import * as v from 'valibot';

/**
 * レース直後の気づき（`race_entry_insight`）と、その言葉（`insight_word`）の入力。
 * 数の上限は DB に制約を置かず、ここと `services/insights.ts` で守る。
 */

/** 言葉1つの長さ（文字数）。押せる札として並ぶので短く。 */
export const INSIGHT_WORD_MAX = 20;
/** 登録できる言葉の数。 */
export const INSIGHT_WORDS_LIMIT = 30;
/** 1頭に付けられる言葉の数。 */
export const INSIGHT_ATTACHED_LIMIT = 40;
/** 自由入力の気づきの長さ（文字数）。ふりかえりの本文ではなく、短い一言のための欄。 */
export const INSIGHT_MEMO_MAX = 200;

/** 言葉。全角の英数字・空白は半角に寄せ（NFKC）、前後の空白を除いて 1〜20 字。 */
export const insightWordSchema = v.pipe(
	v.string('言葉を入力してください'),
	v.transform((s) => s.normalize('NFKC')),
	v.trim(),
	v.minLength(1, '言葉を入力してください'),
	v.maxLength(INSIGHT_WORD_MAX, `言葉は${INSIGHT_WORD_MAX}文字以内で入力してください`)
);

/** 自由入力の気づき。前後の空白を除いて 200 字以内。空は可（空にすると気づきのメモを消す）。 */
export const insightMemoSchema = v.pipe(
	v.string('気づきを入力してください'),
	v.trim(),
	v.maxLength(INSIGHT_MEMO_MAX, `気づきは${INSIGHT_MEMO_MAX}文字以内で入力してください`)
);

/** 押した言葉（押す＝付ける、もう一度押す＝外す）を運ぶ JSON。 */
export const insightToggleSchema = v.object({
	entryId: v.pipe(v.string(), v.minLength(1)),
	word: insightWordSchema,
	on: v.boolean()
});
