import { describe, expect, it, vi } from 'vitest';

const decodeIdToken = vi.hoisted(() => vi.fn());
vi.mock('arctic', () => ({
	Google: class {},
	decodeIdToken,
	OAuth2RequestError: class extends Error {
		constructor(public code: string) {
			super(code);
		}
	},
	generateState: () => 'state-value',
	generateCodeVerifier: () => 'verifier-value'
}));

import { OAuth2RequestError } from 'arctic';
import { createLoginRequest, oauthErrorCode, parseIdToken } from './google';

describe('createLoginRequest', () => {
	it('state と code_verifier を返す', () => {
		expect(createLoginRequest()).toEqual({ state: 'state-value', codeVerifier: 'verifier-value' });
	});
});

describe('oauthErrorCode', () => {
	it('OAuth2RequestError なら code を返す', () => {
		// 実物のコンストラクタの形はモックで置き換えている（code だけ見ることを確かめる）
		const e = new (OAuth2RequestError as unknown as new (c: string) => Error)('invalid_grant');
		expect(oauthErrorCode(e)).toBe('invalid_grant');
	});

	it('それ以外は null', () => {
		expect(oauthErrorCode(new Error('x'))).toBeNull();
		expect(oauthErrorCode('invalid_grant')).toBeNull();
		expect(oauthErrorCode(null)).toBeNull();
	});
});

const base = {
	sub: '1234567890',
	email: 'someone@example.com',
	email_verified: true,
	name: 'Someone',
	picture: 'https://example.com/a.png'
};

describe('parseIdToken', () => {
	it('必要な claim を取り出す', () => {
		decodeIdToken.mockReturnValue(base);
		expect(parseIdToken('t')).toEqual({
			googleSub: '1234567890',
			email: 'someone@example.com',
			displayName: 'Someone',
			avatarUrl: 'https://example.com/a.png'
		});
	});

	it('email_verified が false のアカウントは弾く', () => {
		decodeIdToken.mockReturnValue({ ...base, email_verified: false });
		expect(parseIdToken('t')).toBeNull();
	});

	it('name が無ければ email を表示名にする', () => {
		decodeIdToken.mockReturnValue({ ...base, name: undefined, picture: undefined });
		expect(parseIdToken('t')).toMatchObject({
			displayName: 'someone@example.com',
			avatarUrl: null
		});
	});

	it('claim が壊れていれば null', () => {
		decodeIdToken.mockReturnValue({ sub: '', email: 'not-an-email' });
		expect(parseIdToken('t')).toBeNull();
	});
});
