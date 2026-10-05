import * as v from 'valibot';
import { bodySchema } from './note';

/**
 * 重賞の傾向のメモ（1人・1重賞につき1本）。本文が空なら「消す」。札は無い
 * （傾向の言葉は重賞ごとに違い、固定の選択肢を作れない）。
 * 重賞の鍵は URL から取るので、ここでは運ばない。
 */
export const gradedRaceTrendSchema = v.object({ body: bodySchema });

export type GradedRaceTrendFormInput = v.InferOutput<typeof gradedRaceTrendSchema>;
