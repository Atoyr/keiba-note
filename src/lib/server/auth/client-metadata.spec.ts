import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import { CLIENT_METADATA_MAX_BYTES, resolveClient, type MetadataFetch } from './client-metadata';
import {
	createAuthorizationCode,
	exchangeAuthorizationCode,
	listGrants,
	registerClient,
	UNUSED_CLIENT_LIMIT,
	UNUSED_CLIENT_TTL_SEC,
	validateAccessToken,
	type TokenResponse
} from './oauth';

let db: Db;
let sqlite: DatabaseSync;

const CLIENT_ID = 'https://claude.ai/oauth/mcp-client-metadata.json';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'c'.repeat(50);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');
const NOW = new Date('2026-10-03T00:00:00Z');
const later = (sec: number) => new Date(NOW.getTime() + sec * 1000);

const doc = (over: Record<string, unknown> = {}) => ({
	client_id: CLIENT_ID,
	client_name: 'Claude',
	redirect_uris: [REDIRECT],
	token_endpoint_auth_method: 'none',
	...over
});

/** 呼ばれた回数と渡された設定を記録する偽の fetch。 */
function fakeFetch(respond: (url: string) => Response) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fetcher: MetadataFetch = async (url, init) => {
		calls.push({ url, init });
		return respond(url);
	};
	return { fetcher, calls };
}

const json = (body: unknown, init: ResponseInit = {}) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
		...init
	});

beforeEach(() => {
	({ db, sqlite } = createTestDb());
	sqlite.exec(
		`INSERT INTO user (id, google_sub, email, display_name) VALUES ('A', 'ga', 'a@example.invalid', 'A')`
	);
});

