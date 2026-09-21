import { redirect } from '@sveltejs/kit';
import { generateCodeVerifier, generateState } from 'arctic';
import {
	GOOGLE_SCOPES,
	OAUTH_STATE_COOKIE,
	OAUTH_TTL_SECONDS,
	OAUTH_VERIFIER_COOKIE,
	REDIRECT_COOKIE,
	createGoogleClient
} from '$lib/server/auth/google';
import { safeRedirect } from '$lib/utils/redirect';
import type { RequestHandler } from './$types';

/**
 * Google の認可画面へ送る。
 * state と PKCE の code_verifier を作り、HttpOnly Cookie に10分だけ置く。
 */
export const GET: RequestHandler = ({ cookies, url, platform }) => {
	if (!platform?.env) redirect(302, '/login?error=unavailable');

	const state = generateState();
	const codeVerifier = generateCodeVerifier();

	const secure = url.protocol === 'https:';
	const base = {
		path: '/',
		httpOnly: true,
		secure,
		sameSite: 'lax',
		maxAge: OAUTH_TTL_SECONDS
	} as const;

	cookies.set(OAUTH_STATE_COOKIE, state, base);
	cookies.set(OAUTH_VERIFIER_COOKIE, codeVerifier, base);

	// ログイン後に戻る先。往復をまたぐので Cookie で持ち回す。
	const target = safeRedirect(url.searchParams.get('redirect'));
	if (target !== '/') {
		cookies.set(REDIRECT_COOKIE, target, base);
	} else {
		cookies.delete(REDIRECT_COOKIE, { path: '/' });
	}

	const google = createGoogleClient(platform.env, url.origin);
	redirect(302, google.createAuthorizationURL(state, codeVerifier, GOOGLE_SCOPES).toString());
};
