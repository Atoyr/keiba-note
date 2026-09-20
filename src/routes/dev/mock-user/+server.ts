import { dev } from '$app/environment';
import { error, redirect } from '@sveltejs/kit';
import { MOCK_USER_COOKIE, isMockUserKey } from '$lib/server/auth/mock';
import { safeRedirect } from '$lib/utils/redirect';
import type { RequestHandler } from './$types';

/**
 * モックユーザーの切り替え。開発専用。
 * `dev` ガードにより本番ビルドでは常に 404 になる。
 */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	if (!dev) error(404, 'Not found');

	const form = await request.formData();
	const as = form.get('as')?.toString();

	if (!isMockUserKey(as)) error(400, 'unknown mock user');

	cookies.set(MOCK_USER_COOKIE, as, {
		path: '/',
		httpOnly: true,
		secure: url.protocol === 'https:',
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 365
	});

	redirect(303, safeRedirect(form.get('redirect')?.toString()));
};
