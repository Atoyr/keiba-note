import { listRecentNotes, listWatchSources } from '$lib/server/services/notes';
import { listRacesBetween, resolveWeek } from '$lib/server/services/races';
import { awaitingReview, pickWatchlist } from '$lib/utils/dashboard';
import { todayJst, weeksBefore } from '$lib/utils/date';
import { ctx } from '$lib/server/util';
import type { PageServerLoad } from './$types';

/** 「過去のレース」をどこまで遡るか。3週間。 */
const PAST_WEEKS = 3;

/**
 * ダッシュボード: **次にやること**の画面。上から
 * 今週出走する注目馬 → ふりかえり待ち → 今週のレース → 過去のレース → 最近のメモ。
 *
 * 目的は「次のレースで勝つための積み上げ」なので、開いた瞬間に
 * 「今週どの馬を狙うか」「どのレースの答え合わせが残っているか」が見えることを優先する。
 * 注目馬は自分が付けた「次走買い／次走消し」の札から、ふりかえり待ちは
 * 予想したのにふりかえっていないレースから組む（→ `$lib/utils/dashboard`）。
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
	// 未ログインは紹介ページ（hooks が `/` だけを完全一致で通している）。
	// **DB に触らない。** ここで何か引くと、そのまま誰にでも見える。
	if (!locals.user) return { landing: true as const };

	const { db, user } = ctx(locals, platform);

	// 週の解決そのものが1クエリ。残りの4本はそれに依存しないので並行に投げる（計5クエリ）。
	const week = await resolveWeek(db, 0);
	const thisWeekRange = { from: week.start, to: week.end };

	const [notes, thisWeek, past, watchSources] = await Promise.all([
		listRecentNotes(db, user.id, 20),
		listRacesBetween(db, user.id, thisWeekRange),
		listRacesBetween(db, user.id, weeksBefore(week, PAST_WEEKS), 'desc'),
		listWatchSources(db, user.id, thisWeekRange)
	]);

	// today はレースの行き先と進み具合を決めるのに要る（結果が出るまでは予想画面 → `isSettled`）。
	const today = todayJst();

	return {
		landing: false as const,
		notes,
		week,
		thisWeek,
		past,
		pastWeeks: PAST_WEEKS,
		today,
		watchlist: pickWatchlist(watchSources),
		// 今週のうち走り終えたものも含める。土曜に予想して日曜の夜に開いたとき、
		// 土曜のレースの答え合わせが「過去のレース」に落ちるのは来週になってから。
		awaiting: awaitingReview([...thisWeek, ...past], today)
	};
};
