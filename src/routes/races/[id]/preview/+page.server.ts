import { error, fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { previewNotesSchema } from '$lib/schemas/note';
import { FLOW_PHASES, restrictFlowTo } from '$lib/schemas/race-flow';
import {
	listHistoryForHorses,
	listRaceNotes,
	listSameConditionRaceNotes,
	savePreviewNotes
} from '$lib/server/services/notes';
import { getRaceOdds } from '$lib/server/services/odds';
import { getRace, listEntriesForPreview, listPastRuns } from '$lib/server/services/races';
import { isUpcoming, todayJst } from '$lib/utils/date';
import { ctx } from '$lib/server/util';
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
 * 読みは7クエリ（race / entries+horse / このレースのメモ / 過去メモ / 馬柱 / 同じ条件のレースのメモ / オッズ）。
 * 16頭いても N+1 にしない。過去メモも馬柱も horse_id の IN で一度に引く
 * （D1 は1リクエスト50クエリが上限。architecture.md 7-1）。
 */
export const load: PageServerLoad = async ({ locals, platform, params }) => {
	const { db, user } = ctx(locals, platform);

	const race = await getRace(db, params.id);
	if (!race) error(404, 'レースが見つかりません');

	const entries = await listEntriesForPreview(db, params.id);

	const horseIds = entries.map((e) => e.horseId);

	const { surface, distance } = race;

	const [thisRaceNotes, history, pastRuns, sameCondition, odds] = await Promise.all([
		listRaceNotes(db, params.id, user.id),
		listHistoryForHorses(db, horseIds, params.id, user.id),
		// 馬柱。このレースより前の出走歴だけを見る。
		listPastRuns(db, horseIds, race.date),
		// 見立ての材料。同じ舞台で前に自分が何を見たか。馬場か距離が未定なら「同じ条件」が決まらない。
		surface && distance
			? listSameConditionRaceNotes(
					db,
					{ course: race.course, surface, distance, before: race.date },
					user.id
				)
			: Promise.resolve([]),
		// Cron が30分おきに取ってきた最新のオッズ（D1 の値）。ここから取得元へは行かない。
		getRaceOdds(db, params.id)
	]);

	// オッズは馬番に付く。馬番が決まっていない馬（枠順確定前）には付かない。
	const oddsByNumber = new Map(odds?.horses.map((h) => [h.horseNumber, h]) ?? []);

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
		// 開催前はふりかえりへの導線を出さない（開いても戻されるだけなので）。
		upcoming: isUpcoming(race.date, todayJst()),
		// 取れた時点。1度も取れていなければ null で、オッズの欄ごと出さない。
		oddsAsOf: odds?.asOf ?? null,
		rows: entries.map((e) => ({
			...e,
			odds: e.horseNumber === null ? null : (oddsByNumber.get(e.horseNumber) ?? null),
			myPreview: myPreview.get(e.entryId) ?? null,
			history: history.get(e.horseId) ?? [],
			pastRuns: pastRuns.get(e.horseId) ?? []
		}))
	};
};

export const actions: Actions = {
	default: async ({ locals, platform, params, request }) => {
		const { db, user } = ctx(locals, platform);

		const race = await getRace(db, params.id);
		if (!race) error(404, 'レースが見つかりません');

		const form = await request.formData();

		// 出走馬の構成は DB を正とする。フォームの entryId を鵜呑みにすると
		// 他のレースの出走馬にメモを書き込めてしまう。
		const entries = await listEntriesForPreview(db, params.id);

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
			return fail(400, { message: parsed.issues[0]?.message ?? '入力を確認してください' });
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
