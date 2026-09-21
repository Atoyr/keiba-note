import { dev } from '$app/environment';
import { redirect, type Handle } from '@sveltejs/kit';
import { createDb } from '$lib/server/db';
import { SESSION_COOKIE, validateSession } from '$lib/server/auth/session';
import { MOCK_USER_COOKIE, ensureMockUser, isMockUserKey } from '$lib/server/auth/mock';
import { safeRedirect } from '$lib/utils/redirect';

/**
 * ログイン不要で触れるパス。これ以外は全部弾く。
 *
 * `/notes/` は共有ページ。未ログインで開ける唯一のルートだが、そこで出せるのは
 * `visibility = 'unlisted'` の1行だけ（design.md 第6章）。
 *
 * `/robots.txt` はここに要らない。`static/` の実ファイルは Workers Static Assets が
 * 直接返し、**Worker 自体が起動しない**ので hooks を通らない。
 */
const PUBLIC_PATHS = ['/login', '/auth/', '/notes/'];

function isPublic(pathname: string): boolean {
	return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
}

/**
 * 認証の判断はここに閉じ込める。ルートからは `locals.user` しか見ない。
 * どの認証方式を使っているかを知っているのはこのファイルだけ。
 */
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.mockAuth = false;

	const db = event.platform?.env?.DB ? createDb(event.platform.env) : null;

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
