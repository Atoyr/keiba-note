import { listHorses } from '$lib/server/services/horses';
import { ctx } from '$lib/server/util';
import { parseOffset } from '$lib/utils/paging';
import type { PageServerLoad } from './$types';

/**
 * 馬一覧。`?q=` で名前（とカナ）の部分一致に絞る。
 * `?offset=` は何件目から読むか（100件ずつ。画面は下端で続きを読む → `$lib/utils/paging`）。
 */
export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const { db, user } = ctx(locals, platform);
	const q = url.searchParams.get('q') ?? '';
	const offset = parseOffset(url.searchParams);
	return { horses: await listHorses(db, user.id, q, offset), q, offset };
};
