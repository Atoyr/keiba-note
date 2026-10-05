import { and, asc, count, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { gradedRaceNote, horse, note, race, raceEntry, type Race } from '$lib/server/db/schema';
import { MARKS, type Mark, type NoteTag } from '$lib/schemas/note';
import type { Pace } from '$lib/schemas/race-flow';
import { gradedRaceKey, gradedRaceNames, isGraded } from '$lib/utils/graded-race';
import { raceResultCount } from './races';

/**
 * 重賞。
 *
 * **重賞はマスタの表を持たない。** レース名を `gradedRaceKey`（別名の表で寄せた名前）で束ねる
 * （schema.ts の `gradedRaceNote` の注記）。レースは全ユーザー共通のマスタなので誰が見ても同じで、
 * そこに重ねるメモ・傾向のメモ（`graded_race_note`）だけが viewer のもの。
 *
 * **メモと傾向を読む関数は viewerId を必須で受け、WHERE に入れる**（architecture.md 第0章）。
 */

const GRADES = ['G1', 'G2', 'G3'] as const;

/** 重賞の一覧に出す1レース（今年のもの）。 */
export type GradedRaceOfYear = Pick<
	Race,
	'id' | 'date' | 'course' | 'raceNumber' | 'name' | 'grade' | 'surface' | 'distance'
>;

/**
 * 今年（`YYYY`）に G1〜G3 で登録されているレース。日付 → R の昇順。
 * マスタなので viewerId を取らない。索引は race_date。
 */
export async function listGradedRacesOfYear(db: Db, year: string): Promise<GradedRaceOfYear[]> {
	return db
		.select({
			id: race.id,
			date: race.date,
			course: race.course,
			raceNumber: race.raceNumber,
			name: race.name,
			grade: race.grade,
			surface: race.surface,
			distance: race.distance
		})
		.from(race)
		.where(
			and(
				sql`${race.date} >= ${`${year}-01-01`}`,
				sql`${race.date} <= ${`${year}-12-31`}`,
				inArray(race.grade, [...GRADES])
			)
		)
		.orderBy(asc(race.date), asc(race.raceNumber));
}

/** レース名と年（`YYYY`）。 */
export type NotedYear = { name: string; year: string };

/**
 * viewer がレース全体の見立て・ふりかえり、または1頭ごとのメモ（出走前・ふりかえり。印だけでもよい）を書いた
 * レースの `(レース名, 年)`（重複なし）。
 * 一覧の「メモのある年 N」を、呼び出し側が鍵ごとに数えるための材料。
 *
 * **`name IN (別名すべて)` で引かない。** 一覧の重賞の別名を全部並べると D1 の bind の上限（100）を超えうる。
 */
export async function listNotedGradedYears(db: Db, viewerId: string): Promise<NotedYear[]> {
	const rows = await db
		.selectDistinct({ name: race.name, year: sql<string>`substr(${race.date}, 1, 4)` })
		.from(note)
		.innerJoin(race, eq(note.raceId, race.id))
		.where(
			and(
				eq(note.authorId, viewerId),
				isNotNull(race.name),
				inArray(note.kind, ['race_preview', 'race', 'preview', 'entry'])
			)
		);
	return rows.flatMap((r) => (r.name ? [{ name: r.name, year: r.year }] : []));
}

/** viewer が傾向のメモを書いた重賞の鍵。一覧の「傾向あり」。 */
export async function listGradedRaceTrendKeys(db: Db, viewerId: string): Promise<string[]> {
	const rows = await db
		.select({ key: gradedRaceNote.raceKey })
		.from(gradedRaceNote)
		.where(eq(gradedRaceNote.userId, viewerId));
	return rows.map((r) => r.key);
}

/** 重賞の画面に並べる1レース（どの年のものでも）。 */
export type SeriesRace = Pick<
	Race,
	| 'id'
	| 'date'
	| 'course'
	| 'raceNumber'
	| 'name'
	| 'grade'
	| 'surface'
	| 'distance'
	| 'trackCondition'
	| 'winnerName'
> & {
	/** そのレースで着順の入った出走の数（→ `isSettled`）。 */
	resultCount: number;
};

/** 名前（鍵と別名）に当たるレース。日付の降順。マスタなので viewerId を取らない。索引は race_name。 */
export async function listSeriesRaces(db: Db, names: string[]): Promise<SeriesRace[]> {
	if (names.length === 0) return [];
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
			trackCondition: race.trackCondition,
			winnerName: race.winnerName,
			resultCount: raceResultCount()
		})
		.from(race)
		.where(inArray(race.name, names))
		.orderBy(desc(race.date), desc(race.raceNumber));
}

