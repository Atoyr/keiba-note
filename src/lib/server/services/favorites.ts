import { and, asc, eq, gte } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { favoriteHorse, horse, race, raceEntry } from '$lib/server/db/schema';
import type { FavoriteHorse, FavoriteRun } from '$lib/utils/dashboard';
import { raceResultCount } from './races';

/**
 * 推しの馬。
 *
 * **誰が何を推しているかは本人だけのもの。** メモと同じく、読む関数は viewerId を必須で受け、
 * WHERE に `user_id = :viewer` を入れる（architecture.md 第0章）。
 * 馬・レース・出走馬はマスタなので、推しても書くのは favorite_horse の行だけ。
 */

function ownedBy(viewerId: string) {
	return eq(favoriteHorse.userId, viewerId);
}

/** その馬を viewer が推しているか。 */
export async function isFavoriteHorse(db: Db, horseId: string, viewerId: string): Promise<boolean> {
	const rows = await db
		.select({ horseId: favoriteHorse.horseId })
		.from(favoriteHorse)
		.where(and(ownedBy(viewerId), eq(favoriteHorse.horseId, horseId)))
		.limit(1);
	return rows.length > 0;
}

/**
 * 推しにする・外す。何度押しても同じ状態になる（二重送信で行が増えたり、エラーになったりしない）。
 * 馬があるかはルートが先に確かめる。
 */
export async function setFavoriteHorse(
	db: Db,
	horseId: string,
	userId: string,
	favorite: boolean
): Promise<void> {
	if (favorite) {
		await db.insert(favoriteHorse).values({ userId, horseId }).onConflictDoNothing();
	} else {
		await db
			.delete(favoriteHorse)
			.where(and(eq(favoriteHorse.userId, userId), eq(favoriteHorse.horseId, horseId)));
	}
}

/** viewer の推しの馬。馬名の順。 */
export async function listFavoriteHorses(db: Db, viewerId: string): Promise<FavoriteHorse[]> {
	return db
		.select({ horseId: horse.id, horseName: horse.name })
		.from(favoriteHorse)
		.innerJoin(horse, eq(favoriteHorse.horseId, horse.id))
		.where(ownedBy(viewerId))
		.orderBy(asc(horse.name))
		.limit(200);
}

/**
 * viewer の推しの馬の、`from`（JST の今日）以降の出走。1クエリ。
 *
 * 当日のレースを走り終えたかは結果の有無で決めるので、ここでは日付で粗く切るだけにして、
 * 最後の線引きは `$lib/utils/dashboard` の `favoriteSchedule` に任せる。
 */
export async function listFavoriteRuns(
	db: Db,
	viewerId: string,
	from: string
): Promise<FavoriteRun[]> {
	return db
		.select({
			horseId: horse.id,
			horseName: horse.name,
			entryId: raceEntry.id,
			raceId: race.id,
			raceDate: race.date,
			resultCount: raceResultCount(),
			course: race.course,
			raceNumber: race.raceNumber,
			raceName: race.name,
			grade: race.grade,
			horseNumber: raceEntry.horseNumber
		})
		.from(favoriteHorse)
		.innerJoin(horse, eq(favoriteHorse.horseId, horse.id))
		.innerJoin(raceEntry, eq(raceEntry.horseId, horse.id))
		.innerJoin(race, eq(raceEntry.raceId, race.id))
		.where(and(ownedBy(viewerId), gte(race.date, from)))
		.orderBy(asc(race.date), asc(race.raceNumber))
		.limit(200);
}
