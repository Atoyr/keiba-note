import { listRecentNotes } from '$lib/server/services/notes';
import { listRaces } from '$lib/server/services/races';
import { todayJst } from '$lib/utils/date';
import { ctx } from '$lib/server/util';
import type { PageServerLoad } from './$types';

/**
 * ダッシュボード: 最近のメモ / 直近のレース。読みは2クエリ。
 *
 * レースは**次のレースから**5件（`listRaces`）。ここは5件しか出さないので、
 * 日付の降順にすると先の予定に埋もれて次のレースが一覧から落ちる。
 */
export const load: PageServerLoad = async ({ locals, platform }) => {
	const { db, user } = ctx(locals, platform);

	const [notes, races] = await Promise.all([
		listRecentNotes(db, user.id, 20),
		listRaces(db, user.id, todayJst())
	]);

	return { notes, races: races.slice(0, 5) };
};
