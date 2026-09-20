import { describe, expect, it, vi } from 'vitest';

const decodeIdToken = vi.hoisted(() => vi.fn());
vi.mock('arctic', () => ({ Google: class {}, decodeIdToken }));

import { parseIdToken } from './google';

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
