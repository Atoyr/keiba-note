import { describe, expect, it } from 'vitest';
import { horseAge, sexAgeLabel } from './horse';

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
