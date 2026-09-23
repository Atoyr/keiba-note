import { describe, expect, it } from 'vitest';
import type { Mark } from '$lib/schemas/note';
import { answerCheck, asMarked, byMark, inTheMoneyCount, placing } from './answer';

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

describe('placing', () => {
	// 境界は3着（複勝圏）。
	it('3着以内は馬券内、4着以下は着外', () => {
		expect(placing(1)).toBe('in');
		expect(placing(3)).toBe('in');
		expect(placing(4)).toBe('out');
	});

	// 着順が入っていない馬を着外と出すと、結果の投入待ちなのに負けたように読める。
	it('着順が無ければ未確定', () => {
		expect(placing(null)).toBe('pending');
	});
});

describe('asMarked', () => {
	it('◎○▲△ は馬券内なら読みどおり', () => {
		for (const mark of ['◎', '○', '▲', '△'] as Mark[]) {
			expect(asMarked(mark, 'in')).toBe(true);
			expect(asMarked(mark, 'out')).toBe(false);
		}
	});

	// × は「来ない」と読んだ印。馬券内に来たら読み違い。
	it('× は着外なら読みどおり、馬券内なら読み違い', () => {
		expect(asMarked('×', 'out')).toBe(true);
		expect(asMarked('×', 'in')).toBe(false);
	});

	it('未確定なら読みどおりとも読み違いとも言わない', () => {
		expect(asMarked('◎', 'pending')).toBeNull();
		expect(asMarked('×', 'pending')).toBeNull();
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
		expect(answers.map((a) => a.placing)).toEqual(['out', 'in', 'out', 'in', 'in']);
		expect(answers.map((a) => a.asMarked)).toEqual([false, true, false, true, false]);
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
			placing: 'in',
			asMarked: true
		});
	});
});

describe('inTheMoneyCount', () => {
	it('着順が決まった ◎○▲△ のうち、馬券内の頭数を数える', () => {
		const answers = answerCheck([
			row('◎', 1, 9),
			row('○', 2, 1),
			row('▲', 3, 3),
			row('△', 4, null)
		]);

		expect(inTheMoneyCount(answers)).toEqual({ in: 2, of: 3 });
	});

	// × を馬券内の数に混ぜると、消した馬に来られたことが「成績」に数えられてしまう。
	it('× は数えない', () => {
		const answers = answerCheck([row('◎', 1, 2), row('×', 2, 1)]);

		expect(inTheMoneyCount(answers)).toEqual({ in: 1, of: 1 });
	});

	it('数える馬がいなければ null', () => {
		expect(inTheMoneyCount(answerCheck([row('×', 1, 5), row('◎', 2, null)]))).toBeNull();
	});
});
