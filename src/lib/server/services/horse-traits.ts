import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '#lib/server/db/index.ts';
import { horseTrait } from '#lib/server/db/schema.ts';

/**
 * 馬の特徴メモ。1人・1頭につき1本（本文だけ）。**本人だけのもの**。
 *
 * **`horse.profile_memo`（admin が書く共通マスタ）とは別物。** こちらは自分の見立てで、
 * 読む関数は viewerId を必須で受け、WHERE に `user_id = :viewer` を入れる（architecture.md 第0章）。
 */

/** viewer の特徴メモの本文。無ければ null。 */
export async function getHorseTrait(
	db: Db,
	horseId: string,
	viewerId: string
): Promise<string | null> {
	const rows = await db
		.select({ body: horseTrait.body })
		.from(horseTrait)
		.where(and(eq(horseTrait.userId, viewerId), eq(horseTrait.horseId, horseId)))
		.limit(1);
	return rows.at(0)?.body ?? null;
}

/**
 * 出走馬たちの特徴メモを読む1クエリ（`listRaceMemoContext` の batch に載せる）。
 * **viewer 自身のものだけ**。メモの無い馬は返らない。
 */
export function horseTraitsQuery(db: Db, horseIds: string[], viewerId: string) {
	return db
		.select({ horseId: horseTrait.horseId, body: horseTrait.body })
		.from(horseTrait)
		.where(and(eq(horseTrait.userId, viewerId), inArray(horseTrait.horseId, horseIds)));
}

/**
 * 特徴メモを書く（1人・1頭につき1本。編集＝上書き）。**本文が空なら消す。**
 * 馬がいるかはルートが先に確かめる。
 */
export async function saveHorseTrait(
	db: Db,
	horseId: string,
	body: string,
	userId: string
): Promise<'saved' | 'cleared'> {
	const text = body.trim();

	if (!text) {
		await db
			.delete(horseTrait)
			.where(and(eq(horseTrait.userId, userId), eq(horseTrait.horseId, horseId)));
		return 'cleared';
	}

	await db
		.insert(horseTrait)
		.values({ userId, horseId, body: text })
		.onConflictDoUpdate({
			target: [horseTrait.userId, horseTrait.horseId],
			set: { body: text, updatedAt: sql`(unixepoch())` }
		});
	return 'saved';
}
