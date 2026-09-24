/**
 * オッズまわりの純関数。取りに行く時間帯の判定と、画面での書き方。
 *
 * 時刻は JST 固定（docs/product.md 第9章 #7）。Worker がどこで動いても同じになるよう、
 * ローカルタイムゾーンを経由せず UTC のミリ秒で計算する。
 */

import { addDays } from './date';

const HOUR_MS = 60 * 60 * 1000;

/** 重賞でないレースは、発走の何時間前から取りに行くか。 */
export const ODDS_WINDOW_BEFORE_MS = 3 * HOUR_MS;

/** 重賞は、何日前の何時（JST）から取りに行くか。前日発売のオッズが出始める頃に合わせる。 */
const GRADED_OPENS: Partial<Record<string, { daysBefore: number; time: string }>> = {
	// 金曜から売る G1 があるので、前々日から見に行く。まだ出ていなければ何も保存しない
	G1: { daysBefore: 2, time: '18:30' },
	G2: { daysBefore: 1, time: '18:30' },
	G3: { daysBefore: 1, time: '18:30' }
};

/** `YYYY-MM-DD` と `HH:MM`（JST）→ その時刻。形が違えば null。 */
export function startsAt(date: string, startTime: string): Date | null {
	const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	const t = /^(\d{1,2}):(\d{2})$/.exec(startTime);
	if (!d || !t) return null;
	const [y, m, day] = d.slice(1).map(Number);
	const [h, mi] = t.slice(1).map(Number);
	if (h > 23 || mi > 59) return null;
	return new Date(Date.UTC(y, m - 1, day, h - 9, mi));
}

/**
 * オッズを取りに行き始める時刻。格で決める。
 *
 * - G1 … 前々日の 18:30（金曜から売る G1 がある）
 * - G2・G3 … 前日の 18:30（前日発売のオッズが出始める頃）
 * - それ以外 … 発走の3時間前
 *
 * どれも発売前なら取得元は予想オッズしか返さず、parser が読まないので何も保存されない。
 */
export function oddsWindowOpens(
	date: string,
	startTime: string,
	grade: string | null
): Date | null {
	const opens = grade ? GRADED_OPENS[grade] : undefined;
	if (opens) return startsAt(addDays(date, -opens.daysBefore), opens.time);
	const start = startsAt(date, startTime);
	return start && new Date(start.getTime() - ODDS_WINDOW_BEFORE_MS);
}

/**
 * いまオッズを取りに行ってよいか。**取りに行き始める時刻（`oddsWindowOpens`）から発走まで。**
 *
 * 発走後は締め切られて変わらない（確定オッズは結果と一緒に YAML の `odds` で入る）。
 * 取りに行く回数をこの幅に絞ることが、取得元への負荷を抑える主な手段。
 * 夜中に取りに行かないのは Cron の時間帯（wrangler.toml）の側で決めている。
 */
export function inOddsWindow(
	date: string,
	startTime: string,
	grade: string | null,
	now: Date
): boolean {
	const start = startsAt(date, startTime);
	const opens = oddsWindowOpens(date, startTime, grade);
	if (!start || !opens) return false;
	const t = now.getTime();
	return t >= opens.getTime() && t <= start.getTime();
}

/** 単勝。値が無ければ `-`。 */
export function formatWinOdds(value: number | null): string {
	return value === null ? '-' : value.toFixed(1);
}

/** 複勝の幅。`1.4-1.8`。値が無ければ `-`。 */
export function formatPlaceOdds(min: number | null, max: number | null): string {
	if (min === null || max === null) return '-';
	return `${min.toFixed(1)}-${max.toFixed(1)}`;
}

const TIME_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
	timeZone: 'Asia/Tokyo',
	month: 'numeric',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hour12: false
});

/**
 * 「9/27 14:30時点」。日付も付けるのは、前日の値が残っているときに今日の値と取り違えないため。
 * 「現在」「リアルタイム」とは書かない（30分おきにしか取っていない）。
 */
export function formatOddsAsOf(iso: string): string {
	const parts = Object.fromEntries(
		TIME_FORMATTER.formatToParts(new Date(iso)).map((p) => [p.type, p.value])
	);
	return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}時点`;
}
