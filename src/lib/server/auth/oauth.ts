import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeBase64urlNoPadding } from '@oslojs/encoding';
import {
	and,
	eq,
	exists,
	gt,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	ne,
	notExists,
	or,
	sql
} from 'drizzle-orm';
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
 * - リフレッシュトークンは1回きり。使い回しが来たら盗まれたとみなして連携（grant）ごと消す。
 *   ただし回線断で応答が届かなかった送り直しは受ける（`judgeRetry`。docs/architecture.md 3-10）
 */

export const ACCESS_TOKEN_TTL_SEC = 60 * 60;
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;
export const CODE_TTL_SEC = 5 * 60;
/**
 * リフレッシュの送り直しを受ける猶予。競馬場のように電波の弱い所では、要求は届いたのに応答が届かず、
 * クライアントが同じリフレッシュトークンで送り直すことがある。電波が戻るまでを見込んで30分。
 */
export const REFRESH_RETRY_GRACE_SEC = 30 * 60;

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

export const CLIENT_REGISTRATION_LIMIT = 100;
export const CLIENT_REGISTRATION_WINDOW_SEC = 60;
export const UNUSED_CLIENT_LIMIT = 1000;
export const UNUSED_CLIENT_TTL_SEC = 24 * 60 * 60;

export class ClientRegistrationLimitError extends Error {}

/**
 * 一度も連携していない登録。誰でも登録できるので、これだけを数の上限と24時間の期限の対象にする。
 * **今 grant があるかでは決めない。** 解除・使い回しの検出・凍結で grant が消えた登録も期限で消すと、
 * 同じアプリ（手元に client_id を持っている）からつなぎ直せなくなる。
 */
const neverConnected = isNull(oauthClient.connectedAt);

/** 動的クライアント登録。誰でも呼べるので、登録だけでは何の権限も生まない。 */
export async function registerClient(
	db: Db,
	input: { name: string; redirectUris: string[] },
	now = new Date()
): Promise<OAuthClientView> {
	const client = {
		id: generateSecret('uma_client_', 16),
		name: input.name || '名前の無いアプリ',
		redirectUris: input.redirectUris
	};
	const t = sec(now);
	// 削除も件数を区切る。一度でも連携した登録は消さない。INSERT 自体で上限を判定し、同時登録でも超えない。
	const expired = db
		.select({ id: oauthClient.id })
		.from(oauthClient)
		.where(and(lte(oauthClient.createdAt, t - UNUSED_CLIENT_TTL_SEC), neverConnected))
		.limit(100);
	const recent = db
		.select({ id: oauthClient.id })
		.from(oauthClient)
		.where(gt(oauthClient.createdAt, t - CLIENT_REGISTRATION_WINDOW_SEC))
		.limit(CLIENT_REGISTRATION_LIMIT);
	const pending = db
		.select({ id: oauthClient.id })
		.from(oauthClient)
		.where(neverConnected)
		.limit(UNUSED_CLIENT_LIMIT);
	const [, inserted] = await db.batch([
		db.delete(oauthClient).where(inArray(oauthClient.id, expired)),
		db
			.insert(oauthClient)
			.select(
				// 列は schema.ts の oauthClient の並び（id・name・redirect_uris・connected_at・created_at）。
				sql`SELECT ${client.id}, ${client.name}, ${JSON.stringify(client.redirectUris)}, NULL, ${t}
			WHERE (SELECT count(*) FROM (${recent})) < ${CLIENT_REGISTRATION_LIMIT}
			AND (SELECT count(*) FROM (${pending})) < ${UNUSED_CLIENT_LIMIT}`
			)
			.returning({ id: oauthClient.id })
	]);
	if (inserted.length === 0) throw new ClientRegistrationLimitError('クライアント登録の上限です');
	return client;
}

