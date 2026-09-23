import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, invalidateSession } from '$lib/server/auth/session';
import { createDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

/**
 * ログアウト。POST のみ（GET だと先読みやリンク踏みで落ちる）。
 * SvelteKit が Origin ヘッダを検証するので CSRF 対策は既定のままでよい。
 */
export const POST: RequestHandler = async ({ cookies, platform, locals }) => {
	const token = cookies.get(SESSION_COOKIE);

	if (token && platform?.env?.DB) {
		await invalidateSession(createDb(platform.env, locals.monitor.onQuery), token);
	}

	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/login');
};
