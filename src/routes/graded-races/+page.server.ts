import {
	buildGradedRaceList,
	listGradedRaceTrendKeys,
	listGradedRacesOfYear,
	listNotedGradedYears
} from '$lib/server/services/graded-races';
import { ctx } from '$lib/server/util';
import { todayJst } from '$lib/utils/date';
import { gradedRaceKey } from '$lib/utils/graded-race';
import type { PageServerLoad } from './$types';

/**
 * 重賞の一覧＝今年（JST の暦年）に G1〜G3 で登録されているレース。格は今年のもの。
 * 重賞はマスタを持たず、レース名を別名の表で寄せた鍵で束ねる（services/graded-races.ts）。読みは3クエリで、並行に投げる。
 */
export const load: PageServerLoad = async ({ locals, platform }) => {
	const { db, user } = ctx(locals, platform);
	const year = todayJst().slice(0, 4);

	const [races, notedYears, trendKeys] = await Promise.all([
		listGradedRacesOfYear(db, year),
		listNotedGradedYears(db, user.id),
		listGradedRaceTrendKeys(db, user.id)
	]);

	return {
		year,
		items: buildGradedRaceList(
			races,
			notedYears,
			// 別名の鍵で書いた傾向も同じ重賞のものとして数える。
			trendKeys.map(gradedRaceKey)
		)
	};
};
