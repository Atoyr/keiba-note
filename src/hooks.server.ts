import { dev } from '$app/environment';
import {
	json,
	redirect,
	type Handle,
	type HandleServerError,
	type RequestEvent
} from '@sveltejs/kit';
import { createDb } from '$lib/server/db';
import { validateAccessToken } from '$lib/server/auth/oauth';
import { bearerChallenge, MCP_PATH } from '$lib/server/auth/oauth-metadata';
import { describeError } from '$lib/server/monitoring/log';
import { createMonitor, type Monitor } from '$lib/server/monitoring/monitor';
import { SESSION_COOKIE, validateSession } from '$lib/server/auth/session';
import { MOCK_USER_COOKIE, ensureMockUser, isMockUserKey } from '$lib/server/auth/mock';
import { safeRedirect } from '$lib/utils/redirect';

/**
 * ログイン不要で触れるパス。これ以外は全部弾く。
 *
 * そのパスと、その下（`/login` なら `/login/...`）が開く。`/auth/` のように `/` で終わるものは
 * 下だけ。**`/` だけは完全一致。** 前方一致にすると全部のパスが開いてしまう。
 * `/` は未ログインだと紹介ページを出し、DB には触らない（`src/routes/+page.server.ts`）。
 *
 * `/notes/` はメモの共有ページ。そこで出せるのは
 * `visibility = 'unlisted'` の1行だけ（product.md 第6章）。
 *
 * `/privacy` と `/terms` は Google OAuth の同意画面に URL を登録するページ。
 * ログインする前に読めなければ意味がない（docs/operations.md）。
 *
 * `/api/health` は死活監視（GitHub Actions の health.yml）が外から叩く。返すのは
 * `{"status":"ok"}` か `{"status":"error"}` だけで、DB の中身は出さない（docs/monitoring.md）。
 *
 * `/.well-known/oauth-*` と `/oauth/register` は MCP クライアントが連携の前に読む・登録する口
 * （docs/api.md 第2章）。案内と、権限を持たないクライアントの行を作るだけで、誰のデータにも触らない。
 * 同意画面の `/oauth/authorize` は入れない（ログインした本人だけが許可できる）。
 * `/oauth/token` は SvelteKit に来る前に src/worker.js が受けるので、ここには要らない。
 *
 * `/robots.txt` はここに要らない。`static/` の実ファイルは Workers Static Assets が
 * 直接返し、**Worker 自体が起動しない**ので hooks を通らない。
 */
const PUBLIC_PATHS = [
	'/',
	'/login',
	'/auth/',
	'/notes/',
	'/shared/races/',
	'/privacy',
	'/terms',
	'/api/health',
	// `/.well-known/` ごとは開けない。下に足したルートが黙って公開になる。
	'/.well-known/oauth-protected-resource',
	'/.well-known/oauth-authorization-server',
	'/oauth/register'
];

