// Worker の入口（wrangler.toml の main）。adapter-cloudflare が作る Worker を包み、
// 返す前にレスポンスを直す。Cron Trigger（オッズの更新・出走馬の取得の依頼）もここで受ける。
//
// adapter は adapter の設定（wrangler.adapter.toml）の main に Worker を書き出し、そこを
// 消してから書く。このファイルを adapter の main にすると上書きされるので、分けている。
//
// JS にしているのは、ビルド前（svelte-check）には .svelte-kit/cloudflare/_worker.js が
// 無いため。tsconfig は checkJs を切っているので、ここは型検査されない。
//
// ここから import する TS は wrangler（esbuild）が束ねる。`$lib` は wrangler.toml の alias で解く。
import sveltekit from '../.svelte-kit/cloudflare/_worker.js';
import { uncacheFailure } from './lib/server/asset-cache.ts';
import { handleOddsRun, isOddsRunRequest, relayOddsCron } from './lib/server/odds/scheduled.ts';
import { ENTRIES_CRON, runEntriesCron } from './lib/server/race-data/scheduled.ts';

export default {
	/**
	 * @param {Request} req
	 * @param {Env} env
	 * @param {ExecutionContext} ctx
	 */
	async fetch(req, env, ctx) {
		// オッズの Cron が env.SELF から呼ぶ。fetch の処理は東京に置かれる（wrangler.toml の placement）。
		if (isOddsRunRequest(req)) return handleOddsRun(req, env, ctx);
		return uncacheFailure(await sveltekit.fetch(req, env, ctx));
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
		} else {
			// 取得は Cron の中でせず、東京で動く fetch の処理に渡す（placement は Cron に効かない）
			ctx.waitUntil(relayOddsCron(env, ctx, controller.scheduledTime));
		}
	}
};
