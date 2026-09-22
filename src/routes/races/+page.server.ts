import { listRaces } from '$lib/server/services/races';
import { todayJst } from '$lib/utils/date';
import { ctx } from '$lib/server/util';
import type { PageServerLoad } from './$types';

/** 並びは次のレースが先頭（`listRaces`）。ダッシュボードと同じ順で見えるようにする。 */
export const load: PageServerLoad = async ({ locals, platform }) => {
	const { db, user } = ctx(locals, platform);
	return { races: await listRaces(db, user.id, todayJst()) };
};
