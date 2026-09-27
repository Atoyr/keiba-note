import { describe, expect, it } from 'vitest';
import {
	actualFlow,
	corner4Position,
	corner4Positions,
	hasCorners,
	last3fRanks
} from './run-stats';

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

/** 1頭の結果。馬番 n、着順 finish（中止は null）、通過順 passing。 */
const horse = (n: number, finish: number | null, passing: string | null) => ({
	entryId: `e${n}`,
	horseNumber: n,
	bracket: n,
	horseName: `馬${n}`,
	finishPosition: finish,
	passing
});

const turf = { course: '中山', surface: '芝', distance: 2000, direction: '右' };

describe('corner4Positions', () => {
	it('通過順が途中で切れた中止の馬（コーナーの数より短い）は4角の位置を持たない', () => {
		const at = corner4Positions(
			[horse(1, 1, '4-4-3-1'), horse(2, 2, '1-1-1-2'), horse(3, null, '4-4-13')],
			turf
		);
		expect(at.get('e1')).toBe(1);
		expect(at.get('e2')).toBe(2);
		expect(at.has('e3')).toBe(false);
	});

	it('4コーナーを回ってから止まった中止の馬は位置を持つ', () => {
		const at = corner4Positions([horse(1, 1, '1-1-1-1'), horse(2, null, '10-10-14-18')], turf);
		expect(at.get('e2')).toBe(18);
	});

	it('直線のレースでは誰も持たない', () => {
		const straight = { course: '新潟', surface: '芝', distance: 1000, direction: '直線' };
		expect(corner4Positions([horse(1, 1, '5')], straight).size).toBe(0);
	});
});

describe('actualFlow', () => {
	/** 盤面のコマを「馬番@x,y」で並べる（見比べやすいように）。 */
	const cells = (spots: { horseNumber: number | null; x: number; y: number }[] = []) =>
		spots.map((s) => `${s.horseNumber}@${s.x},${s.y}`);

	it('4角は通過順、ゴール前は着順の並び。同じ位置の馬は1つの列に馬番の順で並ぶ', () => {
		const flow = actualFlow(
			[
				horse(1, 1, '3-3-3-2'),
				horse(2, 2, '1-1-1-1'),
				horse(3, 3, '5-5-4-2'),
				horse(4, 4, '2-2-2-4'),
				horse(5, null, '4-4-5')
			],
			{ ...turf, fieldSize: 5 }
		);
		// ⑤は4角の手前で中止。4角にもゴール前にも出ない。
		expect(flow?.corner4?.columns).toEqual(['②', '①③', '④']);
		expect(flow?.finish?.columns).toEqual(['①', '②', '③', '④']);
	});

	it('盤面は順位のマスに置き、同じ順位の馬は上の段から積む。順位の抜けはマスを空ける', () => {
		const flow = actualFlow(
			[
				horse(1, 1, '3-3-3-2'),
				horse(2, 2, '1-1-1-1'),
				horse(3, 3, '5-5-4-2'),
				horse(4, 4, '2-2-2-4')
			],
			{ ...turf, fieldSize: 4 }
		);
		expect(cells(flow?.corner4?.spots)).toEqual(['2@0,0', '1@1,0', '3@1,1', '4@3,0']);
	});

	it('11頭以上は1マスに順位2つぶんをまとめ、隊列の1行は順位で区切ったまま', () => {
		const rows = Array.from({ length: 18 }, (_, i) => horse(i + 1, i + 1, `${i + 1}-${i + 1}`));
		const flow = actualFlow(rows, { ...turf, fieldSize: 18 });
		expect(cells(flow?.finish?.spots).slice(0, 4)).toEqual(['1@0,0', '2@0,1', '3@1,0', '4@1,1']);
		expect(cells(flow?.finish?.spots).at(-1)).toBe('18@8,1');
		expect(flow?.finish?.columns.slice(0, 3)).toEqual(['①', '②', '③']);
	});

	it('先頭の向きは予想の盤面と同じ（右回りは左、左回りは右）', () => {
		const rows = [horse(1, 1, '1-1'), horse(2, 2, '2-2')];
		expect(actualFlow(rows, { ...turf, fieldSize: 2 })?.leadsRight).toBe(false);
		const left = { course: '東京', surface: '芝', distance: 1600, direction: '左', fieldSize: 2 };
		expect(actualFlow(rows, left)?.leadsRight).toBe(true);
	});

	it('同着は同じ列にまとめる', () => {
		const flow = actualFlow([horse(1, 1, '1-1'), horse(2, 1, '2-2'), horse(3, 3, '3-3')], {
			...turf,
			fieldSize: 3
		});
		expect(flow?.finish?.columns).toEqual(['①②', '③']);
	});

	it('走った全頭がそろっていない（気にしている馬だけ入れた）レースでは出さない', () => {
		const rows = [horse(1, 1, '1-1'), horse(7, 7, '5-6')];
		expect(actualFlow(rows, { ...turf, fieldSize: 16 })).toBeNull();
		expect(actualFlow(rows, { ...turf, fieldSize: null })).toBeNull();
	});

	it('取消の馬（着順も通過順も無い）は走った馬に数えない', () => {
		const flow = actualFlow([horse(1, 1, '1-1'), horse(2, 2, '2-2'), horse(3, null, null)], {
			...turf,
			fieldSize: 2
		});
		expect(flow?.finish?.columns).toEqual(['①', '②']);
	});

	it('直線のレースはゴール前だけ', () => {
		const straight = { course: '新潟', surface: '芝', distance: 1000, direction: '直線' };
		const flow = actualFlow([horse(1, 1, '2'), horse(2, 2, '1')], { ...straight, fieldSize: 2 });
		expect(flow?.corner4).toBeNull();
		expect(flow?.finish?.columns).toEqual(['①', '②']);
	});

	it('結果がまだ入っていなければ出さない', () => {
		expect(actualFlow([horse(1, null, null)], { ...turf, fieldSize: 1 })).toBeNull();
	});
});
