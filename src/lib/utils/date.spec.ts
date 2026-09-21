import { describe, expect, it } from 'vitest';
import { addDays, currentWeek, formatDateShort, shiftWeek, todayJst } from './date';

/** JST は UTC+9。UTC の 15:00 が JST の翌日 0:00。 */
const utc = (iso: string) => new Date(iso);

describe('todayJst', () => {
	it('UTC の深夜でも JST の日付を返す', () => {
		expect(todayJst(utc('2026-09-26T15:00:00Z'))).toBe('2026-09-27');
		expect(todayJst(utc('2026-09-26T14:59:00Z'))).toBe('2026-09-26');
	});
});

describe('currentWeek', () => {
	it('月曜から日曜を返す', () => {
		// 2026-09-23 は水曜
		expect(currentWeek(utc('2026-09-23T03:00:00Z'))).toEqual({
			start: '2026-09-21',
			end: '2026-09-27'
		});
	});

	it('日曜はまだその週のうち（週末開催の最終日）', () => {
		expect(currentWeek(utc('2026-09-27T03:00:00Z'))).toEqual({
			start: '2026-09-21',
			end: '2026-09-27'
		});
	});

	it('月曜に次の週へ切り替わる', () => {
		expect(currentWeek(utc('2026-09-28T03:00:00Z'))).toEqual({
			start: '2026-09-28',
			end: '2026-10-04'
		});
	});

	it('JST で日付が変わる瞬間に切り替わる', () => {
		// 日曜 23:59 JST = まだ 9/21 週
		expect(currentWeek(utc('2026-09-27T14:59:00Z')).start).toBe('2026-09-21');
		// 月曜 00:00 JST = 次の週
		expect(currentWeek(utc('2026-09-27T15:00:00Z')).start).toBe('2026-09-28');
	});

	it('月をまたいでも壊れない', () => {
		expect(currentWeek(utc('2026-12-31T03:00:00Z'))).toEqual({
			start: '2026-12-28',
			end: '2027-01-03'
		});
	});
});

describe('shiftWeek', () => {
	it('前後の週へ動かせる', () => {
		const w = { start: '2026-09-21', end: '2026-09-27' };
		expect(shiftWeek(w, 1)).toEqual({ start: '2026-09-28', end: '2026-10-04' });
		expect(shiftWeek(w, -1)).toEqual({ start: '2026-09-14', end: '2026-09-20' });
	});
});

describe('addDays', () => {
	it('月をまたぐ', () => {
		expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
		expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
	});

	it('閏日を跨ぐ', () => {
		expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
	});
});

describe('formatDateShort', () => {
	it('曜日つきで短く出す', () => {
		expect(formatDateShort('2026-09-27')).toBe('9/27(日)');
		expect(formatDateShort('2026-09-26')).toBe('9/26(土)');
	});
});
