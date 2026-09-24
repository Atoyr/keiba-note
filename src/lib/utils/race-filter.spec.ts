import { describe, expect, it } from 'vitest';
import {
	ALL_RACES_QUERY,
	hasRaceFilter,
	parseRaceFilter,
	yearOptions,
	yearRange,
	EMPTY_RACE_FILTER
} from './race-filter';

const TODAY = '2026-09-25';
const parse = (qs: string) => parseRaceFilter(new URLSearchParams(qs), TODAY);

describe('parseRaceFilter', () => {
	it('何も指定が無ければ今年の重賞に絞る', () => {
		expect(parse('')).toEqual({ year: 2026, grades: ['G1', 'G2', 'G3'], q: '' });
	});

	// 年の境界は JST の今日で決める。元日に開いたら新しい年。
	it('既定の年は今日の年', () => {
		expect(parseRaceFilter(new URLSearchParams(), '2027-01-01').year).toBe(2027);
	});

	it('絞り込みと関係の無いクエリだけなら既定のまま', () => {
		expect(parse('utm_source=x').grades).toEqual(['G1', 'G2', 'G3']);
	});

	// フォームで「すべて」を選び、ランクを外して送ったとき（`year=&q=`）。
	// 既定に戻ってしまうと、全件を見る手段が無くなる。
	it.each(['year=&q=', ALL_RACES_QUERY.slice(1)])('%o なら絞らない', (qs) => {
		expect(parse(qs)).toEqual(EMPTY_RACE_FILTER);
	});

	it('どれか1つでも指定があれば、ほかは既定で補わない', () => {
		expect(parse('grade=L')).toEqual({ year: null, grades: ['L'], q: '' });
		expect(parse('q=記念')).toEqual({ year: null, grades: [], q: '記念' });
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

	it.each(['', '2026-09'])('年度が %o なら全期間にする', (year) => {
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

	it('どれか1つでも指定があれば true', () => {
		expect(hasRaceFilter({ ...EMPTY_RACE_FILTER, q: '記念' })).toBe(true);
	});
});

describe('yearOptions', () => {
	it('今年のレースがまだ無くても、今年を選択肢に入れる（降順）', () => {
		expect(yearOptions([2025, 2024], TODAY)).toEqual([2026, 2025, 2024]);
		expect(yearOptions([], TODAY)).toEqual([2026]);
	});

	it('今年がもうあれば、そのまま', () => {
		expect(yearOptions([2099, 2026, 2025], TODAY)).toEqual([2099, 2026, 2025]);
	});
});

describe('yearRange', () => {
	// 年の境界。12/31 を含み損ねると、その年の最終週の開催が消える。
	it('元日から大晦日までを含む', () => {
		expect(yearRange(2026)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
	});
});
