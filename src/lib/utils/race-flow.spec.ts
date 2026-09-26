import { describe, expect, it } from 'vitest';
import { emptyFlow, type RaceFlow } from '../schemas/race-flow';
import {
	flowColumns,
	flowDigest,
	flowLeadsRight,
	flowOrder,
	hasResolvedFlow,
	horseToken,
	resolveFlow,
	type ResolvedSpot
} from './race-flow';

const spot = (horseNumber: number | null, x: number, y: number, horseName = `馬${horseNumber}`) =>
	({ horseNumber, bracket: null, horseName, x, y }) satisfies ResolvedSpot;

describe('horseToken', () => {
	it('馬番は丸数字、馬番が無いうちは馬名の頭2文字', () => {
		expect(horseToken({ horseNumber: 5, horseName: 'ホースA' })).toBe('⑤');
		expect(horseToken({ horseNumber: 18, horseName: 'ホースA' })).toBe('⑱');
		expect(horseToken({ horseNumber: null, horseName: 'ドウデュース' })).toBe('ドウ');
	});
});

describe('flowOrder', () => {
	it('前から後ろへ、同じ列は内から外へ続けて書く', () => {
		expect(flowOrder([spot(11, 4, 0), spot(7, 1, 2), spot(5, 0, 0), spot(3, 1, 0)])).toBe('⑤-③⑦-⑪');
	});

	/** 頭2文字が区切りなしに並ぶと、どこで馬が切れるか読めない。 */
	it('馬番が無い馬がいる列は、列の中も「･」で区切る', () => {
		expect(
			flowColumns([spot(null, 0, 1, 'カゲロウ'), spot(null, 0, 0, 'アカツキ'), spot(3, 2, 0)])
		).toEqual(['アカ･カゲ', '③']);
		expect(flowOrder([spot(null, 0, 0, 'アカツキ'), spot(5, 0, 1)])).toBe('アカ･⑤');
	});

	it('何も置いていなければ空', () => {
		expect(flowOrder([])).toBe('');
	});
});

describe('flowLeadsRight', () => {
	/** スタンドから見た向き。左回りは直線を左から右へ走ってくる。 */
	it('左回りだけ先頭を右に描く', () => {
		expect(flowLeadsRight({ course: '中山', direction: '左', surface: '芝', distance: 2000 })).toBe(
			true
		);
		expect(flowLeadsRight({ course: '東京', direction: '右', surface: '芝', distance: 2000 })).toBe(
			false
		);
		expect(
			flowLeadsRight({ course: '新潟', direction: '直線', surface: '芝', distance: 1000 })
		).toBe(false);
	});

	/** 新潟は左回りだが、芝1000m は直線コース。回りが空でも距離で直線と決める（コース図と同じ）。 */
	it('回りが空の新潟の芝1000m は直線として先頭を左にする', () => {
		expect(flowLeadsRight({ course: '新潟', direction: null, surface: '芝', distance: 1000 })).toBe(
			false
		);
		expect(flowLeadsRight({ course: '新潟', direction: null, surface: '芝', distance: 1600 })).toBe(
			true
		);
	});

	/** コース図と同じく、回りが入っていなければ場の回りで決める（東京は左回り）。 */
	it('回りが空なら場の回りで決め、分からなければ先頭を左にする', () => {
		expect(flowLeadsRight({ course: '東京', direction: null, surface: '芝', distance: 2000 })).toBe(
			true
		);
		expect(flowLeadsRight({ course: '中山', direction: null, surface: '芝', distance: 2000 })).toBe(
			false
		);
		expect(
			flowLeadsRight({ course: '大井', direction: null, surface: 'ダート', distance: 1200 })
		).toBe(false);
	});
});

describe('resolveFlow', () => {
	const flow: RaceFlow = {
		...emptyFlow(),
		pace: 'スロー',
		start: {
			spots: [
				{ entryId: 'e1', x: 0, y: 0 },
				{ entryId: 'gone', x: 1, y: 0 }
			],
			memo: '逃げ一頭'
		}
	};

	/** 共有のコピーに入るので、出走馬や馬の id を写さない。 */
	it('馬番・枠・馬名だけを写し、引き当てられない馬は落とす', () => {
		const horses = new Map([
			['e1', { entryId: 'e1', horseId: 'h1', horseNumber: 3, bracket: 2, horseName: 'ホースA' }]
		]);
		const out = resolveFlow(flow, horses, {
			course: '中山',
			direction: '左',
			surface: '芝',
			distance: 2000
		});
		expect(out.start.spots).toEqual([
			{ horseNumber: 3, bracket: 2, horseName: 'ホースA', x: 0, y: 0 }
		]);
		expect(out.leadsRight).toBe(true);
		expect(JSON.stringify(out)).not.toMatch(/e1|h1|gone/);
	});

	it('隊列を置いた局面だけを1行にする', () => {
		const out = resolveFlow(
			flow,
			new Map([['e1', { horseNumber: 3, bracket: 2, horseName: 'ホースA' }]]),
			{ course: '中山', direction: '右', surface: '芝', distance: 2000 }
		);
		expect(flowDigest(out)).toEqual([{ phase: 'start', label: 'スタート', columns: ['③'] }]);
		expect(hasResolvedFlow(out)).toBe(true);
		expect(hasResolvedFlow(null)).toBe(false);
		expect(
			hasResolvedFlow(
				resolveFlow(emptyFlow(), new Map(), {
					course: '中山',
					direction: '右',
					surface: '芝',
					distance: 2000
				})
			)
		).toBe(false);
	});
});
