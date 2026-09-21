import { error, fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { previewNotesSchema } from '$lib/schemas/note';
import { listHistoryForHorses, listRaceNotes, savePreviewNotes } from '$lib/server/services/notes';
import { getRace, listEntriesForPreview, listPastRuns } from '$lib/server/services/races';
import { ctx } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

/**
 * ★ 予想画面。出馬表の形で、各馬の過去メモを横に並べる。
 *
 * ふりかえり（/races/[id]）とは別画面。あちらは書く場、こちらは読む場。
 * ただし出走前に気づいたことはその場で書けるようにしてある（kind='preview'）。
 *
 * 読みは5クエリ（race / entries+horse / このレースのメモ / 過去メモ / 馬柱）。
 * 16頭いても N+1 にしない。過去メモも馬柱も horse_id の IN で一度に引く
 * （D1 は1リクエスト50クエリが上限。architecture.md 7-1）。
 */
export const load: PageServerLoad = async ({ locals, platform, params }) => {
	const { db, user } = ctx(locals, platform);

	const race = await getRace(db, params.id);
	if (!race) error(404, 'レースが見つかりません');

	const entries = await listEntriesForPreview(db, params.id);

	const horseIds = entries.map((e) => e.horseId);

	const [thisRaceNotes, history, pastRuns] = await Promise.all([
		listRaceNotes(db, params.id, user.id),
		listHistoryForHorses(db, horseIds, params.id, user.id),
		// 馬柱。このレースより前の出走歴だけを見る。
		listPastRuns(db, horseIds, race.date)
	]);

	// 読めるのは自分のメモだけなので、著者での選り分けは要らない。
	const myPreview = new Map(
		thisRaceNotes.filter((n) => n.kind === 'preview').map((n) => [n.raceEntryId, n])
	);

	return {
		race,
		rows: entries.map((e) => ({
			...e,
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
			entries: entries.map((e) => ({
				entryId: e.entryId,
				horseId: e.horseId,
				body: form.get(`body.${e.entryId}`)?.toString() ?? '',
				rating: form.get(`rating.${e.entryId}`)?.toString() ?? '',
				mark: form.get(`mark.${e.entryId}`)?.toString() ?? ''
			}))
		});

		if (!parsed.success) {
			return fail(400, { message: parsed.issues[0]?.message ?? '入力を確認してください' });
		}

		// occurred_at はレース日。タイムラインでそのレースの位置に並ぶ。
		const result = await savePreviewNotes(
			db,
			{ raceId: params.id, entries: parsed.output.entries },
			user.id,
			race.date
		);

		return { saved: result.saved, savedAt: Date.now() };
	}
};
