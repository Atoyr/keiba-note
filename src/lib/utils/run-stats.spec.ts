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
	/** 完走した馬（着順・通過順・上りあり）。 */
	const ran = (entryId: string, last3f: number) => ({
		entryId,
		last3f,
		finishPosition: 1,
		passing: '1-1-1-1'
	});

	it('上りの速い順に 1・2・3位', () => {
		const ranks = last3fRanks([ran('a', 34.5), ran('b', 33.9), ran('c', 34.1)], 3);
		expect(ranks.get('b')).toBe(1);
		expect(ranks.get('c')).toBe(2);
		expect(ranks.get('a')).toBe(3);
	});

	it('同じタイムは同じ順位にし、次はその頭数ぶん飛ばす', () => {
		const ranks = last3fRanks([ran('a', 33.9), ran('b', 33.9), ran('c', 34.1)], 3);
		expect(ranks.get('a')).toBe(1);
		expect(ranks.get('b')).toBe(1);
		expect(ranks.get('c')).toBe(3);
	});

	it('取消の馬（着順も通過順も無い）は順位を持たず、頭数にも数えない', () => {
		const cancelled = { entryId: 'a', last3f: null, finishPosition: null, passing: null };
		const ranks = last3fRanks([cancelled, ran('b', 34.0)], 1);
		expect(ranks.has('a')).toBe(false);
		expect(ranks.get('b')).toBe(1);
	});

	it('競走中止の馬（通過順はあるが着順も上りも無い）は数えから外し、ほかの馬の順位は出す', () => {
		const stopped = { entryId: 'x', last3f: null, finishPosition: null, passing: '9-9-10-15' };
		// 中止も走ったので頭数に入る（3頭立て）。
		const ranks = last3fRanks([ran('a', 34.5), stopped, ran('b', 33.9)], 3);
		expect(ranks.has('x')).toBe(false);
		expect(ranks.get('b')).toBe(1);
		expect(ranks.get('a')).toBe(2);
	});

	it('1コーナーより前の中止（通過順も無い）は取消と見分けられないので、そのレースは数えない', () => {
		const stoppedEarly = { entryId: 'x', last3f: null, finishPosition: null, passing: null };
		expect(last3fRanks([ran('a', 34.5), stoppedEarly, ran('b', 33.9)], 3).size).toBe(0);
	});

	it('走った全頭の上りがそろっていなければ数えない（気にしている馬だけ入れたレース）', () => {
		expect(last3fRanks([ran('a', 35.2)], 16).size).toBe(0);
	});

	it('頭数が入っていなければ、そろっているか分からないので数えない', () => {
		expect(last3fRanks([ran('a', 34.0), ran('b', 34.5)], null).size).toBe(0);
	});
});
