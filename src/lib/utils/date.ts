/**
 * 日付まわり。JST 固定（docs/design.md 第9章 #7）。
 *
 * 日付は `YYYY-MM-DD` の文字列で扱い、計算は UTC のミリ秒に直して行う。
 * ローカルタイムゾーンを経由すると、Worker がどこで動いても JST になる保証が崩れる。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const JST_FORMATTER = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Asia/Tokyo',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

/** JST の今日を `YYYY-MM-DD` で返す。 */
export function todayJst(now: Date = new Date()): string {
	return JST_FORMATTER.format(now);
}

/** `YYYY-MM-DD` → その日の 00:00 UTC のミリ秒。日付同士の加減算に使う。 */
function toEpoch(date: string): number {
	const [y, m, d] = date.split('-').map(Number);
	return Date.UTC(y, m - 1, d);
}

function toDateString(epoch: number): string {
	return new Date(epoch).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` に日数を足す。 */
export function addDays(date: string, days: number): string {
	return toDateString(toEpoch(date) + days * DAY_MS);
}

export type Week = { start: string; end: string };

/**
 * 「今週」= 月曜から日曜（JST）。
 *
 * JRA の開催は土日なので、週末開催の翌日（月曜）に次の週へ切り替わり、
 * その週の日曜（＝次の週末開催の最終日）で閉じる。
 * 日曜の時点ではまだその週の中にいる。
 */
export function currentWeek(now: Date = new Date()): Week {
	const today = todayJst(now);
	const dayOfWeek = new Date(toEpoch(today)).getUTCDay(); // 0=日 … 6=土
	const sinceMonday = (dayOfWeek + 6) % 7; // 月=0 … 日=6
	const start = toEpoch(today) - sinceMonday * DAY_MS;
	return { start: toDateString(start), end: toDateString(start + 6 * DAY_MS) };
}

/** 週をまたいだ移動。一覧の「前の週 / 次の週」用。 */
export function shiftWeek(week: Week, weeks: number): Week {
	return { start: addDays(week.start, weeks * 7), end: addDays(week.end, weeks * 7) };
}

/** `2026-09-27` → `9/27(日)` の表示用。 */
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function formatDateShort(date: string): string {
	const [, m, d] = date.split('-').map(Number);
	const w = WEEKDAYS[new Date(toEpoch(date)).getUTCDay()];
	return `${m}/${d}(${w})`;
}
