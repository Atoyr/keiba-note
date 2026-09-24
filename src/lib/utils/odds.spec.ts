import { describe, expect, it } from 'vitest';
import { formatOddsAsOf, formatPlaceOdds, formatWinOdds, inOddsWindow, startsAt } from './odds';

describe('startsAt', () => {
	it('JST の発走時刻を UTC に直す', () => {
		expect(startsAt('2026-09-27', '15:40')?.toISOString()).toBe('2026-09-27T06:40:00.000Z');
		// JST の朝は UTC では前日
		expect(startsAt('2026-09-27', '08:05')?.toISOString()).toBe('2026-09-26T23:05:00.000Z');
	});

	it('形が違えば null', () => {
		expect(startsAt('2026-09-27', '15時40分')).toBeNull();
		expect(startsAt('2026/09/27', '15:40')).toBeNull();
		expect(startsAt('2026-09-27', '25:00')).toBeNull();
	});
});

describe('inOddsWindow', () => {
	// 15:40 発走 = 06:40Z
	const at = (iso: string) => inOddsWindow('2026-09-27', '15:40', new Date(iso));

	it('発走3時間前から発走までだけ取りに行く', () => {
		expect(at('2026-09-27T03:39:59Z')).toBe(false); // 12:39:59
		expect(at('2026-09-27T03:40:00Z')).toBe(true); // 12:40 ちょうど
		expect(at('2026-09-27T06:30:00Z')).toBe(true); // 15:30
		expect(at('2026-09-27T06:40:00Z')).toBe(true); // 発走ちょうど
		expect(at('2026-09-27T07:00:00Z')).toBe(false); // 発走後
	});

	it('別の日には取りに行かない', () => {
		expect(inOddsWindow('2026-09-28', '15:40', new Date('2026-09-27T06:30:00Z'))).toBe(false);
	});

	it('発走時刻が読めなければ取りに行かない', () => {
		expect(inOddsWindow('2026-09-27', '', new Date('2026-09-27T06:30:00Z'))).toBe(false);
	});
});

describe('書き方', () => {
	it('単勝は小数1桁、無ければ -', () => {
		expect(formatWinOdds(3.4)).toBe('3.4');
		expect(formatWinOdds(12)).toBe('12.0');
		expect(formatWinOdds(null)).toBe('-');
	});

	it('複勝は下限-上限、片方でも無ければ -', () => {
		expect(formatPlaceOdds(1.4, 1.8)).toBe('1.4-1.8');
		expect(formatPlaceOdds(null, null)).toBe('-');
		expect(formatPlaceOdds(1.4, null)).toBe('-');
	});

	it('時点は JST の日付と時刻', () => {
		expect(formatOddsAsOf('2026-09-27T05:30:00.000Z')).toBe('9/27 14:30時点');
		expect(formatOddsAsOf('2026-09-26T23:05:00.000Z')).toBe('9/27 08:05時点');
	});
});
