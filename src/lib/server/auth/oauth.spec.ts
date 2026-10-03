import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase64urlNoPadding } from '@oslojs/encoding';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import {
	ACCESS_TOKEN_TTL_SEC,
	getClient,
	ClientRegistrationLimitError,
	CLIENT_REGISTRATION_LIMIT,
	UNUSED_CLIENT_LIMIT,
	UNUSED_CLIENT_TTL_SEC,
	CODE_TTL_SEC,
	REFRESH_RETRY_GRACE_SEC,
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

/** 発行直前で1要求だけ止め、その間に別の要求を最後まで進める。 */
function pauseNextBatch() {
	const entered = Promise.withResolvers<void>();
	const released = Promise.withResolvers<void>();
	const batch = db.batch.bind(db);
	const spy = vi.spyOn(db, 'batch').mockImplementationOnce(async (queries) => {
		spy.mockRestore();
		entered.resolve();
		await released.promise;
		return batch(queries);
	});
	return { entered: entered.promise, resume: () => released.resolve() };
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

	it('次のトークンを使ったあとで古いものが来たら（盗まれた）、連携ごと消して新しいトークンも止める', async () => {
		const { client, tokens } = await tokensFor();
		const old = { refreshToken: tokens.refresh_token, clientId: client.id };
		const next = (await refreshTokens(db, old, NOW)) as TokenResponse;
		// 正規のクライアントは次のトークンを受け取って使った。
		const after = (await refreshTokens(
			db,
			{ refreshToken: next.refresh_token, clientId: client.id },
			later(60)
		)) as TokenResponse;
		expect(await refreshTokens(db, old, later(120))).toMatchObject({
			error: 'invalid_grant',
			reused: true
		});
		expect(await validateAccessToken(db, after.access_token, later(120))).toBe(null);
		expect(await listGrants(db, 'A')).toEqual([]);
	});

	describe('回線断での送り直し（競馬場など電波の弱い所）', () => {
		it('応答が届かずに同じトークンで送り直したら、猶予の内なら新しい1組を出し、届かなかった1組は止める', async () => {
			const { client, tokens } = await tokensFor();
			const input = { refreshToken: tokens.refresh_token, clientId: client.id };
			const lost = (await refreshTokens(db, input, NOW)) as TokenResponse; // 応答が届かなかった
			const retried = await refreshTokens(db, input, later(REFRESH_RETRY_GRACE_SEC));
			expect(retried).toHaveProperty('access_token');
			const fresh = retried as TokenResponse;

			const t = later(REFRESH_RETRY_GRACE_SEC);
			expect((await validateAccessToken(db, fresh.access_token, t))?.user.id).toBe('A');
			expect(await validateAccessToken(db, lost.access_token, t)).toBe(null);
			expect(await listGrants(db, 'A')).toHaveLength(1);

			// 送り直しのあとも、ふつうに更新を続けられる。
			expect(
				await refreshTokens(
					db,
					{ refreshToken: fresh.refresh_token, clientId: client.id },
					later(REFRESH_RETRY_GRACE_SEC + 60)
				)
			).toHaveProperty('access_token');
		});

		it('何度送り直しても、そのたびに前の1組を止めて新しい1組を出す', async () => {
			const { client, tokens } = await tokensFor();
			const input = { refreshToken: tokens.refresh_token, clientId: client.id };
			const issued: TokenResponse[] = [];
			for (let i = 0; i < 3; i++) {
				issued.push((await refreshTokens(db, input, later(i * 60))) as TokenResponse);
			}
			const t = later(180);
			expect(await validateAccessToken(db, issued[0].access_token, t)).toBe(null);
			expect(await validateAccessToken(db, issued[1].access_token, t)).toBe(null);
			expect(await validateAccessToken(db, issued[2].access_token, t)).not.toBe(null);
		});

		it('猶予を過ぎた送り直しは、盗まれたとみなして連携ごと消す', async () => {
			const { client, tokens } = await tokensFor();
			const input = { refreshToken: tokens.refresh_token, clientId: client.id };
			await refreshTokens(db, input, NOW);
			expect(await refreshTokens(db, input, later(REFRESH_RETRY_GRACE_SEC + 1))).toMatchObject({
				error: 'invalid_grant',
				reused: true
			});
			expect(await listGrants(db, 'A')).toEqual([]);
		});

		it.each([
			// 止めてから60秒以内でも待たずに検出する（以前は「処理中」とみなして見逃していた）。
			['止めた直後', 20],
			['猶予の内', 120],
			['猶予の外', REFRESH_RETRY_GRACE_SEC + 60]
		])(
			'届かなかったはずの1組があとで使われたら（持っていないはずのもの＝盗まれた）、%sでも連携ごと消す',
			async (_when, at) => {
				const { client, tokens } = await tokensFor();
				const input = { refreshToken: tokens.refresh_token, clientId: client.id };
				const lost = (await refreshTokens(db, input, NOW)) as TokenResponse;
				const fresh = (await refreshTokens(db, input, later(10))) as TokenResponse;
				expect(
					await refreshTokens(
						db,
						{ refreshToken: lost.refresh_token, clientId: client.id },
						later(at)
					)
				).toMatchObject({ error: 'invalid_grant', reused: true });
				expect(await validateAccessToken(db, fresh.access_token, later(at))).toBe(null);
			}
		);

		it('出したアクセストークンが使われたあとで古いリフレッシュトークンが来たら、猶予の内でも盗まれたとみなす', async () => {
			// 応答を受け取ったクライアントは、新しいアクセストークンをすぐ使う。使われていれば送り直しではない。
			const { client, tokens } = await tokensFor();
			const input = { refreshToken: tokens.refresh_token, clientId: client.id };
			const next = (await refreshTokens(db, input, NOW)) as TokenResponse;
			expect(await validateAccessToken(db, next.access_token, later(5))).not.toBe(null);
			expect(await refreshTokens(db, input, later(60))).toMatchObject({
				error: 'invalid_grant',
				reused: true
			});
			expect(await listGrants(db, 'A')).toEqual([]);
		});

		it('同じ送り直しが同時に2つ来ても、生きているアクセストークンは1つだけで、連携は残る', async () => {
			const { client, tokens } = await tokensFor();
			const input = { refreshToken: tokens.refresh_token, clientId: client.id };
			await refreshTokens(db, input, NOW); // 届かなかった応答
			const results = await Promise.all([
				refreshTokens(db, input, later(30)),
				refreshTokens(db, input, later(30))
			]);
			const issued = results.filter((r): r is TokenResponse => 'access_token' in r);
			expect(issued.length).toBeGreaterThanOrEqual(1);
			const alive = [];
			for (const r of issued) {
				if (await validateAccessToken(db, r.access_token, later(31))) alive.push(r);
			}
			expect(alive).toHaveLength(1);
			expect(await listGrants(db, 'A')).toHaveLength(1);
		});
	});

	it.each([false, true])(
		'保存失敗で使用済みの印も新規トークンも残らず、再試行できる（送り直し=%s）',
		async (retry) => {
			const { client, tokens } = await tokensFor();
			const input = { refreshToken: tokens.refresh_token, clientId: client.id };
			if (retry) await refreshTokens(db, input, NOW);
			const before = sqlite.prepare('SELECT * FROM oauth_token ORDER BY id').all();
			sqlite.exec(`CREATE TRIGGER fail_issue BEFORE UPDATE OF last_used_at ON oauth_grant
			BEGIN SELECT RAISE(ABORT, 'injected save failure'); END`);
			await expect(refreshTokens(db, input, later(10))).rejects.toThrow();
			expect(sqlite.prepare('SELECT * FROM oauth_token ORDER BY id').all()).toEqual(before);
			expect(await listGrants(db, 'A')).toHaveLength(1);
			sqlite.exec('DROP TRIGGER fail_issue');
			const fresh = await refreshTokens(db, input, later(120));
			expect(fresh).toHaveProperty('access_token');
			expect(
				(await validateAccessToken(db, (fresh as TokenResponse).access_token, later(120)))?.user.id
			).toBe('A');
		}
	);

	it('同じ未使用トークンの同時更新は片方が成功し、もう片方は再試行できる', async () => {
		const { client, tokens } = await tokensFor();
		const input = { refreshToken: tokens.refresh_token, clientId: client.id };
		const pause = pauseNextBatch();
		const first = refreshTokens(db, input, NOW);
		await pause.entered;
		const second = await refreshTokens(db, input, NOW);
		pause.resume();
		const delayed = await first;
		const success = [second, delayed].filter((r): r is TokenResponse => 'access_token' in r);
		expect(success).toHaveLength(1);
		expect([second, delayed].find((r) => 'error' in r)).toMatchObject({
			error: 'temporarily_unavailable'
		});
		expect(await listGrants(db, 'A')).toHaveLength(1);
		expect(await refreshTokens(db, input, later(2))).toHaveProperty('access_token');
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

	it('空の scope で狭めても、外せない races:read は残る', async () => {
		const { client, tokens } = await tokensFor();
		const r = (await refreshTokens(
			db,
			{ refreshToken: tokens.refresh_token, clientId: client.id, scope: '' },
			NOW
		)) as TokenResponse;
		expect(r.scope).toBe('races:read');
	});

	it('別のクライアントからは使えない', async () => {
		const { tokens } = await tokensFor();
		const other = await registerClient(db, { name: 'Other', redirectUris: [REDIRECT] });
		expect(
			await refreshTokens(db, { refreshToken: tokens.refresh_token, clientId: other.id }, NOW)
		).toMatchObject({ error: 'invalid_grant' });
	});
});

describe('同意し直し', () => {
	it.each(['code', 'refresh', 'retry'] as const)(
		'発行直前にメモを外して再同意すると、古い%s処理から権限を復活できない',
		async (flow) => {
			const { client, code } = await authorize();
			const exchange = (value: string) =>
				exchangeAuthorizationCode(
					db,
					{
						code: value,
						clientId: client.id,
						redirectUri: REDIRECT,
						codeVerifier: VERIFIER
					},
					NOW
				);
			const original = flow === 'code' ? null : ((await exchange(code)) as TokenResponse);
			const input = { refreshToken: original?.refresh_token ?? '', clientId: client.id };
			if (flow === 'retry') await refreshTokens(db, input, NOW);
			const pause = pauseNextBatch();
			const pending = flow === 'code' ? exchange(code) : refreshTokens(db, input, NOW);
			await pause.entered;
			const newCode = await createAuthorizationCode(
				db,
				{
					userId: 'A',
					clientId: client.id,
					scopes: ['races:read'],
					redirectUri: REDIRECT,
					codeChallenge: CHALLENGE
				},
				NOW
			);
			pause.resume();
			expect(await pending).toMatchObject({ error: 'invalid_grant' });
			expect(sqlite.prepare('SELECT count(*) AS n FROM oauth_token').get()).toEqual({ n: 0 });
			expect((await listGrants(db, 'A'))[0].scopes).toEqual(['races:read']);
			const fresh = (await exchange(newCode!)) as TokenResponse;
			expect((await validateAccessToken(db, fresh.access_token, NOW))?.scopes).toEqual([
				'races:read'
			]);
			expect(
				(
					(await refreshTokens(
						db,
						{ refreshToken: fresh.refresh_token, clientId: client.id },
						NOW
					)) as TokenResponse
				).scope
			).toBe('races:read');
		}
	);

	it('再同意のコード保存が失敗したら、前の連携・トークンを維持する', async () => {
		const { client, tokens } = await tokensFor();
		const [before] = await listGrants(db, 'A');
		sqlite.exec(`CREATE TRIGGER fail_consent BEFORE INSERT ON oauth_code
			BEGIN SELECT RAISE(ABORT, 'injected consent failure'); END`);
		await expect(
			createAuthorizationCode(
				db,
				{
					userId: 'A',
					clientId: client.id,
					scopes: ['races:read'],
					redirectUri: REDIRECT,
					codeChallenge: CHALLENGE
				},
				NOW
			)
		).rejects.toThrow();
		expect(await listGrants(db, 'A')).toEqual([before]);
		expect((await validateAccessToken(db, tokens.access_token, NOW))?.scopes).toEqual([
			'races:read',
			'notes:read'
		]);
	});
	it('メモを外して同意し直すと、前のトークン（notes:read 付き）は使えない', async () => {
		const { client, tokens } = await tokensFor('A', ['races:read', 'notes:read']);
		// 同じクライアントにもう一度、races:read だけで同意する。
		const code = await createAuthorizationCode(
			db,
			{
				userId: 'A',
				clientId: client.id,
				scopes: ['races:read'],
				redirectUri: REDIRECT,
				codeChallenge: CHALLENGE
			},
			NOW
		);
		expect(code).not.toBeNull();
		expect(await validateAccessToken(db, tokens.access_token, NOW)).toBe(null);
		expect(
			await refreshTokens(db, { refreshToken: tokens.refresh_token, clientId: client.id }, NOW)
		).toMatchObject({ error: 'invalid_grant' });
		// 一覧の表示と、効くスコープがそろう。
		expect((await listGrants(db, 'A'))[0].scopes).toEqual(['races:read']);
	});

	it('期限の切れた使われなかったコードは、次の同意で消える', async () => {
		await authorize('A');
		await authorize('B'); // 別の連携。NOW + 期限を過ぎたあとの同意で消える
		await createAuthorizationCode(
			db,
			{
				userId: 'A',
				clientId: (await registerClient(db, { name: 'C', redirectUris: [REDIRECT] })).id,
				scopes: ['races:read'],
				redirectUri: REDIRECT,
				codeChallenge: CHALLENGE
			},
			later(CODE_TTL_SEC + 1)
		);
		expect(sqlite.prepare('SELECT count(*) AS n FROM oauth_code').get()).toEqual({ n: 1 });
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

describe('登録の上限と期限', () => {
	const input = { name: 'Client', redirectUris: [REDIRECT] };
	it('同時登録でも毎分の上限を超えず、60秒後に再開できる', async () => {
		const results = await Promise.allSettled(
			Array.from({ length: CLIENT_REGISTRATION_LIMIT + 2 }, () => registerClient(db, input, NOW))
		);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(CLIENT_REGISTRATION_LIMIT);
		expect(
			results
				.filter((r) => r.status === 'rejected')
				.every((r) => r.status === 'rejected' && r.reason instanceof ClientRegistrationLimitError)
		).toBe(true);
		await expect(registerClient(db, input, later(59))).rejects.toThrow(
			ClientRegistrationLimitError
		);
		await expect(registerClient(db, input, later(60))).resolves.toHaveProperty('id');
	});
	it('未連携が1000件なら保存せず、期限切れを削除して受け直す', async () => {
		const insert = sqlite.prepare(
			'INSERT INTO oauth_client (id, name, redirect_uris, created_at) VALUES (?, ?, ?, ?)'
		);
		for (let i = 0; i < UNUSED_CLIENT_LIMIT; i++)
			insert.run(
				`pending-${i}`,
				'Client',
				JSON.stringify([REDIRECT]),
				Math.floor(NOW.getTime() / 1000)
			);
		await expect(registerClient(db, input, later(60))).rejects.toThrow(
			ClientRegistrationLimitError
		);
		expect(sqlite.prepare('SELECT count(*) AS n FROM oauth_client').get()).toMatchObject({
			n: UNUSED_CLIENT_LIMIT
		});
		await expect(registerClient(db, input, later(UNUSED_CLIENT_TTL_SEC))).resolves.toHaveProperty(
			'id'
		);
		expect(sqlite.prepare('SELECT count(*) AS n FROM oauth_client').get()).toMatchObject({
			n: UNUSED_CLIENT_LIMIT - 100 + 1
		});
	});
	it('連携を解除した登録も、24時間を過ぎてから同じアプリでつなぎ直せ、掃除で消えない', async () => {
		// 解除・使い回しの検出・凍結で grant が消えても、手元に client_id を持つアプリは同じ登録で認可に来る。
		const { client } = await tokensFor();
		const [grant] = await listGrants(db, 'A');
		expect(await revokeGrant(db, grant.id, 'A')).toBe(true);
		sqlite.prepare('UPDATE oauth_client SET created_at = ?').run(Math.floor(NOW.getTime() / 1000));
		const after = later(UNUSED_CLIENT_TTL_SEC + 60);
		await registerClient(db, input, after); // 掃除が走る
		expect(sqlite.prepare('SELECT id FROM oauth_client WHERE id = ?').get(client.id)).toBeDefined();
		expect(await getClient(db, client.id, after)).not.toBeNull();
		expect(
			await createAuthorizationCode(
				db,
				{
					userId: 'A',
					clientId: client.id,
					scopes: ['races:read'],
					redirectUri: REDIRECT,
					codeChallenge: CHALLENGE
				},
				after
			)
		).not.toBeNull();
	});
	it('一度でも連携した登録は、未連携の上限に数えない', async () => {
		const { client } = await tokensFor();
		const [grant] = await listGrants(db, 'A');
		await revokeGrant(db, grant.id, 'A');
		const row = sqlite
			.prepare('SELECT connected_at AS c FROM oauth_client WHERE id = ?')
			.get(client.id) as { c: number | null };
		expect(row.c).not.toBeNull();
	});
	it('期限切れの未連携は認可できず、連携済みの登録とトークンは掃除後も残る', async () => {
		const unused = await registerClient(db, input, NOW);
		const { client, tokens } = await tokensFor();
		sqlite.prepare('UPDATE oauth_client SET created_at = ?').run(Math.floor(NOW.getTime() / 1000));
		expect(await getClient(db, unused.id, later(UNUSED_CLIENT_TTL_SEC - 1))).not.toBeNull();
		expect(await getClient(db, unused.id, later(UNUSED_CLIENT_TTL_SEC))).toBeNull();
		expect(
			await createAuthorizationCode(
				db,
				{
					userId: 'A',
					clientId: unused.id,
					scopes: ['races:read'],
					redirectUri: REDIRECT,
					codeChallenge: CHALLENGE
				},
				later(UNUSED_CLIENT_TTL_SEC)
			)
		).toBeNull();
		await registerClient(db, input, later(UNUSED_CLIENT_TTL_SEC));
		expect(
			sqlite.prepare('SELECT id FROM oauth_client WHERE id = ?').get(unused.id)
		).toBeUndefined();
		expect(await getClient(db, client.id, later(UNUSED_CLIENT_TTL_SEC))).not.toBeNull();
		expect(
			await refreshTokens(
				db,
				{ clientId: client.id, refreshToken: tokens.refresh_token },
				later(UNUSED_CLIENT_TTL_SEC)
			)
		).toHaveProperty('access_token');
	});
});

describe('再送時のスコープ固定', () => {
	it('縮小後の省略再送を繰り返しても、メモ権限を復活させない', async () => {
		const { client, tokens } = await tokensFor();
		const input = { clientId: client.id, refreshToken: tokens.refresh_token };
		const narrowed = (await refreshTokens(
			db,
			{ ...input, scope: 'races:read' },
			NOW
		)) as TokenResponse;
		expect(narrowed.scope).toBe('races:read');
		const retry = (await refreshTokens(db, input, later(10))) as TokenResponse;
		expect(retry.scope).toBe('races:read');
		const retry2 = (await refreshTokens(
			db,
			{ ...input, scope: 'races:read' },
			later(20)
		)) as TokenResponse;
		expect(retry2.scope).toBe('races:read');
		expect(await validateAccessToken(db, narrowed.access_token, later(20))).toBeNull();
		expect(await validateAccessToken(db, retry.access_token, later(20))).toBeNull();
		expect(await validateAccessToken(db, retry2.access_token, later(20))).toMatchObject({
			scopes: ['races:read']
		});
		expect(
			await refreshTokens(
				db,
				{ clientId: client.id, refreshToken: retry2.refresh_token },
				later(30)
			)
		).toMatchObject({ scope: 'races:read' });
	});
	it.each(['races:read', 'races:read notes:read'])(
		'異なるスコープの再送を断り、確定済みトークンを保持する: %s',
		async (firstScope) => {
			const { client, tokens } = await tokensFor();
			const input = { clientId: client.id, refreshToken: tokens.refresh_token };
			const issued = (await refreshTokens(
				db,
				{ ...input, scope: firstScope },
				NOW
			)) as TokenResponse;
			const before = sqlite.prepare('SELECT * FROM oauth_token ORDER BY id').all();
			expect(
				await refreshTokens(
					db,
					{ ...input, scope: firstScope === 'races:read' ? 'races:read notes:read' : 'races:read' },
					later(10)
				)
			).toMatchObject({ error: 'invalid_scope' });
			expect(sqlite.prepare('SELECT * FROM oauth_token ORDER BY id').all()).toEqual(before);
			expect(await validateAccessToken(db, issued.access_token, later(10))).not.toBeNull();
		}
	);
});
