import { describe, expect, it } from 'vitest';
import {
	distanceTraitTag,
	formatHorseWeight,
	horseAge,
	raceHorseTraitTags,
	sexAgeLabel
} from './horse';

describe('formatHorseWeight', () => {
	it('増えた分は + を付ける', () => {
		expect(formatHorseWeight(486, 4)).toBe('486(+4)');
	});

	it('減った分は - を付ける', () => {
		expect(formatHorseWeight(486, -6)).toBe('486(-6)');
	});

	it('増減が 0 なら ±0', () => {
		expect(formatHorseWeight(486, 0)).toBe('486(±0)');
	});

	it('増減が無ければ（初出走など）馬体重だけ', () => {
		expect(formatHorseWeight(486, null)).toBe('486');
	});

	it('馬体重が無ければ null（表示しない）', () => {
		expect(formatHorseWeight(null, null)).toBeNull();
		expect(formatHorseWeight(null, 4)).toBeNull();
	});
});

describe('horseAge', () => {
	it('レースの年 − 生年。月日は使わない', () => {
		expect(horseAge(2020, '2026-06-14')).toBe(6);
		expect(horseAge(2020, '2026-01-01')).toBe(6);
		expect(horseAge(2020, '2026-12-31')).toBe(6);
	});

	it('年をまたぐと1つ上がる', () => {
		expect(horseAge(2022, '2025-12-28')).toBe(3);
		expect(horseAge(2022, '2026-01-04')).toBe(4);
	});

	it('生年が無ければ null', () => {
		expect(horseAge(null, '2026-06-14')).toBeNull();
	});
});

describe('sexAgeLabel', () => {
	it('性と馬齢があれば出馬表と同じ性齢', () => {
		expect(sexAgeLabel('牡', 2022, '2026-10-11')).toBe('牡4');
		expect(sexAgeLabel('牝', 2021, '2026-10-11')).toBe('牝5');
		expect(sexAgeLabel('セ', 2019, '2026-10-11')).toBe('セ7');
	});

	it('性だけなら性だけ', () => {
		expect(sexAgeLabel('牡', null, '2026-10-11')).toBe('牡');
	});

	it('馬齢だけなら歳を付ける', () => {
		expect(sexAgeLabel(null, 2022, '2026-10-11')).toBe('4歳');
	});

	it('どちらも無ければ null', () => {
		expect(sexAgeLabel(null, null, '2026-10-11')).toBeNull();
	});

	it('レースの日付の年で数える（年をまたぐと1つ上がる）', () => {
		expect(sexAgeLabel('牡', 2022, '2025-12-28')).toBe('牡3');
		expect(sexAgeLabel('牡', 2022, '2026-01-04')).toBe('牡4');
	});
});

describe('distanceTraitTag', () => {
	it('境目は 1400 / 1401、1800 / 1801、2200 / 2201', () => {
		expect(distanceTraitTag(1000)).toBe('短距離巧者');
		expect(distanceTraitTag(1400)).toBe('短距離巧者');
		expect(distanceTraitTag(1401)).toBe('マイル巧者');
		expect(distanceTraitTag(1800)).toBe('マイル巧者');
		expect(distanceTraitTag(1801)).toBe('中距離巧者');
		expect(distanceTraitTag(2200)).toBe('中距離巧者');
		expect(distanceTraitTag(2201)).toBe('長距離巧者');
		expect(distanceTraitTag(3600)).toBe('長距離巧者');
	});

	it('距離が無ければ null', () => {
		expect(distanceTraitTag(null)).toBeNull();
	});
});

describe('raceHorseTraitTags', () => {
	const all = [
		'小倉巧者',
		'東京巧者',
		'京都巧者',
		'右回り巧者',
		'左回り巧者',
		'短距離巧者',
		'マイル巧者',
		'中距離巧者',
		'長距離巧者'
	] as const;

	it('場・回り・距離の区分が合う札だけを、札の並びで返す', () => {
		expect(raceHorseTraitTags(all, { course: '京都', direction: '右', distance: 2200 })).toEqual([
			'京都巧者',
			'右回り巧者',
			'中距離巧者'
		]);
		expect(raceHorseTraitTags(all, { course: '東京', direction: '左', distance: 1600 })).toEqual([
			'東京巧者',
			'左回り巧者',
			'マイル巧者'
		]);
	});

	it('持っていない札は、合っていても出さない', () => {
		expect(
			raceHorseTraitTags(['東京巧者', '中距離巧者'], {
				course: '京都',
				direction: '右',
				distance: 2200
			})
		).toEqual(['中距離巧者']);
	});

	it('直線と回りが不明のときは回りで合わせない。距離が無ければ距離で合わせない', () => {
		expect(raceHorseTraitTags(all, { course: '新潟', direction: '直線', distance: 1000 })).toEqual([
			'短距離巧者'
		]);
		expect(raceHorseTraitTags(all, { course: '京都', direction: null, distance: null })).toEqual([
			'京都巧者'
		]);
	});

	it('札が無ければ空', () => {
		expect(raceHorseTraitTags([], { course: '京都', direction: '右', distance: 2200 })).toEqual([]);
	});
});
