import { COURSE_RECORDS } from './course-records-data.ts';

/**
 * JRA のレコードタイム表（`course-records-data.ts`。`pnpm run course-records` が書く）と、
 * 走りの日付・場・馬場・距離・タイムを突き合わせる。表は「いまのレコード」だけなので、
 * その後に破られたレコードの走りには付かない。
 */

/** `1:58.4`・`0:53.5`・`53.5` を 0.1 秒の整数にする。読めなければ null。 */
export function timeToTenths(s: string): number | null {
	const m = /^(?:(\d+):)?(\d{1,2})\.(\d)$/.exec(s.trim());
	if (!m) return null;
	return Number(m[1] ?? 0) * 600 + Number(m[2]) * 10 + Number(m[3]);
}

const key = (date: string, course: string, surface: string, distance: number, tenths: number) =>
	`${date}|${course}|${surface}|${distance}|${tenths}`;

const KEYS = new Set(
	COURSE_RECORDS.flatMap((r) => {
		const t = timeToTenths(r.time);
		return t === null ? [] : [key(r.date, r.course, r.surface, r.distance, t)];
	})
);

/** その走りの走破タイムが、同じ日・場・馬場・距離のレコードと同じか。値が欠けていれば false。 */
export function isRecordTime(r: {
	date: string;
	course: string;
	surface: string | null;
	distance: number | null;
	finishTime: string | null;
}): boolean {
	if (!r.date || !r.course || !r.surface || r.distance === null || !r.finishTime) return false;
	const t = timeToTenths(r.finishTime);
	return t !== null && KEYS.has(key(r.date, r.course, r.surface, r.distance, t));
}
