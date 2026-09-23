import { and, asc, between, countDistinct, desc, eq, inArray, like, lt, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Db } from '$lib/server/db';
import { horse, note, race, raceEntry, type Race } from '$lib/server/db/schema';
import { GRADED } from '$lib/schemas/race';
import { currentWeek, shiftWeek, weekLookupRange, type Week } from '$lib/utils/date';
import { EMPTY_RACE_FILTER, yearRange, type RaceFilter } from '$lib/utils/race-filter';
import { findOrCreateHorse } from './horses';

export type RaceListItem = Pick<
	Race,
	'id' | 'date' | 'course' | 'raceNumber' | 'name' | 'grade' | 'className' | 'surface' | 'distance'
> & {
	entryCount: number;
	noteCount: number;
	/** 着順の入った出走の数。行き先（予想かふりかえりか）を決める（→ `opensReview`）。 */
	resultCount: number;
	/** 自分のふりかえり（`race` と `entry`）の数。書いてあれば結果の前でもふりかえりへ向ける。 */
	reviewCount: number;
};

/**
 * レースの着順の入った出走の数。どの画面でもリンク先を `isSettled` で決めるための材料。
 *
 * 出走やメモとの JOIN で行が増えるクエリにもそのまま足せるよう、相関サブクエリにする。
 * **外側の列を `${}` で埋めない。** Drizzle が修飾なしで展開して内側の race_entry に
 * 束縛される（`listRaces` の注記）。代わりに外側の `"race"."id"` を文字で書くので、
 * 外側のクエリに `race` が別名なしで入っていることが前提。LEFT JOIN で race が無い行は 0。
 */
export function raceResultCount() {
	return sql<number>`(SELECT count(*) FROM race_entry AS settled WHERE settled.race_id = "race"."id" AND settled.finish_position IS NOT NULL)`;
}

/**
 * 絞り込み条件 → WHERE。指定の無い項目は `undefined` を渡して外す。
 *
 * `and` は `undefined` を捨てるので、全部空なら `undefined`（＝絞らない）になる。
 * 格付けは `IN` なので複数指定が OR になる。名前は部分一致で、
 * `name` が NULL の行は LIKE が NULL を返して自然に落ちる（名前未設定のレースは
 * 名前で探せない、で正しい）。
 */
function raceFilterWhere(filter: RaceFilter) {
	const year = filter.year === null ? null : yearRange(filter.year);
	return and(
		year ? between(race.date, year.from, year.to) : undefined,
		filter.grades.length > 0 ? inArray(race.grade, filter.grades) : undefined,
		filter.q ? like(race.name, `%${filter.q}%`) : undefined
	);
}

/**
 * レース一覧。日付降順（product.md 第6章）。
 *
 * 件数は LEFT JOIN + GROUP BY。相関サブクエリを raw な `sql` で書くと
 * Drizzle が列をテーブル修飾なしで展開し、内側のテーブルの同名列に
 * 束縛されて壊れる（horses.ts の listHorses に同じ注記あり）。
 *
 * `filter` は年度・格付け・レース名の絞り込み（→ `$lib/utils/race-filter`）。
 * **メモ件数は viewer 自身のぶんだけ**を数えるのは絞り込みの有無によらない。
 */
export async function listRaces(
	db: Db,
	viewerId: string,
	filter: RaceFilter = EMPTY_RACE_FILTER
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
			noteCount: countDistinct(note.id),
			resultCount: raceResultCount(),
			reviewCount: sql<number>`count(DISTINCT CASE WHEN ${note.kind} IN ('race', 'entry') THEN ${note.id} END)`
		})
		.from(race)
		.leftJoin(raceEntry, eq(raceEntry.raceId, race.id))
		.leftJoin(note, and(eq(note.raceId, race.id), eq(note.authorId, viewerId)))
		.where(raceFilterWhere(filter))
		.groupBy(race.id)
		.orderBy(desc(race.date), desc(race.raceNumber))
		.limit(100);
}

/**
 * 期間内のレースに添える、自分のメモの種類別の件数。ダッシュボードの進み具合
 * （見立て済・印 N頭・ふりかえり済 → `$lib/utils/dashboard` の `raceProgress`）の材料。
 */
export type RaceProgressItem = RaceListItem & {
	/** 見立て（`race_preview`）。 */
	outlookCount: number;
	/** 印を付けた出走前メモ。 */
	markCount: number;
};

