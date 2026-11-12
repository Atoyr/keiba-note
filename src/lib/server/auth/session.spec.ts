import { describe, expect, it } from 'vitest';
import { createTestDb } from '#lib/server/db/test-d1.ts';
import type { DatabaseSync } from 'node:sqlite';
import {
	createUser,
	generateSessionToken,
	hashSessionToken,
	resolveGoogleLogin,
	type CreateUserInput
} from './session';

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

describe('resolveGoogleLogin', () => {
	const input = (over: Partial<CreateUserInput> = {}): CreateUserInput => ({
		googleSub: 'g1',
		email: 'one@example.invalid',
		displayName: 'One',
		avatarUrl: null,
		role: 'user',
		...over
	});
	const count = (sqlite: DatabaseSync, table: string) =>
		(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

	it('新規なら行を作り、渡した role で作る', async () => {
		const { db, sqlite } = createTestDb();
		const out = await resolveGoogleLogin(db, input({ role: 'admin' }));
		expect(out.kind).toBe('active');
		expect(sqlite.prepare(`SELECT role FROM user WHERE google_sub = 'g1'`).get()).toEqual({
			role: 'admin'
		});
		// セッションは作らない（callback が作る）。
		expect(count(sqlite, 'session')).toBe(0);
	});

	it('既にいる人は作り直さず active で返す', async () => {
		const { db, sqlite } = createTestDb();
		const first = await resolveGoogleLogin(db, input());
		const second = await resolveGoogleLogin(db, input({ role: 'admin' }));
		expect(second).toMatchObject({
			kind: 'active',
			user: { id: (first as { user: { id: string } }).user.id, role: 'user' }
		});
		expect(count(sqlite, 'user')).toBe(1);
	});

	it('凍結済みなら suspended で、行もセッションも増えない', async () => {
		const { db, sqlite } = createTestDb();
		await resolveGoogleLogin(db, input());
		sqlite.exec(`UPDATE user SET deleted_at = 1 WHERE google_sub = 'g1'`);
		expect(await resolveGoogleLogin(db, input())).toEqual({ kind: 'suspended' });
		expect(count(sqlite, 'user')).toBe(1);
		expect(count(sqlite, 'session')).toBe(0);
	});

	it('作るときに google_sub の UNIQUE に当たったら（同時のコールバック）、引き直して active', async () => {
		const { db, sqlite } = createTestDb();
		// 引いた時点では無く、作る直前にもう片方が作った、という順を作る。
		const racing: typeof createUser = async (d, i) => {
			await createUser(d, i);
			return createUser(d, { ...i, email: 'other@example.invalid' });
		};
		const out = await resolveGoogleLogin(db, input(), racing);
		expect(out.kind).toBe('active');
		expect(count(sqlite, 'user')).toBe(1);
	});

	it('UNIQUE に当たった相手が凍結済みなら suspended', async () => {
		const { db, sqlite } = createTestDb();
		const racing: typeof createUser = async (d, i) => {
			await createUser(d, i);
			sqlite.exec(`UPDATE user SET deleted_at = 1 WHERE google_sub = 'g1'`);
			return createUser(d, { ...i, email: 'other@example.invalid' });
		};
		expect(await resolveGoogleLogin(db, input(), racing)).toEqual({ kind: 'suspended' });
	});

	it('別の Google アカウントが同じ email なら email_conflict で、行は増えない', async () => {
		const { db, sqlite } = createTestDb();
		await resolveGoogleLogin(db, input());
		const out = await resolveGoogleLogin(db, input({ googleSub: 'g2' }));
		expect(out).toEqual({ kind: 'email_conflict' });
		expect(count(sqlite, 'user')).toBe(1);
	});

	it('UNIQUE 以外の例外は投げる', async () => {
		const { db } = createTestDb();
		const broken: typeof createUser = async () => {
			throw new Error('boom');
		};
		await expect(resolveGoogleLogin(db, input(), broken)).rejects.toThrow('boom');
	});
});
