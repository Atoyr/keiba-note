import { describe, expect, it } from 'vitest';
import { applySecurityHeaders } from './security-headers';

const HTTPS = new URL('https://uma-memo.com/races');
const HTTP = new URL('http://localhost:4173/races');

describe('applySecurityHeaders', () => {
	it('無い項目を付ける', () => {
		const h = new Headers();
		applySecurityHeaders(h, HTTPS);
		expect(h.get('x-content-type-options')).toBe('nosniff');
		expect(h.get('x-frame-options')).toBe('DENY');
		expect(h.get('content-security-policy')).toBe("frame-ancestors 'none'");
		expect(h.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
		expect(h.get('permissions-policy')).toBe('camera=(), microphone=(), geolocation=()');
		expect(h.get('strict-transport-security')).toBe('max-age=31536000');
	});

	it('既にある項目は上書きしない', () => {
		const h = new Headers({
			'Referrer-Policy': 'no-referrer',
			'Content-Security-Policy': "frame-ancestors 'self'",
			'X-Frame-Options': 'SAMEORIGIN'
		});
		applySecurityHeaders(h, HTTPS);
		expect(h.get('referrer-policy')).toBe('no-referrer');
		expect(h.get('content-security-policy')).toBe("frame-ancestors 'self'");
		expect(h.get('x-frame-options')).toBe('SAMEORIGIN');
	});

	it('http では HSTS を付けない', () => {
		const h = new Headers();
		applySecurityHeaders(h, HTTP);
		expect(h.has('strict-transport-security')).toBe(false);
		expect(h.get('x-content-type-options')).toBe('nosniff');
	});
});