/** レース全体のメモ。`race_preview`（予想の見立て）か `race`（ふりかえり）。 */
export type SeriesNote = {
	id: string;
	kind: 'race_preview' | 'race';
	raceId: string;
	body: string;
	tags: NoteTag[];
	/** 見立てに付けた展開のペース。ふりかえりには付かない。 */
	pace: Pace | null;
};

/** 付けた印（`preview` で印のあるもの）。 */
export type SeriesMark = {
	/** 出走（race_entry）の id。画面の each の鍵。 */
	entryId: string;
	raceId: string;
	mark: Mark;
	horseName: string;
	bracket: number | null;
	horseNumber: number | null;
	finishPosition: number | null;
};

/**
 * 名前に当たるレースに viewer が書いたメモ。2クエリ。
 * 1頭ごとのメモの本文は出さない（年数 × 頭数で傾向が読めなくなる）ので、印と、レースごとの件数だけ別に拾う。
 * 件数は出走前メモ（`preview`。印の有無を問わない）とふりかえり（`entry`）を合わせて数える。
 */
export async function listSeriesNotes(
	db: Db,
	names: string[],
	viewerId: string
): Promise<{
	notes: SeriesNote[];
	marks: SeriesMark[];
	/** レースごとの1頭ごとのメモの件数（0 のレースは入らない）。 */
	entryNoteCounts: Record<string, number>;
}> {
	if (names.length === 0) return { notes: [], marks: [], entryNoteCounts: {} };

	const [noteRows, markRows, countRows] = await Promise.all([
		db
			.select({
				id: note.id,
				kind: note.kind,
				raceId: race.id,
				body: note.body,
				tags: note.tags,
				flow: note.flow
			})
			.from(note)
			.innerJoin(race, eq(note.raceId, race.id))
			.where(
				and(
					eq(note.authorId, viewerId),
					inArray(note.kind, ['race_preview', 'race']),
					inArray(race.name, names)
				)
			)
			.orderBy(asc(note.createdAt)),
		db
			.select({
				entryId: raceEntry.id,
				raceId: race.id,
				mark: note.mark,
				horseName: horse.name,
				bracket: raceEntry.bracket,
				horseNumber: raceEntry.horseNumber,
				finishPosition: raceEntry.finishPosition
			})
			.from(note)
			.innerJoin(race, eq(note.raceId, race.id))
			.innerJoin(raceEntry, eq(note.raceEntryId, raceEntry.id))
			.innerJoin(horse, eq(raceEntry.horseId, horse.id))
			.where(
				and(
					eq(note.authorId, viewerId),
					eq(note.kind, 'preview'),
					isNotNull(note.mark),
					inArray(race.name, names)
				)
			),
		db
			.select({ raceId: note.raceId, n: count() })
			.from(note)
			.innerJoin(race, eq(note.raceId, race.id))
			.where(
				and(
					eq(note.authorId, viewerId),
					inArray(note.kind, ['preview', 'entry']),
					inArray(race.name, names)
				)
			)
			.groupBy(note.raceId)
	]);

	const notes = noteRows.flatMap((r): SeriesNote[] =>
		r.kind === 'race_preview' || r.kind === 'race'
			? [
					{
						id: r.id,
						kind: r.kind,
						raceId: r.raceId,
						body: r.body,
						tags: r.tags,
						pace: r.kind === 'race_preview' ? (r.flow?.pace ?? null) : null
					}
				]
			: []
	);
	const marks = markRows.flatMap((r): SeriesMark[] => (r.mark ? [{ ...r, mark: r.mark }] : []));
	const entryNoteCounts: Record<string, number> = {};
	for (const r of countRows) if (r.raceId && r.n > 0) entryNoteCounts[r.raceId] = r.n;
	return { notes, marks, entryNoteCounts };
}

