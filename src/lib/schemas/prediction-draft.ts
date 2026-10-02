import * as v from 'valibot';
import { bodySchema, MARKS, NOTE_TAGS, tagsSchema } from './note';
import { flowMemoSchema, flowSpotSchema, PACES } from './race-flow';

const paceSchema = v.nullable(v.picklist(PACES));
const phaseSchema = v.strictObject({
	spots: v.array(v.strictObject(flowSpotSchema.entries)),
	memo: flowMemoSchema
});

/** JSON の展開。フォーム用の JSON 文字列にする前に、座標を既存規則で検証する。 */
export const predictionFlowSchema = v.strictObject({
	pace: paceSchema,
	start: phaseSchema,
	corner4: phaseSchema,
	finish: phaseSchema
});

/** 未指定は維持。null / 空文字 / 空配列だけが明示的なクリア。 */
export const predictionDraftSchema = v.strictObject({
	race: v.optional(
		v.strictObject({
			body: v.optional(bodySchema),
			pace: v.optional(paceSchema),
			flow: v.optional(v.nullable(predictionFlowSchema))
		})
	),
	entries: v.array(
		v.strictObject({
			entryId: v.pipe(v.string(), v.minLength(1)),
			body: v.optional(bodySchema),
			tags: v.optional(
				v.pipe(
					v.array(v.picklist(NOTE_TAGS)),
					v.transform((xs) => v.parse(tagsSchema, xs))
				)
			),
			mark: v.optional(v.nullable(v.picklist(MARKS)))
		})
	)
});

export type PredictionDraft = v.InferOutput<typeof predictionDraftSchema>;
