import { parseJockeyTag } from '$lib/schemas/jockey';
import { listJockeys, listJockeyTagsInUse } from '$lib/server/services/jockeys';
import { ctx } from '$lib/server/util';
import type { PageServerLoad } from './$types';

/**
 * 騎手の一覧。名前（部分一致）と、自分が付けた札で絞る。
 * 騎手はマスタを持たず、出走馬の騎手名で束ねる（services/jockeys.ts）。読みは2クエリ。
 */
export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const { db, user } = ctx(locals, platform);
	const q = url.searchParams.get('q') ?? '';
	// 選択肢に無い札は捨てる（＝札では絞らない）。
	const tag = parseJockeyTag(url.searchParams.get('tag'));

	const [jockeys, tagsInUse] = await Promise.all([
		listJockeys(db, user.id, { q, tag }),
		listJockeyTagsInUse(db, user.id)
	]);
	return { jockeys, tagsInUse, q, tag };
};