describe('resolveClient（Client ID Metadata Document）', () => {
	it('文書を取り、client_id の URL をそのまま id にして保存する。リダイレクトは追わない', async () => {
		const { fetcher, calls } = fakeFetch(() => json(doc()));
		const client = await resolveClient(db, CLIENT_ID, { now: NOW, fetcher });
		expect(client).toEqual({
			id: CLIENT_ID,
			name: 'Claude',
			redirectUris: [REDIRECT],
			source: 'metadata'
		});
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe(CLIENT_ID);
		expect(calls[0].init.redirect).toBe('manual');
	});

	it('24時間は保存したものを使い、過ぎたら取り直す', async () => {
		const { fetcher, calls } = fakeFetch(() => json(doc()));
		await resolveClient(db, CLIENT_ID, { now: NOW, fetcher });
		await resolveClient(db, CLIENT_ID, { now: later(UNUSED_CLIENT_TTL_SEC - 1), fetcher });
		expect(calls).toHaveLength(1);
		await resolveClient(db, CLIENT_ID, { now: later(UNUSED_CLIENT_TTL_SEC), fetcher });
		expect(calls).toHaveLength(2);
	});

	it('取り直しに失敗したら、古い内容は使わない', async () => {
		let ok = true;
		const { fetcher } = fakeFetch(() => (ok ? json(doc()) : new Response('', { status: 500 })));
		await resolveClient(db, CLIENT_ID, { now: NOW, fetcher });
		ok = false;
		expect(
			await resolveClient(db, CLIENT_ID, { now: later(UNUSED_CLIENT_TTL_SEC), fetcher })
		).toBeNull();
	});

	it.each([
		[
			'文書の client_id が URL と違う（別のクライアントの文書を指させない）',
			() => json(doc({ client_id: 'https://evil.example/c.json' }))
		],
		[
			'リダイレクトを返した',
			() =>
				new Response(null, { status: 302, headers: { location: 'https://evil.example/c.json' } })
		],
		['200 以外', () => new Response('nope', { status: 404 })],
		[
			'JSON でない',
			() =>
				new Response(JSON.stringify(doc()), {
					status: 200,
					headers: { 'content-type': 'text/html' }
				})
		],
		[
			'壊れた JSON',
			() => new Response('{', { status: 200, headers: { 'content-type': 'application/json' } })
		],
		['大きすぎる本文', () => json({ ...doc(), padding: 'x'.repeat(CLIENT_METADATA_MAX_BYTES) })],
		[
			'戻り先が https でもループバックでもない',
			() => json(doc({ redirect_uris: ['http://evil.example/cb'] }))
		],
		['戻り先が無い', () => json(doc({ redirect_uris: [] }))],
		[
			'秘密鍵を使うクライアント',
			() => json(doc({ token_endpoint_auth_method: 'client_secret_basic' }))
		]
	])('%s なら使わず、何も保存しない', async (_why, respond) => {
		const { fetcher } = fakeFetch(respond);
		expect(await resolveClient(db, CLIENT_ID, { now: NOW, fetcher })).toBeNull();
		expect(sqlite.prepare('SELECT count(*) AS n FROM oauth_client').get()).toEqual({ n: 0 });
	});

	it('取りに行けなかった（タイムアウト・つながらない）なら使わない', async () => {
		const fetcher: MetadataFetch = async () => {
			throw new Error('timeout');
		};
		expect(await resolveClient(db, CLIENT_ID, { now: NOW, fetcher })).toBeNull();
	});

	it.each([
		['http（ループバックの許可なし）', 'http://localhost:8080/c.json'],
		['IP の直書き', 'https://10.0.0.1/c.json'],
		['パスが無い', 'https://claude.ai'],
		['クエリ付き', 'https://claude.ai/c.json?x=1']
	])('%s の client_id は文書として取りに行かない', async (_why, clientId) => {
		const { fetcher, calls } = fakeFetch(() => json(doc({ client_id: clientId })));
		expect(await resolveClient(db, clientId, { now: NOW, fetcher })).toBeNull();
		expect(calls).toHaveLength(0);
	});

	it('動的登録の client_id はこれまでどおり登録から引き、外へは行かない', async () => {
		const registered = await registerClient(db, { name: 'DCR', redirectUris: [REDIRECT] }, NOW);
		const { fetcher, calls } = fakeFetch(() => json(doc()));
		expect(await resolveClient(db, registered.id, { now: NOW, fetcher })).toMatchObject({
			id: registered.id,
			source: 'registered'
		});
		expect(calls).toHaveLength(0);
	});

	it('CIMD の行は、動的登録の未連携の上限に数えない', async () => {
		const insert = sqlite.prepare(
			"INSERT INTO oauth_client (id, name, redirect_uris, source, fetched_at, created_at) VALUES (?, 'c', ?, 'metadata', ?, ?)"
		);
		const t = Math.floor(NOW.getTime() / 1000);
		for (let i = 0; i < UNUSED_CLIENT_LIMIT; i++) {
			insert.run(`https://c${i}.example/c.json`, JSON.stringify([REDIRECT]), t, t);
		}
		await expect(
			registerClient(db, { name: 'DCR', redirectUris: [REDIRECT] }, later(60))
		).resolves.toHaveProperty('id');
	});
});

describe('CIMD のクライアントでの認可', () => {
	it('同意 → コード → トークンまで通り、トークンは許可した本人に紐づき、連携の一覧に提供元が出る', async () => {
		const { fetcher } = fakeFetch(() => json(doc()));
		const client = await resolveClient(db, CLIENT_ID, { now: NOW, fetcher });
		expect(client).not.toBeNull();
		const code = await createAuthorizationCode(
			db,
			{
				userId: 'A',
				clientId: CLIENT_ID,
				scopes: ['races:read'],
				redirectUri: REDIRECT,
				codeChallenge: CHALLENGE
			},
			NOW
		);
		const tokens = (await exchangeAuthorizationCode(
			db,
			{ code: code!, clientId: CLIENT_ID, redirectUri: REDIRECT, codeVerifier: VERIFIER },
			NOW
		)) as TokenResponse;
		expect((await validateAccessToken(db, tokens.access_token, NOW))?.user.id).toBe('A');
		const [grant] = await listGrants(db, 'A');
		expect(grant).toMatchObject({ clientName: 'Claude', provider: 'claude.ai' });
	});

	it('文書に無い戻り先にはコードを出さない', async () => {
		const { fetcher } = fakeFetch(() => json(doc()));
		await resolveClient(db, CLIENT_ID, { now: NOW, fetcher });
		expect(
			await createAuthorizationCode(
				db,
				{
					userId: 'A',
					clientId: CLIENT_ID,
					scopes: ['races:read'],
					redirectUri: 'https://evil.example/cb',
					codeChallenge: CHALLENGE
				},
				NOW
			)
		).toBeNull();
	});
});
