/**
 * 馬齢。JRA は毎年1月1日に一斉に加齢する数え方（2001年以降）なので、レースの日付の年 − 生年。
 * 生年月日の月日は使わない。出馬表の馬齢と一致する。`date` は `YYYY-MM-DD`。生年が無ければ null。
 */
export function horseAge(birthYear: number | null, date: string): number | null {
	if (!birthYear) return null;
	const year = Number(date.slice(0, 4));
	return Number.isInteger(year) ? year - birthYear : null;
}
