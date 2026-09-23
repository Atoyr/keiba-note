// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			/**
			 * Worker のバインディングとシークレット。
			 *
			 * `Env` は wrangler.toml から `wrangler types` が
			 * worker-configuration.d.ts に生成する（現時点では `DB: D1Database`）。
			 * シークレットは wrangler.toml に書かない（本番は `wrangler secret put`、
			 * ローカルは `.dev.vars`）ので生成物には現れない。ここで足しておく。
			 */
			env: Env & {
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
			};
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		interface Locals {
			/** hooks.server.ts が埋める。未ログインなら null。 */
			user: import('$lib/server/auth/session').SessionUser | null;
			/** 開発用のモック認証で入っているか。本番では常に false。 */
			mockAuth: boolean;
			/** 動いている環境（production / staging / local）。hooks.server.ts が埋める。 */
			appEnv: string;
			/** hooks.server.ts が作る、リクエストごとの監視の口（docs/monitoring.md）。 */
			monitor: import('$lib/server/monitoring/monitor').Monitor;
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
