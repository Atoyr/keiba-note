import { redirect, type Handle } from '@sveltejs/kit';
import { createDb } from '$lib/server/db';
import { SESSION_COOKIE, validateSession } from '$lib/server/auth/session';
import { safeRedirect } from '$lib/utils/redirect';

/**
 * ログイン不要で触れるパス。これ以外は全部弾く。
 * 招待リンク（/invite/[code]）は未ログインで踏まれる前提なので当然ここに入る。
 */
const PUBLIC_PATHS = ['/login', '/auth/', '/invite/'];

function isPublic(pathname: string): boolean {
	return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
}

/**
 * 認証の判断はここに閉じ込める。ルートからは `locals.user` しか見ない。
 * どの認証方式を使っているかを知っているのはこのファイルだけ。
 */
export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);

	event.locals.user = null;

	if (token && event.platform?.env?.DB) {
		const db = createDb(event.platform.env);
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
