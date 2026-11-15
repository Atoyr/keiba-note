import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '#lib/server/db/index.ts';
import { horseTrait } from '#lib/server/db/schema.ts';
import type { HorseTraitValue } from '#lib/schemas/horse.ts';

/**
 * 馬の特徴メモ（画面の言葉は「メモ」）。1人・1頭につき1本（本文と札）。**本人だけのもの**。
 *
 * **`horse.profile_memo`（admin が書く共通マスタ）とは別物。** こちらは自分の見立てで、
 * 読む関数は viewerId を必須で受け、WHERE に `user_id = :viewer` を入れる（architecture.md 第0章）。
 */

/** viewer の特徴メモ（本文と札）。無ければ null。 */
export async function getHorseTrait(
	db: Db,
	horseId: string,
	viewerId: string
): Promise<HorseTraitValue | null> {
	const rows = await db
		.select({ body: horseTrait.body, tags: horseTrait.tags })
		.from(horseTrait)
		.where(and(eq(horseTrait.userId, viewerId), eq(horseTrait.horseId, horseId)))
		.limit(1);
	return rows.at(0) ?? null;
}

/**
 * 出走馬たちの特徴メモを読む1クエリ（`listRaceMemoContext` の batch に載せる）。
 * **viewer 自身のものだけ**。メモの無い馬は返らない。
 */
export function horseTraitsQuery(db: Db, horseIds: string[], viewerId: string) {
	return db
		.select({ horseId: horseTrait.horseId, body: horseTrait.body, tags: horseTrait.tags })
		.from(horseTrait)
		.where(and(eq(horseTrait.userId, viewerId), inArray(horseTrait.horseId, horseIds)));
}

/**
 * 特徴メモを書く（1人・1頭につき1本。編集＝上書き）。**本文も札も空なら消す。**
 * 札だけ付けておく（「東京巧者」だけ）のは普通の使い方なので、本文が空でも札があれば残す（`saveJockeySummary` と同じ）。
 * 馬がいるかはルートが先に確かめる。
 */
export async function saveHorseTrait(
	db: Db,
	horseId: string,
	input: HorseTraitValue,
	userId: string
): Promise<'saved' | 'cleared'> {
	const body = input.body.trim();
	const mine = and(eq(horseTrait.userId, userId), eq(horseTrait.horseId, horseId));

	if (!body && input.tags.length === 0) {
		await db.delete(horseTrait).where(mine);
		return 'cleared';
	}

	await db
		.insert(horseTrait)
		.values({ userId, horseId, body, tags: input.tags })
		.onConflictDoUpdate({
			target: [horseTrait.userId, horseTrait.horseId],
			set: { body, tags: input.tags, updatedAt: sql`(unixepoch())` }
		});
	return 'saved';
}
