import { HORSE_TRAIT_TAGS, type HorseSex, type HorseTraitTag } from '#lib/schemas/horse.ts';

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
 * 馬体重と増減。`486(+4)`・`486(-6)`・`486(±0)`。増減が無ければ（初出走など）`486`だけ。
 * 馬体重が無ければ null（計不・結果の投入前。表示しない）。
 */
export function formatHorseWeight(weight: number | null, diff: number | null): string | null {
	if (weight === null) return null;
	if (diff === null) return `${weight}`;
	if (diff === 0) return `${weight}(±0)`;
	return `${weight}(${diff > 0 ? '+' : '-'}${Math.abs(diff)})`;
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

/**
 * 距離（m）の区分の札。短距離（〜1400）・マイル（1401〜1800）・中距離（1801〜2200）・長距離（2201〜）。
 * 距離が無ければ null。JRA の呼び方（1400m 以下を短距離、1800m をマイル、2200m までを中距離）に寄せている。
 */
export function distanceTraitTag(distance: number | null): HorseTraitTag | null {
	if (distance === null) return null;
	if (distance <= 1400) return '短距離巧者';
	if (distance <= 1800) return 'マイル巧者';
	if (distance <= 2200) return '中距離巧者';
	return '長距離巧者';
}

/**
 * そのレースに合う、馬に付けた札。場（`{course}巧者`）・回り（右・左。直線と不明は合わせない）・距離の区分で当てる。
 * 並びは `HORSE_TRAIT_TAGS` の順。予想・ふりかえりの行で、メモを開かずに「このレースに合う」を見せるために使う。
 */
export function raceHorseTraitTags(
	tags: readonly HorseTraitTag[],
	race: { course: string; direction: string | null; distance: number | null }
): HorseTraitTag[] {
	const wanted = new Set<string>([`${race.course}巧者`]);
	if (race.direction === '右') wanted.add('右回り巧者');
	if (race.direction === '左') wanted.add('左回り巧者');
	const distance = distanceTraitTag(race.distance);
	if (distance) wanted.add(distance);
	return HORSE_TRAIT_TAGS.filter((t) => tags.includes(t) && wanted.has(t));
}