/**
 * viewer がその重賞に書いた傾向のメモ。無ければ null。
 *
 * 別名の表に行を足すと、鍵が変わることがある。古い鍵で書いた傾向が消えないよう、鍵と別名すべて
 * （`gradedRaceNames(key)`）で引き、鍵の行があればそれを、なければ更新の新しい行を返す。
 */
export async function getGradedRaceTrend(
	db: Db,
	key: string,
	viewerId: string
): Promise<{ body: string } | null> {
	const rows = await db
		.select({ raceKey: gradedRaceNote.raceKey, body: gradedRaceNote.body })
		.from(gradedRaceNote)
		.where(
			and(
				eq(gradedRaceNote.userId, viewerId),
				inArray(gradedRaceNote.raceKey, gradedRaceNames(key))
			)
		)
		.orderBy(desc(gradedRaceNote.updatedAt), desc(gradedRaceNote.createdAt));
	const found = rows.find((r) => r.raceKey === key) ?? rows.at(0);
	return found ? { body: found.body } : null;
}

/**
 * 傾向のメモを書く（1人・1重賞につき1本。編集＝上書き）。**本文が空なら消す。**
 * 同じ viewer の別名の鍵（`key` 以外の `gradedRaceNames(key)`）の行は、同じ batch で消す
 * （読むときに別名の行を拾うので、残すと消したはずの傾向が戻る）。空で消すときは別名も全部消す。
 * 鍵が重賞かはルートが先に確かめる。
 */
export async function saveGradedRaceTrend(
	db: Db,
	key: string,
	body: string,
	userId: string
): Promise<'saved' | 'cleared'> {
	const text = body.trim();
	const names = gradedRaceNames(key);
	if (!text) {
		await db
			.delete(gradedRaceNote)
			.where(and(eq(gradedRaceNote.userId, userId), inArray(gradedRaceNote.raceKey, names)));
		return 'cleared';
	}

	await db.batch([
		db
			.insert(gradedRaceNote)
			.values({ userId, raceKey: key, body: text })
			.onConflictDoUpdate({
				target: [gradedRaceNote.userId, gradedRaceNote.raceKey],
				set: { body: text, updatedAt: sql`(unixepoch())` }
			}),
		db
			.delete(gradedRaceNote)
			.where(
				and(
					eq(gradedRaceNote.userId, userId),
					ne(gradedRaceNote.raceKey, key),
					inArray(gradedRaceNote.raceKey, names)
				)
			)
	]);
	return 'saved';
}

/* ---- 組み立て（D1 を読まない純関数） ---- */

export type GradedRaceListItem = {
	/** 重賞の鍵（URL と傾向のメモの鍵）。 */
	key: string;
	/** 今年のレースの名前。 */
	name: string;
	/** 今年の格。 */
	grade: 'G1' | 'G2' | 'G3';
	date: string;
	course: GradedRaceOfYear['course'];
	surface: GradedRaceOfYear['surface'];
	distance: number | null;
	raceId: string;
	/** viewer がメモ（見立て・ふりかえり・印）を書いた年の数。 */
	notedYears: number;
	hasTrend: boolean;
};

/**
 * 重賞の一覧。今年のレースを鍵で1本にし（同じ鍵が今年に2つあれば早いほう）、日付の昇順に並べる。
 * 名前の無いレース・重賞でないレースは入れない。
 */
export function buildGradedRaceList(
	races: GradedRaceOfYear[],
	notedYears: NotedYear[],
	trendKeys: string[]
): GradedRaceListItem[] {
	const yearsByKey = new Map<string, Set<string>>();
	for (const n of notedYears) {
		const key = gradedRaceKey(n.name);
		yearsByKey.set(key, (yearsByKey.get(key) ?? new Set()).add(n.year));
	}
	const trends = new Set(trendKeys);

	const items = new Map<string, GradedRaceListItem>();
	const sorted = [...races].sort(
		(a, b) => a.date.localeCompare(b.date) || (a.raceNumber ?? 0) - (b.raceNumber ?? 0)
	);
	for (const r of sorted) {
		if (!r.name || !isGraded(r.grade)) continue;
		const key = gradedRaceKey(r.name);
		if (items.has(key)) continue;
		items.set(key, {
			key,
			name: r.name,
			grade: r.grade,
			date: r.date,
			course: r.course,
			surface: r.surface,
			distance: r.distance,
			raceId: r.id,
			notedYears: yearsByKey.get(key)?.size ?? 0,
			hasTrend: trends.has(key)
		});
	}
	return [...items.values()];
}

