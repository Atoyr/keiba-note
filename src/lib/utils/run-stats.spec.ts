import { describe, expect, it } from 'vitest';
import {
	actualFlow,
	corner4Position,
	corner4Positions,
	hasCorners,
	last3fRanks,
	marginLengths
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

/** 1頭の結果。馬番 n、着順 finish（中止は null）、通過順 passing、着差 margin（既定は無し）。 */
const horse = (
	n: number,
	finish: number | null,
	passing: string | null,
	margin: string | null = null
) => ({
	entryId: `e${n}`,
	horseNumber: n,
	bracket: n,
	horseName: `馬${n}`,
	finishPosition: finish,
	passing,
	margin
});

const turf = { course: '中山', surface: '芝', distance: 2000, direction: '右' };

describe('marginLengths', () => {
	it.each([
		['ハナ', 0.1],
		['アタマ', 0.2],
		['クビ', 0.3],
		['同着', 0],
		['大', 10],
		['大差', 10],
		['2', 2],
		['10', 10],
		['1/2', 0.5],
		['3/4', 0.75],
		['1.1/4', 1.25],
		['2.1/2', 2.5],
		['1.3/4', 1.75],
		[' 3.1/2 ', 3.5]
	])('%s は %s 馬身', (margin, lengths) => {
		expect(marginLengths(margin)).toBe(lengths);
	});

	it('空・null・読めない表記は null', () => {
		expect(marginLengths(null)).toBeNull();
		expect(marginLengths('')).toBeNull();
		expect(marginLengths('  ')).toBeNull();
		expect(marginLengths('-')).toBeNull();
		expect(marginLengths('不明')).toBeNull();
		expect(marginLengths('1/0')).toBeNull();
		expect(marginLengths('1.5')).toBeNull();
	});
});

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

	it('4角の盤面は、同じ順位を1つの列に、違う順位は違う列に置く。順位の抜けはマスを空けない', () => {
		const flow = actualFlow(
			[
				horse(1, 1, '3-3-3-2'),
				horse(2, 2, '1-1-1-1'),
				horse(3, 3, '5-5-4-2'),
				horse(4, 4, '2-2-2-4')
			],
			{ ...turf, fieldSize: 4 }
		);
		expect(cells(flow?.corner4?.spots)).toEqual(['2@0,0', '1@1,0', '3@1,1', '4@2,0']);
		expect(flow?.corner4?.cell).toBeNull();
	});

	it('4角の順位が11列以上に分かれるときは、隣の列を2つずつまとめる。全頭ばらばらの18頭は1マス2頭', () => {
		const rows = Array.from({ length: 18 }, (_, i) => horse(i + 1, i + 1, `${i + 1}-${i + 1}`));
		const flow = actualFlow(rows, { ...turf, fieldSize: 18 });
		expect(cells(flow?.corner4?.spots).slice(0, 4)).toEqual(['1@0,0', '2@0,1', '3@1,0', '4@1,1']);
		expect(cells(flow?.corner4?.spots).at(-1)).toBe('18@8,1');
		expect(flow?.corner4?.columns.slice(0, 3)).toEqual(['①', '②', '③']);
		// 着差が無い（読めない）ゴール前も同じ置き方で、cell は null。
		expect(cells(flow?.finish?.spots).at(-1)).toBe('18@8,1');
		expect(flow?.finish?.cell).toBeNull();
	});

	it('4角は通過順に距離が無いので、着差がそろっていても順位で置く', () => {
		const flow = actualFlow(
			[horse(1, 1, '1-1', null), horse(2, 2, '2-2', 'ハナ'), horse(3, 3, '3-3', '5')],
			{ ...turf, fieldSize: 3 }
		);
		expect(cells(flow?.corner4?.spots)).toEqual(['1@0,0', '2@1,0', '3@2,0']);
		expect(flow?.corner4?.cell).toBeNull();
	});

	it('同じ順位の馬が5頭以上いたら、4段を超えた馬は後ろのマスへ送る（y は4段に収まる）', () => {
		const rows = Array.from({ length: 6 }, (_, i) => horse(i + 1, i + 1, '5-5-5-5'));
		const flow = actualFlow(rows, { ...turf, fieldSize: 6 });
		expect(cells(flow?.corner4?.spots)).toEqual([
			'1@0,0',
			'2@0,1',
			'3@0,2',
			'4@0,3',
			'5@1,0',
			'6@1,1'
		]);
		expect(flow?.corner4?.columns).toEqual(['①②③④⑤⑥']);
	});

	it('着順の全馬に着差が読めるときは、勝ち馬からの累積の着差でゴール前のマスに置く', () => {
		const flow = actualFlow(
			[
				horse(1, 1, '1-1', null),
				horse(2, 2, '2-2', 'ハナ'),
				horse(3, 3, '3-3', '2'),
				horse(4, 4, '4-4', 'クビ'),
				horse(5, 5, '5-5', '1')
			],
			{ ...turf, fieldSize: 5 }
		);
		// 累積 0・0.1・2.1・2.4・3.4 馬身。1マス 0.5 馬身（下限）で、x = 0・0・4・4・6。
		expect(cells(flow?.finish?.spots)).toEqual(['1@0,0', '2@0,1', '3@4,0', '4@4,1', '5@6,0']);
		expect(flow?.finish?.cell).toBe(0.5);
		// 隊列の1行は着差でなく順位で区切る。
		expect(flow?.finish?.columns).toEqual(['①', '②', '③', '④', '⑤']);
	});

	it('4角で同じ順位が5頭いると2列を取り、溢れた馬は次の順位の列に混ざらず、次の順位は1列後ろへずれる', () => {
		// 1番手 ① → 2番手 ② → 3番手 ③〜⑦（5頭） → 5番手 ⑧。盤面の列は 0 / 1 / 2・3 / 4。
		const rows = [
			horse(1, 1, '1-1'),
			horse(2, 2, '2-2'),
			...[3, 4, 5, 6, 7].map((n) => horse(n, n, `${n}-3`)),
			horse(8, 8, '8-5')
		];
		const flow = actualFlow(rows, { ...turf, fieldSize: 8 });
		expect(cells(flow?.corner4?.spots)).toEqual([
			'1@0,0',
			'2@1,0',
			'3@2,0',
			'4@2,1',
			'5@2,2',
			'6@2,3',
			'7@3,0',
			'8@4,0'
		]);
		// 隊列の1行は順位で区切るので、5頭は1つの列のまま。
		expect(flow?.corner4?.columns).toEqual(['①', '②', '③④⑤⑥⑦', '⑧']);
	});

	it('着差で置くとき、最後の馬が最後のマスに来る（1マスの馬身は広がる）', () => {
		const rows = Array.from({ length: 12 }, (_, i) =>
			horse(i + 1, i + 1, `${i + 1}-${i + 1}`, i === 0 ? null : '1')
		);
		const flow = actualFlow(rows, { ...turf, fieldSize: 12 });
		const spots = flow?.finish?.spots ?? [];
		expect(spots[0]).toMatchObject({ horseNumber: 1, x: 0 });
		expect(spots.at(-1)).toMatchObject({ horseNumber: 12, x: 9 });
		expect(flow?.finish?.cell).toBeCloseTo(11 / 9, 5);
		// 先頭から後ろへ、x は戻らない。
		expect(spots.map((s) => s.x)).toEqual([...spots.map((s) => s.x)].sort((a, b) => a - b));
	});

	it('着差で置くとき、同じマスが4段を超えたら後ろのマスへ、最後のマスでも溢れたら先着した馬を前のマスへ寄せる', () => {
		// 全馬ハナ差（累積 0.1 ずつ）。cell は下限 0.5 で、6頭とも x=0 に入る。
		const close = Array.from({ length: 6 }, (_, i) =>
			horse(i + 1, i + 1, `${i + 1}-${i + 1}`, i === 0 ? null : 'ハナ')
		);
		const flow = actualFlow(close, { ...turf, fieldSize: 6 });
		expect(cells(flow?.finish?.spots)).toEqual([
			'1@0,0',
			'2@0,1',
			'3@0,2',
			'4@0,3',
			'5@1,0',
			'6@1,1'
		]);
		// 最後のマスにも詰まる形: 2頭目が 9 馬身離れ、後ろの 9 頭がハナ差で続く。
		// 2〜9頭目は x=8 を望み、10頭目は x=9 を望む。
		const pile = Array.from({ length: 10 }, (_, i) =>
			horse(i + 1, i + 1, `${i + 1}-${i + 1}`, i === 0 ? null : i === 1 ? '9' : 'ハナ')
		);
		const spots = actualFlow(pile, { ...turf, fieldSize: 10 })?.finish?.spots ?? [];
		expect(spots.every((s) => s.y >= 0 && s.y < 4)).toBe(true);
		// どのマスにも4頭を超えて積まない（同じ座標に2頭いない）。
		const perCell = new Map<number, number[]>();
		for (const s of spots) perCell.set(s.x, [...(perCell.get(s.x) ?? []), s.horseNumber!]);
		expect(Math.max(...[...perCell.values()].map((v) => v.length))).toBeLessThanOrEqual(4);
		expect(new Set(spots.map((s) => `${s.x},${s.y}`)).size).toBe(spots.length);
		// 前後の順は崩れない: 着順の順に x は戻らない（着順の良い馬が悪い馬より後ろに描かれない）。
		const xs = spots.map((s) => s.x);
		expect(xs).toEqual([...xs].sort((a, b) => a - b));
		// 最後のマスには、最も着順の悪い4頭が入る。溢れて前のマスへ寄るのは先着した馬のほう。
		expect(perCell.get(9)).toEqual([7, 8, 9, 10]);
		expect(perCell.get(8)).toEqual([3, 4, 5, 6]);
		expect(perCell.get(7)).toEqual([2]);
	});

	it('4角で最後方の順位に5頭並んでも、前後が逆にならない（先着した馬が前のマスへ寄る）', () => {
		// 1〜9番手は1頭ずつ（x=0〜8）、最後方の順位に5頭（⑩〜⑭）が並ぶ。
		const rows = Array.from({ length: 14 }, (_, i) =>
			horse(i + 1, i + 1, `${i + 1}-${i < 9 ? i + 1 : 14}`)
		);
		const flow = actualFlow(rows, { ...turf, fieldSize: 14 });
		expect(cells(flow?.corner4?.spots).slice(7)).toEqual([
			'8@7,0',
			'9@8,0',
			'10@8,1',
			'11@9,0',
			'12@9,1',
			'13@9,2',
			'14@9,3'
		]);
		const xs = (flow?.corner4?.spots ?? []).map((s) => s.x);
		expect(xs).toEqual([...xs].sort((a, b) => a - b));
		// 隊列の1行は順位で区切るので、5頭は1つの列のまま。
		expect(flow?.corner4?.columns.at(-1)).toBe('⑩⑪⑫⑬⑭');
	});

	it('着差が1頭でも読めなければ、ゴール前も順位で置く（cell は null）', () => {
		const flow = actualFlow(
			[horse(1, 1, '1-1', null), horse(2, 2, '2-2', 'ハナ'), horse(3, 3, '3-3', null)],
			{ ...turf, fieldSize: 3 }
		);
		expect(cells(flow?.finish?.spots)).toEqual(['1@0,0', '2@1,0', '3@2,0']);
		expect(flow?.finish?.cell).toBeNull();
	});

	it('先頭（勝ち馬）の着差は見ない', () => {
		const flow = actualFlow([horse(1, 1, '1-1', '不明'), horse(2, 2, '2-2', '3')], {
			...turf,
			fieldSize: 2
		});
		expect(flow?.finish?.cell).not.toBeNull();
	});

	it('ハナ差・クビ差の馬は同じマスに寄り、離れた馬は離れたマスに置く', () => {
		const margins = [null, 'クビ', 'ハナ', '2', '1/2', 'クビ', '3', 'アタマ', '1', '大'];
		const rows = margins.map((m, i) => horse(i + 1, i + 1, `${i + 1}-${i + 1}`, m));
		const flow = actualFlow(rows, { ...turf, fieldSize: margins.length });
		const spots = flow?.finish?.spots ?? [];
		expect(spots[0].x).toBe(spots[1].x);
		expect(spots[1].x).toBe(spots[2].x);
		expect(spots[3].x).toBeGreaterThan(spots[2].x);
		expect(spots.at(-1)?.x).toBe(9);
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