function isPublic(pathname: string): boolean {
	return PUBLIC_PATHS.some((p) => {
		if (p === '/') return pathname === '/';
		return pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`);
	});
}

/**
 * 動いている環境の名前。`wrangler.toml` の `APP_ENV`（本番は production、Workers Preview は staging）。
 * 開発サーバーは local にする。通知の Environment 欄と、画面のステージングの印（AppEnvMark）が見る。
 */
function appEnv(platform: App.Platform | undefined): string {
	return dev ? 'local' : (platform?.env?.APP_ENV ?? 'production');
}

/**
 * リクエストごとの監視の口（docs/monitoring.md）。request id は Cloudflare が振る `cf-ray` を使い、
 * Workers Logs の同じリクエストの行と突き合わせられるようにする。ローカルには無いので作る。
 */
function createRequestMonitor(event: RequestEvent): Monitor {
	const platform = event.platform;
	return createMonitor({
		requestId: event.request.headers.get('cf-ray') ?? crypto.randomUUID(),
		environment: appEnv(platform),
		webhookUrl: platform?.env?.DISCORD_WEBHOOK_URL || undefined,
		waitUntil: platform?.ctx ? (task) => platform.ctx.waitUntil(task) : undefined
	});
}

/**
 * 認証の判断はここに閉じ込める。ルートからは `locals.user` しか見ない。
 * どの認証方式を使っているかを知っているのはこのファイルだけ。
 *
 * 例外は OAuth のトークンの口（`/oauth/token`）。src/worker.js が SvelteKit より先に受けるので、
 * **ここに足したもの（レート制限など）はその口には効かない**（docs/architecture.md 3-10）。
 */
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.oauthScopes = null;
	event.locals.mockAuth = false;
	event.locals.appEnv = appEnv(event.platform);
	event.locals.monitor = createRequestMonitor(event);

	const db = event.platform?.env?.DB
		? createDb(event.platform.env, event.locals.monitor.onQuery)
		: null;

	// --- MCP（/mcp）は Bearer だけ ---------------------------------------------
	// Cookie のセッションもモック認証も見ない。逆に、ほかのパスは Authorization を見ない
	// （このファイルで Bearer を読むのはここだけ）。経路を混ぜると、ブラウザの Cookie で
	// 他サイトから /mcp を叩かれる（CSRF）か、漏れたトークンで画面に入られる。
	// 通らなければログインへ飛ばさず 401 と、認可の案内の場所を返す（MCP の認可の仕様）。
	if (event.url.pathname === MCP_PATH) {
		const bearer = /^Bearer[ ]+(\S+)$/i.exec(event.request.headers.get('authorization') ?? '')?.[1];
		const auth = bearer && db ? await validateAccessToken(db, bearer) : null;
		if (!auth) {
			return json(
				{ error: 'invalid_token', error_description: 'アクセストークンが必要です' },
				{
					status: 401,
					headers: {
						'WWW-Authenticate': bearerChallenge(
							event.url.origin,
							bearer ? { code: 'invalid_token' } : undefined
						),
						'Cache-Control': 'no-store'
					}
				}
			);
		}
		event.locals.user = auth.user;
		event.locals.oauthScopes = auth.scopes;
		return resolve(event);
	}
	// -------------------------------------------------------------------------

	// --- 開発用のモック認証 --------------------------------------------------
	// `dev` は本番ビルドで静的に false になり、この分岐はバンドルから消える。
	// したがってデプロイした Worker でモックが有効になることはない。
	if (dev && event.platform?.env?.MOCK_AUTH && db) {
		const key = event.cookies.get(MOCK_USER_COOKIE);
		event.locals.user = await ensureMockUser(db, isMockUserKey(key) ? key : 'admin');
		event.locals.mockAuth = true;
		return resolve(event);
	}
	// -------------------------------------------------------------------------

	const token = event.cookies.get(SESSION_COOKIE);

	if (token && db) {
		const result = await validateSession(db, token);

		if (result) {
			event.locals.user = result.user;

			// スライディング更新で期限が延びたときだけ Cookie を貼り直す。
			if (result.renewedExpiresAt) {
				event.cookies.set(SESSION_COOKIE, token, {
					path: '/',
					httpOnly: true,
					secure: event.url.protocol === 'https:',
					sameSite: 'lax',
					expires: result.renewedExpiresAt
				});
			}
		} else {
			// 期限切れ・破棄済み。残っている Cookie を掃除する。
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	if (!event.locals.user && !isPublic(event.url.pathname)) {
		const target = safeRedirect(event.url.pathname + event.url.search);
		redirect(302, `/login?redirect=${encodeURIComponent(target)}`);
	}

	return resolve(event);
};

/**
 * 想定外のエラー（`error()` で投げたもの以外）がここに来る。ログに出し、500 以上なら通知する。
 *
 * 404（無いパス）もここを通るが、bot の走査でいくらでも来るので通知しない。
 * 画面に出す文言は SvelteKit の既定のまま（中身を利用者に見せない）。
 */
export const handleError: HandleServerError = ({ error, event, status }) => {
	if (status < 500) return;

	// handle より前で落ちたときは monitor がまだ無い。
	const monitor = event.locals.monitor ?? createRequestMonitor(event);
	const route = event.route.id ?? '(no route)';
	monitor.log({
		level: 'error',
		event: 'request.unhandled',
		message: 'リクエストの処理中に想定外のエラーが起きた',
		method: event.request.method,
		// パスではなくルートの形（/races/[id]）。クエリ文字列（検索語）は出さない。
		route,
		status,
		error: describeError(error),
		dedupeKey: `request.unhandled:${route}`
	});
};
