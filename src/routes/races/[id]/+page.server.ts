import { error, fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { raceReviewSchema } from '$lib/schemas/note';
import { listRaceNotes, saveRaceReview } from '$lib/server/services/notes';
import { getRace, listEntries } from '$lib/server/services/races';
import { ctx } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

/**
 * ★ ふりかえり画面。このアプリで一番よく使う画面。
 *
 * 読みは3クエリ（race / entries+horse / notes+user）。
 * 18頭いても N+1 にしない、が設計ルール（architecture.md 7-1）。
 */
export const load: PageServerLoad = async ({ locals, platform, params }) => {
	const { db, user } = ctx(locals, platform);

	const [race, entries, notes] = await Promise.all([
		getRace(db, params.id),
		listEntries(db, params.id),
		listRaceNotes(db, params.id, user.id)
	]);

	if (!race) error(404, 'レースが見つかりません');

	// 自分のメモはフォームに、他人のメモは読み取り専用で出す。
	// 他人のメモは編集できない（design.md 第9章 #3）。
	const myRaceNote = notes.find((n) => n.kind === 'race' && n.authorId === user.id) ?? null;
	const othersRaceNotes = notes.filter((n) => n.kind === 'race' && n.authorId !== user.id);

	const myEntryNotes = new Map(
		notes.filter((n) => n.kind === 'entry' && n.authorId === user.id).map((n) => [n.raceEntryId, n])
	);
	const othersEntryNotes = new Map<string, typeof notes>();
	for (const n of notes) {
		if (n.kind !== 'entry' || n.authorId === user.id || !n.raceEntryId) continue;
		const list = othersEntryNotes.get(n.raceEntryId) ?? [];
		list.push(n);
		othersEntryNotes.set(n.raceEntryId, list);
	}

	return {
		race,
		rows: entries.map((e) => ({
			...e,
			myNote: myEntryNotes.get(e.entryId) ?? null,
			othersNotes: othersEntryNotes.get(e.entryId) ?? []
		})),
		myRaceNote,
		othersRaceNotes
	};
};

export const actions: Actions = {
	default: async ({ locals, platform, params, request }) => {
		const { db, user } = ctx(locals, platform);

		const race = await getRace(db, params.id);
		if (!race) error(404, 'レースが見つかりません');

		const form = await request.formData();

		// 出走馬の構成はフォームではなく DB を正とする。
		// フォームから来た entryId を鵜呑みにすると、他のレースの entry に
		// メモを書き込めてしまう。
		const entries = await listEntries(db, params.id);

		const parsed = v.safeParse(raceReviewSchema, {
			raceNote: {
				body: form.get('raceNoteBody')?.toString() ?? '',
				visibility: form.get('raceNoteVisibility')?.toString() ?? 'shared'
			},
			entries: entries.map((e) => ({
				entryId: e.entryId,
				horseId: e.horseId,
				body: form.get(`body.${e.entryId}`)?.toString() ?? '',
				rating: form.get(`rating.${e.entryId}`)?.toString() ?? '',
				visibility: form.get(`visibility.${e.entryId}`)?.toString() ?? 'shared'
			}))
		});

		if (!parsed.success) {
			return fail(400, { message: parsed.issues[0]?.message ?? '入力を確認してください' });
		}

		// occurred_at はレース日。これでタイムラインがレース順に並ぶ。
		const result = await saveRaceReview(
			db,
			{ raceId: params.id, ...parsed.output },
			user.id,
			race.date
		);

		return { saved: result.saved, savedAt: Date.now() };
	}
};
