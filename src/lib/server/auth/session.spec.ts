import { describe, expect, it } from 'vitest';
import { createTestDb } from '$lib/server/db/test-d1';
import { createUser, findUserByGoogleSub, generateSessionToken, hashSessionToken } from './session';

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

describe('findUserByGoogleSub', () => {
	it('凍結済みのユーザーも返す（返さないと再ログインが UNIQUE 違反の 500 になる）', async () => {
		const { db, sqlite } = createTestDb();
		const input = {
			googleSub: 'g-suspended',
			email: 'suspended@example.invalid',
			displayName: 'S',
			avatarUrl: null,
			role: 'user' as const
		};
		const created = await createUser(db, input);
		expect((await findUserByGoogleSub(db, 'g-suspended'))?.deletedAt).toBeNull();

		sqlite.exec(`UPDATE user SET deleted_at = 1 WHERE id = '${created.id}'`);
		const found = await findUserByGoogleSub(db, 'g-suspended');
		expect(found?.id).toBe(created.id);
		expect(found?.deletedAt).not.toBeNull();

		expect(await findUserByGoogleSub(db, 'nobody')).toBeNull();
	});
});
