/**
 * Worker の env と waitUntil を取り出す、**`cloudflare:workers` を import してよい唯一の場所**
 * （ESLint の規則で止めている。例外は src/worker.js だけ）。
 *
 * adapter-cloudflare 8 は `event.platform` を廃し、env を `cloudflare:workers` から取らせる。
 * ここに閉じておけば、単体テスト（Node）では vitest の alias で差し替えるだけで済む
 * （vite.config.ts の `cloudflare:workers` → test-cloudflare-workers.ts）。
 * 呼ぶのはリクエストの中だけ（import の時点で env に触れない）。
 */
import { env, waitUntil } from 'cloudflare:workers';

/**
 * Worker のバインディングとシークレット。
 *
 * `Env` は wrangler.toml から `wrangler types` が
 * worker-configuration.d.ts に生成する（現時点では `DB: D1Database`）。
 * シークレットは wrangler.toml に書かない（本番は `wrangler secret put`、
 * ローカルは `.dev.vars`）ので生成物には現れない。ここで足しておく。
 */
export type AppEnv = Env & {
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	/** ここと一致した email でログインした人だけ role='admin' になる。 */
	ADMIN_EMAIL: string;
	/**
	 * 開発用のモック認証を有効にする。`.dev.vars` にだけ置く。
	 * 本番で設定しても `dev` ガードにより無視される（分岐がビルドに残らない）。
	 */
	MOCK_AUTH?: string;
	/**
	 * 障害を知らせる Discord の Webhook（docs/monitoring.md）。無ければ通知しない。
	 * URL そのものが書き込みの鍵なので、ログにもコードにも出さない。
	 */
	DISCORD_WEBHOOK_URL?: string;
	/**
	 * 出走馬の取得を GitHub Actions に頼むトークン（lib/server/race-data/dispatch.ts）。
	 * このリポジトリの Actions に書き込めるだけの fine-grained token。無ければ頼まない。
	 */
	GITHUB_DISPATCH_TOKEN?: string;
	/**
	 * E2E だけで 1 にする（playwright.config.ts の --var）。Client ID Metadata Document の
	 * client_id に http://localhost を許し、テストが手元で立てたサーバーの文書を読めるようにする。
	 * 本番・ステージングでは設定しない（wrangler.toml に書かない）。
	 */
	OAUTH_CIMD_ALLOW_LOOPBACK?: string;
};

/** 今のリクエストの env。バインディングが無い環境（ビルドの前処理など）では `DB` などが undefined のことがある。 */
export function appEnv(): AppEnv {
	return env as unknown as AppEnv;
}

/** 応答を返したあとも続けたい仕事を頼む（監視の通知など）。 */
export function runInBackground(task: Promise<unknown>): void {
	waitUntil(task);
}
