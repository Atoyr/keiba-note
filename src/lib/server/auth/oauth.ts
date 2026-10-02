import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeBase64urlNoPadding } from '@oslojs/encoding';
import { and, eq, isNull, lt, lte, or } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Db } from '$lib/server/db';
import { oauthClient, oauthCode, oauthGrant, oauthToken, user } from '$lib/server/db/schema';
import {
	knownScopes,
	redirectUriMatches,
	REQUIRED_SCOPES,
	sortScopes,
	type OAuthScope
} from '$lib/schemas/oauth';
import { hashSessionToken, type SessionUser } from './session';

/**
 * MCP の認可サーバー（OAuth 2.1）。クライアント・同意（grant）・認可コード・トークンを扱う。
 *
 * 守っていること:
 * - 生のコードとトークンは DB に入れない。セッションと同じ SHA-256 だけを持つ
 * - PKCE（S256）を必ず確かめる。公開クライアントなので、コードを横取りされてもこれで止まる
 * - トークンが連れてくるのは grant の持ち主だけ。**誰のデータを読むかはトークンで決まり、入力では選べない**
 * - リフレッシュトークンは1回きり。使い回しが来たら盗まれたとみなして連携（grant）ごと消す
 */

export const ACCESS_TOKEN_TTL_SEC = 60 * 60;
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;
export const CODE_TTL_SEC = 5 * 60;

const sec = (now: Date) => Math.floor(now.getTime() / 1000);

/** 種類が見て分かるように頭に印を付ける（漏れたときに探しやすい）。中身は 32 バイトの乱数。 */
function generateSecret(prefix: string, bytes = 32): string {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	return `${prefix}${encodeBase32LowerCaseNoPadding(buf)}`;
}

/** PKCE S256: BASE64URL(SHA256(code_verifier)) === code_challenge（RFC 7636 4.6）。 */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
	return encodeBase64urlNoPadding(sha256(new TextEncoder().encode(codeVerifier))) === codeChallenge;
}

export type OAuthClientView = { id: string; name: string; redirectUris: string[] };

/** 動的クライアント登録。誰でも呼べるので、登録だけでは何の権限も生まない。 */
export async function registerClient(
	db: Db,
	input: { name: string; redirectUris: string[] }
): Promise<OAuthClientView> {
	const client = {
		id: generateSecret('uma_client_', 16),
		name: input.name || '名前の無いアプリ',
		redirectUris: input.redirectUris
	};
	await db.insert(oauthClient).values(client);
	return client;
}

export async function getClient(db: Db, clientId: string): Promise<OAuthClientView | null> {
	const rows = await db
		.select({ id: oauthClient.id, name: oauthClient.name, redirectUris: oauthClient.redirectUris })
		.from(oauthClient)
		.where(eq(oauthClient.id, clientId))
		.limit(1);
	return rows.at(0) ?? null;
}

/**
 * 本人が同意画面で「許可する」を押したときに呼ぶ。連携（grant）を作るか、あれば許したスコープを
 * 置き換え、認可コードを1つ出す。
 *
 * **同意し直したら、その連携の前のトークンとコードを消す。** 残すと、メモのチェックを外して同意し直しても
 * 前のリフレッシュトークンが notes:read を持ったまま生き続け、一覧の表示（grant のスコープ）と食い違う。
 * ついでに、どの連携のものでも期限の切れたコードを消す（交換されなかったコードはほかに消す経路が無い）。
 *
 * 戻り先がクライアントの登録と合うかは呼ぶ側（ルート）が確かめてから呼ぶが、ここでも確かめる。
 */
export async function createAuthorizationCode(
	db: Db,
	input: {
		userId: string;
		clientId: string;
		scopes: readonly OAuthScope[];
		redirectUri: string;
		codeChallenge: string;
	},
	now = new Date()
): Promise<string | null> {
	const client = await getClient(db, input.clientId);
	if (!client || !redirectUriMatches(client.redirectUris, input.redirectUri)) return null;

	const scopes = sortScopes(input.scopes);
	const [grant] = await db
		.insert(oauthGrant)
		.values({ id: ulid(), userId: input.userId, clientId: input.clientId, scopes })
		.onConflictDoUpdate({
			target: [oauthGrant.userId, oauthGrant.clientId],
			set: { scopes }
		})
		.returning({ id: oauthGrant.id });

	const code = generateSecret('uma_ac_');
	await db.batch([
		db.delete(oauthToken).where(eq(oauthToken.grantId, grant.id)),
		db
			.delete(oauthCode)
			.where(or(eq(oauthCode.grantId, grant.id), lte(oauthCode.expiresAt, sec(now)))),
		db.insert(oauthCode).values({
			id: hashSessionToken(code),
			grantId: grant.id,
			scopes,
			redirectUri: input.redirectUri,
			codeChallenge: input.codeChallenge,
			expiresAt: sec(now) + CODE_TTL_SEC
		})
	]);
	return code;
}

