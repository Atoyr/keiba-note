import { describe, expect, it } from 'vitest';
import { firstLapLength, lapChart, lapDiffLabel, lapSummary } from './laps';

// 2026-09-20 中山11R オールカマー（芝2200m）のラップ。
const allComers = [12.8, 11.8, 13.0, 12.3, 12.5, 12.5, 12.4, 12.5, 12.3, 12.1, 12.7];

describe('firstLapLength', () => {
	it('200m で割り切れる距離は 200m、割り切れなければ端数', () => {
		expect(firstLapLength(11, 2200)).toBe(200);
		expect(firstLapLength(13, 2500)).toBe(100);
		expect(firstLapLength(6, null)).toBe(200);
	});
});

describe('lapSummary', () => {
	it('前半3Fは最初の3区間、後半3Fは最後の3区間の合計', () => {
		expect(lapSummary(allComers, 2200)).toEqual({
			front: 37.6,
			back: 37.1,
			diff: 0.5,
			frontIndex: [0, 2],
			backIndex: [8, 10]
		});
	});

	it('最初の区間が端数（100m）なら、それを飛ばした3区間を前半3Fにする', () => {
		const laps = [6.9, 11.2, 11.6, 12.4, 12.6, 12.3, 12.1, 12.4, 12.3, 12.0, 11.6, 11.4, 12.0];
		const s = lapSummary(laps, 2500);
		expect(s?.frontIndex).toEqual([1, 3]);
		expect(s?.front).toBe(35.2);
		expect(s?.back).toBe(35);
	});

	it('区間が3つに満たなければ出さない', () => {
		expect(lapSummary([12.0, 11.5], 400)).toBeNull();
	});
});

describe('lapDiffLabel', () => {
	it('どちらが何秒速いかを言う', () => {
		expect(lapDiffLabel(1.2)).toBe('後半が1.2秒速い');
		expect(lapDiffLabel(-0.8)).toBe('前半が0.8秒速い');
		expect(lapDiffLabel(0)).toBe('前後半が同じ');
	});
});

describe('lapChart', () => {
	it('速い区間ほど上（y が小さい）。目盛りはいちばん速い区間と遅い区間', () => {
		const c = lapChart(allComers, 2200);
		const fastest = c.points.find((p) => p.lap === 11.8)!;
		const slowest = c.points.find((p) => p.lap === 13.0)!;
		expect(fastest.y).toBeLessThan(slowest.y);
		expect(c.levels.map((l) => l.label)).toEqual(['11.8', '13.0']);
		// 上下に 0.2 秒ずつ余白があるので、端に張り付かない。
		expect(fastest.y).toBeGreaterThan(0);
		expect(slowest.y).toBeLessThan(100);
	});

	it('前半3F・後半3Fの範囲を区間の境目で塗る', () => {
		const c = lapChart(allComers, 2200);
		expect(c.front).toEqual({ x1: 0, x2: (3 / 11) * 100 });
		expect(c.back).toEqual({ x1: (8 / 11) * 100, x2: 100 });
	});

	it('最初の区間が端数（100m）のレースは、その区間を描かず目盛りにも数えない', () => {
		const laps = [6.9, 11.2, 11.6, 12.4, 12.6, 12.3, 12.1, 12.4, 12.3, 12.0, 11.6, 11.4, 12.0];
		const c = lapChart(laps, 2500);
		expect(c.points).toHaveLength(12);
		expect(c.points.map((p) => p.lap)).not.toContain(6.9);
		expect(c.levels.map((l) => l.label)).toEqual(['11.2', '12.6']);
		// 前半3F は端数を飛ばした3区間 = 描いた区間の先頭から3つ。
		expect(c.front).toEqual({ x1: 0, x2: (3 / 12) * 100 });
		expect(c.back).toEqual({ x1: (9 / 12) * 100, x2: 100 });
	});

	it('1200m 以下は前半3Fと後半3Fで横幅が埋まるので塗らない。1400m からは塗る', () => {
		expect(lapChart([12.0, 10.8, 11.2, 11.5, 11.4, 12.1], 1200).shade).toBe(false);
		expect(lapChart([12.0, 10.8, 11.2, 11.5, 11.4], 1000).shade).toBe(false);
		expect(lapChart([12.0, 10.8, 11.2, 11.5, 11.4, 11.6, 12.1], 1400).shade).toBe(true);
	});

	it('読み上げの説明に区間タイムと前後半を入れる', () => {
		expect(lapChart(allComers, 2200).summary).toContain(
			'前半3F 37.6、後半3F 37.1（後半が0.5秒速い）'
		);
	});
});
