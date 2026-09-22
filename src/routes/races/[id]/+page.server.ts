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

	// `listRaceNotes` が返すのは **viewer 自身のメモだけ**（design.md 第2章 2-2）。
	// 以前あった「他人のメモを読み取り専用で出す」分岐は、返ってこない行を
	// 選り分けるだけの死にコードになったので落とした。
	const myRaceNote = notes.find((n) => n.kind === 'race') ?? null;
	const myEntryNotes = new Map(
		notes.filter((n) => n.kind === 'entry').map((n) => [n.raceEntryId, n])
	);

	return {
		race,
		rows: entries.map((e) => ({
			...e,
			myNote: myEntryNotes.get(e.entryId) ?? null
		})),
		myRaceNote
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
				body: form.get('raceNoteBody')?.toString() ?? ''
			},
			entries: entries.map((e) => ({
				entryId: e.entryId,
				horseId: e.horseId,
				body: form.get(`body.${e.entryId}`)?.toString() ?? '',
				// 札は複数選択なので getAll。1つも選ばれていなければ空配列になる。
				tags: form.getAll(`tags.${e.entryId}`).map(String)
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
