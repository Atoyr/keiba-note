import { fail } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import * as v from 'valibot';
import { note, session, user } from '$lib/server/db/schema';
import { ctxAdmin } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

/**
 * サイト管理者の画面。メンテ作業のための区分で、**メンバー管理ではない**。
 *
 * **他人のメモはここからも読めない。** admin にできるのはマスタの修正と
 * ユーザーの凍結だけで、メモを覗くことではない（product.md 第4章）。
 */
const freezeSchema = v.object({ userId: v.pipe(v.string(), v.minLength(1)) });

export const load: PageServerLoad = async ({ locals, platform }) => {
	const { db } = ctxAdmin(locals, platform);

	// 出すのはアカウントの素性だけ。メモの件数すら出さない
	// （本文を見せなくても「何か書いている」ことは漏れる）。
	const users = await db
		.select({
			id: user.id,
			email: user.email,
			displayName: user.displayName,
			role: user.role,
			deletedAt: user.deletedAt,
			createdAt: user.createdAt
		})
		.from(user)
		.orderBy(desc(user.createdAt))
		.limit(200);

	return { users };
};

export const actions: Actions = {
	/**
	 * 凍結＝論理削除。行は消さない（note.author_id が NOT NULL のため）。
	 *
	 * セッションを全削除してログイン不能にし、**同時に共有中のメモを private に倒す。**
	 * 退会した人の共有リンクがいつまでも開けるのは筋が悪い（product.md 第9章 #8）。
	 * 触るのは可視性だけで、本文は読みも書きもしない。
	 */
	freeze: async ({ request, locals, platform }) => {
		const { db, user: admin } = ctxAdmin(locals, platform);

		const form = await request.formData();
		const parsed = v.safeParse(freezeSchema, { userId: form.get('userId')?.toString() ?? '' });
		if (!parsed.success) return fail(400, { message: '操作を受け付けられませんでした' });

		const targetId = parsed.output.userId;
		if (targetId === admin.id) return fail(400, { message: '自分自身は凍結できません' });

		const now = Math.floor(Date.now() / 1000);

		await db.batch([
			db.update(user).set({ deletedAt: now, updatedAt: now }).where(eq(user.id, targetId)),
			db.delete(session).where(eq(session.userId, targetId)),
			db
				.update(note)
				.set({ visibility: 'private', updatedAt: now })
				.where(and(eq(note.authorId, targetId), eq(note.visibility, 'unlisted')))
		]);

		return { frozen: true };
	}
};
