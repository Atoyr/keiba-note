/**
 * Cron Trigger の入口（`src/worker.js` の `scheduled` から呼ぶ）。オッズの更新を1回ぶん回す。
 *
 * SvelteKit の外で動くので、`hooks.server.ts` がリクエストごとにしていること
 * （監視の口と D1 クライアントを作る）をここで同じようにする。役割はルートと同じで、
 * monitoring を使ってよいのはこの層だけ（docs/architecture.md 第2章）。
 *
 * **取得元を替えるときに直すのはここの `new NetkeibaOddsProvider()` だけ。**
 */
import { createDb } from '$lib/server/db';
import { describeError } from '$lib/server/monitoring/log';
import { createMonitor } from '$lib/server/monitoring/monitor';
import { NetkeibaOddsProvider } from './netkeiba/provider';
import { updateOdds, type OddsLogEntry } from './update';

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
		const summary = await updateOdds({
			db: createDb(env, monitor.onQuery),
			provider: new NetkeibaOddsProvider(),
			log
		});
		// 対象が無い回（ほとんどの回）はログを出さない。
		if (summary.targets > 0) {
			monitor.log({
				level: 'info',
				event: 'odds.cron',
				message: 'オッズの更新を終えた',
				...summary
			});
		}
	} catch (e) {
		monitor.log({
			level: 'error',
			event: 'odds.cron.failed',
			message: 'オッズの更新を始められなかった',
			error: describeError(e)
		});
	}
}
