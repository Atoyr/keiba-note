import { describe, expect, it } from 'vitest';
import { generateInviteCode, isInviteUsable } from './invite';
import type { Invite } from '$lib/server/db/schema';

const NOW = new Date('2026-09-20T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const makeInvite = (over: Partial<Invite> = {}): Invite => ({
	id: 'inv1',
	code: 'code',
	email: null,
	invitedBy: '01OWNER',
	expiresAt: Math.floor((NOW.getTime() + 7 * DAY) / 1000),
	usedAt: null,
	usedBy: null,
	createdAt: Math.floor(NOW.getTime() / 1000),
	...over
});

describe('generateInviteCode', () => {
	it('推測不能な長さがある（24バイト以上）', () => {
		// base32 は 5bit/文字。32バイト = 256bit → 52文字。
		expect(generateInviteCode().length).toBeGreaterThanOrEqual(39);
	});

	it('毎回異なる', () => {
		const codes = new Set(Array.from({ length: 50 }, () => generateInviteCode()));
		expect(codes.size).toBe(50);
	});

	it('URL に安全な文字だけ', () => {
		expect(generateInviteCode()).toMatch(/^[a-z2-7]+$/);
	});
});

describe('isInviteUsable', () => {
	it('未使用・期限内・宛先なしなら誰でも使える', () => {
		expect(isInviteUsable(makeInvite(), 'anyone@example.com', NOW)).toBe(true);
	});

	it('使用済みは使えない', () => {
		const used = makeInvite({ usedAt: Math.floor(NOW.getTime() / 1000), usedBy: '01X' });
		expect(isInviteUsable(used, 'anyone@example.com', NOW)).toBe(false);
	});

	it('期限切れは使えない', () => {
		const expired = makeInvite({ expiresAt: Math.floor((NOW.getTime() - DAY) / 1000) });
		expect(isInviteUsable(expired, 'anyone@example.com', NOW)).toBe(false);
	});

	it('期限ちょうどは使えない（境界）', () => {
		const justExpired = makeInvite({ expiresAt: Math.floor(NOW.getTime() / 1000) });
		expect(isInviteUsable(justExpired, 'anyone@example.com', NOW)).toBe(false);
	});

	it('宛先付きの招待は、その宛先でしか使えない', () => {
		const addressed = makeInvite({ email: 'friend@example.com' });
		expect(isInviteUsable(addressed, 'friend@example.com', NOW)).toBe(true);
		expect(isInviteUsable(addressed, 'stranger@example.com', NOW)).toBe(false);
	});

	it('宛先の照合は大文字小文字と前後の空白を無視する', () => {
		const addressed = makeInvite({ email: 'friend@example.com' });
		expect(isInviteUsable(addressed, '  Friend@Example.COM ', NOW)).toBe(true);
	});
});
