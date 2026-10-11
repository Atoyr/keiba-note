import { describe, expect, it } from 'vitest';
import { jockeyListQuery, jockeyParam, raceJockeyTags } from './jockey';

describe('騎手のリンク', () => {
	it('騎手名は URL の区切りになる文字もエンコードする', () => {
		expect(jockeyParam('M.デムーロ')).toBe('M.%E3%83%87%E3%83%A0%E3%83%BC%E3%83%AD');
		expect(jockeyParam('a?b#c/d')).toBe('a%3Fb%23c%2Fd');
	});

	it('一覧のクエリは空の条件を付けない', () => {
		expect(jockeyListQuery({ q: '', tag: null })).toBe('');
		expect(jockeyListQuery({ q: ' 武 ', tag: null })).toBe('?q=%E6%AD%A6');
		expect(jockeyListQuery({ q: '', tag: '中山巧者' })).toBe(
			'?tag=%E4%B8%AD%E5%B1%B1%E5%B7%A7%E8%80%85'
		);
	});
});

describe('raceJockeyTags', () => {
	it('レースの場の札だけ出す', () => {
		expect(raceJockeyTags(['東京巧者', '中山巧者'], { course: '東京', surface: null })).toEqual([
			'東京巧者'
		]);
		expect(raceJockeyTags(['中山巧者'], { course: '東京', surface: '芝' })).toEqual([]);
	});

	it('芝・ダートの札は馬場が合うときだけ。障害と null は出さない', () => {
		const tags = ['芝巧者', 'ダート巧者'] as const;
		expect(raceJockeyTags(tags, { course: '東京', surface: '芝' })).toEqual(['芝巧者']);
		expect(raceJockeyTags(tags, { course: '東京', surface: 'ダート' })).toEqual(['ダート巧者']);
		expect(raceJockeyTags(tags, { course: '東京', surface: '障害' })).toEqual([]);
		expect(raceJockeyTags(tags, { course: '東京', surface: null })).toEqual([]);
	});

	it('距離・乗り方・狙いどころの札は出さず、並びは JOCKEY_TAGS の順', () => {
		expect(
			raceJockeyTags(['穴で怖い', '短距離巧者', '芝巧者', '東京巧者'], {
				course: '東京',
				surface: '芝'
			})
		).toEqual(['東京巧者', '芝巧者']);
	});

	it('札が空なら空', () => {
		expect(raceJockeyTags([], { course: '東京', surface: '芝' })).toEqual([]);
	});
});
