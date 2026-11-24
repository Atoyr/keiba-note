import { describe, expect, it } from 'vitest';
import { isRecordTime, timeToTenths } from './course-records.ts';

const base = {
	date: '2025-11-30',
	course: '東京',
	surface: '芝',
	distance: 2400,
	finishTime: '2:20.3'
};

describe('timeToTenths', () => {
	it('分あり・0分・分なしを同じ単位にする', () => {
		expect(timeToTenths('1:58.4')).toBe(1184);
		expect(timeToTenths('0:53.5')).toBe(535);
		expect(timeToTenths('53.5')).toBe(535);
		expect(timeToTenths('abc')).toBeNull();
	});
});

describe('isRecordTime', () => {
	it('レコードの日付・場・馬場・距離・タイムが同じなら true', () => {
		expect(isRecordTime(base)).toBe(true);
	});
	it('1分未満は 0:53.5 形でも true', () => {
		const r = { date: '2026-08-02', course: '新潟', surface: '芝', distance: 1000 };
		expect(isRecordTime({ ...r, finishTime: '0:53.5' })).toBe(true);
		expect(isRecordTime({ ...r, finishTime: '53.5' })).toBe(true);
	});
	it('タイム・日付・馬場が違えば false', () => {
		expect(isRecordTime({ ...base, finishTime: '2:20.4' })).toBe(false);
		expect(isRecordTime({ ...base, date: '2025-11-29' })).toBe(false);
		expect(isRecordTime({ ...base, surface: 'ダート' })).toBe(false);
	});
	it('値が欠けていれば false', () => {
		expect(isRecordTime({ ...base, finishTime: null })).toBe(false);
		expect(isRecordTime({ ...base, surface: null })).toBe(false);
		expect(isRecordTime({ ...base, distance: null })).toBe(false);
	});
});
