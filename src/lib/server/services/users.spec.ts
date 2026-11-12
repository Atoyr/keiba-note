import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from '#lib/server/db/index.ts';
import { createTestDb } from '#lib/server/db/test-d1.ts';
import { freezeUser, listUsersForAdmin } from './users';

let db: Db;
let sqlite: DatabaseSync;

const NOW = new Date('2026-10-04T10:00:00+09:00');
const SEC = Math.floor(NOW.getTime() / 1000);

beforeEach(() => {
	({ db, sqlite } = createTestDb());
});

describe('listUsersForAdmin', () => {
	beforeEach(() => {
		sqlite.exec(`INSERT INTO user (id, google_sub, email, display_name, created_at) VALUES
			('A', 'ga', 'a@example.invalid', 'A', 100),
			('B', 'gb', 'b@example.invalid', 'B', 300),
			('C', 'gc', 'c@example.invalid', 'C', 200);`);
	});

	it('作成の新しい順に、素性の列だけ返す', async () => {
		const rows = await listUsersForAdmin(db);
		expect(rows.map((r) => r.id)).toEqual(['B', 'C', 'A']);
		expect(Object.keys(rows[0]).sort()).toEqual(
			['createdAt', 'deletedAt', 'displayName', 'email', 'id', 'role'].sort()
		);
	});

	it('上限が効く', async () => {
		const rows = await listUsersForAdmin(db, 2);
		expect(rows.map((r) => r.id)).toEqual(['B', 'C']);
	});
});

describe('freezeUser', () => {
	const count = (table: string, where: string) =>
		(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number }).n;

	beforeEach(() => {
		sqlite.exec(`INSERT INTO user (id, google_sub, email, display_name) VALUES
			('T', 'gt', 't@example.invalid', 'T'), ('O', 'go', 'o@example.invalid', 'O');
			INSERT INTO session (id, user_id, expires_at) VALUES ('s-t', 'T', 9999999999), ('s-o', 'O', 9999999999);
			INSERT INTO oauth_client (id, name, redirect_uris) VALUES ('c', 'client', '[]');
			INSERT INTO oauth_grant (id, user_id, client_id, scopes) VALUES
				('g-t', 'T', 'c', 'notes:read'), ('g-o', 'O', 'c', 'notes:read');
			INSERT INTO oauth_code (id, grant_id, scopes, redirect_uri, code_challenge, expires_at) VALUES
				('code-t', 'g-t', 'notes:read', 'https://x.invalid/cb', 'x', 9999999999);
			INSERT INTO oauth_token (id, grant_id, kind, scopes, expires_at) VALUES
				('tok-t', 'g-t', 'access', 'notes:read', 9999999999), ('tok-o', 'g-o', 'access', 'notes:read', 9999999999);
			INSERT INTO horse (id, name) VALUES ('h', 'ウマ');
			INSERT INTO note (id, author_id, kind, horse_id, body, occurred_at, visibility) VALUES
				('n-t-unl', 'T', 'horse', 'h', 'x', '2026-01-01', 'unlisted'),
				('n-t-priv', 'T', 'horse', 'h', 'x', '2026-01-01', 'private'),
				('n-o-unl', 'O', 'horse', 'h', 'x', '2026-01-01', 'unlisted');`);
	});

	it('対象の凍結印・セッション・連携が消える', async () => {
		await freezeUser(db, 'T', NOW);
		const t = sqlite.prepare('SELECT deleted_at, updated_at FROM user WHERE id = ?').get('T') as {
			deleted_at: number;
			updated_at: number;
		};
		expect(t).toEqual({ deleted_at: SEC, updated_at: SEC });
		expect(count('session', "user_id = 'T'")).toBe(0);
		expect(count('oauth_grant', "user_id = 'T'")).toBe(0);
		// 子のコード・トークンも CASCADE で消える
		expect(count('oauth_code', "grant_id = 'g-t'")).toBe(0);
		expect(count('oauth_token', "grant_id = 'g-t'")).toBe(0);
	});

	it('対象の unlisted のメモだけ private になる', async () => {
		await freezeUser(db, 'T', NOW);
		const vis = (id: string) =>
			(sqlite.prepare('SELECT visibility FROM note WHERE id = ?').get(id) as { visibility: string })
				.visibility;
		expect(vis('n-t-unl')).toBe('private');
		expect(vis('n-t-priv')).toBe('private');
		expect(vis('n-o-unl')).toBe('unlisted');
	});

	it('他のユーザーの行には触れない', async () => {
		await freezeUser(db, 'T', NOW);
		const o = sqlite.prepare('SELECT deleted_at FROM user WHERE id = ?').get('O') as {
			deleted_at: number | null;
		};
		expect(o.deleted_at).toBeNull();
		expect(count('session', "user_id = 'O'")).toBe(1);
		expect(count('oauth_grant', "user_id = 'O'")).toBe(1);
		expect(count('oauth_token', "grant_id = 'g-o'")).toBe(1);
	});

	it('行が無い userId でも成功する', async () => {
		await expect(freezeUser(db, 'nobody', NOW)).resolves.toBeUndefined();
	});
});
