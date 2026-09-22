import { and, asc, between, countDistinct, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Db } from '$lib/server/db';
import { horse, note, race, raceEntry, type Race } from '$lib/server/db/schema';
import { GRADED } from '$lib/schemas/race';
import { currentWeek, shiftWeek, weekLookupRange, type Week } from '$lib/utils/date';
import { findOrCreateHorse } from './horses';

export type RaceListItem = Pick<
	Race,
	'id' | 'date' | 'course' | 'raceNumber' | 'name' | 'grade' | 'className' | 'surface' | 'distance'
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
			className: race.className,
			surface: race.surface,
			distance: race.distance,
			entryCount: countDistinct(raceEntry.id),
			noteCount: countDistinct(note.id)
		})
		.from(race)
		.leftJoin(raceEntry, eq(raceEntry.raceId, race.id))
		.leftJoin(note, and(eq(note.raceId, race.id), eq(note.authorId, viewerId)))
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

/** そのレースの出走馬。着順 → 馬番の順に並べる（ふりかえり用）。 */
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

/** 一覧に出すレースの条件。JRA（course が10場の選択式）・重賞・芝。 */
const gradedTurf = and(inArray(race.grade, [...GRADED]), eq(race.surface, '芝'));

/**
 * 開催日だけを返す。週の終わりが月曜・火曜まで伸びるかの判定に使う。
 *
 * 一覧と同じ条件で引く。画面に出ないレースで週を伸ばしても、伸ばした先に出るものが無い。
 */
async function listGradedRaceDates(db: Db, from: string, to: string): Promise<string[]> {
	const rows = await db
		.selectDistinct({ date: race.date })
		.from(race)
		.where(and(between(race.date, from, to), gradedTurf));
	return rows.map((r) => r.date);
}

/**
 * 表示する週を決める。`offset` は一覧の「前の週 / 次の週」ぶん。
 *
 * 連休は月曜・火曜まで開催があるので、週の終わりは登録済みの開催日を見て決まる
 * （→ `$lib/utils/date` の `currentWeek`）。判定に要る日付は今週と移動先の前後に限られるので、
 * まとめて1回で引いてから週を解決する。
 */
export async function resolveWeek(db: Db, offset: number, now: Date = new Date()): Promise<Week> {
	const { from, to } = weekLookupRange(now, offset);
	const dates = await listGradedRaceDates(db, from, to);
	return shiftWeek(currentWeek(now, dates), offset, dates);
}

/**
 * 今週の重賞。予想の入口。
 *
 * 対象は **JRA・重賞・芝** に絞る。
 * - JRA — `course` が10場の選択式なので、列の値がそのまま JRA であることを意味する
 * - 重賞 — `G1` / `G2` / `G3` のみ。`L` / `OP` は重賞ではない
 * - 芝 — ダート・障害は対象外
 *
 * 週の範囲（連休は火曜まで）は `resolveWeek` が決める。
 * 該当が無い週は空で返す。条件を緩めて埋めたりはしない。
 */
export async function listGradedRacesInWeek(
	db: Db,
	week: Week,
	viewerId: string
): Promise<RaceListItem[]> {
	return db
		.select({
			id: race.id,
			date: race.date,
			course: race.course,
			raceNumber: race.raceNumber,
			name: race.name,
			grade: race.grade,
			className: race.className,
			surface: race.surface,
			distance: race.distance,
			entryCount: countDistinct(raceEntry.id),
			noteCount: countDistinct(note.id)
		})
		.from(race)
		.leftJoin(raceEntry, eq(raceEntry.raceId, race.id))
		.leftJoin(note, and(eq(note.raceId, race.id), eq(note.authorId, viewerId)))
		.where(and(between(race.date, week.start, week.end), gradedTurf))
		.groupBy(race.id)
		.orderBy(asc(race.date), asc(race.raceNumber));
}

/**
 * 出馬表の並びで出走馬を返す（予想用）。
 *
 * 馬番の昇順。**馬番が未定（枠順確定前）の馬は後ろに回し、馬名順で並べる。**
 * 着順では並べない。出走前なので着順はまだ無い。
 */
export async function listEntriesForPreview(db: Db, raceId: string): Promise<RaceEntryView[]> {
	return db
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
		.orderBy(
			sql`CASE WHEN ${raceEntry.horseNumber} IS NULL THEN 1 ELSE 0 END`,
			asc(raceEntry.horseNumber),
			asc(horse.name)
		);
}

/** 馬柱1走ぶん。過去のレースの race_entry がそのまま材料になる。 */
export type PastRun = {
	horseId: string;
	raceId: string;
	date: string;
	course: string;
	raceNumber: number | null;
	raceName: string | null;
	grade: string | null;
	/** 条件戦のクラス（`1勝クラス` 等）。重賞は格があるので普通は NULL。 */
	className: string | null;
	surface: string | null;
	distance: number | null;
	trackCondition: string | null;
	finishPosition: number | null;
	popularity: number | null;
	last3f: number | null;
	margin: string | null;
	jockey: string | null;
};

/**
 * 馬柱の材料。出走馬たちの**このレースより前**の出走歴をまとめて返す。
 *
 * **1クエリ。** 16頭 × 5走を1頭ずつ引くと N+1 になり、D1 の
 * 「1リクエストあたり50クエリ」（architecture.md 7-1）に近づく。
 * `horse_id IN (...)` で一度に取り、頭ごとの件数制限は JS 側で切る。
 * SQL で頭ごとに5走に絞るには窓関数が要るが、取ってから捨てるほうが単純で、
 * この規模なら転送量も問題にならない。
 *
 * 並びは日付の降順。**着順が入っていない行も返す**（出走予定だけ登録して
 * 結果が未入力のレースもある）。表示側で「—」を出すか落とすかを決める。
 */
export async function listPastRuns(
	db: Db,
	horseIds: string[],
	beforeDate: string,
	perHorse = 5
): Promise<Map<string, PastRun[]>> {
	if (horseIds.length === 0) return new Map();

	const rows = await db
		.select({
			horseId: raceEntry.horseId,
			raceId: race.id,
			date: race.date,
			course: race.course,
			raceNumber: race.raceNumber,
			raceName: race.name,
			grade: race.grade,
			className: race.className,
			surface: race.surface,
			distance: race.distance,
			trackCondition: race.trackCondition,
			finishPosition: raceEntry.finishPosition,
			popularity: raceEntry.popularity,
			last3f: raceEntry.last3f,
			margin: raceEntry.margin,
			jockey: raceEntry.jockey
		})
		.from(raceEntry)
		.innerJoin(race, eq(raceEntry.raceId, race.id))
		.where(and(inArray(raceEntry.horseId, horseIds), lt(race.date, beforeDate)))
		.orderBy(desc(race.date), desc(race.raceNumber))
		.limit(horseIds.length * perHorse * 3);

	const byHorse = new Map<string, PastRun[]>();
	for (const r of rows) {
		const list = byHorse.get(r.horseId) ?? [];
		if (list.length >= perHorse) continue;
		list.push(r);
		byHorse.set(r.horseId, list);
	}
	return byHorse;
}
