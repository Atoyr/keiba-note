import { describe, expect, it } from 'vitest';
import { generateSessionToken, hashSessionToken } from './session';

describe('セッショントークン', () => {
	it('32バイト分の長さがある', () => {
		// base32 は 5bit/文字。32バイト = 256bit → 52文字（パディングなし）。
		expect(generateSessionToken()).toHaveLength(52);
	});

	it('ハッシュは SHA-256 の既知ベクタと一致する', () => {
		// echo -n "abc" | sha256sum
		// ここが変わると既存のセッションと e2e/seed.sql の行がすべて引けなくなる。
		expect(hashSessionToken('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
	});
});