/**
 * 期間内のレース。ダッシュボードの「今週のレース」「過去のレース」が読む。
 *
 * **重賞に絞らない**（`/this-week` とはここが違う）。ダッシュボードは予想の入口ではなく
 * 自分が書いたもの・これから書くものの置き場なので、条件戦が落ちると歯抜けに見える。
 *
 * `order` は日付の向き。今週は昇順（先に走るレースから）、過去は降順（最後に走ったレースから）。
 * 件数は `listRaces` と同じで viewer 自身のメモだけを数える。
 *
 * 種類別の件数は `count(DISTINCT CASE ...)`。出走馬との JOIN で行が増えるので、
 * 素の `sum(CASE ...)` だと出走馬の頭数ぶん水増しされる。
 */
export async function listRacesBetween(
	db: Db,
	viewerId: string,
	range: { from: string; to: string },
	order: 'asc' | 'desc' = 'asc'
): Promise<RaceProgressItem[]> {
	const dir = order === 'asc' ? asc : desc;

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
			noteCount: countDistinct(note.id),
			resultCount: raceResultCount(),
			outlookCount: sql<number>`count(DISTINCT CASE WHEN ${note.kind} = 'race_preview' THEN ${note.id} END)`,
			markCount: sql<number>`count(DISTINCT CASE WHEN ${note.kind} = 'preview' AND ${note.mark} IS NOT NULL THEN ${note.id} END)`,
			reviewCount: sql<number>`count(DISTINCT CASE WHEN ${note.kind} IN ('race', 'entry') THEN ${note.id} END)`
		})
		.from(race)
		.leftJoin(raceEntry, eq(raceEntry.raceId, race.id))
		.leftJoin(note, and(eq(note.raceId, race.id), eq(note.authorId, viewerId)))
		.where(between(race.date, range.from, range.to))
		.groupBy(race.id)
		.orderBy(dir(race.date), dir(race.raceNumber))
		.limit(100);
}

/**
 * 登録されているレースの開催年。絞り込みの選択肢に使う。新しい年が先。
 *
 * 選択肢を固定の範囲で作らない。データの無い年を出しても選ばせるだけ無駄で、
 * 逆に範囲を決め打つと古い開催を入れたときに選べなくなる。
 */
export async function listRaceYears(db: Db): Promise<number[]> {
	const rows = await db
		.selectDistinct({ year: sql<string>`substr(${race.date}, 1, 4)`.as('year') })
		.from(race);
	return rows.map((r) => Number(r.year)).sort((a, b) => b - a);
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
 * （product.md 第10章「`note` の非正規化」のリスク）。
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
			noteCount: countDistinct(note.id),
			resultCount: raceResultCount(),
			reviewCount: sql<number>`count(DISTINCT CASE WHEN ${note.kind} IN ('race', 'entry') THEN ${note.id} END)`
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

/** 馬タイムラインに並べる1走ぶん。メモが無くても出す（product.md 第6章 `/horses/[id]`）。 */
export type HorseRun = {
	/** race_entry.id。同じ出走に対するメモと突き合わせる鍵。 */
	entryId: string;
	raceId: string;
	date: string;
	course: string;
	raceNumber: number | null;
	raceName: string | null;
	grade: string | null;
	className: string | null;
	finishPosition: number | null;
	/** そのレースで着順の入った出走の数（この馬が取消でも、レースの結果が出ていれば 1 以上）。 */
	resultCount: number;
};

/**
 * 馬1頭の出走歴。**メモの有無を見ない。**
 *
 * タイムラインの骨組みになる。メモを書いた日だけが並ぶと、走ったのに何も書かなかった
 * レースがタイムラインから消え、「前走から間隔が空いた」のか「書き忘れた」のかが
 * 読めなくなる。走った事実は race_entry にあるので、それをそのまま骨にする。
 *
 * **未来の開催も落とさない。** 出馬表は開催前に入る（README「出走馬データ」）ので、
 * 次走が決まった時点でタイムラインの先頭に出る。これが馬を追う理由そのもの。
 *
 * 全ユーザー共通のマスタなので viewerId を取らない。ここで返すのは誰が見ても同じ
 * 「走った事実」で、メモは1行も混ざらない（混ぜるのは `mergeHorseTimeline`）。
 * 索引は entry_horse (horse_id) が効く。
 */
export async function listRunsForHorse(db: Db, horseId: string, limit = 200): Promise<HorseRun[]> {
	return db
		.select({
			entryId: raceEntry.id,
			raceId: race.id,
			date: race.date,
			course: race.course,
			raceNumber: race.raceNumber,
			raceName: race.name,
			grade: race.grade,
			className: race.className,
			finishPosition: raceEntry.finishPosition,
			resultCount: raceResultCount()
		})
		.from(raceEntry)
		.innerJoin(race, eq(raceEntry.raceId, race.id))
		.where(eq(raceEntry.horseId, horseId))
		.orderBy(desc(race.date), desc(race.raceNumber))
		.limit(limit);
}
