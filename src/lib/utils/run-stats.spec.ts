import { describe, expect, it } from 'vitest';
import { corner4Position, last3fRanks } from './run-stats';

describe('corner4Position', () => {
	it('通過順の最後の数字を4コーナーの位置にする', () => {
		expect(corner4Position('5-5-4-2')).toBe(2);
		expect(corner4Position('12-11')).toBe(11);
		expect(corner4Position('3')).toBe(3);
	});

	it('通過順が無い・読めないときは null', () => {
		expect(corner4Position(null)).toBeNull();
		expect(corner4Position('')).toBeNull();
		expect(corner4Position('5-5-')).toBeNull();
		expect(corner4Position('中止')).toBeNull();
		expect(corner4Position('0')).toBeNull();
	});
});

describe('last3fRanks', () => {
	it('上りの速い順に 1・2・3位', () => {
		const ranks = last3fRanks([
			{ entryId: 'a', last3f: 34.5 },
			{ entryId: 'b', last3f: 33.9 },
			{ entryId: 'c', last3f: 34.1 }
		]);
		expect(ranks.get('b')).toBe(1);
		expect(ranks.get('c')).toBe(2);
		expect(ranks.get('a')).toBe(3);
	});

	it('同じタイムは同じ順位にし、次はその頭数ぶん飛ばす', () => {
		const ranks = last3fRanks([
			{ entryId: 'a', last3f: 33.9 },
			{ entryId: 'b', last3f: 33.9 },
			{ entryId: 'c', last3f: 34.1 }
		]);
		expect(ranks.get('a')).toBe(1);
		expect(ranks.get('b')).toBe(1);
		expect(ranks.get('c')).toBe(3);
	});

	it('上りの入っていない馬は順位を持たず、ほかの馬の順位にも数えない', () => {
		const ranks = last3fRanks([
			{ entryId: 'a', last3f: null },
			{ entryId: 'b', last3f: 34.0 }
		]);
		expect(ranks.has('a')).toBe(false);
		expect(ranks.get('b')).toBe(1);
	});
});