export type TokenResponse = {
	access_token: string;
	token_type: 'Bearer';
	expires_in: number;
	refresh_token: string;
	scope: string;
};

/** トークンの口で返す誤り（RFC 6749 5.2）。 */
export type TokenError = {
	error: 'invalid_grant' | 'invalid_scope' | 'invalid_client';
	error_description: string;
	/** リフレッシュトークンの使い回しを見つけて連携を消したとき。監視に残す（応答には載せない）。 */
	reused?: true;
};

/**
 * アクセストークンとリフレッシュトークンを1組出す。ついでに、この連携の期限切れのトークンを掃除する
 * （呼ばれるのは1時間に1回程度なので、溜まらないようにここで消す）。
 */
async function issueTokens(
	db: Db,
	grantId: string,
	scopes: readonly OAuthScope[],
	now: Date
): Promise<TokenResponse> {
	const access = generateSecret('uma_at_');
	const refresh = generateSecret('uma_rt_');
	const t = sec(now);
	await db.batch([
		db.delete(oauthToken).where(and(eq(oauthToken.grantId, grantId), lt(oauthToken.expiresAt, t))),
		db.insert(oauthToken).values([
			{
				id: hashSessionToken(access),
				grantId,
				kind: 'access',
				scopes: [...scopes],
				expiresAt: t + ACCESS_TOKEN_TTL_SEC
			},
			{
				id: hashSessionToken(refresh),
				grantId,
				kind: 'refresh',
				scopes: [...scopes],
				expiresAt: t + REFRESH_TOKEN_TTL_SEC
			}
		]),
		db.update(oauthGrant).set({ lastUsedAt: t }).where(eq(oauthGrant.id, grantId))
	]);
	return {
		access_token: access,
		token_type: 'Bearer',
		expires_in: ACCESS_TOKEN_TTL_SEC,
		refresh_token: refresh,
		scope: scopes.join(' ')
	};
}

const invalidGrant = (error_description: string): TokenError => ({
	error: 'invalid_grant',
	error_description
});

/** 認可コード → トークン。コードは当たった時点で消す（成否によらず2回目は通らない）。 */
export async function exchangeAuthorizationCode(
	db: Db,
	input: { code: string; clientId: string; redirectUri: string; codeVerifier: string },
	now = new Date()
): Promise<TokenResponse | TokenError> {
	const id = hashSessionToken(input.code);
	const [row] = await db.delete(oauthCode).where(eq(oauthCode.id, id)).returning({
		grantId: oauthCode.grantId,
		scopes: oauthCode.scopes,
		redirectUri: oauthCode.redirectUri,
		codeChallenge: oauthCode.codeChallenge,
		expiresAt: oauthCode.expiresAt
	});
	if (!row) return invalidGrant('認可コードが無効です');

	const grant = await activeGrant(db, row.grantId);
	if (!grant || grant.clientId !== input.clientId) return invalidGrant('認可コードが無効です');
	if (row.expiresAt <= sec(now)) return invalidGrant('認可コードの期限が切れています');
	if (row.redirectUri !== input.redirectUri) return invalidGrant('redirect_uri が一致しません');
	if (!verifyPkce(input.codeVerifier, row.codeChallenge)) {
		return invalidGrant('code_verifier が一致しません');
	}
	return issueTokens(db, row.grantId, knownScopes(row.scopes), now);
}

/** 連携が生きていて、持ち主が退会していないか。 */
async function activeGrant(db: Db, grantId: string) {
	const rows = await db
		.select({ clientId: oauthGrant.clientId, deletedAt: user.deletedAt })
		.from(oauthGrant)
		.innerJoin(user, eq(oauthGrant.userId, user.id))
		.where(eq(oauthGrant.id, grantId))
		.limit(1);
	const row = rows.at(0);
	return row && row.deletedAt === null ? row : null;
}

/**
 * リフレッシュトークン → 新しい1組。古いリフレッシュトークンは使用済みにする。
 *
 * 使用済みの印は `used_at IS NULL` を条件にした UPDATE で付ける。同じトークンで2つの要求が
 * 同時に来ても、印を付けられるのは片方だけになる。**印を付けられなかった＝使い回し**なので、
 * 連携ごと消してどちらのトークンも使えなくする（盗んだ側が先に使っていた場合に備える）。
 *
 * `scope` で今より狭いスコープを求められたら、それで出す。広げることはできない。
 */
