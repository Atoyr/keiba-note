import { listRecentNotes } from '$lib/server/services/notes';
import { listRacesBetween, resolveWeek } from '$lib/server/services/races';
import { todayJst, weeksBefore } from '$lib/utils/date';
import { ctx } from '$lib/server/util';
import type { PageServerLoad } from './$types';

/** 「過去のレース」をどこまで遡るか。3週間。 */
const PAST_WEEKS = 3;

/**
 * ダッシュボード: 最近のメモ / 今週のレース / 過去のレース。
 *
 * レースを「今週」と「過去」に割るのは、**この画面で知りたいことが2つある**から。
 * これから書くレース（今週の開催）と、書いたか確かめたいレース（終わったばかりの開催）で、
 * 1本の一覧に混ぜて日付順に並べると、先に登録しただけの先の重賞が上を埋めて
 * 今週が見えなくなる。重賞は開催のずっと前に枠だけ登録するので、これは普通に起きる。
 *
 * 「今週」は `/this-week` と同じ範囲（連休は火曜まで → services/races の `resolveWeek`）。
 * 画面の中で週の切り方が違うと、同じレースが今週に出たり出なかったりする。
 */
export const load: PageServerLoad = async ({ locals, platform }) => {
	const { db, user } = ctx(locals, platform);

	// 週の解決そのものが1クエリ。残りの3本はそれに依存しないので並行に投げる。
	const week = await resolveWeek(db, 0);

	const [notes, thisWeek, past] = await Promise.all([
		listRecentNotes(db, user.id, 20),
		listRacesBetween(db, user.id, { from: week.start, to: week.end }),
		listRacesBetween(db, user.id, weeksBefore(week, PAST_WEEKS), 'desc')
	]);

	// today はレースの行き先を決めるのに要る（開催前は予想画面 → `raceHref`）。
	return { notes, week, thisWeek, past, pastWeeks: PAST_WEEKS, today: todayJst() };
};
