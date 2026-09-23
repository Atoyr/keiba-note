import { error, fail, redirect } from '@sveltejs/kit';
import { resolve as resolveRoute } from '$app/paths';
import * as v from 'valibot';
import { raceReviewSchema } from '$lib/schemas/note';
import { listRaceNotes, saveRaceReview } from '$lib/server/services/notes';
import { getRace, listEntries } from '$lib/server/services/races';
import { isUpcoming, todayJst } from '$lib/utils/date';
import { ctx } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

/**
 * ★ ふりかえり画面。このアプリで一番よく使う画面。
 *
 * **まだ走っていないレースでは開けない。** 走る前に「どう走ったか」を訊く欄が
 * 出ていると、書く場所を間違えたのかと読ませてしまう。開催前に書きたいことは
 * 見立てと出走前メモで、それは予想画面（`/races/[id]/preview`）にある。
 * ダッシュボードもレース一覧も開催前のレースを普通に並べるので、
 * **入口ごとに塞ぐのではなく、この画面自身が行き先を持つ**。
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

	// 開催前なら予想画面へ送る。302（恒久ではない）なのは、
	// **同じ URL が開催日を過ぎれば正しい行き先になる**ため。
	if (isUpcoming(race.date, todayJst())) {
		redirect(302, resolveRoute('/races/[id]/preview', { id: params.id }));
	}

	// `listRaceNotes` が返すのは **viewer 自身のメモだけ**（design.md 第2章 2-2）。
	// 以前あった「他人のメモを読み取り専用で出す」分岐は、返ってこない行を
	// 選り分けるだけの死にコードになったので落とした。
	const myRaceNote = notes.find((n) => n.kind === 'race') ?? null;
	const myEntryNotes = new Map(
		notes.filter((n) => n.kind === 'entry').map((n) => [n.raceEntryId, n])
	);
	// 開催前に書いた見立て。**読むだけ**で、ここからは直せない。
	// 直せるようにすると「結果を見たあとで見立てを書き換える」ができてしまい、
	// 事前と事後を別の行にした意味が無くなる。直すのは予想画面。
	const myRacePreview = notes.find((n) => n.kind === 'race_preview') ?? null;
	// 1頭ごとの出走前メモと印。**答え合わせの材料**で、見立てと同じく読むだけ。
	// 印を付け直せると、結果を見てから予想を書き換えられてしまう。
	const myPreviews = new Map(
		notes.filter((n) => n.kind === 'preview').map((n) => [n.raceEntryId, n])
	);

	return {
		race,
		myRacePreview,
		rows: entries.map((e) => {
			const p = myPreviews.get(e.entryId);
			return {
				...e,
				myNote: myEntryNotes.get(e.entryId) ?? null,
				myPreview: p ? { mark: p.mark, body: p.body, tags: p.tags } : null
			};
		}),
		myRaceNote
	};
};

export const actions: Actions = {
	default: async ({ locals, platform, params, request }) => {
		const { db, user } = ctx(locals, platform);

		const race = await getRace(db, params.id);
		if (!race) error(404, 'レースが見つかりません');

		// load が先に弾くのでフォーム自体そこにないが、直接叩かれた場合に
		// 開催前のレースへ `kind='race'` の行が立つのを防ぐ。
		if (isUpcoming(race.date, todayJst())) {
			error(400, 'まだ開催されていないレースにふりかえりは書けません');
		}

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
