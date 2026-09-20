import { and, countDistinct, desc, eq, or, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Db } from '$lib/server/db';
import { horse, note, race, raceEntry, type Race } from '$lib/server/db/schema';
import { findOrCreateHorse } from './horses';

export type RaceListItem = Pick<
	Race,
	'id' | 'date' | 'course' | 'raceNumber' | 'name' | 'grade' | 'surface' | 'distance'
> & { entryCount: number; noteCount: number };

/**
 * レース一覧。日付降順（design.md 第6章）。
 *
 * 件数は LEFT JOIN + GROUP BY。相関サブクエリを raw な `sql` で書くと
 * Drizzle が列をテーブル修飾なしで展開し、内側のテーブルの同名列に
 * 束縛されて壊れる（horses.ts の listHorses に同じ注記あり）。
 */
export async function listRaces(db: Db, viewerId: string): Promise<RaceListItem[]> {
	return db
		.select({
			id: race.id,
			date: race.date,
			course: race.course,
			raceNumber: race.raceNumber,
			name: race.name,
			grade: race.grade,
			surface: race.surface,
			distance: race.distance,
			entryCount: countDistinct(raceEntry.id),
			noteCount: countDistinct(note.id)
		})
		.from(race)
		.leftJoin(raceEntry, eq(raceEntry.raceId, race.id))
		.leftJoin(
			note,
			and(eq(note.raceId, race.id), or(eq(note.visibility, 'shared'), eq(note.authorId, viewerId)))
		)
		.groupBy(race.id)
		.orderBy(desc(race.date), desc(race.raceNumber))
		.limit(100);
}

export async function getRace(db: Db, id: string): Promise<Race | null> {
	const rows = await db.select().from(race).where(eq(race.id, id)).limit(1);
	return rows.at(0) ?? null;
}

export type CreateRaceInput = Omit<
	Race,
	'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'externalRef'
>;

export async function createRace(
	db: Db,
	input: CreateRaceInput,
	createdBy: string
): Promise<string> {
	const id = ulid();
	await db.insert(race).values({ ...input, id, createdBy });
	return id;
}

export async function updateRace(db: Db, id: string, input: CreateRaceInput): Promise<void> {
	await db
		.update(race)
		.set({ ...input, updatedAt: Math.floor(Date.now() / 1000) })
		.where(eq(race.id, id));
}

export type EntryRow = {
	horseName: string;
	bracket: number | null;
	horseNumber: number | null;
	jockey: string | null;
	finishPosition: number | null;
	finishTime: string | null;
	margin: string | null;
	last3f: number | null;
	popularity: number | null;
};

export type RaceEntryView = {
	entryId: string;
	horseId: string;
	horseName: string;
	bracket: number | null;
	horseNumber: number | null;
	jockey: string | null;
	finishPosition: number | null;
	finishTime: string | null;
	margin: string | null;
	last3f: number | null;
	popularity: number | null;
};

/** そのレースの出走馬。着順 → 馬番の順に並べる。 */
export async function listEntries(db: Db, raceId: string): Promise<RaceEntryView[]> {
	return (
		db
			.select({
				entryId: raceEntry.id,
				horseId: horse.id,
				horseName: horse.name,
				bracket: raceEntry.bracket,
				horseNumber: raceEntry.horseNumber,
				jockey: raceEntry.jockey,
				finishPosition: raceEntry.finishPosition,
				finishTime: raceEntry.finishTime,
				margin: raceEntry.margin,
				last3f: raceEntry.last3f,
				popularity: raceEntry.popularity
			})
			.from(raceEntry)
			.innerJoin(horse, eq(raceEntry.horseId, horse.id))
			.where(eq(raceEntry.raceId, raceId))
			// 着順未確定（NULL）は後ろへ。
			.orderBy(
				sql`CASE WHEN ${raceEntry.finishPosition} IS NULL THEN 1 ELSE 0 END`,
				raceEntry.finishPosition,
				raceEntry.horseNumber
			)
	);
}

/**
 * 出走馬をまとめて保存する。
 *
 * 付け替えを「削除＋再作成」ではなく UPDATE で扱うのが肝。
 * race_entry を消すと、そこに紐づく note が ON DELETE CASCADE で道連れになる
 * （design.md 第10章「`note` の非正規化」のリスク）。
 * そのため既存の馬はそのまま UPDATE し、フォームから消えた行だけを削除する。
 */
export async function saveEntries(
	db: Db,
	raceId: string,
	rows: EntryRow[],
	userId: string
): Promise<{ saved: number; removed: number }> {
	const existing = await db
		.select({ id: raceEntry.id, horseId: raceEntry.horseId })
		.from(raceEntry)
		.where(eq(raceEntry.raceId, raceId));

	const byHorseId = new Map(existing.map((e) => [e.horseId, e.id]));
	const keptHorseIds = new Set<string>();

	const statements = [];

	for (const row of rows) {
		if (!row.horseName.trim()) continue;

		// 馬の引き当ては1頭ずつ走る。MVP では許容（Phase 2 でサジェストに置き換える）。
		const horseId = await findOrCreateHorse(db, row.horseName, userId);
		keptHorseIds.add(horseId);

		const values = {
			bracket: row.bracket,
			horseNumber: row.horseNumber,
			jockey: row.jockey,
			finishPosition: row.finishPosition,
			finishTime: row.finishTime,
			margin: row.margin,
			last3f: row.last3f,
			popularity: row.popularity
		};

		const existingId = byHorseId.get(horseId);
		if (existingId) {
			statements.push(db.update(raceEntry).set(values).where(eq(raceEntry.id, existingId)));
		} else {
			statements.push(db.insert(raceEntry).values({ id: ulid(), raceId, horseId, ...values }));
		}
	}

	// フォームから消えた出走馬は削除する。紐づく note も CASCADE で消える。
	const removed = existing.filter((e) => !keptHorseIds.has(e.horseId));
	for (const e of removed) {
		statements.push(db.delete(raceEntry).where(eq(raceEntry.id, e.id)));
	}

	if (statements.length > 0) {
		// batch は1トランザクション。途中で失敗しても半分だけ保存される事故が起きない。
		await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
	}

	return { saved: keptHorseIds.size, removed: removed.length };
}
