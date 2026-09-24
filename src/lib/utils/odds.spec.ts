import { describe, expect, it } from 'vitest';
import {
	formatOddsAsOf,
	formatPlaceOdds,
	formatWinOdds,
	inOddsWindow,
	oddsWindowOpens,
	startsAt
} from './odds';

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
	// 2026-09-27（日）15:40 発走 = 06:40Z
	const at = (grade: string | null, iso: string) =>
		inOddsWindow('2026-09-27', '15:40', grade, new Date(iso));

	it('重賞でないレースは、当日の発走3時間前から発走まで', () => {
		expect(at(null, '2026-09-27T03:39:59Z')).toBe(false); // 12:39:59
		expect(at(null, '2026-09-27T03:40:00Z')).toBe(true); // 12:40 ちょうど
		expect(at('OP', '2026-09-27T06:30:00Z')).toBe(true); // 15:30
		expect(at('L', '2026-09-26T10:00:00Z')).toBe(false); // 前日 19:00
	});

	it('G2・G3 は前日の 18:30 から', () => {
		expect(at('G2', '2026-09-26T09:29:59Z')).toBe(false); // 土 18:29:59
		expect(at('G2', '2026-09-26T09:30:00Z')).toBe(true); // 土 18:30
		expect(at('G3', '2026-09-26T13:30:00Z')).toBe(true); // 土 22:30
		expect(at('G3', '2026-09-27T00:00:00Z')).toBe(true); // 日 9:00
		expect(at('G2', '2026-09-25T10:00:00Z')).toBe(false); // 金 19:00
	});

	it('G1 は前々日の 18:30 から', () => {
		expect(at('G1', '2026-09-25T09:29:59Z')).toBe(false); // 金 18:29:59
		expect(at('G1', '2026-09-25T09:30:00Z')).toBe(true); // 金 18:30
		expect(at('G1', '2026-09-26T03:00:00Z')).toBe(true); // 土 12:00
	});

	it('どの格も発走後は取りに行かない', () => {
		for (const grade of [null, 'G1', 'G2']) {
			expect(at(grade, '2026-09-27T06:40:00Z')).toBe(true); // 発走ちょうど
			expect(at(grade, '2026-09-27T07:00:00Z')).toBe(false);
		}
	});

	it('発走時刻が読めなければ取りに行かない', () => {
		expect(inOddsWindow('2026-09-27', '', 'G1', new Date('2026-09-27T06:30:00Z'))).toBe(false);
	});
});

describe('oddsWindowOpens', () => {
	it('月初をまたいでも前日・前々日を数える', () => {
		// 2026-10-01（木）発走。G1 は 9/29 18:30 JST = 09:30Z
		expect(oddsWindowOpens('2026-10-01', '15:40', 'G1')?.toISOString()).toBe(
			'2026-09-29T09:30:00.000Z'
		);
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