export type CurrentGrade = {
	grade: 'G1' | 'G2' | 'G3';
	/** その格のレースの年。 */
	year: string;
	/** 今年のレースの格か（false = 今年は重賞でないか未登録で、いちばん新しい年の格）。 */
	isThisYear: boolean;
	/** 今年のレースは登録されているが G1〜G3 でない（格が下がった）。見出しで「未登録」と言わないため。 */
	thisYearNotGraded: boolean;
	/** 格を決めたレース（見出しの名前・日付・場所に使う）。 */
	race: SeriesRace;
};

/**
 * 見出しの格。今年のレースが G1〜G3 ならその格、そうでなければ（未登録・重賞でない）いちばん新しい重賞のレースの格。
 * G1〜G3 のレースが1つも無ければ null（＝重賞ではない）。
 */
export function currentGrade(races: SeriesRace[], thisYear: string): CurrentGrade | null {
	const graded = races
		.filter((r) => isGraded(r.grade))
		.sort((a, b) => b.date.localeCompare(a.date) || (b.raceNumber ?? 0) - (a.raceNumber ?? 0));
	const thisYearRace = graded.find((r) => r.date.startsWith(thisYear));
	const picked = thisYearRace ?? graded.at(0);
	if (!picked || !isGraded(picked.grade)) return null;
	return {
		grade: picked.grade,
		year: picked.date.slice(0, 4),
		isThisYear: !!thisYearRace,
		thisYearNotGraded: !thisYearRace && races.some((r) => r.date.startsWith(thisYear)),
		race: picked
	};
}

export type GradedTimelineRace = {
	race: SeriesRace;
	/** まだ日が来ていないレース。当日は予定にしない（馬のタイムラインと同じ線引き）。 */
	upcoming: boolean;
	preview: { body: string; pace: Pace | null } | null;
	review: { body: string; tags: NoteTag[] } | null;
	/** 1頭ごとのメモ（出走前・ふりかえり）の件数。本文は出さない。 */
	entryNoteCount: number;
	/** 付けた印。印の順（`MARKS`）、同じ印は馬番の昇順（馬番なしは後ろ）。 */
	marks: SeriesMark[];
};

export type GradedTimelineYear = { year: string; races: GradedTimelineRace[] };

/**
 * 重賞のタイムライン。年の降順。**骨はレースで、メモはレースの下に重ねる**（メモが無い年も出す）。
 */
export function buildGradedRaceTimeline(
	races: SeriesRace[],
	notes: SeriesNote[],
	marks: SeriesMark[],
	today: string,
	entryNoteCounts: Record<string, number> = {}
): GradedTimelineYear[] {
	const markOrder = (m: Mark) => MARKS.indexOf(m);
	const years = new Map<string, GradedTimelineRace[]>();

	const ordered = [...races].sort(
		(a, b) => b.date.localeCompare(a.date) || (b.raceNumber ?? 0) - (a.raceNumber ?? 0)
	);
	for (const r of ordered) {
		const mine = notes.filter((n) => n.raceId === r.id);
		const outlook = mine.find((n) => n.kind === 'race_preview');
		const review = mine.find((n) => n.kind === 'race');
		const row: GradedTimelineRace = {
			race: r,
			upcoming: r.date > today,
			preview: outlook ? { body: outlook.body, pace: outlook.pace } : null,
			review: review ? { body: review.body, tags: review.tags } : null,
			entryNoteCount: entryNoteCounts[r.id] ?? 0,
			marks: marks
				.filter((m) => m.raceId === r.id)
				.sort(
					(a, b) =>
						markOrder(a.mark) - markOrder(b.mark) ||
						(a.horseNumber ?? Infinity) - (b.horseNumber ?? Infinity)
				)
		};
		const year = r.date.slice(0, 4);
		years.set(year, [...(years.get(year) ?? []), row]);
	}
	return [...years.entries()]
		.sort(([a], [b]) => b.localeCompare(a))
		.map(([year, rows]) => ({ year, races: rows }));
}
