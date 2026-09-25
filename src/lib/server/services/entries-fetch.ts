import { and, asc, between, count, eq, inArray, isNotNull, notExists, sql } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { race, raceEntry } from '$lib/server/db/schema';
import { addDays, todayJst } from '$lib/utils/date';

/**
 * 出走馬の取得（GitHub Actions に頼む。`lib/server/race-data/`）の対象を D1 から選ぶ。
 *
 * **ここは読むだけ。** 取ってきた出馬表は YAML に書かれ、PR のマージで D1 に入る
 * （docs/architecture.md 第0章）。レースと出走馬は全員に共通のマスタなので `viewerId` で絞らない。
 */

/** Cron が枠順を待つ格。オッズと同じく重賞だけ。 */
export const ENTRIES_FETCH_GRADES = ['G1', 'G2', 'G3'] as const;

/**
 * 開催の何日前から枠順を待つか。G1 は木曜に枠順が出るので、日曜の G1 は3日前。
 * 土曜のレースは木曜（2日前）、日曜のレースは金曜（2日前）、月曜の祝日開催は金曜（3日前）。
 */
const WAIT_FROM_DAYS = 3;

export type EntriesFetchTarget = {
	raceId: string;
	date: string;
	course: string;
	raceNumber: number;
	externalRef: string | null;
};

/**
 * Cron が出走馬を取りに行かせるレース。**重賞で、開催が1〜3日後で、まだ馬番が1頭も入っていないもの。**
 *
 * 馬番が入った（枠順の PR がマージされて本番に入った）時点で外れる。それまでは毎時選ばれるが、
 * Actions 側は枠順が確定するまで何も書かず、同じ中身の PR があれば何もしない。
 * レース番号が無いレースは取得元のページを引けないので外す。
 */
export async function listEntriesFetchTargets(db: Db, now: Date): Promise<EntriesFetchTarget[]> {
	const today = todayJst(now);
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
				inArray(race.grade, [...ENTRIES_FETCH_GRADES]),
				between(race.date, addDays(today, 1), addDays(today, WAIT_FROM_DAYS)),
				isNotNull(race.raceNumber),
				notExists(
					db
						.select({ one: sql`1` })
						.from(raceEntry)
						.where(and(eq(raceEntry.raceId, race.id), isNotNull(raceEntry.horseNumber)))
				)
			)
		)
		.orderBy(asc(race.date), asc(race.course), asc(race.raceNumber));
}

export type UpcomingRace = {
	id: string;
	date: string;
	course: string;
	raceNumber: number | null;
	name: string | null;
	grade: string | null;
	className: string | null;
	/** 出走馬（候補を含む）の頭数。 */
	entryCount: number;
	/** 馬番が入った頭数。0 なら枠順はまだ入っていない。 */
	numberedCount: number;
};

/**
 * 管理画面に並べる、これからのレース（`from` 〜 `to`。両端を含む）。格を問わない。
 * 頭数は1回の GROUP BY で数える（レースごとに引かない）。
 */
export async function listUpcomingRaces(
	db: Db,
	range: { from: string; to: string }
): Promise<UpcomingRace[]> {
	return db
		.select({
			id: race.id,
			date: race.date,
			course: race.course,
			raceNumber: race.raceNumber,
			name: race.name,
			grade: race.grade,
			className: race.className,
			entryCount: count(raceEntry.id),
			numberedCount: count(raceEntry.horseNumber)
		})
		.from(race)
		.leftJoin(raceEntry, eq(raceEntry.raceId, race.id))
		.where(between(race.date, range.from, range.to))
		.groupBy(race.id)
		.orderBy(asc(race.date), asc(race.course), asc(race.raceNumber));
}
