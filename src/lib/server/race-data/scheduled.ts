/**
 * Cron Trigger の入口（`src/worker.js` の `scheduled` から、`ENTRIES_CRON` のときに呼ぶ）。
 * 枠順を待っている重賞の出走馬の取得を、GitHub Actions に頼む。
 *
 * SvelteKit の外で動くので、`hooks.server.ts` がリクエストごとにしていること
 * （監視の口と D1 クライアントを作る）をここで同じようにする。
 */
import { createDb } from '$lib/server/db';
import { describeError } from '$lib/server/monitoring/log';
import { createMonitor } from '$lib/server/monitoring/monitor';
import { dispatchEntriesFetch } from './dispatch';
import { requestEntriesFetch, type EntriesLogEntry } from './request';

/**
 * 出走馬の取得を頼む Cron。UTC で書く。1-10 時 = JST 10:05〜19:05 の毎時。
 * **wrangler.toml の `[triggers] crons` と同じ文字列にすること**（`worker.js` がこれで出し分ける）。
 * オッズの Cron（毎時 0 分・30 分）と同じ時刻に重ならないよう 5 分にしてある。
 */
export const ENTRIES_CRON = '5 1-10 * * *';

export async function runEntriesCron(
	env: App.Platform['env'],
	ctx: ExecutionContext,
	scheduledTime: number
): Promise<void> {
	const monitor = createMonitor({
		requestId: `cron-entries-${new Date(scheduledTime).toISOString()}`,
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
			log
		});
		// 対象が無い回（ほとんどの回）はログを出さない。
		if (summary.targets > 0) {
			monitor.log({
				level: 'info',
				event: 'entries.cron',
				message: '出走馬の取得を頼み終えた',
				...summary
			});
		}
	} catch (e) {
		monitor.log({
			level: 'error',
			event: 'entries.cron.failed',
			message: '出走馬の取得を頼み始められなかった',
			error: describeError(e)
		});
	}
}
