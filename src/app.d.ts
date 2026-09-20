// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			/**
			 * Worker のバインディング。`Env` は wrangler.toml から
			 * `wrangler types` が worker-configuration.d.ts に生成する。
			 * 現時点の中身は `DB: D1Database`（D1 バインディング）。
			 */
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// Phase 1（認証）で locals.user を足す。docs/design.md 第4章を参照。
		// interface Locals {}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
