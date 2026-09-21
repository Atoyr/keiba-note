import * as v from 'valibot';

export const VISIBILITIES = ['private', 'unlisted'] as const;

/** 予想印。本命 → 消し の順。 */
export const MARKS = ['◎', '○', '▲', '△', '×'] as const;

export type Mark = (typeof MARKS)[number];

/** 選択肢のどれでもなければ null。印なしが既定。 */
export const markSchema = v.pipe(
	v.optional(v.string(), ''),
	v.trim(),
	v.transform((s): Mark | null => ((MARKS as readonly string[]).includes(s) ? (s as Mark) : null))
);

/**
 * 公開範囲。**保存フォームはこれを運ばない。**
 *
 * 既定が非公開になったので、書くときに公開範囲を選ばせる意味がなくなった。
 * ふりかえり画面に18頭ぶんのチェックボックスを並べても、ほぼ誰も触らず
 * 「うっかり公開」の事故だけが残る。共有は書いたあとの明示的な操作にする
 * （design.md 第6章「共有の操作をどこに置くか」）。
 *
 * ここを使うのは共有の切り替えフォームだけ。
 */
export const visibilitySchema = v.pipe(
	v.optional(v.string(), 'private'),
	v.transform((s) => (s === 'unlisted' ? 'unlisted' : 'private')),
	v.picklist(VISIBILITIES)
);

/** 共有を始める／やめる。 */
export const shareNoteSchema = v.object({
	noteId: v.pipe(v.string(), v.minLength(1)),
	visibility: visibilitySchema
});

/** 次走期待度 1–5。任意。 */
export const ratingSchema = v.pipe(
	v.optional(v.string(), ''),
	v.trim(),
	v.transform((s) => (s === '' ? null : Number(s))),
	v.union([v.null(), v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5))])
);

export const bodySchema = v.pipe(
	v.string(),
	// 前後の空白だけのメモは「空」とみなしたいので trim はサービス層でも行う。
	v.maxLength(10000, 'メモが長すぎます')
);

/** 出走馬1頭分のメモ入力。ふりかえりと予想で共通の形。 */
export const entryNoteSchema = v.object({
	entryId: v.pipe(v.string(), v.minLength(1)),
	horseId: v.pipe(v.string(), v.minLength(1)),
	body: bodySchema,
	rating: ratingSchema
});

/** 予想画面の1頭分。本文に加えて印を持つ。 */
export const previewEntrySchema = v.object({
	entryId: v.pipe(v.string(), v.minLength(1)),
	horseId: v.pipe(v.string(), v.minLength(1)),
	body: bodySchema,
	rating: ratingSchema,
	mark: markSchema
});

/**
 * 予想画面の一括保存（出走前メモ）。
 * レース自体のメモは無く、出走馬ごとのメモだけ。
 */
export const previewNotesSchema = v.object({
	entries: v.array(previewEntrySchema)
});

export type PreviewNotesFormInput = v.InferOutput<typeof previewNotesSchema>;

/** ふりかえり画面の一括保存。レースのメモ + 出走馬ごとのメモ。 */
export const raceReviewSchema = v.object({
	raceNote: v.object({
		body: bodySchema
	}),
	entries: v.array(entryNoteSchema)
});

export type RaceReviewFormInput = v.InferOutput<typeof raceReviewSchema>;

/** 馬の近況メモ（レースに紐づかないメモ）。 */
export const horseNoteSchema = v.object({
	body: v.pipe(bodySchema, v.trim(), v.minLength(1, 'メモを入力してください')),
	rating: ratingSchema,
	occurredAt: v.pipe(
		v.string(),
		v.trim(),
		v.regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD で入力してください')
	)
});

export const deleteNoteSchema = v.object({
	noteId: v.pipe(v.string(), v.minLength(1))
});
