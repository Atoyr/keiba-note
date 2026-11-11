import { redirect } from '@sveltejs/kit';
import { OAuth2RequestError } from 'arctic';
import {
	OAUTH_STATE_COOKIE,
	OAUTH_VERIFIER_COOKIE,
	REDIRECT_COOKIE,
	createGoogleClient,
	parseIdToken
} from '$lib/server/auth/google';
import {
	SESSION_COOKIE,
	SESSION_TTL_MS,
	createSession,
	createUser,
	findUserByGoogleSub
} from '$lib/server/auth/session';
import { createDb } from '$lib/server/db';
import { isUniqueViolation } from '$lib/server/db/errors';
import { describeError } from '$lib/server/monitoring/log';
import { safeRedirect } from '$lib/utils/redirect';
import type { RequestHandler } from './$types';

/** 一時 Cookie をまとめて捨てる。 */
function clearTransientCookies(cookies: {
	delete: (name: string, opts: { path: string }) => void;
}) {
	for (const name of [OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, REDIRECT_COOKIE]) {
		cookies.delete(name, { path: '/' });
	}
}

export const GET: RequestHandler = async ({ cookies, url, platform, locals }) => {
	if (!platform?.env?.DB) redirect(302, '/login?error=unavailable');

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get(OAUTH_STATE_COOKIE);
	const codeVerifier = cookies.get(OAUTH_VERIFIER_COOKIE);
	const target = safeRedirect(cookies.get(REDIRECT_COOKIE));

	// state の照合。不一致・欠落はすべて拒否する（CSRF / セッション固定対策）。
	if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
		clearTransientCookies(cookies);
		redirect(302, '/login?error=invalid_request');
	}

	const google = createGoogleClient(platform.env, url.origin);

	let identity: ReturnType<typeof parseIdToken>;
	try {
		const tokens = await google.validateAuthorizationCode(code, codeVerifier);
		identity = parseIdToken(tokens.idToken());
	} catch (e) {
		// 中身はログにだけ出す。認可コードの使い回し・期限切れ（invalid_grant）は戻るボタンや
		// 二度押しで普通に起きるので warn に留める。それ以外（クライアントの設定の誤り・
		// Google に届かない）は全員がログインできなくなる類なので error にして通知する。
		const oauthError = e instanceof OAuth2RequestError ? e.code : null;
		locals.monitor.log({
			level: oauthError === 'invalid_grant' ? 'warn' : 'error',
			event: 'auth.google.token_exchange.failed',
			message: 'Google の認可コードをトークンに交換できなかった',
			...(oauthError ? { oauthError } : { error: describeError(e) })
		});
		clearTransientCookies(cookies);
		redirect(302, '/login?error=oauth_failed');
	}

	if (!identity) {
		clearTransientCookies(cookies);
		redirect(302, '/login?error=oauth_failed');
	}

	const db = createDb(platform.env, locals.monitor.onQuery);
	let found = await findUserByGoogleSub(db, identity.googleSub);

	if (!found) {
		// **登録に条件は無い。** メモが既定で非公開になった以上、入ってきた人に
		// 見えるのは自分のメモだけで、守るべき「場」が存在しない（product.md 第3章）。
		//
		// ADMIN_EMAIL と一致したときだけ admin。「user テーブルが空なら」という
		// 条件は付けない — 登録が開いている以上「最初の1人」が成立しないため。
		const adminEmail = platform.env.ADMIN_EMAIL?.toLowerCase();
		const role = adminEmail && identity.email.toLowerCase() === adminEmail ? 'admin' : 'user';

		try {
			found = await createUser(db, { ...identity, role });
		} catch (e) {
			if (!isUniqueViolation(e)) throw e;
			// 2タブ同時のコールバックなら、もう片方が作った行が googleSub で引ける。
			found = await findUserByGoogleSub(db, identity.googleSub);
			if (!found) {
				// googleSub では見つからない＝email の UNIQUE。別の Google アカウントが同じ email。
				// email はログに出さない。
				locals.monitor.log({
					level: 'warn',
					event: 'auth.google.email_conflict',
					message: '同じ email の別の Google アカウントでログインされ、登録できなかった'
				});
				clearTransientCookies(cookies);
				redirect(302, '/login?error=oauth_failed');
			}
		}
	}

	// 凍結したユーザーは入れない。セッションは作らない。
	if (found.deletedAt !== null) {
		clearTransientCookies(cookies);
		redirect(302, '/login?error=suspended');
	}

	const userId = found.id;

	const token = await createSession(db, userId);

	clearTransientCookies(cookies);
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: url.protocol === 'https:',
		sameSite: 'lax',
		expires: new Date(Date.now() + SESSION_TTL_MS)
	});

	redirect(302, target);
};
