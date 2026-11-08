import {
	and,
	asc,
	between,
	eq,
	exists,
	inArray,
	isNotNull,
	ne,
	notExists,
	or,
	isNull,
	sql
} from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { race, raceEntry } from '$lib/server/db/schema';
import { COURSES } from '$lib/schemas/race';
import { addDays, todayJst } from '$lib/utils/date';
import type { EntriesFetchTarget } from './entries-fetch';

/**
 * 結果の取得（GitHub Actions に頼む。`lib/server/race-data/`）の対象を D1 から選ぶ。
 * **当日（JST）の JRA のレースで、出走馬が1頭でも登録されているもの。**
 *
 * 格は問わない（気にしている馬だけ載せた条件戦も取る）。着順の有無でも絞らない。
 * 入れ済みなら Actions 側で main と差分が出ず、PR は作られない。
 *
 * **ここは読むだけ。** 結果は YAML に書かれ、PR のマージで D1 に入る（docs/architecture.md 第0章）。
 * レースと出走馬は全員に共通のマスタなので `viewerId` で絞らない。
 */
export async function listResultsFetchTargets(db: Db, now: Date): Promise<EntriesFetchTarget[]> {
	return db
		.select({
			raceId: race.id,
			date: race.date,
			course: race.course,
			raceNumber: sql<number>`${race.raceNumber}`,
			externalRef: race.externalRef
		})
		.from(race)
		.where(
			and(
				eq(race.date, todayJst(now)),
				between(race.raceNumber, 1, 12),
				inArray(race.course, [...COURSES]),
				exists(
					db
						.select({ one: sql`1` })
						.from(raceEntry)
						.where(eq(raceEntry.raceId, race.id))
				)
			)
		)
		.orderBy(asc(race.course), asc(race.raceNumber));
}

/** 通過順の取り直しで遡る日数。載るまでの日数が分からないので、区切って毎日取り直す。 */
export const PASSING_REFETCH_DAYS = 7;

/**
 * 通過順の取り直しの対象。結果の Cron の時点では netkeiba の「通過」列がまだ空のことがあり、
 * 通過順はあとから載る。そこで **当日の 1〜7 日前のレースで、着順は入っているのに通過順が1頭も入っていないもの** を
 * 毎日取り直す（`data:fetch result` は上書きなので何度流しても同じ）。
 *
 * - `external_ref` が無いレースは対象外（当週の一覧から引けず、Actions が落ち続ける）
 * - 直線のレースは通過順がもともと無いので対象外（direction が NULL なら含める）
 * - 着順が1頭も無い（結果が未マージ）レースは、当日の回の PR が待っているので対象外
 *
 * ここも読むだけ。`viewerId` で絞らない。
 */
export async function listPassingRefetchTargets(db: Db, now: Date): Promise<EntriesFetchTarget[]> {
	const today = todayJst(now);
	return selectPassingMissing(
		db,
		between(race.date, addDays(today, -PASSING_REFETCH_DAYS), addDays(today, -1))
	);
}

/**
 * 通過順の取り直しを7日続けても入らず、今日から対象を外れるレース（開催日がちょうど8日前で、
 * 取り直しと同じ条件を満たすもの）。黙って外れないよう、Cron が人に知らせる。
 */
export async function listPassingGaveUpRaces(db: Db, now: Date): Promise<EntriesFetchTarget[]> {
	return selectPassingMissing(
		db,
		eq(race.date, addDays(todayJst(now), -(PASSING_REFETCH_DAYS + 1)))
	);
}

/** 取り直しと諦めで共有する条件。開催日の条件だけ呼び出し側が渡す。 */
function selectPassingMissing(db: Db, dateCondition: SQL): Promise<EntriesFetchTarget[]> {
	return db
		.select({
			raceId: race.id,
			date: race.date,
			course: race.course,
			raceNumber: sql<number>`${race.raceNumber}`,
			externalRef: race.externalRef
		})
		.from(race)
		.where(
			and(
				dateCondition,
				between(race.raceNumber, 1, 12),
				inArray(race.course, [...COURSES]),
				isNotNull(race.externalRef),
				or(isNull(race.direction), ne(race.direction, '直線')),
				exists(
					db
						.select({ one: sql`1` })
						.from(raceEntry)
						.where(and(eq(raceEntry.raceId, race.id), isNotNull(raceEntry.finishPosition)))
				),
				notExists(
					db
						.select({ one: sql`1` })
						.from(raceEntry)
						.where(
							and(
								eq(raceEntry.raceId, race.id),
								isNotNull(raceEntry.passing),
								ne(raceEntry.passing, '')
							)
						)
				)
			)
		)
		.orderBy(asc(race.date), asc(race.course), asc(race.raceNumber));
}
