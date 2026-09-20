import { redirect } from '@sveltejs/kit';
import { OAuth2RequestError } from 'arctic';
import {
	OAUTH_STATE_COOKIE,
	OAUTH_VERIFIER_COOKIE,
	REDIRECT_COOKIE,
	createGoogleClient,
	parseIdToken
} from '$lib/server/auth/google';
import { INVITE_COOKIE, consumeInvite, findUsableInvite } from '$lib/server/auth/invite';
import {
	SESSION_COOKIE,
	SESSION_TTL_MS,
	createSession,
	createUser,
	findUserByGoogleSub,
	hasAnyUser
} from '$lib/server/auth/session';
import { createDb } from '$lib/server/db';
import { safeRedirect } from '$lib/utils/redirect';
import type { RequestHandler } from './$types';

/** 一時 Cookie をまとめて捨てる。 */
function clearTransientCookies(cookies: {
	delete: (name: string, opts: { path: string }) => void;
}) {
	for (const name of [OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, REDIRECT_COOKIE, INVITE_COOKIE]) {
		cookies.delete(name, { path: '/' });
	}
}

export const GET: RequestHandler = async ({ cookies, url, platform }) => {
	if (!platform?.env?.DB) redirect(302, '/login?error=unavailable');

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get(OAUTH_STATE_COOKIE);
	const codeVerifier = cookies.get(OAUTH_VERIFIER_COOKIE);
	const inviteCode = cookies.get(INVITE_COOKIE) ?? null;
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
		// 認可コードが無効・期限切れなど。中身はログにだけ出す。
		console.error('google token exchange failed', e instanceof OAuth2RequestError ? e.code : e);
		clearTransientCookies(cookies);
		redirect(302, '/login?error=oauth_failed');
	}

	if (!identity) {
		clearTransientCookies(cookies);
		redirect(302, '/login?error=oauth_failed');
	}

	const db = createDb(platform.env);
	const existing = await findUserByGoogleSub(db, identity.googleSub);

	let userId: string;

	if (existing) {
		userId = existing.id;
	} else {
		// 未登録。ここから先は「招待があるか」だけが登録の門になる。
		const bootstrap =
			!(await hasAnyUser(db)) &&
			identity.email.toLowerCase() === platform.env.OWNER_EMAIL?.toLowerCase();

		if (bootstrap) {
			const created = await createUser(db, { ...identity, role: 'owner' });
			userId = created.id;
		} else {
			const usable = inviteCode ? await findUsableInvite(db, inviteCode, identity.email) : null;

			if (!usable) {
				// 存在しない・使用済み・期限切れ・宛先不一致をすべて同じ扱いにする。
				clearTransientCookies(cookies);
				redirect(302, '/login?error=invite_required');
			}

			const created = await createUser(db, { ...identity, role: 'member' });

			// 消費に失敗＝その招待は他の誰かに先に使われた。ユーザーは作ってしまった
			// あとなので、ここで弾かずに通す方が害が大きい。招待は1回しか消費できない
			// ことだけを DB 側で保証しておく。
			const consumed = await consumeInvite(db, usable.id, created.id);
			if (!consumed) {
				console.warn('invite already consumed', usable.id);
			}

			userId = created.id;
		}
	}

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
