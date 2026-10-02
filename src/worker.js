// Worker の入口（wrangler.toml の main）。adapter-cloudflare が作る Worker を包み、
// 返す前にレスポンスを直す。Cron Trigger（出走馬の取得の依頼）もここで受ける。
// オッズの更新は Worker ではなく GitHub Actions がする（scripts/odds-update.ts。docs/architecture.md 3-8）。
//
// adapter は adapter の設定（wrangler.adapter.toml）の main に Worker を書き出し、そこを
// 消してから書く。このファイルを adapter の main にすると上書きされるので、分けている。
//
// JS にしているのは、ビルド前（svelte-check）には .svelte-kit/cloudflare/_worker.js が
// 無いため。tsconfig は checkJs を切っているので、ここは型検査されない。
//
// ここから import する TS は wrangler（esbuild）が束ねる。`$lib` は wrangler.toml の alias で解く。
//
// 共有の画像（/shared/races/[id]/og.png）を描く resvg の wasm もここで import する。wrangler は .wasm を
// コンパイル済みの WebAssembly.Module にする。Workers は実行中にバイト列から wasm をコンパイルできず、
// SvelteKit（Vite）の側では .wasm を import できないので、env に足して渡す（src/lib/server/og/render.ts）。
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import sveltekit from '../.svelte-kit/cloudflare/_worker.js';
import { uncacheFailure } from './lib/server/asset-cache.ts';
import { handleTokenRequest } from './lib/server/auth/token-endpoint.ts';
import { createDb } from './lib/server/db/index.ts';
import { describeError } from './lib/server/monitoring/log.ts';
import { createMonitor } from './lib/server/monitoring/monitor.ts';
import { ENTRIES_CRON, runEntriesCron } from './lib/server/race-data/scheduled.ts';

/**
 * OAuth のトークンの口（MCP の連携。docs/architecture.md 3-10）。SvelteKit の CSRF の検査が、
 * Origin の無いフォームの POST（Claude・ChatGPT のサーバーからの要求）を hooks より前に 403 にするので、
 * ここで先に受ける。Cookie を見ない口なので CSRF の検査が守るものは無い。
 *
 * @param {Request} req
 * @param {Env} env
 * @param {ExecutionContext} ctx
 */
async function oauthToken(req, env, ctx) {
	const monitor = createMonitor({
		requestId: req.headers.get('cf-ray') ?? crypto.randomUUID(),
		environment: env.APP_ENV ?? 'production',
		webhookUrl: env.DISCORD_WEBHOOK_URL || undefined,
		waitUntil: (task) => ctx.waitUntil(task)
	});
	try {
		return await handleTokenRequest(req, env.DB ? createDb(env, monitor.onQuery) : null);
	} catch (e) {
		monitor.log({
			level: 'error',
			event: 'oauth.token.failed',
			message: 'トークンの要求の処理中に想定外のエラーが起きた',
			error: describeError(e),
			dedupeKey: 'oauth.token.failed'
		});
		return Response.json({ error: 'server_error' }, { status: 500 });
	}
}

export default {
	/**
	 * @param {Request} req
	 * @param {Env} env
	 * @param {ExecutionContext} ctx
	 */
	async fetch(req, env, ctx) {
		if (new URL(req.url).pathname === '/oauth/token') return oauthToken(req, env, ctx);
		return uncacheFailure(await sveltekit.fetch(req, { ...env, RESVG_WASM: resvgWasm }, ctx));
	},

	/**
	 * @param {ScheduledController} controller
	 * @param {Env} env
	 * @param {ExecutionContext} ctx
	 */
	async scheduled(controller, env, ctx) {
		// Cron は式ごとに別々に起動される。どの式で起きたかで出し分ける（wrangler.toml の crons）。
		if (controller.cron === ENTRIES_CRON) {
			ctx.waitUntil(runEntriesCron(env, ctx, controller.scheduledTime));
		}
	}
};
