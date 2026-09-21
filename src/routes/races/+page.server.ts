import { listRaces } from '$lib/server/services/races';
import { ctx } from '$lib/server/util';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const { db, user } = ctx(locals, platform);
	return { races: await listRaces(db, user.id) };
};
