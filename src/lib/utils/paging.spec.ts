import { describe, expect, it } from 'vitest';
import { appendPage, pageHref, parseOffset, toPage } from './paging';

describe('parseOffset', () => {
	it('数字だけを受け、それ以外は先頭に倒す', () => {
		const offset = (q: string) => parseOffset(new URLSearchParams(q));
		expect(offset('')).toBe(0);
		expect(offset('offset=200')).toBe(200);
		expect(offset('offset=')).toBe(0);
		expect(offset('offset=-100')).toBe(0);
		expect(offset('offset=1e3')).toBe(0);
		expect(offset('offset=12.5')).toBe(0);
		expect(offset('offset=9999999999')).toBe(0);
	});
});

describe('toPage', () => {
	it('1件余分に引けたら、その1件は捨てて次の先頭を返す', () => {
		expect(toPage([1, 2, 3], 100, 2)).toEqual({ items: [1, 2], next: 102 });
	});

	it('ちょうど limit 件なら次は無い', () => {
		expect(toPage([1, 2], 100, 2)).toEqual({ items: [1, 2], next: null });
		expect(toPage([], 0, 2)).toEqual({ items: [], next: null });
	});
});

describe('pageHref', () => {
	it('絞り込みのクエリを残して offset だけを替える', () => {
		const url = new URL('http://x/races?year=2026&grade=G1&grade=G2&q=記念&offset=100');
		const next = new URL(pageHref(url, 200), url);
		expect(next.pathname).toBe('/races');
		expect(next.searchParams.get('year')).toBe('2026');
		expect(next.searchParams.getAll('grade')).toEqual(['G1', 'G2']);
		expect(next.searchParams.get('q')).toBe('記念');
		expect(next.searchParams.getAll('offset')).toEqual(['200']);
	});

	it('空の year（全期間）も残す。落とすと既定の絞り込みに戻ってしまう', () => {
		expect(pageHref(new URL('http://x/races?year='), 100)).toBe('/races?year=&offset=100');
		expect(pageHref(new URL('http://x/races?year=&offset=100'), 0)).toBe('/races?year=');
	});

	it('先頭のページは offset を外す', () => {
		expect(pageHref(new URL('http://x/horses?offset=200'), 0)).toBe('/horses');
	});
});

describe('appendPage', () => {
	it('先に出ている行と同じ id は足さない', () => {
		const a = { id: 'a' };
		const b = { id: 'b' };
		const c = { id: 'c' };
		expect(appendPage([a, b], [{ id: 'b' }, c])).toEqual([a, b, c]);
	});
});
