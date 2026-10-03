import { and, asc, between, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { race, raceOdds } from '$lib/server/db/schema';
import type { HorseOdds } from '$lib/server/odds/odds';
import { addDays, todayJst } from '$lib/utils/date';
import { inOddsWindow, ODDS_GRADES } from '$lib/utils/odds';

/**
 * オッズの読み出し（予想画面）と、Cron が Actions を起動するかどうかの判断。
 * **書くのは GitHub Actions だけ**で、Worker は取得元（netkeiba）へ行かない
 * （取得と保存は scripts/odds/。docs/architecture.md 3-8）。
 *
 * オッズは全員に共通のマスタの付属物で、メモではない。`viewerId` で絞る対象ではない
 * （race / race_entry と同じ扱い。docs/architecture.md 第0章）。
 */

export type StoredRaceOdds = {
	/** 時点（ISO 8601）。行ごとに持つが、1回の保存で揃うので最新を代表にする。 */
	asOf: string;
	horses: HorseOdds[];
};

/** 予想画面に出すオッズ。まだ1度も取れていなければ null。 */
export async function getRaceOdds(db: Db, raceId: string): Promise<StoredRaceOdds | null> {
	const rows = await db
		.select()
		.from(raceOdds)
		.where(eq(raceOdds.raceId, raceId))
		.orderBy(asc(raceOdds.horseNumber));
	if (rows.length === 0) return null;

	const asOf = Math.max(...rows.map((r) => r.asOf));
	return {
		asOf: new Date(asOf * 1000).toISOString(),
		horses: rows.map((r) => ({
			horseNumber: r.horseNumber,
			winOdds: r.winOdds,
			placeOddsMin: r.placeOddsMin,
			placeOddsMax: r.placeOddsMax
		}))
	};
}

/**
 * いまオッズを取りに行く時間帯に入っているレースの ID。Cron（`lib/server/odds/request.ts`）が、
 * GitHub Actions を起動するかどうかを決めるのに使う。**ここは読むだけ。**
 *
 * 選び方は Actions 側の `targetsSql`・`pickTargets`（scripts/odds/store.ts）と同じにする。
 * D1 で「重賞」「今日から2日後まで」「ref・発走時刻あり」まで絞り、時間帯（`inOddsWindow`）は取ってから切る。
 */
export async function listOddsTargetIds(db: Db, now: Date): Promise<string[]> {
	const today = todayJst(now);
	const rows = await db
		.select({ id: race.id, date: race.date, startTime: race.startTime, grade: race.grade })
		.from(race)
		.where(
			and(
				inArray(race.grade, ODDS_GRADES),
				between(race.date, today, addDays(today, 2)),
				isNotNull(race.externalRef),
				isNotNull(race.startTime)
			)
		)
		.orderBy(asc(race.date), asc(race.startTime));
	return rows.flatMap((r) =>
		r.startTime && inOddsWindow(r.date, r.startTime, r.grade, now) ? [r.id] : []
	);
}
