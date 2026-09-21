import { listGradedRacesInWeek } from '$lib/server/services/races';
import { ctx } from '$lib/server/util';
import { currentWeek, shiftWeek } from '$lib/utils/date';
import type { PageServerLoad } from './$types';

/**
 * 今週の重賞。予想の入口。
 *
 * 「今週」は月曜〜日曜（JST）。`?w=` で前後の週へ動かせる。
 */
export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const { db, user } = ctx(locals, platform);

	const offset = Number(url.searchParams.get('w') ?? 0);
	const week = shiftWeek(currentWeek(), Number.isInteger(offset) ? offset : 0);

	return {
		week,
		offset: Number.isInteger(offset) ? offset : 0,
		races: await listGradedRacesInWeek(db, week, user.id)
	};
};
