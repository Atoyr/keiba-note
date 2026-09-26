/**
 * Cron Trigger の入口（`src/worker.js` から呼ぶ）。オッズの更新を1回ぶん回す。
 *
 * **取得は Cron（`scheduled`）の中ではしない。** Cron はどの拠点で動くか決められず、海外の拠点から
 * netkeiba へ行くと手前で 400 を返される。`wrangler.toml` の `[placement]` で東京に置けるのは fetch の処理だけなので、
 * Cron は `relayOddsCron` で自分自身（`env.SELF`）の fetch を呼び、`handleOddsRun` が東京で `runOddsCron` を回す
 * （docs/architecture.md 3-8）。
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

/**
 * Cron から自分の fetch を呼ぶときの宛先。**外からは届かない。** 外からのリクエストが Worker に届くのは
 * `wrangler.toml` の独自ドメインと workers.dev のホスト名だけで、`.internal` は公に登録できないドメイン。
 * サービスバインディングの fetch だけが、このホスト名のまま届く。
 */
const RUN_URL = new URL('https://odds-cron.internal/run');
/** Cron の起動時刻（ミリ秒）。ログの requestId を Cron の回と揃えるために渡す。 */
const SCHEDULED_TIME_HEADER = 'x-scheduled-time';

type Env = App.Platform['env'];

/**
 * Cron（`scheduled`）の入口。取得はせず、東京に置かれる fetch の処理（`handleOddsRun`）に渡して、終わるまで待つ。
 * 渡せなかった・落ちたときだけ `odds.cron.failed` を出す。1レースごとのログは渡した先が出す。
 */
export async function relayOddsCron(
	env: Pick<Env, 'APP_ENV' | 'DISCORD_WEBHOOK_URL'> & { SELF: Pick<Fetcher, 'fetch'> },
	ctx: ExecutionContext,
	scheduledTime: number
): Promise<void> {
	try {
		const res = await env.SELF.fetch(RUN_URL, {
			method: 'POST',
			headers: { [SCHEDULED_TIME_HEADER]: String(scheduledTime) }
		});
		if (!res.ok) throw new Error(`オッズの更新の処理が ${res.status} を返した`);
	} catch (e) {
		cronMonitor(env, ctx, scheduledTime).log({
			level: 'error',
			event: 'odds.cron.failed',
			message: 'オッズの更新を fetch の処理に渡せなかった',
			error: describeError(e)
		});
	}
}

/** `worker.js` の fetch が SvelteKit に渡す前に見る。Cron から `env.SELF` を通して来たものだけ true。 */
export function isOddsRunRequest(req: Request): boolean {
	const url = new URL(req.url);
	return req.method === 'POST' && url.host === RUN_URL.host && url.pathname === RUN_URL.pathname;
}

/** `relayOddsCron` から来たリクエストを受けて、オッズの更新を1回ぶん回す。終わってから返す。 */
export async function handleOddsRun(req: Request, env: Env, ctx: ExecutionContext) {
	const scheduledTime = Number(req.headers.get(SCHEDULED_TIME_HEADER));
	if (!Number.isFinite(scheduledTime) || scheduledTime <= 0) {
		return new Response(null, { status: 400 });
	}
	await runOddsCron(env, ctx, scheduledTime);
	return new Response(null, { status: 204 });
}

function cronMonitor(
	env: Pick<Env, 'APP_ENV' | 'DISCORD_WEBHOOK_URL'>,
	ctx: ExecutionContext,
	scheduledTime: number
) {
	return createMonitor({
		requestId: `cron-odds-${new Date(scheduledTime).toISOString()}`,
		environment: env.APP_ENV ?? 'production',
		webhookUrl: env.DISCORD_WEBHOOK_URL || undefined,
		waitUntil: (task) => ctx.waitUntil(task)
	});
}

export async function runOddsCron(
	env: Env,
	ctx: ExecutionContext,
	scheduledTime: number
): Promise<void> {
	const monitor = cronMonitor(env, ctx, scheduledTime);
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
