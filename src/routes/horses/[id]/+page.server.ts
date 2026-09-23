import { error, fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { deleteNoteSchema, horseNoteSchema } from '$lib/schemas/note';
import { getHorse, updateHorseProfile } from '$lib/server/services/horses';
import {
	addHorseNote,
	deleteNote,
	getHorseTimeline,
	mergeHorseTimeline
} from '$lib/server/services/notes';
import { listRunsForHorse } from '$lib/server/services/races';
import { todayJst } from '$lib/utils/date';
import { ctx, ctxAdmin } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

/**
 * ★ 馬詳細＝プロフィール + タイムライン。
 *
 * レース紐付きメモも近況メモも同じ流れに並ぶ。これが note を
 * 1テーブルにした狙い（product.md 第2章）。
 *
 * **出走はメモが無くても並べる。** 骨は race_entry（誰が見ても同じ走った事実）で、
 * そこに viewer 自身のメモを重ねる。読みは3クエリで、3本とも並行に投げる。
 */
export const load: PageServerLoad = async ({ locals, platform, params }) => {
	const { db, user } = ctx(locals, platform);

	const today = todayJst();

	const [horse, notes, runs] = await Promise.all([
		getHorse(db, params.id),
		getHorseTimeline(db, params.id, user.id),
		listRunsForHorse(db, params.id)
	]);

	if (!horse) error(404, '馬が見つかりません');

	// viewerId は返さない。タイムラインに並ぶメモは viewer 自身のものだけなので、
	// 画面側で「自分のメモか」を判定する必要がなくなった。
	return { horse, timeline: mergeHorseTimeline(notes, runs, today), today };
};

export const actions: Actions = {
	/** 近況メモを追加する。 */
	addNote: async ({ locals, platform, params, request }) => {
		const { db, user } = ctx(locals, platform);

		const horse = await getHorse(db, params.id);
		if (!horse) error(404, '馬が見つかりません');

		const form = await request.formData();
		const parsed = v.safeParse(horseNoteSchema, {
			body: form.get('body')?.toString() ?? '',
			tags: form.getAll('tags').map(String),
			occurredAt: form.get('occurredAt')?.toString() ?? todayJst()
		});

		if (!parsed.success) {
			return fail(400, { message: parsed.issues[0]?.message ?? '入力を確認してください' });
		}

		await addHorseNote(db, { horseId: params.id, ...parsed.output }, user.id);
		return { added: true };
	},

	/** 自分のメモを消す。他人のメモはサービス層で弾かれる。 */
	deleteNote: async ({ locals, platform, request }) => {
		const { db, user } = ctx(locals, platform);

		const form = await request.formData();
		const parsed = v.safeParse(deleteNoteSchema, {
			noteId: form.get('noteId')?.toString() ?? ''
		});
		if (!parsed.success) return fail(400, { message: '削除できませんでした' });

		const ok = await deleteNote(db, parsed.output.noteId, user.id);
		if (!ok) return fail(403, { message: '自分のメモだけ削除できます' });

		return { deleted: true };
	},

	/**
	 * プロフィール欄。馬の属性と常設メモ。
	 *
	 * 全ユーザー共通のマスタを書き換えるので admin だけ（product.md 第4章 / 第9章 #10）。
	 * 一般ユーザーが馬について書けるのはタイムラインの近況メモ（`addNote`）の方。
	 */
	saveProfile: async ({ locals, platform, params, request }) => {
		const { db } = ctxAdmin(locals, platform);

		const form = await request.formData();
		const str = (k: string) => form.get(k)?.toString().trim() || null;
		const year = Number(form.get('birthYear')?.toString().trim());

		await updateHorseProfile(db, params.id, {
			nameKana: str('nameKana'),
			sex: (['牡', '牝', 'セ'] as const).find((s) => s === str('sex')) ?? null,
			birthYear: Number.isInteger(year) && year > 1900 ? year : null,
			trainer: str('trainer'),
			sire: str('sire'),
			dam: str('dam'),
			profileMemo: str('profileMemo')
		});

		return { profileSaved: true };
	}
};
