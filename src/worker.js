// Worker の入口（wrangler.toml の main）。adapter-cloudflare が作る Worker を包み、
// 返す前にレスポンスを直す。Cron Trigger（出走馬の取得とオッズの更新を Actions に頼む）もここで受ける。
// オッズを取得元から取るのは Worker ではなく GitHub Actions（scripts/odds-update.ts）。Worker は起動の合図を出すだけ
// （docs/architecture.md 3-8）。
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
import { ODDS_CRONS, runOddsCron } from './lib/server/odds/scheduled.ts';
import { ENTRIES_CRON, runEntriesCron } from './lib/server/race-data/scheduled.ts';

export default {
	/**
	 * @param {Request} req
	 * @param {Env} env
	 * @param {ExecutionContext} ctx
	 */
	async fetch(req, env, ctx) {
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
		} else if (ODDS_CRONS.includes(controller.cron)) {
			ctx.waitUntil(runOddsCron(env, ctx, controller.scheduledTime));
		}
	}
};
