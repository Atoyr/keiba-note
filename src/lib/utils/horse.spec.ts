import { describe, expect, it } from 'vitest';
import { horseAge } from './horse';

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
