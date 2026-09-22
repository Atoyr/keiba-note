import { describe, expect, it } from 'vitest';
import { hasRaceFilter, parseRaceFilter, yearRange, EMPTY_RACE_FILTER } from './race-filter';

const parse = (qs: string) => parseRaceFilter(new URLSearchParams(qs));

describe('parseRaceFilter', () => {
	it('何も指定が無ければ絞らない', () => {
		expect(parse('')).toEqual(EMPTY_RACE_FILTER);
	});

	it('年度・ランク・名前をまとめて読む', () => {
		expect(parse('year=2026&grade=G1&q=天皇賞')).toEqual({
			year: 2026,
			grades: ['G1'],
			q: '天皇賞'
		});
	});

	it('ランクは複数指定できる（OR 検索）', () => {
		expect(parse('grade=G3&grade=G1').grades).toEqual(['G1', 'G3']);
	});

	it('ランクの重複と未知の値は落とす', () => {
		expect(parse('grade=G1&grade=G1&grade=G4&grade=%27%20OR%201=1').grades).toEqual(['G1']);
	});

	it.each(['', '20xx', '26', '2026-09', ' 2026'])('年度が %o なら全期間にする', (year) => {
		expect(parse(`year=${encodeURIComponent(year)}`).year).toBeNull();
	});

	it('名前の前後の空白は落とす', () => {
		expect(parse('q=%20%20%E3%83%80%E3%83%BC%E3%83%93%E3%83%BC%20%20').q).toBe('ダービー');
	});

	it('空白だけの名前は絞り込みにしない', () => {
		expect(parse('q=%20%20').q).toBe('');
	});
});

describe('hasRaceFilter', () => {
	it('何も指定が無ければ false', () => {
		expect(hasRaceFilter(EMPTY_RACE_FILTER)).toBe(false);
	});

	it.each([
		['年度だけ', { ...EMPTY_RACE_FILTER, year: 2026 }],
		['ランクだけ', { ...EMPTY_RACE_FILTER, grades: ['G1' as const] }],
		['名前だけ', { ...EMPTY_RACE_FILTER, q: '記念' }]
	])('%s でも true', (_label, filter) => {
		expect(hasRaceFilter(filter)).toBe(true);
	});
});

describe('yearRange', () => {
	// 年の境界。12/31 を含み損ねると、その年の最終週の開催が消える。
	it('元日から大晦日までを含む', () => {
		expect(yearRange(2026)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
	});

	it('隣の年とは重ならない', () => {
		expect(yearRange(2025).to < yearRange(2026).from).toBe(true);
	});
});
