import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '#lib/server/db/index.ts';
import { note, oauthGrant, session, user } from '#lib/server/db/schema.ts';

/**
 * サイト管理者の画面が使うユーザーの一覧と凍結。
 * **権限は見ない**（呼ぶルートが ctxAdmin と「自分自身は凍結できない」を確かめる。api.md 第5章のマスタの書き込みと同じ流儀）。
 */

/**
 * 一覧に出すのはアカウントの素性だけ。メモの件数すら出さない
 * （本文を見せなくても「何か書いている」ことは漏れる）。作成の新しい順。
 */
export function listUsersForAdmin(db: Db, limit = 200) {
	return db
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
		.limit(limit);
}

/**
 * 凍結＝論理削除。行は消さない（note.author_id が NOT NULL のため）。
 *
 * セッションを全削除してログイン不能にし、**同時に共有中のメモを private に倒す。**
 * 退会した人の共有リンクがいつまでも開けるのは筋が悪い（product.md 第4章 #8）。
 * 触るのは可視性だけで、本文は読みも書きもしない。4文は1つの batch（途中で止まって半端に凍らせない）。
 * 行が無い userId でも成功のまま（何も起きない）。
 */
export async function freezeUser(db: Db, targetId: string, now: Date = new Date()): Promise<void> {
	const sec = Math.floor(now.getTime() / 1000);

	await db.batch([
		db.update(user).set({ deletedAt: sec, updatedAt: sec }).where(eq(user.id, targetId)),
		db.delete(session).where(eq(session.userId, targetId)),
		// AI との連携（MCP）も切る。トークンは退会で止まるが、凍結を戻したときに生き返らせない。
		db.delete(oauthGrant).where(eq(oauthGrant.userId, targetId)),
		db
			.update(note)
			.set({ visibility: 'private', updatedAt: sec })
			.where(and(eq(note.authorId, targetId), eq(note.visibility, 'unlisted')))
	]);
}
