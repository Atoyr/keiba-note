import * as v from 'valibot';

export const VISIBILITIES = ['shared', 'private'] as const;

/** 公開範囲。既定は shared（招待制の閉じた場なので共有が自然）。 */
export const visibilitySchema = v.pipe(
	v.optional(v.string(), 'shared'),
	v.transform((s) => (s === 'private' ? 'private' : 'shared')),
	v.picklist(VISIBILITIES)
);

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

/** ふりかえり画面の一括保存。レースのメモ + 出走馬ごとのメモ。 */
export const raceReviewSchema = v.object({
	raceNote: v.object({
		body: bodySchema,
		visibility: visibilitySchema
	}),
	entries: v.array(
		v.object({
			entryId: v.pipe(v.string(), v.minLength(1)),
			horseId: v.pipe(v.string(), v.minLength(1)),
			body: bodySchema,
			rating: ratingSchema,
			visibility: visibilitySchema
		})
	)
});

export type RaceReviewFormInput = v.InferOutput<typeof raceReviewSchema>;

/** 馬の近況メモ（レースに紐づかないメモ）。 */
export const horseNoteSchema = v.object({
	body: v.pipe(bodySchema, v.trim(), v.minLength(1, 'メモを入力してください')),
	rating: ratingSchema,
	visibility: visibilitySchema,
	occurredAt: v.pipe(
		v.string(),
		v.trim(),
		v.regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD で入力してください')
	)
});

export const deleteNoteSchema = v.object({
	noteId: v.pipe(v.string(), v.minLength(1))
});
