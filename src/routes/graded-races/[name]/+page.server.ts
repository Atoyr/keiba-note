import { error, fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { gradedRaceTrendSchema } from '$lib/schemas/graded-race';
import {
	buildGradedRaceTimeline,
	currentGrade,
	getGradedRaceTrend,
	listSeriesNotes,
	listSeriesRaces,
	saveGradedRaceTrend
} from '$lib/server/services/graded-races';
import { ctx } from '$lib/server/util';
import { todayJst } from '$lib/utils/date';
import { gradedRaceKey, gradedRaceNames } from '$lib/utils/graded-race';
import type { Actions, PageServerLoad } from './$types';

/**
 * 重賞の画面＝傾向のメモ + 年ごとのメモ（予想とふりかえり）。
 *
 * 骨は同じ重賞のレース（レース名を別名の表で寄せた鍵で束ねる。誰が見ても同じ）で、そこに viewer 自身の
 * レース全体のメモと印を重ねる。1頭ごとのメモの本文は出さない。読みは3つで、並行に投げる。
 * 見出しの格は今年のレースの格（無ければいちばん新しい年の格）。G1〜G3 のレースが1つも無い名前は 404。
 */
export const load: PageServerLoad = async ({ locals, platform, params }) => {
	const { db, user } = ctx(locals, platform);
	const key = gradedRaceKey(params.name);
	const names = gradedRaceNames(key);
	const today = todayJst();

	const [races, series, trend] = await Promise.all([
		listSeriesRaces(db, names),
		listSeriesNotes(db, names, user.id),
		getGradedRaceTrend(db, key, user.id)
	]);
	const headline = currentGrade(races, today.slice(0, 4));
	if (!headline) error(404, '重賞が見つかりません');

	return {
		key,
		name: headline.race.name ?? key,
		headline,
		trend,
		timeline: buildGradedRaceTimeline(
			races,
			series.notes,
			series.marks,
			today,
			series.entryNoteCounts
		),
		hasNotes:
			series.notes.length > 0 ||
			series.marks.length > 0 ||
			Object.keys(series.entryNoteCounts).length > 0,
		today
	};
};

export const actions: Actions = {
	/**
	 * 傾向のメモを書く・書き直す。本文が空なら消える。
	 * 傾向は本人だけのもので、マスタには何も書かないので、admin でなくても書ける。
	 */
	saveTrend: async ({ locals, platform, params, request }) => {
		const { db, user } = ctx(locals, platform);
		const key = gradedRaceKey(params.name);
		const races = await listSeriesRaces(db, gradedRaceNames(key));
		if (!currentGrade(races, todayJst().slice(0, 4))) error(404, '重賞が見つかりません');

		const form = await request.formData();
		const body = form.get('body')?.toString() ?? '';
		const parsed = v.safeParse(gradedRaceTrendSchema, { body });
		if (!parsed.success) {
			// JS が無いと画面が描き直されるので、入力した本文も返す（失敗した欄を空に戻さない）。
			return fail(400, { message: parsed.issues[0]?.message ?? '入力を確認してください', body });
		}

		const result = await saveGradedRaceTrend(db, key, parsed.output.body, user.id);
		return { trend: result };
	}
};
