import { and, asc, between, eq, exists, inArray, sql } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { race, raceEntry } from '$lib/server/db/schema';
import { COURSES } from '$lib/schemas/race';
import { todayJst } from '$lib/utils/date';
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
