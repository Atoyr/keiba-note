import * as v from 'valibot';

/**
 * クイック入力の言葉（`insight_word`）の入力。
 * 数の上限は DB に制約を置かず、ここと `services/insights.ts` で守る。
 */

/** 言葉1つの長さ（文字数）。押せる札として並ぶので短く。 */
export const INSIGHT_WORD_MAX = 20;
/** 登録できる言葉の数。 */
export const INSIGHT_WORDS_LIMIT = 30;

/** 言葉。全角の英数字・空白は半角に寄せ（NFKC）、前後の空白を除いて 1〜20 字。 */
export const insightWordSchema = v.pipe(
	v.string('言葉を入力してください'),
	v.transform((s) => s.normalize('NFKC')),
	v.trim(),
	v.minLength(1, '言葉を入力してください'),
	v.maxLength(INSIGHT_WORD_MAX, `言葉は${INSIGHT_WORD_MAX}文字以内で入力してください`)
);
