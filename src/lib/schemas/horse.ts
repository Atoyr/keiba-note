import * as v from 'valibot';

/** 馬の性。画面の選択肢と DB の enum（`db/schema.ts`）の元。 */
export const HORSE_SEXES = ['牡', '牝', 'セ'] as const;

export type HorseSex = (typeof HORSE_SEXES)[number];

/**
 * 馬の所属（トレセン）。netkeiba の調教師欄の頭のラベルと同じ。
 * 美浦・栗東は JRA のトレセン、地方・海外はそれ以外。画面の選択肢と札の色の判断に使う。
 */
export const TRAINING_CENTERS = ['美浦', '栗東', '地方', '海外'] as const;

export type TrainingCenter = (typeof TRAINING_CENTERS)[number];

/** trim して、空なら null。 */
const optionalText = v.pipe(
	v.string(),
	v.trim(),
	v.transform((s) => s || null)
);

/** 空（未選択）か選択肢のどれか。空は null にする。 */
const optionalChoice = <const T extends readonly [string, ...string[]]>(
	options: T,
	message: string
) =>
	v.pipe(
		v.string(),
		v.trim(),
		v.union([v.literal(''), v.picklist(options)], message),
		v.transform((s): T[number] | null => (s === '' ? null : s))
	);

/** `YYYY-MM-DD` で、暦に実在する日付か（`2021-02-30` は偽）。 */
export function isIsoDate(s: string): boolean {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
	if (!m) return false;
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const date = new Date(Date.UTC(y, mo - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const horseProfileFields = v.object({
	nameKana: optionalText,
	sex: optionalChoice(HORSE_SEXES, '性別を選び直してください'),
	birthYear: v.pipe(
		v.string(),
		v.trim(),
		v.transform((s) => Number(s)),
		v.transform((n) => (Number.isInteger(n) && n > 1900 ? n : null))
	),
	birthDate: v.pipe(
		v.string(),
		v.trim(),
		v.check((s) => s === '' || isIsoDate(s), '生年月日を確かめてください'),
		v.transform((s) => s || null)
	),
	trainer: optionalText,
	trainingCenter: optionalChoice(TRAINING_CENTERS, '所属を選び直してください'),
	sire: optionalText,
	dam: optionalText,
	damSire: optionalText,
	profileMemo: optionalText
});

/**
 * 馬のプロフィール欄（`saveProfile`）。**馬名は含まない。** 生年は整数で 1900 年より後だけ、それ以外は null。
 * 生年月日があって生年が空なら生年は生年月日の年にし、両方あって年が違えば落とす。
 */
export const horseProfileSchema = v.pipe(
	horseProfileFields,
	v.check(
		(p) =>
			p.birthDate === null ||
			p.birthYear === null ||
			p.birthYear === Number(p.birthDate.slice(0, 4)),
		'生年と生年月日の年が合いません'
	),
	v.transform((p) => ({
		...p,
		birthYear: p.birthYear ?? (p.birthDate ? Number(p.birthDate.slice(0, 4)) : null)
	}))
);
