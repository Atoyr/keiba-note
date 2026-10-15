import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { isPredictionMark, markSchema, tagsSchema } from './note';

const parse = (input: unknown) => v.parse(tagsSchema, input);

/**
 * 札はフォームから `getAll()` で来るので、**中身は何でもありえる**。
 * ここが素通しになると、選択肢に無い文字列がそのまま JSON で D1 に入り、
 * 画面側の色分け（`NOTE_TAG_GROUP` の引き当て）が undefined になる。
 */
describe('tagsSchema', () => {
	it('選択肢にある札だけを通す', () => {
		expect(parse(['次走買い', '不利'])).toEqual(['次走買い', '不利']);
	});

	it('選択肢に無い値は黙って落とす', () => {
		expect(parse(['次走買い', '好きな馬', '<script>', ''])).toEqual(['次走買い']);
	});

	it('重複を落とし、並びを NOTE_TAGS の順に揃える（チェックした順に依存しない）', () => {
		// 同じ組み合わせなら、送られた順が違っても同じ配列になること。
		// ここがずれると、中身が同じでも保存のたびに JSON が変わって差分に見える。
		const a = parse(['好上がり', '不利', '次走買い', '不利']);
		const b = parse(['次走買い', '好上がり', '不利']);
		expect(a).toEqual(['次走買い', '不利', '好上がり']);
		expect(b).toEqual(a);
	});

	it('空でも未指定でも空配列になる（null を返さない）', () => {
		expect(parse([])).toEqual([]);
		expect(parse(undefined)).toEqual([]);
	});
});

/** 印もフォームから文字列で来る。選択肢に無いものは「印なし」にする。 */
describe('markSchema', () => {
	it('☆ と候補の ✓ を含む選択肢の印を通す', () => {
		for (const m of ['◎', '○', '▲', '△', '☆', '✓', '×']) expect(v.parse(markSchema, m)).toBe(m);
	});

	it('選択肢に無い値・空・未指定は null（印なし）', () => {
		expect(v.parse(markSchema, '★')).toBeNull();
		expect(v.parse(markSchema, '')).toBeNull();
		expect(v.parse(markSchema, undefined)).toBeNull();
	});
});

/** ✓ は候補のチェック。予想をまとめる・数える場所では印なしと同じに扱うための判定。 */
describe('isPredictionMark', () => {
	it('候補のチェックと印なしは予想の印ではなく、それ以外の印は予想の印', () => {
		expect(isPredictionMark('✓')).toBe(false);
		expect(isPredictionMark(null)).toBe(false);
		expect(isPredictionMark('◎')).toBe(true);
		expect(isPredictionMark('×')).toBe(true);
	});
});
