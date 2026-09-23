import { describe, expect, it } from 'vitest';
import type { Mark } from '$lib/schemas/note';
import { answerCheck, answerVerdict, byMark } from './answer';

describe('byMark', () => {
	// 予想画面の「付けた印」と答え合わせで同じ並びにする。
	it('印の無い馬を落とし、◎ → × の順、同じ印は馬番の順に並べる', () => {
		const rows = [
			{ mark: '△' as const, horseNumber: 9 },
			{ mark: null, horseNumber: 1 },
			{ mark: '◎' as const, horseNumber: 12 },
			{ mark: '△' as const, horseNumber: 2 }
		];

		expect(byMark(rows)).toEqual([
			{ mark: '◎', horseNumber: 12 },
			{ mark: '△', horseNumber: 2 },
			{ mark: '△', horseNumber: 9 }
		]);
	});
});

describe('answerVerdict', () => {
	// 境界は3着。◎が2着でも本命としては仕事をしている。
	it('◎○▲△ は3着以内なら当たり、4着以下なら外れ', () => {
		for (const mark of ['◎', '○', '▲', '△'] as Mark[]) {
			expect(answerVerdict(mark, 1)).toBe('hit');
			expect(answerVerdict(mark, 3)).toBe('hit');
			expect(answerVerdict(mark, 4)).toBe('miss');
		}
	});

	// × は「来ない」と読んだ印。3着以内に来たら読みが外れている。
	it('× は当たり外れが逆になる', () => {
		expect(answerVerdict('×', 3)).toBe('miss');
		expect(answerVerdict('×', 4)).toBe('hit');
	});

	// 着順が入っていない馬を「外れ」と出すと、結果の投入待ちなのに予想が外れたように読める。
	it('着順が無ければ当たりとも外れとも言わない', () => {
		expect(answerVerdict('◎', null)).toBe('pending');
		expect(answerVerdict('×', null)).toBe('pending');
	});
});

const row = (mark: Mark | null, horseNumber: number | null, finishPosition: number | null) => ({
	mark,
	horseNumber,
	finishPosition,
	horseName: `馬${horseNumber}`
});

describe('answerCheck', () => {
	it('印を付けていない馬は出さない', () => {
		expect(answerCheck([row(null, 1, 1), row('◎', 2, 5)]).map((a) => a.horseName)).toEqual(['馬2']);
	});

	// 画面の出走馬は着順で並ぶ。答え合わせで先に知りたいのは本命がどうだったか。
	it('着順ではなく印の順（◎ → ×）に並べ直す', () => {
		const answers = answerCheck([
			row('×', 1, 1),
			row('△', 2, 2),
			row('○', 3, 3),
			row('◎', 4, 9),
			row('▲', 5, 4)
		]);

		expect(answers.map((a) => a.mark)).toEqual(['◎', '○', '▲', '△', '×']);
		expect(answers.map((a) => a.verdict)).toEqual(['miss', 'hit', 'miss', 'hit', 'miss']);
	});

	it('同じ印が複数あれば馬番の順。馬番が無い馬は後ろ', () => {
		const answers = answerCheck([row('△', null, 1), row('△', 8, 2), row('△', 3, 3)]);

		expect(answers.map((a) => a.horseNumber)).toEqual([3, 8, null]);
	});

	it('元の行の中身はそのまま持ち回る', () => {
		const [answer] = answerCheck([row('◎', 4, 2)]);

		expect(answer).toEqual({
			mark: '◎',
			horseNumber: 4,
			finishPosition: 2,
			horseName: '馬4',
			verdict: 'hit'
		});
	});
});
