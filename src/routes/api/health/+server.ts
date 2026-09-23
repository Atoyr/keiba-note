import { json } from '@sveltejs/kit';
import { createDb, pingDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

/**
 * 死活監視。GitHub Actions（health.yml）が外から定期的に叩く（docs/monitoring.md）。
 *
 * Worker が応答し、D1 に `select 1` が通れば 200。通らなければ 503。
 * **ログイン不要（PUBLIC_PATHS）なので、状態以外は何も返さない。** 理由は Workers Logs の
 * `d1.query.failed` に残る。
 */
export const GET: RequestHandler = async ({ platform, locals }) => {
	const headers = { 'cache-control': 'no-store' };
	const ok = platform?.env?.DB
		? await pingDb(createDb(platform.env, locals.monitor.onQuery))
		: false;

	return json({ status: ok ? 'ok' : 'error' }, { status: ok ? 200 : 503, headers });
};
