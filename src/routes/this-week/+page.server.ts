import { listGradedRacesInWeek, resolveWeek } from '$lib/server/services/races';
import { todayJst } from '$lib/utils/date';
import { ctx } from '$lib/server/util';
import type { PageServerLoad } from './$types';

/**
 * 今週の重賞。予想の入口。
 *
 * 「今週」は月曜〜日曜（JST）。ただし連休で月曜・火曜まで開催がある週は、
 * その最終日までを今週に含める（→ services/races の `resolveWeek`）。
 * `?w=` で前後の週へ動かせる。
 *
 * 行き先は予想画面。**結果が出たレースだけふりかえりへ**向ける（→ `isSettled`）。
 */
export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const { db, user } = ctx(locals, platform);

	const requested = Number(url.searchParams.get('w') ?? 0);
	const offset = Number.isInteger(requested) ? requested : 0;
	const week = await resolveWeek(db, offset);

	return {
		week,
		offset,
		today: todayJst(),
		races: await listGradedRacesInWeek(db, week, user.id)
	};
};
