import { and, asc, between, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '#lib/server/db/index.ts';
import { horse, race, raceEntry } from '#lib/server/db/schema.ts';
import type { SeriesRace } from './graded-races';

/**
 * 重賞の過去の好走馬（Issue #235）。同じ重賞（別名を含む）の、窓の中の1〜3着。
 *
 * 読むのは `race` / `race_entry` / `horse` のマスタだけで、メモには触れない。
 * そのため `viewerId` を取らない（`listSeriesRaces` と同じ扱い。誰が見ても同じ結果になる）。
 * 傾向のメモ（`graded_race_note`）とは別の関数・別の節で、何も書かず何も読まない。
 */

/** 好走馬を引く問い合わせの1行。 */
export type PlacerRow = {
	raceId: string;
	entryId: string;
	finishPosition: number;
	popularity: number | null;
	jockey: string | null;
	horseNumber: number | null;
	horseId: string;
	horseName: string;
	sire: string | null;
	damSire: string | null;
};

/**
 * `names`（鍵と別名）のレースの、`fromDate`〜`toDate`（`YYYY-MM-DD`。両端を含む）の1〜3着。
 * 日付の降順 → 着順の昇順 → 馬番の昇順。`names` が空なら `[]`。格は問わない。
 * 索引は race_name。
 */
export async function listGradedRacePlacers(
	db: Db,
	names: string[],
	fromDate: string,
	toDate: string
): Promise<PlacerRow[]> {
	if (names.length === 0) return [];
	// `race.id` と `race_entry.id` はどちらも "id"。別名を付けて、同名の列を2つ選ばない。
	const raceIdColumn = sql<string>`${race.id}`.as('race_id');
	const entryIdColumn = sql<string>`${raceEntry.id}`.as('entry_id');
	const rows = await db
		.select({
			raceId: raceIdColumn,
			entryId: entryIdColumn,
			finishPosition: raceEntry.finishPosition,
			popularity: raceEntry.popularity,
			jockey: raceEntry.jockey,
			horseNumber: raceEntry.horseNumber,
			horseId: raceEntry.horseId,
			horseName: horse.name,
			sire: horse.sire,
			damSire: horse.damSire
		})
		.from(raceEntry)
		.innerJoin(race, eq(raceEntry.raceId, race.id))
		.innerJoin(horse, eq(raceEntry.horseId, horse.id))
		.where(
			and(
				inArray(race.name, names),
				between(race.date, fromDate, toDate),
				between(raceEntry.finishPosition, 1, 3)
			)
		)
		.orderBy(desc(race.date), asc(raceEntry.finishPosition), asc(raceEntry.horseNumber));
	return rows.map((r) => ({ ...r, finishPosition: r.finishPosition as number }));
}

export type Placer = {
	entryId: string;
	finishPosition: number;
	popularity: number | null;
	jockey: string | null;
	horseId: string;
	horseName: string;
	sire: string | null;
	damSire: string | null;
};

export type PlacersRace = {
	race: Pick<
		SeriesRace,
		'id' | 'date' | 'course' | 'raceNumber' | 'name' | 'surface' | 'distance' | 'trackCondition'
	>;
	/** 場・芝ダ・距離のどれかが、見出しのレース（`base`）と違う。 */
	differs: boolean;
	/** 1着がいて、1〜3着が3頭以上（同着を含む）。 */
	complete: boolean;
	placers: Placer[];
};

export type AspectRow = {
	value: string;
	/** 1着の数。 */
	wins: number;
	/** 1〜3着の数。 */
	placed: number;
	sources: { year: string; finishPosition: number }[];
};

export type Aspect = {
	key: 'popularity' | 'jockey' | 'sire' | 'damSire';
	/** 値が分かる出走の数。 */
	known: number;
	/** 値が null・空の出走の数。`known + unknown = counts.placers`。 */
	unknown: number;
	rows: AspectRow[];
};

export type GradedRacePlacersView = {
	fromYear: number;
	toYear: number;
	/** 窓の全部の年を降順で。レースが未登録の年は `races: []`。 */
	years: { year: string; races: PlacersRace[] }[];
	counts: {
		complete: number;
		partial: number;
		noResult: number;
		missingYears: string[];
		/** 結果のある開催のうち、条件が `base` と違うもの。 */
		differs: number;
		/** 1〜3着の出走の数。 */
		placers: number;
		/** 1着の数。 */
		winners: number;
	};
	baseYear: string;
	aspects: Aspect[];
};

/** 人気の段。この順で、0件の段も出す。 */
const POPULARITY_BUCKETS = [
	'1番人気',
	'2番人気',
	'3番人気',
	'4番人気',
	'5番人気',
	'6〜9番人気',
	'10番人気以下'
] as const;

function popularityBucket(popularity: number): string {
	if (popularity <= 5) return POPULARITY_BUCKETS[Math.max(popularity, 1) - 1];
	if (popularity <= 9) return '6〜9番人気';
	return '10番人気以下';
}

function textOrNull(value: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

/**
 * 窓（`fromYear`〜`toYear` の暦年）の好走馬を、年ごとの一覧と観点ごとの集計に組む。D1 を読まない純関数。
 *
 * - 窓の全部の年を降順で並べる。レースが無い年も飛ばさない（古い開催で穴埋めしない）。窓の外のレースは入れない
 * - 集計は出走ごとに数える（同じ馬の複数年も、同着もそれぞれ）。率は出さない
 * - 値が null・空の出走は `unknown` に数え、`rows` に入れない
 * - 一部だけの開催の出走も集計に入れる
 */
export function buildGradedRacePlacers(
	races: SeriesRace[],
	rows: PlacerRow[],
	opts: { fromYear: number; toYear: number; base: SeriesRace }
): GradedRacePlacersView {
	const { fromYear, toYear, base } = opts;
	const rowsByRace = new Map<string, PlacerRow[]>();
	for (const row of rows) {
		const list = rowsByRace.get(row.raceId);
		if (list) list.push(row);
		else rowsByRace.set(row.raceId, [row]);
	}

	const years: GradedRacePlacersView['years'] = [];
	for (let y = toYear; y >= fromYear; y--) {
		const year = String(y);
		const inYear = races
			.filter((r) => r.date.startsWith(year))
			.sort((a, b) => b.date.localeCompare(a.date) || (b.raceNumber ?? 0) - (a.raceNumber ?? 0));
		years.push({
			year,
			races: inYear.map((r) => {
				const placers: Placer[] = (rowsByRace.get(r.id) ?? [])
					.slice()
					.sort(
						(a, b) =>
							a.finishPosition - b.finishPosition ||
							(a.horseNumber ?? Infinity) - (b.horseNumber ?? Infinity)
					)
					.map((p) => ({
						entryId: p.entryId,
						finishPosition: p.finishPosition,
						popularity: p.popularity,
						jockey: textOrNull(p.jockey),
						horseId: p.horseId,
						horseName: p.horseName,
						sire: textOrNull(p.sire),
						damSire: textOrNull(p.damSire)
					}));
				return {
					race: {
						id: r.id,
						date: r.date,
						course: r.course,
						raceNumber: r.raceNumber,
						name: r.name,
						surface: r.surface,
						distance: r.distance,
						trackCondition: r.trackCondition
					},
					differs:
						r.course !== base.course || r.surface !== base.surface || r.distance !== base.distance,
					complete: placers.some((p) => p.finishPosition === 1) && placers.length >= 3,
					placers
				};
			})
		});
	}

	const all = years.flatMap((y) => y.races.map((r) => ({ year: y.year, ...r })));
	const counts: GradedRacePlacersView['counts'] = {
		complete: all.filter((r) => r.complete).length,
		partial: all.filter((r) => !r.complete && r.placers.length > 0).length,
		noResult: all.filter((r) => r.placers.length === 0).length,
		missingYears: years.filter((y) => y.races.length === 0).map((y) => y.year),
		differs: all.filter((r) => r.placers.length > 0 && r.differs).length,
		placers: all.reduce((n, r) => n + r.placers.length, 0),
		winners: all.reduce((n, r) => n + r.placers.filter((p) => p.finishPosition === 1).length, 0)
	};

	type Source = { year: string; placer: Placer };
	const sources: Source[] = all.flatMap((r) =>
		r.placers.map((placer) => ({ year: r.year, placer }))
	);
	const aspectOf = (
		key: Aspect['key'],
		valueOf: (p: Placer) => string | null,
		fixed?: readonly string[]
	): Aspect => {
		const map = new Map<string, AspectRow>();
		for (const value of fixed ?? []) map.set(value, { value, wins: 0, placed: 0, sources: [] });
		let known = 0;
		let unknown = 0;
		for (const { year, placer } of sources) {
			const value = valueOf(placer);
			if (value === null) {
				unknown++;
				continue;
			}
			known++;
			let row = map.get(value);
			if (!row) {
				row = { value, wins: 0, placed: 0, sources: [] };
				map.set(value, row);
			}
			row.placed++;
			if (placer.finishPosition === 1) row.wins++;
			row.sources.push({ year, finishPosition: placer.finishPosition });
		}
		for (const row of map.values()) {
			row.sources.sort(
				(a, b) => b.year.localeCompare(a.year) || a.finishPosition - b.finishPosition
			);
		}
		const list = [...map.values()];
		if (!fixed) {
			list.sort(
				(a, b) => b.placed - a.placed || b.wins - a.wins || a.value.localeCompare(b.value, 'ja')
			);
		}
		return { key, known, unknown, rows: list };
	};

	return {
		fromYear,
		toYear,
		years,
		counts,
		baseYear: base.date.slice(0, 4),
		aspects: [
			aspectOf(
				'popularity',
				(p) => (p.popularity !== null && p.popularity >= 1 ? popularityBucket(p.popularity) : null),
				POPULARITY_BUCKETS
			),
			aspectOf('jockey', (p) => p.jockey),
			aspectOf('sire', (p) => p.sire),
			aspectOf('damSire', (p) => p.damSire)
		]
	};
}
