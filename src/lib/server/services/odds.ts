import { asc, eq } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { raceOdds } from '$lib/server/db/schema';
import type { HorseOdds } from '$lib/server/odds/odds';

/**
 * オッズの読み出し（予想画面）。**書くのは GitHub Actions だけ**で、Worker は取得元（netkeiba）へ行かない
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