export async function refreshTokens(
	db: Db,
	input: { refreshToken: string; clientId: string; scope?: string },
	now = new Date()
): Promise<TokenResponse | TokenError> {
	const id = hashSessionToken(input.refreshToken);
	const rows = await db
		.select({
			grantId: oauthToken.grantId,
			scopes: oauthToken.scopes,
			expiresAt: oauthToken.expiresAt,
			usedAt: oauthToken.usedAt,
			clientId: oauthGrant.clientId
		})
		.from(oauthToken)
		.innerJoin(oauthGrant, eq(oauthToken.grantId, oauthGrant.id))
		.where(and(eq(oauthToken.id, id), eq(oauthToken.kind, 'refresh')))
		.limit(1);
	const row = rows.at(0);
	if (!row || row.clientId !== input.clientId)
		return invalidGrant('リフレッシュトークンが無効です');

	const claimed = await db
		.update(oauthToken)
		.set({ usedAt: sec(now) })
		.where(and(eq(oauthToken.id, id), isNull(oauthToken.usedAt)))
		.returning({ id: oauthToken.id });
	if (claimed.length === 0) {
		await db.delete(oauthGrant).where(eq(oauthGrant.id, row.grantId));
		return {
			...invalidGrant('使用済みのリフレッシュトークンです。連携を解除しました'),
			reused: true
		};
	}
	if (row.expiresAt <= sec(now)) return invalidGrant('リフレッシュトークンの期限が切れています');
	if (!(await activeGrant(db, row.grantId))) return invalidGrant('リフレッシュトークンが無効です');

	const current = knownScopes(row.scopes);
	let scopes = current;
	if (input.scope !== undefined) {
		const asked = input.scope.split(/\s+/).filter(Boolean);
		if (asked.some((s) => !(current as string[]).includes(s))) {
			return { error: 'invalid_scope', error_description: '許可されていないスコープです' };
		}
		// 外せないスコープは狭めても残す（空の scope で何も呼べないトークンを出さない）。
		scopes = sortScopes([...REQUIRED_SCOPES, ...asked]);
	}
	return issueTokens(db, row.grantId, scopes, now);
}

export type AccessTokenAuth = {
	user: SessionUser;
	scopes: OAuthScope[];
};

/**
 * `/mcp` の Bearer を確かめる。hooks.server.ts だけが呼ぶ。1クエリ。
 *
 * アクセストークンだけを受ける（リフレッシュトークンを Bearer に載せても通さない）。
 * 期限切れ・連携の解除・退会のどれでも null。
 */
export async function validateAccessToken(
	db: Db,
	token: string,
	now = new Date()
): Promise<AccessTokenAuth | null> {
	const rows = await db
		.select({
			scopes: oauthToken.scopes,
			expiresAt: oauthToken.expiresAt,
			id: user.id,
			email: user.email,
			displayName: user.displayName,
			avatarUrl: user.avatarUrl,
			role: user.role,
			deletedAt: user.deletedAt
		})
		.from(oauthToken)
		.innerJoin(oauthGrant, eq(oauthToken.grantId, oauthGrant.id))
		.innerJoin(user, eq(oauthGrant.userId, user.id))
		.where(and(eq(oauthToken.id, hashSessionToken(token)), eq(oauthToken.kind, 'access')))
		.limit(1);
	const row = rows.at(0);
	if (!row || row.expiresAt <= sec(now) || row.deletedAt !== null) return null;
	const { id, email, displayName, avatarUrl, role } = row;
	return { user: { id, email, displayName, avatarUrl, role }, scopes: knownScopes(row.scopes) };
}

export type GrantView = {
	id: string;
	clientName: string;
	/** 戻り先のホスト。名前は自己申告なので、どこへ渡したかをこちらで見せる。 */
	redirectHosts: string[];
	scopes: OAuthScope[];
	createdAt: number;
	lastUsedAt: number | null;
};

/** 本人の連携の一覧（`/settings/connections`）。 */
export async function listGrants(db: Db, userId: string): Promise<GrantView[]> {
	const rows = await db
		.select({
			id: oauthGrant.id,
			clientName: oauthClient.name,
			redirectUris: oauthClient.redirectUris,
			scopes: oauthGrant.scopes,
			createdAt: oauthGrant.createdAt,
			lastUsedAt: oauthGrant.lastUsedAt
		})
		.from(oauthGrant)
		.innerJoin(oauthClient, eq(oauthGrant.clientId, oauthClient.id))
		.where(eq(oauthGrant.userId, userId))
		.orderBy(oauthGrant.createdAt);
	return rows.map(({ redirectUris, scopes, ...r }) => ({
		...r,
		redirectHosts: [...new Set(redirectUris.map((u) => new URL(u).host))],
		scopes: knownScopes(scopes)
	}));
}

/** 連携を解除する。コードとトークンは CASCADE で消える。他人の連携には当たらない（false）。 */
export async function revokeGrant(db: Db, grantId: string, userId: string): Promise<boolean> {
	const result = await db
		.delete(oauthGrant)
		.where(and(eq(oauthGrant.id, grantId), eq(oauthGrant.userId, userId)))
		.returning({ id: oauthGrant.id });
	return result.length > 0;
}
