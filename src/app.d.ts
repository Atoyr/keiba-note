// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
//
// adapter-cloudflare 8 は `event.platform` を廃した。env・waitUntil は `cloudflare:workers` から取り、
// 取る場所は src/lib/server/platform.ts に閉じる（そこにシークレットの型もある）。
declare global {
	namespace App {
		interface Locals {
			/** メモaction→loadで再利用する共通マスタ。リクエストをまたがない。 */
			raceFormRead?: {
				raceId: string;
				mode: 'preview' | 'review';
				data:
					| Awaited<ReturnType<typeof import('$lib/server/services/races').getRaceForPreview>>
					| Awaited<ReturnType<typeof import('$lib/server/services/races').getRaceForReview>>;
			};
			/** hooks.server.ts が埋める。未ログインなら null。 */
			user: import('$lib/server/auth/session').SessionUser | null;
			/**
			 * `/mcp` に Bearer で入ったときに許されているスコープ。hooks.server.ts が埋める。
			 * Cookie のセッションでは null（画面は OAuth のスコープで動かない）。
			 */
			oauthScopes: import('$lib/schemas/oauth').OAuthScope[] | null;
			/** 開発用のモック認証で入っているか。本番では常に false。 */
			mockAuth: boolean;
			/** 動いている環境（production / staging / local）。hooks.server.ts が埋める。 */
			appEnv: string;
			/** hooks.server.ts が作る、リクエストごとの監視の口（docs/monitoring.md）。 */
			monitor: import('$lib/server/monitoring/monitor').Monitor;
		}

		// interface Error {}
		// interface PageData {}
		interface PageState {
			/** ふりかえり画面でクイック入力を開いているか。履歴に積み、ブラウザの戻るで閉じる。 */
			quickReview?: boolean;
		}
	}
}

export {};
