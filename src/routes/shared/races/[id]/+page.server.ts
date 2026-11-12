import { error } from '@sveltejs/kit';
import { createDb } from '$lib/server/db';
import { getSharedRaceSummary } from '$lib/server/services/race-shares';
import { appEnv } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
	setHeaders({
		'x-robots-tag': 'noindex, nofollow',
		'referrer-policy': 'no-referrer',
		'cache-control': 'private, no-store'
	});
	const env = appEnv();
	if (!env.DB) error(503, 'データベースに接続できません');
	const shared = await getSharedRaceSummary(createDb(env, locals.monitor.onQuery), params.id);
	if (!shared) error(404, 'このページは見つかりません');
	// 未ログインの人にだけ末尾の案内を出す（product.md「予想まとめ」）。
	// 渡すのは真偽だけ。アカウント情報は共有ページのデータに載せない。
	return { ...shared, signedIn: locals.user !== null };
};
