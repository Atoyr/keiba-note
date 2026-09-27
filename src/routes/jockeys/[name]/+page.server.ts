import { error, fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { jockeySummarySchema } from '$lib/schemas/jockey';
import {
	getJockeySummary,
	JOCKEY_RIDE_LIMIT,
	jockeyExists,
	listJockeyRideNotes,
	listJockeyRides,
	mergeJockeyTimeline,
	saveJockeySummary
} from '$lib/server/services/jockeys';
import { ctx } from '$lib/server/util';
import { todayJst } from '$lib/utils/date';
import type { Actions, PageServerLoad } from './$types';

/**
 * 騎手の画面＝まとめ + 騎乗のタイムライン。
 *
 * 骨は騎乗（`race_entry`。誰が見ても同じ）で、そこに viewer 自身のメモ（その騎乗の出走前・ふりかえり）を重ねる。
 * まとめは1人・1騎手につき1本（本文と札）。読みは3クエリで、並行に投げる。
 *
 * `?notes=1` でメモのある騎乗だけにする。騎乗は数百になるので、メモを読み返したいときに
 * メモの無い行を送らなくて済むように。URL に残るのは、予想の最中に開き直しても同じ絞りで見られるように。
 */
export const load: PageServerLoad = async ({ locals, platform, params, url }) => {
	const { db, user } = ctx(locals, platform);
	const name = params.name;
	const today = todayJst();

	const [rides, notes, summary] = await Promise.all([
		listJockeyRides(db, name),
		listJockeyRideNotes(db, name, user.id),
		getJockeySummary(db, name, user.id)
	]);
	if (rides.length === 0) error(404, '騎手が見つかりません');

	const timeline = mergeJockeyTimeline(rides, notes, today);
	const notedCount = timeline.filter((r) => r.notes.length > 0).length;
	const onlyNoted = url.searchParams.get('notes') === '1';

	return {
		name,
		summary,
		timeline: onlyNoted ? timeline.filter((r) => r.notes.length > 0) : timeline,
		rideCount: rides.length,
		/** 騎乗が上限まであったか（古い騎乗を出していない）。 */
		truncated: rides.length >= JOCKEY_RIDE_LIMIT,
		notedCount,
		onlyNoted,
		today
	};
};

export const actions: Actions = {
	/**
	 * まとめを書く・書き直す。本文も札も空なら消える。
	 * まとめは本人だけのもので、マスタには何も書かないので、admin でなくても書ける。
	 */
	saveSummary: async ({ locals, platform, params, request }) => {
		const { db, user } = ctx(locals, platform);
		if (!(await jockeyExists(db, params.name))) error(404, '騎手が見つかりません');

		const form = await request.formData();
		const parsed = v.safeParse(jockeySummarySchema, {
			body: form.get('body')?.toString() ?? '',
			tags: form.getAll('tags').map(String)
		});
		if (!parsed.success) {
			return fail(400, { message: parsed.issues[0]?.message ?? '入力を確認してください' });
		}

		const result = await saveJockeySummary(db, params.name, parsed.output, user.id);
		return { summary: result };
	}
};
