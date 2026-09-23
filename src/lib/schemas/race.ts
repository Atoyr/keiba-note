import * as v from 'valibot';

/**
 * フォームは未入力を `''` で送ってくる。DB 側は NULL なので、ここで寄せる。
 * 入力は常に string、出力は `string | null`。
 */
const optionalText = v.pipe(
	v.string(),
	v.trim(),
	v.transform((s): string | null => (s === '' ? null : s))
);

/** 選択肢のどれでもなければ null。不正な値でフォーム全体を落とさない。 */
const optionalPick = <const T extends readonly string[]>(options: T) =>
	v.pipe(
		v.string(),
		v.trim(),
		v.transform((s): T[number] | null =>
			(options as readonly string[]).includes(s) ? (s as T[number]) : null
		)
	);

const optionalInt = (min: number, max: number) =>
	v.pipe(
		v.string(),
		v.trim(),
		v.transform((s): number | null => (s === '' ? null : Number(s))),
		v.check(
			(n) => n === null || (Number.isInteger(n) && n >= min && n <= max),
			`${min}〜${max} の整数で入力してください`
		)
	);

const optionalNumber = (min: number, max: number) =>
	v.pipe(
		v.string(),
		v.trim(),
		v.transform((s): number | null => (s === '' ? null : Number(s))),
		v.check(
			(n) => n === null || (Number.isFinite(n) && n >= min && n <= max),
			`${min}〜${max} で入力してください`
		)
	);

export const GRADES = ['G1', 'G2', 'G3', 'L', 'OP'] as const;
export const SURFACES = ['芝', 'ダート', '障害'] as const;
export const DIRECTIONS = ['右', '左', '直線'] as const;
export const TRACK_CONDITIONS = ['良', '稍重', '重', '不良'] as const;
/**
 * JRA の10場。**この10場だけを扱う**（地方・海外は対象外）。
 *
 * 自由入力にすると表記ゆれ1つで「今週の重賞」から落ちるため、選択式に縛る。
 */
export const COURSES = [
	'札幌',
	'函館',
	'福島',
	'新潟',
	'東京',
	'中山',
	'中京',
	'京都',
	'阪神',
	'小倉'
] as const;

/**
 * 1レースに登録できる出走馬の上限。**馬番（1〜18）の上限とは別。**
 *
 * 枠が決まる前は、特別登録の馬をそのまま候補として入れる（data/README.md「三段階で書ける」）。
 * 登録は18頭を超えることがあり、枠が決まると出走しない候補は取り下げる。
 */
export const MAX_ENTRIES = 40;

/** 重賞。`L` / `OP` は重賞ではないので「今週」の対象に含めない。 */
export const GRADED = ['G1', 'G2', 'G3'] as const;

export const raceSchema = v.object({
	date: v.pipe(
		v.string(),
		v.trim(),
		v.regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD で入力してください')
	),
	course: v.picklist(COURSES, '競馬場を選んでください'),
	raceNumber: optionalInt(1, 12),
	name: optionalText,
	grade: optionalPick(GRADES),
	className: optionalText,
	surface: optionalPick(SURFACES),
	distance: optionalInt(800, 5000),
	direction: optionalPick(DIRECTIONS),
	trackCondition: optionalPick(TRACK_CONDITIONS),
	weather: optionalText
});

export type RaceInput = v.InferOutput<typeof raceSchema>;

/** 出走馬1頭分。馬名だけが必須で、あとは全部あとから埋められる。 */
export const entrySchema = v.object({
	horseName: v.pipe(v.string(), v.trim()),
	bracket: optionalInt(1, 8),
	horseNumber: optionalInt(1, 18),
	jockey: optionalText,
	finishPosition: optionalInt(1, 18),
	finishTime: optionalText,
	margin: optionalText,
	last3f: optionalNumber(20, 60),
	popularity: optionalInt(1, 18)
});

export const entriesSchema = v.pipe(
	v.array(entrySchema),
	v.maxLength(MAX_ENTRIES, `出走馬は${MAX_ENTRIES}頭までです`)
);

export type EntryInput = v.InferOutput<typeof entrySchema>;
