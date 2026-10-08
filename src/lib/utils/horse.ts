import type { HorseSex } from '$lib/schemas/horse';

/**
 * 馬齢。JRA は毎年1月1日に一斉に加齢する数え方（2001年以降）なので、レースの日付の年 − 生年。
 * 生年月日の月日は使わない。出馬表の馬齢と一致する。`date` は `YYYY-MM-DD`。生年が無ければ null。
 */
export function horseAge(birthYear: number | null, date: string): number | null {
	if (!birthYear) return null;
	const year = Number(date.slice(0, 4));
	return Number.isInteger(year) ? year - birthYear : null;
}

/**
 * 性齢。出馬表と同じ表記で、`牡4`・`牝5`・`セ7`。性だけ分かれば `牡`、馬齢だけなら `4歳`、どちらも無ければ null。
 * 馬齢は `date`（レースの日付）の年 − 生年なので、過去のレースではそのレースのときの馬齢になる。
 */
export function sexAgeLabel(
	sex: HorseSex | null,
	birthYear: number | null,
	date: string
): string | null {
	const age = horseAge(birthYear, date);
	if (sex && age !== null) return `${sex}${age}`;
	if (sex) return sex;
	if (age !== null) return `${age}歳`;
	return null;
}
