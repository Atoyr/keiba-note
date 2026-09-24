import { and, asc, between, eq, isNotNull, notInArray, sql } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { race, raceOdds } from '$lib/server/db/schema';
import type { HorseOdds, RaceOdds } from '$lib/server/odds/odds';
import { addDays, todayJst } from '$lib/utils/date';
import { inOddsWindow } from '$lib/utils/odds';

/**
 * オッズの読み書き。取得（netkeiba へ行く）は `lib/server/odds/` が持ち、ここは D1 だけを見る。
 *
 * オッズは全員に共通のマスタの付属物で、メモではない。`viewerId` で絞る対象ではない
 * （race / race_entry と同じ扱い。docs/architecture.md 第0章）。
 */

export type OddsTarget = { raceId: string; externalRef: string };

/**
 * いまオッズを取りに行くレース。**取得元の ID と発走時刻があり、いまが取りに行く時間帯に入っているもの**だけ。
 *
 * 時間帯は格で決まる（`oddsWindowOpens`）。G1 は前々日の 18:30、G2・G3 は前日の 18:30、
 * それ以外は当日の発走3時間前から、どれも発走まで。
 *
 * D1 で絞るのは「今日から2日後まで」と「ref・発走時刻が入っているか」まで。時間帯は JST の時刻計算が
 * 要るので JS 側で切る（その範囲の ref 付きのレースは数件なので、取ってから捨ててよい）。
 */
export async function listOddsTargets(db: Db, now: Date): Promise<OddsTarget[]> {
	const today = todayJst(now);
	const rows = await db
		.select({
			id: race.id,
			date: race.date,
			startTime: race.startTime,
			grade: race.grade,
			externalRef: race.externalRef
		})
		.from(race)
		.where(
			and(
				between(race.date, today, addDays(today, 2)),
				isNotNull(race.externalRef),
				isNotNull(race.startTime)
			)
		)
		.orderBy(asc(race.date), asc(race.startTime));

	return rows.flatMap((r) =>
		r.externalRef && r.startTime && inOddsWindow(r.date, r.startTime, r.grade, now)
			? [{ raceId: r.id, externalRef: r.externalRef }]
			: []
	);
}

const toEpoch = (iso: string) => Math.floor(Date.parse(iso) / 1000);

/**
 * 取れたオッズでそのレースの行を置き換える。**検査（`validateRaceOdds`）を通したものだけを渡すこと。**
 *
 * 馬ごとに upsert し、今回の応答に無かった馬番の行は消す。全部を1つの `batch` にするので、
 * 途中で落ちても前回の値が半端に混ざらない。
 * 1文にまとめないのは、D1 のバインド変数が1クエリ100個までで、18頭 × 7列では超えるため。
 */
export async function saveRaceOdds(db: Db, odds: RaceOdds): Promise<void> {
	const asOf = toEpoch(odds.asOf);
	const fetchedAt = toEpoch(odds.fetchedAt);
	const numbers = odds.horses.map((h) => h.horseNumber);

	const upserts = odds.horses.map((h) =>
		db
			.insert(raceOdds)
			.values({
				raceId: odds.raceId,
				horseNumber: h.horseNumber,
				winOdds: h.winOdds,
				placeOddsMin: h.placeOddsMin,
				placeOddsMax: h.placeOddsMax,
				asOf,
				fetchedAt
			})
			.onConflictDoUpdate({
				target: [raceOdds.raceId, raceOdds.horseNumber],
				set: {
					winOdds: sql`excluded.win_odds`,
					placeOddsMin: sql`excluded.place_odds_min`,
					placeOddsMax: sql`excluded.place_odds_max`,
					asOf: sql`excluded.as_of`,
					fetchedAt: sql`excluded.fetched_at`
				}
			})
	);
	const dropStale = db
		.delete(raceOdds)
		.where(and(eq(raceOdds.raceId, odds.raceId), notInArray(raceOdds.horseNumber, numbers)));

	const [first, ...rest] = upserts;
	if (!first) return; // 0頭は validateRaceOdds が弾いている。ここで全行を消さないための保険
	await db.batch([first, ...rest, dropStale]);
}

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
