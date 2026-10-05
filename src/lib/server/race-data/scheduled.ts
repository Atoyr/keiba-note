/**
 * Cron Trigger の入口（`src/worker.js` の `scheduled` から、`ENTRIES_CRONS` のどれかのときに呼ぶ）。
 * 重賞の出走馬の取得（候補・出走馬・枠順の3段）を、GitHub Actions に頼む。
 *
 * SvelteKit の外で動くので、`hooks.server.ts` がリクエストごとにしていること
 * （監視の口と D1 クライアントを作る）をここで同じようにする。
 */
import { createDb } from '$lib/server/db';
import { describeError } from '$lib/server/monitoring/log';
import { createMonitor } from '$lib/server/monitoring/monitor';
import type { EntriesStage } from '$lib/server/services/entries-fetch';
import { dispatchEntriesFetch } from './dispatch';
import { requestEntriesFetch, type EntriesLogEntry } from './request';

/**
 * 出走馬の取得を頼む Cron。UTC で書く。曜日は数字だと 1=日曜で取り違えやすいので 3文字の名前にする。
 *
 * - `candidates` … 日曜 JST 16:30。重賞の候補は日曜16時に決まる（G1 は前週の日曜）
 * - `entries` … 木曜 JST 15:30・17:30。出走馬は木曜14時〜16時すぎに発表される。15時台で間に合わなければ17時台で拾う
 * - `frames` … 金曜 JST 11:30。枠・馬番は金曜10時過ぎに発表される
 *
 * **wrangler.toml の `[triggers] crons` と同じ文字列にすること**（`worker.js` がこれで出し分ける）。
 * オッズの Cron（`lib/server/odds/scheduled.ts`）と時刻が重なっても、式ごとに別々に起動されるので互いに影響しない。
 */
export const ENTRIES_CRONS: Readonly<Record<EntriesStage, string>> = {
	candidates: '30 7 * * sun',
	entries: '30 6,8 * * thu',
	frames: '30 2 * * fri'
};

/** Cron の式から段を引く。出走馬の Cron でなければ null。 */
export function entriesStageOf(cron: string): EntriesStage | null {
	for (const [stage, expr] of Object.entries(ENTRIES_CRONS)) {
		if (expr === cron) return stage as EntriesStage;
	}
	return null;
}

export async function runEntriesCron(
	env: App.Platform['env'],
	ctx: ExecutionContext,
	scheduledTime: number,
	stage: EntriesStage
): Promise<void> {
	const monitor = createMonitor({
		requestId: `cron-entries-${stage}-${new Date(scheduledTime).toISOString()}`,
		environment: env.APP_ENV ?? 'production',
		webhookUrl: env.DISCORD_WEBHOOK_URL || undefined,
		waitUntil: (task) => ctx.waitUntil(task)
	});
	const log = ({ error, ...entry }: EntriesLogEntry) =>
		monitor.log(error === undefined ? entry : { ...entry, error: describeError(error) });

	try {
		const summary = await requestEntriesFetch({
			db: createDb(env, monitor.onQuery),
			dispatch: (req) =>
				dispatchEntriesFetch(
					{ token: env.GITHUB_DISPATCH_TOKEN, repository: env.GITHUB_REPOSITORY },
					req
				),
			log,
			stage,
			now: () => new Date(scheduledTime)
		});
		// 対象が無い回（ほとんどの回）はログを出さない。
		if (summary.targets > 0) {
			monitor.log({
				level: 'info',
				event: 'entries.cron',
				stage,
				message: '出走馬の取得を頼み終えた',
				...summary
			});
		}
	} catch (e) {
		monitor.log({
			level: 'error',
			event: 'entries.cron.failed',
			stage,
			message: '出走馬の取得を頼み始められなかった',
			error: describeError(e)
		});
	}
}
