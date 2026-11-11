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

	it('途中のタブ・改行・CR・バックスラッシュを弾く', () => {
		// URL の解析がタブ・改行を取り除くと //evil.com になる。
		expect(safeRedirect('/\t/evil.com')).toBe('/');
		expect(safeRedirect('/\n/evil.com')).toBe('/');
		expect(safeRedirect('/\r/evil.com')).toBe('/');
		expect(safeRedirect('/a\\b')).toBe('/');
		expect(safeRedirect('/a\u0000b')).toBe('/');
		expect(safeRedirect('/a\u007fb')).toBe('/');
	});

	it('符号化のまま来たタブは同一オリジンのパスなので通る', () => {
		const out = safeRedirect('/%09/evil.com');
		expect(out).toBe('/%09/evil.com');
		expect(new URL(out, 'https://uma-memo.com').origin).toBe('https://uma-memo.com');
	});

	it('畳み込んでプロトコル相対になるものを弾く', () => {
		expect(safeRedirect('/..//evil.com')).toBe('/');
		expect(safeRedirect('/a/..//evil.com')).toBe('/');
		expect(safeRedirect('/.//evil.com')).toBe('/');
		expect(safeRedirect('/%2e%2e//evil.com')).toBe('/');
	});

	it('日本語のパスは符号化して返し、符号化済みは二重に符号化しない', () => {
		expect(safeRedirect('/jockeys/武豊')).toBe('/jockeys/%E6%AD%A6%E8%B1%8A');
		expect(safeRedirect('/jockeys/%E6%AD%A6%E8%B1%8A')).toBe('/jockeys/%E6%AD%A6%E8%B1%8A');
	});

	it('クエリとハッシュを保つ', () => {
		expect(safeRedirect('/races?date=2026-09-20&x=1#top')).toBe('/races?date=2026-09-20&x=1#top');
	});

	it('空・欠落は fallback', () => {
		expect(safeRedirect(null)).toBe('/');
		expect(safeRedirect(undefined)).toBe('/');
		expect(safeRedirect('')).toBe('/');
		expect(safeRedirect('races')).toBe('/');
	});

	it('fallback を指定できる', () => {
		expect(safeRedirect('//evil.com', '/login')).toBe('/login');
		expect(safeRedirect('/\t/evil.com', '/login')).toBe('/login');
	});
});
