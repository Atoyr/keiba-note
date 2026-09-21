import { and, asc, countDistinct, desc, eq, like, or } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Db } from '$lib/server/db';
import { horse, note, race, raceEntry, type Horse } from '$lib/server/db/schema';

/**
 * 馬。
 *
 * この層は SvelteKit を知らない（architecture.md「層を分ける実利」）。
 * 引数で db と userId を受け取り、値を返すだけ。
 */

export type HorseListItem = Pick<Horse, 'id' | 'name' | 'sex' | 'birthYear' | 'trainer'> & {
	entryCount: number;
	noteCount: number;
};

/**
 * 馬の一覧。`q` があれば名前の部分一致で絞る。
 *
 * 件数は相関サブクエリではなく LEFT JOIN + GROUP BY で出す。
 * Drizzle は raw な `sql` テンプレート内の列をテーブル修飾なしで展開するため、
 * `(SELECT count(*) FROM race_entry WHERE horse_id = id)` のように書くと
 * `id` が race_entry.id に束縛されて常に 0 件になる。
 *
 * メモ件数は **viewer 自身のメモだけ**を数える。他人の分を含めると、
 * 本文を出していなくても「誰かが何か書いている」ことが漏れる。
 */
export async function listHorses(db: Db, viewerId: string, q?: string): Promise<HorseListItem[]> {
	const filter = q?.trim()
		? or(like(horse.name, `%${q.trim()}%`), like(horse.nameKana, `%${q.trim()}%`))
		: undefined;

	return db
		.select({
			id: horse.id,
			name: horse.name,
			sex: horse.sex,
			birthYear: horse.birthYear,
			trainer: horse.trainer,
			entryCount: countDistinct(raceEntry.id),
			noteCount: countDistinct(note.id)
		})
		.from(horse)
		.leftJoin(raceEntry, eq(raceEntry.horseId, horse.id))
		.leftJoin(note, and(eq(note.horseId, horse.id), eq(note.authorId, viewerId)))
		.where(filter)
		.groupBy(horse.id)
		.orderBy(asc(horse.name))
		.limit(200);
}

export async function getHorse(db: Db, id: string): Promise<Horse | null> {
	const rows = await db.select().from(horse).where(eq(horse.id, id)).limit(1);
	return rows.at(0) ?? null;
}

/**
 * 馬名から引き当て、無ければ作る。出走馬の一括入力で使う。
 *
 * `(name, birth_year)` が UNIQUE なので、生年が分からないうちは
 * 同名馬を1頭にまとめてしまう。Phase 2 の本実装ではサジェストで
 * 既存馬を選ばせて衝突を避ける（design.md 第9章 #5）。
 */
export async function findOrCreateHorse(
	db: Db,
	name: string,
	createdBy: string | null
): Promise<string> {
	const trimmed = name.trim();

	const found = await db
		.select({ id: horse.id })
		.from(horse)
		.where(eq(horse.name, trimmed))
		.limit(1);

	const hit = found.at(0);
	if (hit) return hit.id;

	const id = ulid();
	await db.insert(horse).values({ id, name: trimmed, createdBy });
	return id;
}

export async function updateHorseProfile(
	db: Db,
	id: string,
	patch: Partial<
		Pick<Horse, 'nameKana' | 'sex' | 'birthYear' | 'trainer' | 'sire' | 'dam' | 'profileMemo'>
	>
): Promise<void> {
	await db
		.update(horse)
		.set({ ...patch, updatedAt: Math.floor(Date.now() / 1000) })
		.where(eq(horse.id, id));
}

/** 馬が走ったレースの一覧（タイムラインの見出しに使う）。 */
export async function getHorseEntries(db: Db, horseId: string) {
	return db
		.select({
			entryId: raceEntry.id,
			raceId: race.id,
			date: race.date,
			course: race.course,
			raceNumber: race.raceNumber,
			raceName: race.name,
			grade: race.grade,
			finishPosition: raceEntry.finishPosition
		})
		.from(raceEntry)
		.innerJoin(race, eq(raceEntry.raceId, race.id))
		.where(eq(raceEntry.horseId, horseId))
		.orderBy(desc(race.date));
}
