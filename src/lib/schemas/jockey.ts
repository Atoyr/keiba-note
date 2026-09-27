import * as v from 'valibot';
import { bodySchema } from './note';

/**
 * 騎手に付ける札。**選択肢は固定で、ユーザーは増やせない**（メモの札 `NOTE_TAGS` と同じ考え方）。
 *
 * 自由に書ける札にすると「中山巧者」と「中山◎」のように同じ意味が別の札に割れ、札で絞っても
 * 拾いきれない。予想のときに「中山巧者の騎手」を引けることが札を付ける理由なので、名前を揃える。
 *
 * 並びは画面の並びでもある。系統（`JOCKEY_TAG_GROUPS`）ごとにまとめて出すので、足すときは
 * 末尾ではなく入る系統の中に置く。
 */
export const JOCKEY_TAG_GROUPS = [
	{
		label: '得意な場',
		tags: [
			'札幌巧者',
			'函館巧者',
			'福島巧者',
			'新潟巧者',
			'東京巧者',
			'中山巧者',
			'中京巧者',
			'京都巧者',
			'阪神巧者',
			'小倉巧者'
		]
	},
	{ label: '得意な条件', tags: ['芝巧者', 'ダート巧者', '短距離巧者', '長距離巧者', '道悪巧者'] },
	{ label: '乗り方', tags: ['先行が多い', '差し・追込が多い'] },
	{ label: '狙いどころ', tags: ['穴で怖い', '人気で危うい'] }
] as const;

export type JockeyTag = (typeof JOCKEY_TAG_GROUPS)[number]['tags'][number];

export const JOCKEY_TAGS: readonly JockeyTag[] = JOCKEY_TAG_GROUPS.flatMap((g) => g.tags);

/** 騎手に付けた札。選択肢に無い値は落とし、重複も落とし、並びは `JOCKEY_TAGS` の順に揃える。 */
export const jockeyTagsSchema = v.pipe(
	v.optional(v.array(v.string()), () => []),
	v.transform((xs) => JOCKEY_TAGS.filter((t) => xs.includes(t)))
);

/** 札1つ（一覧の絞り込み）。選択肢に無ければ null＝絞らない。 */
export function parseJockeyTag(s: string | null): JockeyTag | null {
	return JOCKEY_TAGS.find((t) => t === s) ?? null;
}

/**
 * 騎手のまとめ（1人・1騎手につき1本）。本文も札も空なら「消す」。
 * 騎手の名前は URL から取るので、ここでは運ばない。
 */
export const jockeySummarySchema = v.object({
	body: bodySchema,
	tags: jockeyTagsSchema
});

export type JockeySummaryFormInput = v.InferOutput<typeof jockeySummarySchema>;
