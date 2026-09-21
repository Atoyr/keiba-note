import { describe, expect, it } from 'vitest';
import { generateSessionToken, hashSessionToken } from './session';

describe('セッショントークン', () => {
	it('毎回異なるトークンを返す', () => {
		const tokens = new Set(Array.from({ length: 50 }, () => generateSessionToken()));
		expect(tokens.size).toBe(50);
	});

	it('base32 の英数字だけで構成される（URL / Cookie に安全）', () => {
		expect(generateSessionToken()).toMatch(/^[a-z2-7]+$/);
	});

	it('32バイト分の長さがある', () => {
		// base32 は 5bit/文字。32バイト = 256bit → 52文字（パディングなし）。
		expect(generateSessionToken()).toHaveLength(52);
	});

	it('ハッシュは決定的で、トークンとは別物', () => {
		const token = generateSessionToken();
		expect(hashSessionToken(token)).toBe(hashSessionToken(token));
		expect(hashSessionToken(token)).not.toBe(token);
	});

	it('ハッシュは SHA-256 の hex（64文字）', () => {
		expect(hashSessionToken('x')).toMatch(/^[0-9a-f]{64}$/);
	});

	it('既知のベクタと一致する', () => {
		// echo -n "abc" | sha256sum
		expect(hashSessionToken('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
	});
});