export async function getClient(
	db: Db,
	clientId: string,
	now = new Date()
): Promise<OAuthClientView | null> {
	const rows = await db
		.select({ id: oauthClient.id, name: oauthClient.name, redirectUris: oauthClient.redirectUris })
		.from(oauthClient)
		.where(
			and(
				eq(oauthClient.id, clientId),
				or(
					gt(oauthClient.createdAt, sec(now) - UNUSED_CLIENT_TTL_SEC),
					isNotNull(oauthClient.connectedAt)
				)
			)
		)
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
	const client = await getClient(db, input.clientId, now);
	if (!client || !redirectUriMatches(client.redirectUris, input.redirectUri)) return null;

	const scopes = sortScopes(input.scopes);
	// ID を同意の世代にする。同じスコープに戻した場合も、古い処理は新しい grant に発行できない。
	const grantId = ulid();
	const code = generateSecret('uma_ac_');
	await db.batch([
		db
			.delete(oauthGrant)
			.where(and(eq(oauthGrant.userId, input.userId), eq(oauthGrant.clientId, input.clientId))),
		db.delete(oauthCode).where(lte(oauthCode.expiresAt, sec(now))),
		db
			.insert(oauthGrant)
			.values({ id: grantId, userId: input.userId, clientId: input.clientId, scopes }),
		// 初めて連携した時刻。これがある登録は期限で消さない（解除のあとも同じアプリからつなぎ直せる）。
		db
			.update(oauthClient)
			.set({ connectedAt: sec(now) })
			.where(and(eq(oauthClient.id, input.clientId), isNull(oauthClient.connectedAt))),
		db.insert(oauthCode).values({
			id: hashSessionToken(code),
			grantId,
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
	error: 'invalid_grant' | 'invalid_scope' | 'invalid_client' | 'temporarily_unavailable';
	error_description: string;
	/** リフレッシュトークンの使い回しを見つけて連携を消したとき。監視に残す（応答には載せない）。 */
	reused?: true;
};

/**
 * 同意の世代と未使用状態を INSERT 時にも照合し、1組の保存・使用済みの印・掃除を1つの batch で確定する。
 * 別の要求が先に確定した場合は何も書かず null。途中で DB が失敗すれば全体がロールバックされる。
 */
async function issueTokens(
	db: Db,
	grantId: string,
	scopes: readonly OAuthScope[],
	now: Date,
	/** どのリフレッシュトークンから出したか（送り直しの判断に使う）。認可コードから出したときは null。 */
	parentId: string | null = null,
	/** 使用済みにするトークン。送り直しでは、届かなかった1組のリフレッシュトークンを指定する。 */
	refreshId: string | null = parentId
): Promise<TokenResponse | null> {
	const access = generateSecret('uma_at_');
	const refresh = generateSecret('uma_rt_');
	const accessId = hashSessionToken(access);
	const t = sec(now);
	const active = exists(
		db
			.select({ id: oauthGrant.id })
			.from(oauthGrant)
			.innerJoin(user, eq(oauthGrant.userId, user.id))
			.where(and(eq(oauthGrant.id, grantId), isNull(user.deletedAt)))
	);
	const unused = refreshId
		? exists(
				db
					.select({ id: oauthToken.id })
					.from(oauthToken)
					.where(
						and(
							eq(oauthToken.id, refreshId),
							eq(oauthToken.grantId, grantId),
							eq(oauthToken.kind, 'refresh'),
							isNull(oauthToken.usedAt),
							gt(oauthToken.expiresAt, t)
						)
					)
			)
		: sql`true`;
	const retryUnused =
		refreshId !== parentId
			? notExists(
					db
						.select({ id: oauthToken.id })
						.from(oauthToken)
						.where(
							and(
								eq(oauthToken.parentId, parentId!),
								eq(oauthToken.kind, 'access'),
								sql`${oauthToken.usedAt} IS NOT NULL`
							)
						)
				)
			: sql`true`;
	const saved = exists(
		db.select({ id: oauthToken.id }).from(oauthToken).where(eq(oauthToken.id, accessId))
	);
	const [inserted] = await db.batch([
		// 全列を表の順で選ぶ（insert/select）。2行とも同じ条件で入るので、片方だけ保存されることはない。
		db
			.insert(oauthToken)
			.select(
				sql`
			SELECT issued.id, ${grantId}, issued.kind, ${JSON.stringify(scopes)},
				issued.expires_at, NULL, ${parentId}, ${t}
			FROM (
				SELECT ${accessId} AS id, 'access' AS kind, ${t + ACCESS_TOKEN_TTL_SEC} AS expires_at
				UNION ALL SELECT ${hashSessionToken(refresh)}, 'refresh', ${t + REFRESH_TOKEN_TTL_SEC}
			) AS issued
			WHERE ${active} AND ${unused} AND ${retryUnused}
		`
			)
			.returning({ id: oauthToken.id }),
		...(refreshId
			? [
					db
						.update(oauthToken)
						.set({ usedAt: t })
						.where(and(eq(oauthToken.id, refreshId), saved))
				]
			: []),
		...(parentId
			? [
					db
						.delete(oauthToken)
						.where(
							and(
								eq(oauthToken.parentId, parentId),
								eq(oauthToken.kind, 'access'),
								ne(oauthToken.id, accessId),
								saved
							)
						)
				]
			: []),
		db
			.delete(oauthToken)
			.where(and(eq(oauthToken.grantId, grantId), lt(oauthToken.expiresAt, t), saved)),
		db
			.update(oauthGrant)
			.set({ lastUsedAt: t })
			.where(and(eq(oauthGrant.id, grantId), saved))
	]);
	if (inserted.length === 0) return null;
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
	return (
		(await issueTokens(db, row.grantId, knownScopes(row.scopes), now)) ??
		invalidGrant('同意が更新または解除されています')
	);
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
 * 応答が届かずに同じトークンで送り直されたときは、猶予の内なら受ける（`acceptRetry`）。
 *
 * 未使用状態の照合・新しい1組の保存・使用済みの印を同じ batch で行う。同じ状態を読んだ要求のうち
 * 1つだけ確定でき、競合した要求には失効ではなく再試行可能なエラーを返す。
 *
 * `scope` で今より狭いスコープを求められたら、それで出す。広げることはできない。
 */
export async function refreshTokens(
	db: Db,
	input: { refreshToken: string; clientId: string; scope?: string },
	now = new Date()
): Promise<(TokenResponse & { retried?: true }) | TokenError> {
	const id = hashSessionToken(input.refreshToken);
	const t = sec(now);
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
	if (!row || row.clientId !== input.clientId) {
		return invalidGrant('リフレッシュトークンが無効です');
	}

	// 行だけで決まる検査は、使用済みの印を付ける前に済ませる。印を付けてから落ちると、送り直しを受けた
	// ときに届かなかった1組だけ止めて新しい1組を出さず、クライアントの手元に使えるトークンが残らない。
	if (row.expiresAt <= t) return invalidGrant('リフレッシュトークンの期限が切れています');
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

	const retry =
		row.usedAt === null
			? { state: 'accept' as const, refreshId: id }
			: await judgeRetry(db, id, row.usedAt, t);
	switch (retry.state) {
		case 'accept': {
			if ('scopes' in retry) {
				// 再送は最初に確定した更新と同じ権限だけ。省略で親の広い権限へ戻さない。
				const issuedScopes = knownScopes(retry.scopes);
				if (input.scope !== undefined && scopes.join(' ') !== issuedScopes.join(' ')) {
					return { error: 'invalid_scope', error_description: '最初の更新とスコープが異なります' };
				}
				scopes = issuedScopes;
			}
			const tokens = await issueTokens(db, row.grantId, scopes, now, id, retry.refreshId);
			if (tokens) return row.usedAt === null ? tokens : { ...tokens, retried: true };
			// 同意し直し・解除と、別の要求が先に更新した場合を分ける。
			if (!(await activeGrant(db, row.grantId)))
				return invalidGrant('同意が更新または解除されています');
			return refreshInFlight();
		}
		case 'theft':
			await db.delete(oauthGrant).where(eq(oauthGrant.id, row.grantId));
			return {
				...invalidGrant('使用済みのリフレッシュトークンです。連携を解除しました'),
				reused: true
			};
	}
}

const refreshInFlight = (): TokenError => ({
	error: 'temporarily_unavailable',
	error_description: '同じリフレッシュトークンの要求を処理しています。少し待って送り直してください'
});

/**
 * 使用済みのリフレッシュトークンが来たときの判断。競馬場のスマホのように電波の弱い所では、要求は届いたのに
 * 応答が届かず、クライアントが同じトークンで送り直すことがある。それを盗まれたトークンと分ける。
 *
 * - `accept` — 応答が届かなかった送り直し。前に使われてから猶予の内で、そのとき出したアクセストークンが
 *   **一度も使われていない**（リフレッシュするのは tool を呼ぶためなので、受け取っていればすぐ使う）。
 *   次のリフレッシュトークンの ID を返す。印と届かなかったアクセストークンの削除は発行の batch で行う。
 * - `theft` — 出したアクセストークンが使われた・次のリフレッシュトークンが使われた・猶予を過ぎた。
 *   正規のクライアントは受け取っていたので、古いトークンが来るのは盗まれたとき
 *
 * 残る弱さ: 正規のクライアントが新しいアクセストークンを初めて使うまでの間（ふつうは数秒）に、盗まれた古い
 * トークンが使われると受けてしまう。その場合も正規のクライアントが次に更新したとき（持っているトークンに
 * 使用済みの印が付いている）に見つかり、連携ごと消える。
 */
async function judgeRetry(
	db: Db,
	refreshId: string,
	usedAt: number,
	t: number
): Promise<{ state: 'accept'; refreshId: string; scopes: string[] } | { state: 'theft' }> {
	if (t - usedAt > REFRESH_RETRY_GRACE_SEC) return { state: 'theft' };
	const children = await db
		.select({
			id: oauthToken.id,
			kind: oauthToken.kind,
			usedAt: oauthToken.usedAt,
			scopes: oauthToken.scopes
		})
		.from(oauthToken)
		.where(eq(oauthToken.parentId, refreshId));
	// 使用済みの印と子の INSERT は同じ batch で確定する（issueTokens）。印があって子が無いのは、送り直しで
	// 止めた1組（届かなかったはずのもの）だけ。それが使われたなら持っていないはずのもの＝盗まれた。
	if (children.length === 0) return { state: 'theft' };
	if (children.some((c) => c.kind === 'access' && c.usedAt !== null)) return { state: 'theft' };
	const next = children.find((c) => c.kind === 'refresh' && c.usedAt === null);
	return next ? { state: 'accept', refreshId: next.id, scopes: next.scopes } : { state: 'theft' };
}

export type AccessTokenAuth = {
	user: SessionUser;
	scopes: OAuthScope[];
};

/**
 * `/mcp` の Bearer を確かめる。hooks.server.ts だけが呼ぶ。1クエリ（初めて使われたときだけ、印を付ける1クエリが増える）。
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
			usedAt: oauthToken.usedAt,
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
	// 初めて使われた時刻を1回だけ残す。リフレッシュの送り直しか盗まれたトークンかの判断に使う（judgeRetry）。
	if (row.usedAt === null) {
		await db
			.update(oauthToken)
			.set({ usedAt: sec(now) })
			.where(and(eq(oauthToken.id, hashSessionToken(token)), isNull(oauthToken.usedAt)));
	}
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
