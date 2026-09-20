import { redirect } from '@sveltejs/kit';
import { INVITE_COOKIE, INVITE_COOKIE_TTL_SECONDS } from '$lib/server/auth/invite';
import type { PageServerLoad } from './$types';

/**
 * 招待の受諾。
 *
 * ここではコードの有効性を**検証しない**。検証は callback で、Google から
 * 返った email と突き合わせて初めて意味を持つため。ここでやると
 * 「そのコードが存在するか」を未認証の第三者に教えることになる。
 *
 * やることは、コードを HttpOnly Cookie に30分入れて /auth/google へ送るだけ。
 * これで OAuth のリダイレクト往復をまたいで招待を持ち回せる。
 */
export const load: PageServerLoad = ({ params, cookies, url }) => {
	cookies.set(INVITE_COOKIE, params.code, {
		path: '/',
		httpOnly: true,
		secure: url.protocol === 'https:',
		sameSite: 'lax',
		maxAge: INVITE_COOKIE_TTL_SECONDS
	});

	redirect(302, '/auth/google');
};
