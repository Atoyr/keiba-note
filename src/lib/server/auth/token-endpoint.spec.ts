import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase64urlNoPadding } from '@oslojs/encoding';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import { createAuthorizationCode, registerClient, validateAccessToken } from './oauth';
import { handleTokenRequest } from './token-endpoint';

let db: Db;

const ORIGIN = 'https://uma-memo.test';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'a'.repeat(50);
const CHALLENGE = encodeBase64urlNoPadding(sha256(new TextEncoder().encode(VERIFIER)));

beforeEach(() => {
	let sqlite;
	({ db, sqlite } = createTestDb());
	sqlite.exec(
		`INSERT INTO user (id, google_sub, email, display_name) VALUES ('A', 'ga', 'a@example.invalid', 'A')`
	);
});

const post = (body: string, headers: Record<string, string> = {}) =>
	handleTokenRequest(
		new Request(`${ORIGIN}/oauth/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
			body
		}),
		db
	);

async function codeFor() {
	const client = await registerClient(db, { name: 'Claude', redirectUris: [REDIRECT] });
	const code = await createAuthorizationCode(db, {
		userId: 'A',
		clientId: client.id,
		scopes: ['races:read'],
		redirectUri: REDIRECT,
		codeChallenge: CHALLENGE
	});
	return { clientId: client.id, code: code! };
}

const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();

describe('handleTokenRequest', () => {
	it('認可コードをトークンに替え、どこにも残させない', async () => {
		const { clientId, code } = await codeFor();
		const res = await post(
			form({
				grant_type: 'authorization_code',
				code,
				redirect_uri: REDIRECT,
				client_id: clientId,
				code_verifier: VERIFIER,
				resource: `${ORIGIN}/mcp`
			})
		);
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('no-store');
		const json = (await res.json()) as { access_token: string; scope: string };
		expect(json.scope).toBe('races:read');
		expect((await validateAccessToken(db, json.access_token))?.scopes).toEqual(['races:read']);
	});

	it('client_id は Basic でも受ける', async () => {
		const { clientId, code } = await codeFor();
		const res = await post(
			form({
				grant_type: 'authorization_code',
				code,
				redirect_uri: REDIRECT,
				code_verifier: VERIFIER
			}),
			{ authorization: `Basic ${btoa(`${clientId}:`)}` }
		);
		expect(res.status).toBe(200);
	});

	it('別のサーバー向け（resource が違う）には出さない', async () => {
		const { clientId, code } = await codeFor();
		const res = await post(
			form({
				grant_type: 'authorization_code',
				code,
				redirect_uri: REDIRECT,
				client_id: clientId,
				code_verifier: VERIFIER,
				resource: 'https://other.example/mcp'
			})
		);
		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ error: 'invalid_target' });
	});

	it('知らない grant_type・JSON の本文・重複した項目・GET は受けない', async () => {
		expect(await (await post(form({ grant_type: 'password' }))).json()).toMatchObject({
			error: 'unsupported_grant_type'
		});
		const json = await post('{}', { 'content-type': 'application/json' });
		expect(json.status).toBe(400);
		const dup = await post('grant_type=refresh_token&grant_type=refresh_token');
		expect(await dup.json()).toMatchObject({ error: 'invalid_request' });
		const get = await handleTokenRequest(new Request(`${ORIGIN}/oauth/token`), db);
		expect(get.status).toBe(405);
	});

	it('大きすぎる本文は読み切らずに 413（Content-Length を偽っても）', async () => {
		const big = 'grant_type=refresh_token&x=' + 'a'.repeat(20_000);
		expect((await post(big)).status).toBe(413);
		const lying = await post(big, { 'content-length': '10' });
		expect(lying.status).toBe(413);
	});

	it('リフレッシュトークンの使い回しは、連携を消したうえで監視に知らせる（応答には載せない）', async () => {
		const { clientId, code } = await codeFor();
		const first = (await (
			await post(
				form({
					grant_type: 'authorization_code',
					code,
					redirect_uri: REDIRECT,
					client_id: clientId,
					code_verifier: VERIFIER
				})
			)
		).json()) as { refresh_token: string };
		const events: string[] = [];
		const send = (refreshToken: string) =>
			handleTokenRequest(
				new Request(`${ORIGIN}/oauth/token`, {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body: form({
						grant_type: 'refresh_token',
						refresh_token: refreshToken,
						client_id: clientId
					})
				}),
				db,
				(event) => events.push(event)
			);
		const next = (await (await send(first.refresh_token)).json()) as { refresh_token: string };
		// 次のトークンを使ったあとで古いトークンが来る＝送り直しではなく使い回し。
		expect((await send(next.refresh_token)).status).toBe(200);
		expect(events).toEqual([]);
		const reused = await send(first.refresh_token);
		expect(await reused.json()).toEqual({
			error: 'invalid_grant',
			error_description: expect.any(String)
		});
		expect(events).toEqual(['oauth.refresh.reused']);
	});

	it('DB が無ければ 503', async () => {
		const res = await handleTokenRequest(
			new Request(`${ORIGIN}/oauth/token`, { method: 'POST' }),
			null
		);
		expect(res.status).toBe(503);
	});
});
