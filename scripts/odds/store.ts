/**
 * オッズの対象の選び方と保存の SQL。GitHub Actions から `wrangler d1 execute --remote --command` で本番 D1 に流す。
 *
 * `wrangler d1 execute` は値のバインドを受けないので、**値を SQL の文字列に埋める。**
 * 埋めるのは D1 から読んだレース ID と、`validateRaceOdds` を通した数だけ。文字列は `'` を重ねて閉じる。
 *
 * オッズは全員に共通のマスタの付属物で、メモではない。`viewerId` で絞る対象ではない
 * （race / race_entry と同じ扱い。docs/architecture.md 第0章）。
 */
import type { RaceOdds } from '../../src/lib/server/odds/odds.ts';
import { addDays, todayJst } from '../../src/lib/utils/date.ts';
import { inOddsWindow, ODDS_GRADES } from '../../src/lib/utils/odds.ts';
import type { OddsTarget } from './update.ts';

/** `targetsSql` が返す行（列名は D1 のまま）。 */
export type TargetRow = {
	id: string;
	date: string;
	start_time: string | null;
	grade: string | null;
	external_ref: string | null;
};

const text = (value: string) => `'${value.replaceAll("'", "''")}'`;

function num(value: number | null): string {
	if (value === null) return 'NULL';
	if (!Number.isFinite(value)) throw new Error(`数ではない値を SQL に埋めようとした: ${value}`);
	return String(value);
}

const toEpoch = (iso: string) => Math.floor(Date.parse(iso) / 1000);

/**
 * いまオッズを取りに行くかもしれないレース。**D1 で絞るのは「重賞」「今日から2日後まで」「ref・発走時刻が入っているか」まで。**
 * 時間帯は JST の時刻計算が要るので `pickTargets` で切る（その範囲の ref 付きのレースは数件なので、取ってから捨ててよい）。
 */
export function targetsSql(now: Date): string {
	const today = todayJst(now);
	return [
		'SELECT id, date, start_time, grade, external_ref FROM race',
		`WHERE grade IN (${ODDS_GRADES.map(text).join(', ')})`,
		`AND date BETWEEN ${text(today)} AND ${text(addDays(today, 2))}`,
		'AND external_ref IS NOT NULL AND start_time IS NOT NULL',
		'ORDER BY date, start_time'
	].join(' ');
}

/**
 * いま取りに行くレース。**取得元の ID と発走時刻があり、いまが取りに行く時間帯に入っているもの**だけ。
 *
 * **重賞（G1〜G3）だけ。** 時間帯は格で決まる（`oddsWindowOpens`）。G1 は前々日の 18:30、
 * G2・G3 は前日の 18:30 から、どちらも発走まで。L・OP・条件戦は取りに行かない。
 */
export function pickTargets(rows: TargetRow[], now: Date): OddsTarget[] {
	return rows.flatMap((r) =>
		r.external_ref && r.start_time && inOddsWindow(r.date, r.start_time, r.grade, now)
			? [{ raceId: r.id, externalRef: r.external_ref }]
			: []
	);
}

/**
 * 取れたオッズでそのレースの行を置き換える SQL。**検査（`validateRaceOdds`）を通したものだけを渡すこと。**
 *
 * 馬ごとに upsert し、今回の応答に無かった馬番の行は消す。2文を1回の `--command` で送る。
 * D1 は複数の文を batch（1トランザクション）で流すので、途中で落ちても前回の値が半端に混ざらない。
 * 最後の砦として `race_odds` の CHECK もある。
 */
export function saveOddsSql(odds: RaceOdds): string {
	// 0頭は validateRaceOdds が弾いている。ここで全行を消さないための保険
	if (odds.horses.length === 0) throw new Error('0頭のオッズは保存しない');
	const raceId = text(odds.raceId);
	const asOf = num(toEpoch(odds.asOf));
	const fetchedAt = num(toEpoch(odds.fetchedAt));

	const values = odds.horses.map((h) =>
		[
			raceId,
			num(h.horseNumber),
			num(h.winOdds),
			num(h.placeOddsMin),
			num(h.placeOddsMax),
			asOf,
			fetchedAt
		].join(', ')
	);
	const numbers = odds.horses.map((h) => num(h.horseNumber)).join(', ');

	return [
		'INSERT INTO race_odds (race_id, horse_number, win_odds, place_odds_min, place_odds_max, as_of, fetched_at)',
		`VALUES ${values.map((v) => `(${v})`).join(', ')}`,
		'ON CONFLICT (race_id, horse_number) DO UPDATE SET',
		'win_odds = excluded.win_odds, place_odds_min = excluded.place_odds_min,',
		'place_odds_max = excluded.place_odds_max, as_of = excluded.as_of, fetched_at = excluded.fetched_at;',
		`DELETE FROM race_odds WHERE race_id = ${raceId} AND horse_number NOT IN (${numbers});`
	].join('\n');
}
