import { listRecentNotes } from '$lib/server/services/notes';
import { listRaces } from '$lib/server/services/races';
import { ctx } from '$lib/server/util';
import type { PageServerLoad } from './$types';

/** ダッシュボード: 最近のメモ / 直近のレース。読みは2クエリ。 */
export const load: PageServerLoad = async ({ locals, platform }) => {
	const { db, user } = ctx(locals, platform);

	const [notes, races] = await Promise.all([
		listRecentNotes(db, user.id, 20),
		listRaces(db, user.id)
	]);

	return { notes, races: races.slice(0, 5) };
};
