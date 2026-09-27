import { describe, expect, it } from 'vitest';
import { corner4Position, hasCorners, last3fRanks } from './run-stats';

describe('hasCorners', () => {
	it('新潟の芝1000m（直線）はコーナーが無い。回りが空でも距離で決まる', () => {
		expect(hasCorners({ course: '新潟', surface: '芝', distance: 1000, direction: '直線' })).toBe(
			false
		);
		expect(hasCorners({ course: '新潟', surface: '芝', distance: 1000, direction: null })).toBe(
			false
		);
	});

	it('周回コースのレースはコーナーを回る', () => {
		expect(hasCorners({ course: '新潟', surface: '芝', distance: 1600, direction: '左' })).toBe(
			true
		);
		expect(hasCorners({ course: '新潟', surface: 'ダート', distance: 1200, direction: '左' })).toBe(
			true
		);
		expect(hasCorners({ course: '中山', surface: '芝', distance: 2000, direction: '右' })).toBe(
			true
		);
		expect(hasCorners({ course: '門別', surface: 'ダート', distance: 1200, direction: null })).toBe(
			true
		);
	});
});

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
		const ranks = last3fRanks(
			[
				{ entryId: 'a', last3f: 34.5 },
				{ entryId: 'b', last3f: 33.9 },
				{ entryId: 'c', last3f: 34.1 }
			],
			3
		);
		expect(ranks.get('b')).toBe(1);
		expect(ranks.get('c')).toBe(2);
		expect(ranks.get('a')).toBe(3);
	});

	it('同じタイムは同じ順位にし、次はその頭数ぶん飛ばす', () => {
		const ranks = last3fRanks(
			[
				{ entryId: 'a', last3f: 33.9 },
				{ entryId: 'b', last3f: 33.9 },
				{ entryId: 'c', last3f: 34.1 }
			],
			3
		);
		expect(ranks.get('a')).toBe(1);
		expect(ranks.get('b')).toBe(1);
		expect(ranks.get('c')).toBe(3);
	});

	it('上りの入っていない馬（取消）は順位を持たず、頭数にも数えない', () => {
		const ranks = last3fRanks(
			[
				{ entryId: 'a', last3f: null },
				{ entryId: 'b', last3f: 34.0 }
			],
			1
		);
		expect(ranks.has('a')).toBe(false);
		expect(ranks.get('b')).toBe(1);
	});

	it('走った全頭の上りがそろっていなければ数えない（気にしている馬だけ入れたレース）', () => {
		const rows = [{ entryId: 'a', last3f: 35.2 }];
		expect(last3fRanks(rows, 16).size).toBe(0);
	});

	it('頭数が入っていなければ、そろっているか分からないので数えない', () => {
		const rows = [
			{ entryId: 'a', last3f: 34.0 },
			{ entryId: 'b', last3f: 34.5 }
		];
		expect(last3fRanks(rows, null).size).toBe(0);
	});
});
