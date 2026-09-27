import { describe, expect, it } from 'vitest';
import { jockeyListQuery, jockeyParam } from './jockey';

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
