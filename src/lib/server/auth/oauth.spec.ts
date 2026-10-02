import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase64urlNoPadding } from '@oslojs/encoding';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import {
	ACCESS_TOKEN_TTL_SEC,
	CODE_TTL_SEC,
	createAuthorizationCode,
	exchangeAuthorizationCode,
	listGrants,
	refreshTokens,
	registerClient,
	revokeGrant,
	validateAccessToken,
	verifyPkce,
	type TokenResponse
} from './oauth';

let db: Db;
let sqlite: DatabaseSync;

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'v'.repeat(43) + '-verifier';
const CHALLENGE = encodeBase64urlNoPadding(sha256(new TextEncoder().encode(VERIFIER)));
const NOW = new Date('2026-10-03T00:00:00Z');
const later = (sec: number) => new Date(NOW.getTime() + sec * 1000);

beforeEach(() => {
	({ db, sqlite } = createTestDb());
	sqlite.exec(`INSERT INTO user (id, google_sub, email, display_name) VALUES
		('A', 'ga', 'a@example.invalid', 'A'), ('B', 'gb', 'b@example.invalid', 'B')`);
});

async function authorize(
	userId = 'A',
	scopes: ('races:read' | 'notes:read')[] = ['races:read', 'notes:read']
) {
	const client = await registerClient(db, { name: 'Claude', redirectUris: [REDIRECT] });
	const code = await createAuthorizationCode(
		db,
		{ userId, clientId: client.id, scopes, redirectUri: REDIRECT, codeChallenge: CHALLENGE },
		NOW
	);
	return { client, code: code! };
}

async function tokensFor(userId = 'A', scopes?: ('races:read' | 'notes:read')[]) {
	const { client, code } = await authorize(userId, scopes);
	const t = await exchangeAuthorizationCode(
		db,
		{ code, clientId: client.id, redirectUri: REDIRECT, codeVerifier: VERIFIER },
		NOW
	);
	return { client, tokens: t as TokenResponse };
}

describe('PKCE', () => {
	it('S256 は BASE64URL(SHA256(verifier))。クライアントが使う Node の crypto と同じ値になる', () => {
		const verifier = 'dBjftJeZ4CVP-mJ92K27fCKHBcThOmbNzjNoyD3_v4c';
		const challenge = createHash('sha256').update(verifier).digest('base64url');
		expect(verifyPkce(verifier, challenge)).toBe(true);
		expect(verifyPkce('wrong', challenge)).toBe(false);
	});
});

describe('認可コード', () => {
	it('正しい verifier・戻り先・クライアントでトークンになり、トークンは許可した本人とスコープを連れてくる', async () => {
		const { tokens } = await tokensFor('A', ['races:read']);
		expect(tokens).toMatchObject({ token_type: 'Bearer', scope: 'races:read' });
		expect(tokens.access_token).toMatch(/^uma_at_/);
		expect(tokens.refresh_token).toMatch(/^uma_rt_/);

		const auth = await validateAccessToken(db, tokens.access_token, NOW);
		expect(auth?.user.id).toBe('A');
		expect(auth?.scopes).toEqual(['races:read']);
	});

	it('生のコードとトークンは DB に無い（ハッシュだけ）', async () => {
		const { client, code } = await authorize();
		const codes = sqlite.prepare('SELECT id FROM oauth_code').all() as { id: string }[];
		expect(codes.map((c) => c.id)).not.toContain(code);
		const t = (await exchangeAuthorizationCode(
			db,
			{ code, clientId: client.id, redirectUri: REDIRECT, codeVerifier: VERIFIER },
			NOW
		)) as TokenResponse;
		const ids = (sqlite.prepare('SELECT id FROM oauth_token').all() as { id: string }[]).map(
			(r) => r.id
		);
		expect(ids).not.toContain(t.access_token);
		expect(ids).not.toContain(t.refresh_token);
	});

	it('verifier が違えば出さない', async () => {
		const { client, code } = await authorize();
		const r = await exchangeAuthorizationCode(
			db,
			{ code, clientId: client.id, redirectUri: REDIRECT, codeVerifier: 'x'.repeat(43) },
			NOW
		);
		expect(r).toMatchObject({ error: 'invalid_grant' });
	});

	it('2回目は通らない（失敗した1回目のあとも）', async () => {
		const { client, code } = await authorize();
		const input = { code, clientId: client.id, redirectUri: REDIRECT, codeVerifier: VERIFIER };
		expect(await exchangeAuthorizationCode(db, input, NOW)).toHaveProperty('access_token');
		expect(await exchangeAuthorizationCode(db, input, NOW)).toMatchObject({
			error: 'invalid_grant'
		});
	});

	it('別のクライアント・別の戻り先・期限切れでは出さない', async () => {
		const other = await registerClient(db, { name: 'Other', redirectUris: [REDIRECT] });
		for (const [patch, when] of [
			[{ clientId: other.id }, NOW],
			[{ redirectUri: 'https://claude.ai/other' }, NOW],
			[{}, later(CODE_TTL_SEC)]
		] as const) {
			const { client, code } = await authorize();
			const r = await exchangeAuthorizationCode(
				db,
				{ code, clientId: client.id, redirectUri: REDIRECT, codeVerifier: VERIFIER, ...patch },
				when
			);
			expect(r).toMatchObject({ error: 'invalid_grant' });
		}
	});

	it('登録に無い戻り先にはコードを出さない', async () => {
		const client = await registerClient(db, { name: 'Claude', redirectUris: [REDIRECT] });
		const code = await createAuthorizationCode(db, {
			userId: 'A',
			clientId: client.id,
			scopes: ['races:read'],
			redirectUri: 'https://evil.example/cb',
			codeChallenge: CHALLENGE
		});
		expect(code).toBeNull();
	});
});

