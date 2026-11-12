import { dev } from '$app/env';
import { json, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { createDb } from '#lib/server/db/index.ts';
import { validateAccessToken } from '#lib/server/auth/oauth.ts';
import { bearerChallenge, MCP_PATH } from '#lib/server/auth/oauth-metadata.ts';
import { describeError } from '#lib/server/monitoring/log.ts';
import { createMonitor, type Monitor } from '#lib/server/monitoring/monitor.ts';
import { appEnv, runInBackground } from '#lib/server/platform.ts';
import { SESSION_COOKIE, validateSession } from '#lib/server/auth/session.ts';
import { MOCK_USER_COOKIE, ensureMockUser, isMockUserKey } from '#lib/server/auth/mock.ts';
import { applySecurityHeaders } from '#lib/server/security-headers.ts';
import { safeRedirect } from '#lib/utils/redirect.ts';

/**
 * ログイン不要で触れるパス。これ以外は全部弾く。
 *
 * そのパスと、その下（`/login` なら `/login/...`）が開く。`/auth/` のように `/` で終わるものは
 * 下だけ。**`/` だけは完全一致。** 前方一致にすると全部のパスが開いてしまう。
 * `/` は未ログインだと紹介ページを出し、DB には触らない（`src/routes/+page.server.ts`）。
 *
 * `/notes/` はメモの共有ページ。そこで出せるのは
 * `visibility = 'unlisted'` の1行だけ（pages.md）。
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
function environmentName(): string {
	return dev ? 'local' : (appEnv().APP_ENV ?? 'production');
}

/**
 * リクエストごとの監視の口（docs/monitoring.md）。request id は Cloudflare が振る `cf-ray` を使い、
 * Workers Logs の同じリクエストの行と突き合わせられるようにする。ローカルには無いので作る。
 */
function createRequestMonitor(event: RequestEvent): Monitor {
	return createMonitor({
		requestId: event.request.headers.get('cf-ray') ?? crypto.randomUUID(),
		environment: environmentName(),
		webhookUrl: appEnv().DISCORD_WEBHOOK_URL || undefined,
		waitUntil: runInBackground
	});
}

/** 認証のあと、共通のセキュリティヘッダを付ける（`withSecurityHeaders`）。認証の判断は `authenticateAndResolve`。 */
export const handle: Handle = async ({ event, resolve }) => {
	const res = await authenticateAndResolve({ event, resolve });
	return withSecurityHeaders(res, event.url);
};

/**
 * 共通のセキュリティヘッダを付ける（`applySecurityHeaders`。既にある項目は上書きしない）。
 * 付かない口は security-headers.ts のコメントのとおり（`/oauth/token`・静的アセット・
 * `redirect()` を投げた応答）。ヘッダが変更不可の Response は包み直してから付ける。
 */
function withSecurityHeaders(res: Response, url: URL): Response {
	try {
		applySecurityHeaders(res.headers, url);
		return res;
	} catch (e) {
		if (!(e instanceof TypeError)) throw e;
		const wrapped = new Response(res.body, res);
		applySecurityHeaders(wrapped.headers, url);
		return wrapped;
	}
}

/**
 * 認証の判断はここに閉じ込める。ルートからは `locals.user` しか見ない。
 * どの認証方式を使っているかを知っているのはこのファイルだけ。
 *
 * 例外は OAuth のトークンの口（`/oauth/token`）と `DELETE /mcp`（405）。src/worker.js が SvelteKit より先に受けるので、
 * **ここに足したもの（レート制限など）はその口には効かない**（docs/mcp.md）。SvelteKit の CSRF の検査の 403 も、ここより前に返る。
 */
const authenticateAndResolve: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.oauthScopes = null;
	event.locals.mockAuth = false;
	event.locals.appEnv = environmentName();
	event.locals.monitor = createRequestMonitor(event);

	const env = appEnv();
	const db = env.DB ? createDb(env, event.locals.monitor.onQuery) : null;

	// --- MCP（/mcp）は Bearer だけ ---------------------------------------------
	// Cookie のセッションもモック認証も見ない。逆に、ほかのパスは Authorization を見ない
	// （このファイルで Bearer を読むのはここだけ）。経路を混ぜると、ブラウザの Cookie で
	// 他サイトから /mcp を叩かれる（CSRF）か、漏れたトークンで画面に入られる。
	// 通らなければログインへ飛ばさず 401 と、認可の案内の場所を返す（MCP の認可の仕様）。
	if (event.url.pathname === MCP_PATH) {
		const bearer = /^Bearer[ ]+(\S+)$/i.exec(event.request.headers.get('authorization') ?? '')?.[1];
		// DB に届かないのはトークンのせいではない。401 にするとクライアントがトークンを捨ててしまう。
		if (bearer && !db) {
			return json(
				{ error: 'temporarily_unavailable' },
				{ status: 503, headers: { 'Cache-Control': 'no-store' } }
			);
		}
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
	if (dev && env.MOCK_AUTH && db) {
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
 * 想定外のエラーだけをログに出して通知する。SvelteKit 3 は `error()` で投げたもの（app）・404 など
 * SvelteKit が作ったもの（framework）・入力の検証（validation）も渡してくるが、これらは想定内なので何もしない。
 * bot の走査の 404 がいくらでも来るのも framework。コードや呼び先が投げた例外（unknown）は 500 で返る。
 *
 * **何も返さない。** 返すと画面に出す文言や status が変わる。既定のまま（中身を利用者に見せない）にする。
 */
export const handleError: HandleServerError = (input) => {
	if (input.kind !== 'unknown') return;
	const { error, event } = input;
	const status = 500;

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
