import * as v from 'valibot';
import { bodySchema, MARKS, NOTE_TAGS } from './note';
import { FLOW_MEMO_MAX, PACES, spotSchema } from './race-flow';

const phaseSchema = v.strictObject({
	spots: v.pipe(
		v.array(spotSchema),
		v.check(
			(spots) =>
				new Set(spots.map((s) => s.entryId)).size === spots.length &&
				new Set(spots.map((s) => `${s.x}:${s.y}`)).size === spots.length,
			'同じ馬やマスを重複して配置できません'
		)
	),
	memo: v.pipe(v.string(), v.maxLength(FLOW_MEMO_MAX))
});

export const predictionFlowSchema = v.strictObject({
	pace: v.nullable(v.picklist(PACES)),
	start: phaseSchema,
	corner4: phaseSchema,
	finish: phaseSchema
});

/** 未指定は維持、null / 空文字 / 空配列は明示的なクリア。フォームの寛容な変換は使わない。 */
export const predictionDraftSchema = v.strictObject({
	race: v.optional(
		v.strictObject({
			body: v.optional(bodySchema),
			pace: v.optional(v.nullable(v.picklist(PACES))),
			flow: v.optional(v.nullable(predictionFlowSchema))
		})
	),
	entries: v.pipe(
		v.array(
			v.strictObject({
				entryId: v.pipe(v.string(), v.minLength(1)),
				body: v.optional(bodySchema),
				tags: v.optional(v.array(v.picklist(NOTE_TAGS))),
				mark: v.optional(v.nullable(v.picklist(MARKS)))
			})
		),
		v.check(
			(entries) => new Set(entries.map((e) => e.entryId)).size === entries.length,
			'出走馬を重複して指定できません'
		)
	)
});

export type PredictionDraft = v.InferOutput<typeof predictionDraftSchema>;