describe('アクセストークン', () => {
	it('期限切れ・リフレッシュトークン・知らない値は通さない', async () => {
		const { tokens } = await tokensFor();
		expect(await validateAccessToken(db, tokens.access_token, later(ACCESS_TOKEN_TTL_SEC))).toBe(
			null
		);
		expect(await validateAccessToken(db, tokens.refresh_token, NOW)).toBe(null);
		expect(await validateAccessToken(db, 'uma_at_unknown', NOW)).toBe(null);
	});

	it('退会したユーザーのトークンは通さない', async () => {
		const { tokens } = await tokensFor();
		sqlite.exec(`UPDATE user SET deleted_at = 1 WHERE id = 'A'`);
		expect(await validateAccessToken(db, tokens.access_token, NOW)).toBe(null);
	});

	it('連携を解除すると通らない。他人は解除できない', async () => {
		const { tokens } = await tokensFor('A');
		const [grant] = await listGrants(db, 'A');
		expect(await revokeGrant(db, grant.id, 'B')).toBe(false);
		expect(await validateAccessToken(db, tokens.access_token, NOW)).not.toBe(null);
		expect(await revokeGrant(db, grant.id, 'A')).toBe(true);
		expect(await validateAccessToken(db, tokens.access_token, NOW)).toBe(null);
	});
});

describe('リフレッシュトークン', () => {
	it('使うと新しい1組になり、前のは使用済みになる', async () => {
		const { client, tokens } = await tokensFor();
		const next = (await refreshTokens(
			db,
			{ refreshToken: tokens.refresh_token, clientId: client.id },
			NOW
		)) as TokenResponse;
		expect(next.refresh_token).not.toBe(tokens.refresh_token);
		expect((await validateAccessToken(db, next.access_token, NOW))?.user.id).toBe('A');
	});

	it('使い回されたら連携ごと消し、新しいトークンも止める', async () => {
		const { client, tokens } = await tokensFor();
		const input = { refreshToken: tokens.refresh_token, clientId: client.id };
		const next = (await refreshTokens(db, input, NOW)) as TokenResponse;
		expect(await refreshTokens(db, input, NOW)).toMatchObject({ error: 'invalid_grant' });
		expect(await validateAccessToken(db, next.access_token, NOW)).toBe(null);
		expect(await listGrants(db, 'A')).toEqual([]);
	});

	it('狭めることはできるが、許されていないスコープへは広げられない', async () => {
		const { client, tokens } = await tokensFor('A', ['races:read']);
		const wider = await refreshTokens(
			db,
			{ refreshToken: tokens.refresh_token, clientId: client.id, scope: 'races:read notes:read' },
			NOW
		);
		expect(wider).toMatchObject({ error: 'invalid_scope' });

		const { client: c2, tokens: t2 } = await tokensFor('B');
		const narrower = (await refreshTokens(
			db,
			{ refreshToken: t2.refresh_token, clientId: c2.id, scope: 'races:read' },
			NOW
		)) as TokenResponse;
		expect(narrower.scope).toBe('races:read');
		expect((await validateAccessToken(db, narrower.access_token, NOW))?.scopes).toEqual([
			'races:read'
		]);
	});

	it('別のクライアントからは使えない', async () => {
		const { tokens } = await tokensFor();
		const other = await registerClient(db, { name: 'Other', redirectUris: [REDIRECT] });
		expect(
			await refreshTokens(db, { refreshToken: tokens.refresh_token, clientId: other.id }, NOW)
		).toMatchObject({ error: 'invalid_grant' });
	});
});

describe('listGrants', () => {
	it('本人の連携だけを、戻り先のホストとともに返す', async () => {
		await tokensFor('A', ['races:read']);
		await tokensFor('B');
		const grants = await listGrants(db, 'A');
		expect(grants).toHaveLength(1);
		expect(grants[0]).toMatchObject({
			clientName: 'Claude',
			redirectHosts: ['claude.ai'],
			scopes: ['races:read']
		});
	});
});
