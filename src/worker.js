// Worker の入口（wrangler.toml の main）。adapter-cloudflare が作る Worker を包み、
// 返す前にレスポンスを直す。
//
// adapter は adapter の設定（wrangler.adapter.toml）の main に Worker を書き出し、そこを
// 消してから書く。このファイルを adapter の main にすると上書きされるので、分けている。
//
// JS にしているのは、ビルド前（svelte-check）には .svelte-kit/cloudflare/_worker.js が
// 無いため。tsconfig は checkJs を切っているので、ここは型検査されない。
import sveltekit from '../.svelte-kit/cloudflare/_worker.js';
import { uncacheFailure } from './lib/server/asset-cache.ts';
import { handleNotificationEmail } from './lib/server/monitoring/email.ts';

export default {
	/**
	 * @param {Request} req
	 * @param {Env} env
	 * @param {ExecutionContext} ctx
	 */
	async fetch(req, env, ctx) {
		return uncacheFailure(await sveltekit.fetch(req, env, ctx));
	},

	/**
	 * Email Routing で届く Cloudflare の通知メール（Budget alert など）を Discord へ流す
	 * （docs/monitoring.md 9-2）。
	 *
	 * @param {ForwardableEmailMessage} message
	 * @param {Env & { DISCORD_WEBHOOK_URL?: string }} env
	 */
	async email(message, env) {
		await handleNotificationEmail(message, env);
	}
};
