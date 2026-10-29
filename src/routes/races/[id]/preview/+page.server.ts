import { error, fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { previewNotesSchema } from '$lib/schemas/note';
import { FLOW_PHASES, restrictFlowTo } from '$lib/schemas/race-flow';
import {
	listRaceMemoContext,
	listSameConditionRaceNotes,
	savePreviewNotes
} from '$lib/server/services/notes';
import {
	buildGradedProfileView,
	buildGradedRaceTimeline,
	readGradedRaceSeries
} from '$lib/server/services/graded-races';
import { listRaceJockeySummaries } from '$lib/server/services/jockeys';
import { getRaceOdds } from '$lib/server/services/odds';
import { listPastRuns } from '$lib/server/services/races';
import { isUpcoming, todayJst } from '$lib/utils/date';
import { gradedRaceKey, gradedRaceNames, isGraded } from '$lib/utils/graded-race';
import { gradedRaceProfile } from '$lib/utils/graded-race-profile';
import { sexAgeLabel } from '$lib/utils/horse';
import { raceJockeyTags } from '$lib/utils/jockey';
import { popularityByNumber } from '$lib/utils/odds';
import { noteSaveError } from '$lib/utils/note';
import { ctx, raceFormData } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

/**
 * ★ 予想画面。出馬表の形で、各馬の過去メモを横に並べる。
 *
 * ふりかえり（/races/[id]）とは別画面。あちらは結果を見て書く場、こちらは
 * **結果を見る前に書く場**。開催前に書けるのはこの画面だけで、
 * ふりかえりは開催前には開けない（→ /races/[id] の load）。
 *
 * 書けるのは2つ。レース全体の見立て（kind='race_preview'）と、
 * 1頭ごとの出走前メモ（kind='preview'）。
 * **見立ては出走馬が1頭もいなくても書ける。** これから組まれる重賞は
 * 日付と格だけ先に登録され、出馬表はその後に入る（README「出走馬データ」）。
 * その段階で「このレースを狙う」と書き留める先がこれまで無かった。
 *
 * 読みは最大6往復（race+entriesのbatch / 馬柱 / 同条件メモ / オッズ / 騎手のまとめ / 今回・過去メモのbatch）。
 * 2段目の5つは互いに待たず並べて読む。
 * 重賞のときだけ、自分の傾向（重賞の画面で書くもの）と重賞のタイムライン（1 batch）で+1。レース情報に読むだけで出す。
 * GETはセッションのSELECTと更新のUPDATEを含め最大9往復。
 * JS無効のPOST後のloadでは、actionで読んだ共通マスタをlocalsから再利用する。保存1回を含め最大10往復。
 * 16頭いても N+1 にしない。過去メモも馬柱も horse_id の IN で一度に引く
 * （設計上の上限は1リクエスト10往復。architecture.md 7-1）。
 */
export const load: PageServerLoad = async ({ locals, platform, params }) => {
	const { db, user } = ctx(locals, platform);

	const { race, entries } = await raceFormData(db, locals, params.id, 'preview');
	if (!race) error(404, 'レースが見つかりません');

	const horseIds = entries.map((e) => e.horseId);

	const { surface, distance } = race;
	const today = todayJst();

	// 重賞の傾向を引く鍵。別名で走った年のレースでも、重賞の画面と同じ名前になる。
	const gradedKey = isGraded(race.grade) && race.name ? gradedRaceKey(race.name) : null;
	// 表に紹介がある重賞だけ、条件・優先出走権・前哨戦・コースの特徴を出す。
	const profile = gradedKey ? gradedRaceProfile(gradedKey, race.date) : null;

	const [pastRuns, sameCondition, odds, series, jockeySummaries, memos] = await Promise.all([
		// 馬柱。このレースより前の出走歴だけを見る。
		listPastRuns(db, horseIds, race.date),
		// 見立ての材料。同じ舞台で前に自分が何を見たか。馬場か距離が未定なら「同じ条件」が決まらない。
		surface && distance
			? listSameConditionRaceNotes(
					db,
					{
						course: race.course,
						surface,
						distance,
						before: race.date,
						// 重賞のタイムラインに出るレースは、同じ条件の欄に重ねない（SQL で除く）。
						excludeRaceNames: gradedKey ? gradedRaceNames(gradedKey) : undefined
					},
					user.id
				)
			: Promise.resolve([]),
		// GitHub Actions が30分おきに取ってきた最新のオッズ（D1 の値）。ここから取得元へは行かない。
		getRaceOdds(db, params.id),
		// 重賞ごとの傾向と、重賞のタイムライン。読むだけで出す（直すのは重賞の画面）。重賞でなければ引かない。
		gradedKey
			? readGradedRaceSeries(
					db,
					gradedKey,
					user.id,
					profile ? { keys: [...profile.steps], before: race.date } : undefined
				)
			: Promise.resolve(null),
		// 行展開や騎手名を押したときに読む、自分のまとめ（このレースの出走馬の騎手だけ）。
		listRaceJockeySummaries(db, params.id, user.id),
		// 今回の本人メモ・馬ごとの履歴・各走メモ。過去走の結果を待たずに読む（出走IDは履歴から引く）。
		listRaceMemoContext(db, params.id, horseIds, user.id)
	]);
	const { raceNotes: thisRaceNotes, pastRunNotes: runNotes, history } = memos;

	// オッズは馬番に付く。馬番が決まっていない馬（枠順確定前）には付かない。
	const oddsByNumber = new Map(odds?.horses.map((h) => [h.horseNumber, h]) ?? []);
	// 人気は単勝オッズの順で付ける（取得元の人気は票数で決まるが、持っているのはオッズだけ）。
	const popularity = popularityByNumber(odds?.horses ?? []);

	// 読めるのは自分のメモだけなので、著者での選り分けは要らない。
	const myPreview = new Map(
		thisRaceNotes.filter((n) => n.kind === 'preview').map((n) => [n.raceEntryId, n])
	);

	// ふりかえりの `race` ではなく `race_preview`。開催後にふりかえりを保存しても、
	// ここで書いた見立ては別の行として残る（schema.ts の kind 別の部分ユニーク）。
	const myRaceNote = thisRaceNotes.find((n) => n.kind === 'race_preview') ?? null;

	return {
		race,
		myRaceNote,
		// 取り下げで出走馬から外れた馬は盤面から落とす。
		myFlow: restrictFlowTo(myRaceNote?.flow ?? null, new Set(entries.map((e) => e.entryId))),
		sameCondition,
		// このレース自身の行は除く（このレースの見立てと印は入力側にあり、重ねると入力中の値と食い違って見える）。
		graded:
			gradedKey && series
				? {
						key: gradedKey,
						trend: series.trend?.body ?? null,
						timeline: buildGradedRaceTimeline(
							series.races.filter((r) => r.id !== race.id),
							series.notes,
							series.marks,
							today,
							series.entryNoteCounts,
							series.entryReviewCounts
						),
						profile: profile ? buildGradedProfileView(profile, series.stepRaces) : null
					}
				: null,
		today,
		// 開催前はふりかえりへの導線を出さない（開いても戻されるだけなので）。
		upcoming: isUpcoming(race.date, today),
		// 取れた時点。1度も取れていなければ null で、オッズの欄ごと出さない。
		oddsAsOf: odds?.asOf ?? null,
		rows: entries.map((e) => {
			const jockeySummary = e.jockey ? (jockeySummaries.get(e.jockey) ?? null) : null;
			return {
				...e,
				// 出走馬の行の性齢。馬齢はこのレースの日付で数える（出馬表と同じ）。
				sexAge: sexAgeLabel(e.sex, e.birthYear, race.date),
				odds: e.horseNumber === null ? null : (oddsByNumber.get(e.horseNumber) ?? null),
				popularity: e.horseNumber === null ? null : (popularity.get(e.horseNumber) ?? null),
				// 騎手名を押したときに開く、自分のまとめ。無ければ null。
				jockeySummary,
				// 騎手名の下の段に出す、このレースに合う札だけ（東京のレースなら東京巧者）。
				jockeyCourseTags: jockeySummary ? raceJockeyTags(jockeySummary.tags, race) : [],
				myPreview: myPreview.get(e.entryId) ?? null,
				history: history.get(e.horseId) ?? [],
				pastRuns: (pastRuns.get(e.horseId) ?? []).map((run) => ({
					...run,
					notes: runNotes.get(run.entryId) ?? []
				}))
			};
		})
	};
};

export const actions: Actions = {
	default: async ({ locals, platform, params, request }) => {
		const { db, user } = ctx(locals, platform);

		const { race, entries } = await raceFormData(db, locals, params.id, 'preview');
		if (!race) error(404, 'レースが見つかりません');

		const form = await request.formData();

		// 出走馬の構成は DB を正とする。フォームの entryId を鵜呑みにすると
		// 他のレースの出走馬にメモを書き込めてしまう。
		const parsed = v.safeParse(previewNotesSchema, {
			raceNote: {
				body: form.get('raceNoteBody')?.toString() ?? '',
				// 展開の欄は出走馬がいるときしか画面に出ない。欄が来なかったら undefined にして、
				// 保存済みの展開に触らない（null と読むと黙って消える）。
				flow: !form.has(`flowSpots.${FLOW_PHASES[0]}`)
					? undefined
					: {
							pace: form.get('racePace')?.toString() ?? '',
							...Object.fromEntries(
								FLOW_PHASES.map((p) => [
									p,
									{
										spots: form.get(`flowSpots.${p}`)?.toString() ?? '',
										memo: form.get(`flowMemo.${p}`)?.toString() ?? ''
									}
								])
							)
						}
			},
			entries: entries.map((e) => ({
				entryId: e.entryId,
				horseId: e.horseId,
				body: form.get(`body.${e.entryId}`)?.toString() ?? '',
				// 札は複数選択なので getAll。1つも選ばれていなければ空配列になる。
				tags: form.getAll(`tags.${e.entryId}`).map(String),
				mark: form.get(`mark.${e.entryId}`)?.toString() ?? ''
			}))
		});

		if (!parsed.success) {
			return fail(400, { message: noteSaveError(parsed.issues[0], 'preview', entries) });
		}

		// occurred_at はレース日。タイムラインでそのレースの位置に並ぶ。
		// 盤面に置けるのはこのレースの出走馬だけ（フォームの id は鵜呑みにしない）。
		const flow = restrictFlowTo(
			parsed.output.raceNote.flow,
			new Set(entries.map((e) => e.entryId))
		);

		// 件数（`saved`）は返さない。画面の知らせは、変えたメモの数を画面の側で数える（utils/note.ts の savedMessage）。
		await savePreviewNotes(
			db,
			{ raceId: params.id, ...parsed.output, raceNote: { ...parsed.output.raceNote, flow } },
			user.id,
			race.date
		);

		return { savedAt: Date.now() };
	}
};
