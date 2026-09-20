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
				OWNER_EMAIL: string;
			};
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		interface Locals {
			/** hooks.server.ts が埋める。未ログインなら null。 */
			user: import('$lib/server/auth/session').SessionUser | null;
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
