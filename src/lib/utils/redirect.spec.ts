import { describe, expect, it } from 'vitest';
import { safeRedirect } from './redirect';

describe('safeRedirect', () => {
	it('相対パスはそのまま通す', () => {
		expect(safeRedirect('/races/01J8X')).toBe('/races/01J8X');
		expect(safeRedirect('/races?date=2026-09-20')).toBe('/races?date=2026-09-20');
	});

	it('外部オリジンを弾く', () => {
		// プロトコル相対 URL。ブラウザは //evil.com を外部ホストとして解釈する。
		expect(safeRedirect('//evil.com')).toBe('/');
		// バックスラッシュ版。一部のブラウザが / と同一視する。
		expect(safeRedirect('/\\evil.com')).toBe('/');
		expect(safeRedirect('https://evil.com')).toBe('/');
		expect(safeRedirect('http://evil.com')).toBe('/');
	});

	it('空・欠落は fallback', () => {
		expect(safeRedirect(null)).toBe('/');
		expect(safeRedirect(undefined)).toBe('/');
		expect(safeRedirect('')).toBe('/');
		expect(safeRedirect('races')).toBe('/');
	});

	it('fallback を指定できる', () => {
		expect(safeRedirect('//evil.com', '/login')).toBe('/login');
	});
});
