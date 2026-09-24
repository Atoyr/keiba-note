/**
 * netkeiba のオッズ JSON を `RaceOdds` に読み替える。**通信はしない**（fixture で試せるように）。
 *
 * 読むのは、オッズのページ自身が呼んでいる `api_get_jra_odds.html?type=1`（単勝・複勝）の応答。
 * 公開の API ではないので、形が変わったら黙って空にせず `parse` で投げる。
 * 2026-09-24 に確かめた形:
 *
 * ```json
 * { "status": "result",
 *   "data": { "official_datetime": "2026-09-21 15:53:44",
 *             "odds": { "1": { "01": ["1.4", "0.0", "1"] },          // 単勝: [オッズ, 使わない, 人気]
 *                       "2": { "01": ["1.1", "1.1", "1"] } } } }     // 複勝: [下限, 上限, 人気]
 * ```
 *
 * `status` は netkeiba の画面の JS が分けている5つ。
 * - `middle`（発売中）/ `result`（確定）… 読む
 * - `yoso` … **netkeiba の予想オッズ。** 発売前に出る。キーが馬番ではなく登録順なので、
 *   読むと別の馬にオッズが付く。発売前として扱う
 * - `NG`・空 … まだ無い
 * - `limit` … 取得元が制限をかけている
 */
import { OddsError, type HorseOdds, type RaceOdds } from '../odds';

const WIN = '1';
const PLACE = '2';

export function parseNetkeibaOdds(source: unknown, raceId: string, fetchedAt: Date): RaceOdds {
	if (!isRecord(source) || typeof source.status !== 'string') {
		throw new OddsError('parse', 'status がありません');
	}

	switch (source.status) {
		case 'middle':
		case 'result':
			break;
		case 'yoso':
			throw new OddsError('not-available', '発売前です（予想オッズしか出ていません）');
		case 'NG':
		case '':
			throw new OddsError('not-available', 'オッズがまだありません');
		case 'limit':
			throw new OddsError('rate-limited', '取得元がアクセスを制限しています');
		default:
			throw new OddsError('parse', `知らない status です: ${source.status}`);
	}

	const data = source.data;
	if (!isRecord(data) || !isRecord(data.odds))
		throw new OddsError('parse', 'data.odds がありません');
	const win = data.odds[WIN];
	if (!isRecord(win)) throw new OddsError('parse', '単勝がありません');
	// 複勝は出走が4頭以下だと売られない。無ければ全頭 null にする。
	const place = data.odds[PLACE] ?? {};
	if (!isRecord(place)) throw new OddsError('parse', '複勝の形が違います');

	const horses = new Map<number, HorseOdds>();
	const row = (n: number) => {
		let h = horses.get(n);
		if (!h) {
			h = { horseNumber: n, winOdds: null, placeOddsMin: null, placeOddsMax: null };
			horses.set(n, h);
		}
		return h;
	};

	for (const [key, value] of Object.entries(win)) {
		row(horseNumber(key)).winOdds = oddsValue(cells(value, key)[0], key);
	}
	for (const [key, value] of Object.entries(place)) {
		const [min, max] = cells(value, key);
		const h = row(horseNumber(key));
		h.placeOddsMin = oddsValue(min, key);
		h.placeOddsMax = oddsValue(max, key);
	}

	return {
		raceId,
		asOf: officialTime(data.official_datetime) ?? fetchedAt.toISOString(),
		fetchedAt: fetchedAt.toISOString(),
		horses: [...horses.values()].sort((a, b) => a.horseNumber - b.horseNumber)
	};
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function horseNumber(key: string): number {
	if (!/^\d{1,2}$/.test(key)) throw new OddsError('parse', `馬番として読めないキーです: ${key}`);
	return Number(key);
}

function cells(value: unknown, key: string): [unknown, unknown] {
	if (!Array.isArray(value) || value.length < 2) {
		throw new OddsError('parse', `${key}番の値が配列ではありません`);
	}
	return [value[0], value[1]];
}

/**
 * オッズの1欄。
 *
 * - 数字でない欄（`---.-`・`取消`・空）は値なし。取消・除外の馬はこの形で来る
 * - `0.0` も値なし。netkeiba は使わない欄を `0.0` で埋める（単勝の2番目がそう）
 * - 数字を含むのに数として読めない欄は、形が変わった疑いなので投げる
 */
function oddsValue(cell: unknown, key: string): number | null {
	if (typeof cell !== 'string')
		throw new OddsError('parse', `${key}番のオッズが文字列ではありません`);
	const s = cell.trim();
	if (!/\d/.test(s)) return null;
	if (!/^\d+(\.\d+)?$/.test(s)) throw new OddsError('parse', `${key}番のオッズが読めません: ${s}`);
	const n = Number(s);
	return n > 0 ? n : null;
}

/** `2026-09-21 15:53:44`（JST）→ ISO 8601。読めなければ null（取得した時刻で代える）。 */
function officialTime(v: unknown): string | null {
	if (typeof v !== 'string') return null;
	const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(v.trim());
	if (!m) return null;
	const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
	return new Date(Date.UTC(y, mo - 1, d, h - 9, mi, s)).toISOString();
}
