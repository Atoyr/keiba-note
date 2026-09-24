/**
 * Cloudflare から届く通知メール（Budget alert・使用量の通知）を Discord「障害」へ流す。
 * Email Routing で専用アドレスをこの Worker に向けてある（→ docs/monitoring.md 9-2）。
 *
 * Budget alert はメールでしか送れないので、メールを受けて Discord に写す。
 * 本文（MIME）は読まない。件名と差出人だけを送り、詳しくはメールかダッシュボードで見てもらう。
 *
 * 差出人が Cloudflare でなければ受け取りを断る。見るのはヘッダの From だけ。cloudflare.com は
 * DMARC が p=reject なので、ヘッダの From を偽ったメールは受け手の側で落とされる前提に立つ。
 * 封筒の From（MAIL FROM）は DMARC の判定に使われず誰でも偽れるので、見ない。
 * それでも件名は他人が書きうる文として扱い、コードブロックに入れる（リンクや Markdown を効かせない）。
 */
import { postDiscord, toDiscordPayload } from './discord';
import { writeLog } from './log';

/** 受け取る差出人のドメイン。サブドメイン（notify.cloudflare.com など）も含む。 */
const ALLOWED_SENDER_DOMAINS = ['cloudflare.com'];

export type NotificationEmail = Pick<ForwardableEmailMessage, 'from' | 'to' | 'headers'> & {
	setReject: (reason: string) => void;
};

export type NotificationEmailEnv = {
	APP_ENV: string;
	DISCORD_WEBHOOK_URL?: string;
};

/** `Cloudflare <noreply@notify.cloudflare.com>` のような From から、アドレスだけを取り出す。 */
export function extractAddress(from: string): string {
	const angle = from.match(/<([^<>]+)>\s*$/);
	return (angle ? angle[1] : from).trim().toLowerCase();
}

export function isAllowedSender(address: string): boolean {
	const domain = address.split('@').at(-1) ?? '';
	return ALLOWED_SENDER_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * 件名の encoded-word（`=?UTF-8?B?...?=`）を戻す。UTF-8 の B と Q だけ。
 * 読めないものはそのまま返す（件名が崩れても、届かないよりはよい）。
 */
export function decodeSubject(subject: string): string {
	return subject
		.replace(/\?=\s+=\?/g, '?==?')
		.replace(/=\?utf-8\?([bq])\?([^?]*)\?=/gi, (whole, enc: string, text: string) => {
			try {
				const bytes =
					enc.toLowerCase() === 'b'
						? Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
						: Uint8Array.from(
								text
									.replaceAll('_', ' ')
									.replace(/=([0-9a-f]{2})/gi, (_, hex: string) =>
										String.fromCharCode(parseInt(hex, 16))
									),
								(c) => c.charCodeAt(0)
							);
				return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
			} catch {
				return whole;
			}
		});
}

export async function handleNotificationEmail(
	message: NotificationEmail,
	env: NotificationEmailEnv,
	fetchFn: typeof fetch = fetch
): Promise<void> {
	const headerFrom = extractAddress(message.headers.get('from') ?? '');
	if (!isAllowedSender(headerFrom)) {
		writeLog({
			level: 'warn',
			event: 'monitoring.email.rejected',
			message: 'Cloudflare 以外からの通知メールを断った',
			// 差出人のドメインだけ出す（アドレスは個人の情報でありうる）。
			senderDomain: headerFrom.split('@').at(-1) ?? ''
		});
		message.setReject('Unknown sender');
		return;
	}

	const subject = decodeSubject(message.headers.get('subject') ?? '').trim() || '（件名なし）';
	writeLog({
		level: 'warn',
		event: 'cloudflare.notification',
		message: 'Cloudflare から通知メールが届いた',
		subject
	});
	if (!env.DISCORD_WEBHOOK_URL) return;

	await postDiscord(
		env.DISCORD_WEBHOOK_URL,
		toDiscordPayload({
			level: 'warn',
			event: 'cloudflare.notification',
			message:
				'Cloudflare から通知メールが届いた。本文はメールか、ダッシュボードの Billing > Billable Usage で確かめてください。',
			environment: env.APP_ENV,
			details: { subject, from: headerFrom, to: message.to }
		}),
		fetchFn
	);
}
