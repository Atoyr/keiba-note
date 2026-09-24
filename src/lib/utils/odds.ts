/**
 * オッズまわりの純関数。取りに行く時間帯の判定と、画面での書き方。
 *
 * 時刻は JST 固定（docs/product.md 第9章 #7）。Worker がどこで動いても同じになるよう、
 * ローカルタイムゾーンを経由せず UTC のミリ秒で計算する。
 */

const HOUR_MS = 60 * 60 * 1000;

/** 発走の何時間前から取りに行くか。 */
export const ODDS_WINDOW_BEFORE_MS = 3 * HOUR_MS;

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
 * いまオッズを取りに行ってよいか。**発走3時間前から発走まで。**
 *
 * それより前は動きが小さく、発走後は締め切られて変わらない（確定オッズは結果と一緒に
 * YAML の `odds` で入る）。取りに行く回数をこの幅に絞ることが、取得元への負荷を抑える主な手段。
 */
export function inOddsWindow(date: string, startTime: string, now: Date): boolean {
	const start = startsAt(date, startTime);
	if (!start) return false;
	const t = now.getTime();
	return t >= start.getTime() - ODDS_WINDOW_BEFORE_MS && t <= start.getTime();
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
