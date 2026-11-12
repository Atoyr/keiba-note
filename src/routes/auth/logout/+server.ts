import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, invalidateSession } from '$lib/server/auth/session';
import { createDb } from '$lib/server/db';
import { appEnv } from '$lib/server/platform';
import type { RequestHandler } from './$types';

/**
 * ログアウト。POST のみ（GET だと先読みやリンク踏みで落ちる）。
 * SvelteKit が Origin ヘッダを検証するので CSRF 対策は既定のままでよい。
 */
export const POST: RequestHandler = async ({ cookies, locals }) => {
	const token = cookies.get(SESSION_COOKIE);

	const env = appEnv();
	if (token && env.DB) {
		await invalidateSession(createDb(env, locals.monitor.onQuery), token);
	}

	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/login');
};
