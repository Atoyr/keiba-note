/**
 * Discord の Webhook に通知を送る。**Webhook を叩くのはこのファイルだけ。**
 * 各所の catch から直接 fetch しない（→ docs/monitoring.md）。
 *
 * 送信の失敗は投げない。通知が落ちても本来のリクエストは壊さない。
 * Webhook の URL はログにも出さない（URL そのものが書き込みの鍵になっている）。
 */
import { writeLog, type ErrorSummary } from './log';

export type Alert = {
	level: 'warn' | 'error';
	event: string;
	message: string;
	environment: string;
	requestId?: string;
	durationMs?: number;
	error?: ErrorSummary;
	/** 画面に並べる補足（route・status・sql など）。 */
	details?: Record<string, string | number>;
	/** 抑制していたあいだに捨てた同じ通知の数。 */
	suppressed?: number;
};

const COLOR = { error: 0xdc2626, warn: 0xeab308 } as const;
const TITLE = { error: '🔴 ERROR', warn: '🟡 WARNING' } as const;

// Discord の上限（description 4096・field の値 1024・field 25個）より控えめに切る。
const MAX_DESCRIPTION = 1000;
const MAX_FIELD = 900;
const MAX_DETAILS = 10;

function clip(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 値はコードブロックに入れる。`@everyone` や Markdown が効かないように。 */
function code(text: string, max = MAX_FIELD): string {
	return '```\n' + clip(text.replaceAll('```', "'''"), max) + '\n```';
}

export function toDiscordPayload(alert: Alert, now = new Date()) {
	const fields: { name: string; value: string; inline?: boolean }[] = [
		{ name: 'Event', value: `\`${clip(alert.event, 100)}\``, inline: true },
		{ name: 'Environment', value: clip(alert.environment, 100), inline: true }
	];
	if (alert.requestId) {
		fields.push({ name: 'Request ID', value: `\`${clip(alert.requestId, 100)}\``, inline: true });
	}
	if (alert.durationMs !== undefined) {
		fields.push({ name: 'Duration', value: `${Math.round(alert.durationMs)}ms`, inline: true });
	}
	for (const [name, value] of Object.entries(alert.details ?? {}).slice(0, MAX_DETAILS)) {
		fields.push({ name: clip(name, 100), value: code(String(value)) });
	}
	if (alert.error) {
		const lines = [`${alert.error.name}: ${alert.error.message}`, ...(alert.error.causes ?? [])];
		fields.push({ name: 'Error', value: code(lines.join('\n')) });
	}
	if (alert.suppressed) {
		fields.push({
			name: 'Suppressed',
			value: `前回の通知からこの isolate で同じ通知を ${alert.suppressed} 件抑えた`
		});
	}

	return {
		// エラーメッセージに `@everyone` が混ざっても誰にもメンションが飛ばないように。
		allowed_mentions: { parse: [] as string[] },
		embeds: [
			{
				title: TITLE[alert.level],
				description: clip(alert.message, MAX_DESCRIPTION),
				color: COLOR[alert.level],
				fields,
				timestamp: now.toISOString()
			}
		]
	};
}

export type DiscordPayload = ReturnType<typeof toDiscordPayload>;

/** 送れたら true。失敗しても投げない。 */
export async function postDiscord(
	webhookUrl: string,
	payload: DiscordPayload,
	fetchFn: typeof fetch = fetch
): Promise<boolean> {
	try {
		const res = await fetchFn(webhookUrl, {
			method: 'POST',
			// 手動テストで日本語が化けたことがあるので、UTF-8 であることを明示する。
			headers: { 'content-type': 'application/json; charset=utf-8' },
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(5000)
		});
		if (!res.ok) {
			writeLog({
				level: 'error',
				event: 'monitoring.discord.failed',
				message: 'Discord への通知が受け付けられなかった',
				status: res.status
			});
			return false;
		}
		return true;
	} catch (e) {
		writeLog({
			level: 'error',
			event: 'monitoring.discord.failed',
			message: 'Discord への通知を送れなかった',
			// e.message に URL が入る実装がありうるので、名前だけ出す。
			error: { name: e instanceof Error ? e.name : typeof e, message: '(送信に失敗)' }
		});
		return false;
	}
}
