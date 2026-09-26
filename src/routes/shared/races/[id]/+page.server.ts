import { error } from '@sveltejs/kit';
import { createDb } from '$lib/server/db';
import { getSharedRaceSummary } from '$lib/server/services/race-shares';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, platform, setHeaders }) => {
	setHeaders({
		'x-robots-tag': 'noindex, nofollow',
		'referrer-policy': 'no-referrer',
		'cache-control': 'private, no-store'
	});
	if (!platform?.env.DB) error(503, 'データベースに接続できません');
	const shared = await getSharedRaceSummary(
		createDb(platform.env, locals.monitor.onQuery),
		params.id
	);
	if (!shared) error(404, 'このページは見つかりません');
	return shared;
};
