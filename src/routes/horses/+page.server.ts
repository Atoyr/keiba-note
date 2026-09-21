import { listHorses } from '$lib/server/services/horses';
import { ctx } from '$lib/server/util';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const { db, user } = ctx(locals, platform);
	const q = url.searchParams.get('q') ?? '';
	return { horses: await listHorses(db, user.id, q), q };
};
