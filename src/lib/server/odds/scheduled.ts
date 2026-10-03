/**
 * Cron Trigger の入口（`src/worker.js` の `scheduled` から、`ODDS_CRONS` のどれかのときに呼ぶ）。
 * 取りに行く時間帯に入った重賞があれば、オッズの更新を GitHub Actions に頼む。
 *
 * SvelteKit の外で動くので、`hooks.server.ts` がリクエストごとにしていること
 * （監視の口と D1 クライアントを作る）をここで同じようにする。
 */
import { createDb } from '$lib/server/db';
import { describeError } from '$lib/server/monitoring/log';
import { createMonitor } from '$lib/server/monitoring/monitor';
import { dispatchWorkflow } from '$lib/server/race-data/dispatch';
import { ODDS_WORKFLOW, requestOddsUpdate, type OddsLogEntry } from './request';

/**
 * オッズの更新を頼む Cron。UTC で書く。JST 7:05〜25:05（翌 1:05）の30分おき。
 *
 * - `5,35 22-23,0-15 * * *` … JST 7:05〜24:35
 * - `5 16 * * *` … JST 25:05 の1回（上の式では拾えない）
 *
 * ネットの前日発売は夜間も売っているので 25:00 まで頼み、25:00〜7:00 は頼まない。
 * 毎時 0 分・30 分を避けて 5 分ずらしている（発走の直前の回が、Actions の起動の遅れで発走後にずれないように）。
 * **wrangler.toml の `[triggers] crons` と同じ文字列にすること**（`worker.js` がこれで出し分ける）。
 */
export const ODDS_CRONS: readonly string[] = ['5,35 22-23,0-15 * * *', '5 16 * * *'];

export async function runOddsCron(
	env: App.Platform['env'],
	ctx: ExecutionContext,
	scheduledTime: number
): Promise<void> {
	const monitor = createMonitor({
		requestId: `cron-odds-${new Date(scheduledTime).toISOString()}`,
		environment: env.APP_ENV ?? 'production',
		webhookUrl: env.DISCORD_WEBHOOK_URL || undefined,
		waitUntil: (task) => ctx.waitUntil(task)
	});
	const log = ({ error, ...entry }: OddsLogEntry) =>
		monitor.log(error === undefined ? entry : { ...entry, error: describeError(error) });

	try {
		await requestOddsUpdate({
			db: createDb(env, monitor.onQuery),
			dispatch: () =>
				dispatchWorkflow(
					{ token: env.GITHUB_DISPATCH_TOKEN, repository: env.GITHUB_REPOSITORY },
					ODDS_WORKFLOW
				),
			log,
			now: () => new Date(scheduledTime)
		});
	} catch (e) {
		monitor.log({
			level: 'error',
			event: 'odds.dispatch.failed',
			message: 'オッズの更新を頼み始められなかった',
			error: describeError(e)
		});
	}
}
