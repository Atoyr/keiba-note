import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Db } from '$lib/server/db';
import { session, user, type User } from '$lib/server/db/schema';

/** セッションの有効期限。30日。 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * スライディング更新の閾値。残りがこれを切ったアクセスで 30日に延長する。
 * 毎回 UPDATE しないための仕組み（docs/product.md 第4章）。
 */
export const SESSION_RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE = 'session';

/** ログインしているユーザーとして扱う最小限の形。`locals.user` に入る。 */
export type SessionUser = Pick<User, 'id' | 'email' | 'displayName' | 'avatarUrl' | 'role'>;

/**
 * セッショントークンを作る。32バイトの乱数を base32 で符号化したもの。
 * **これは Cookie にだけ入れる。DB には入れない。**
 */
export function generateSessionToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return encodeBase32LowerCaseNoPadding(bytes);
}

/**
 * トークン → DB に保存する ID（SHA-256 の hex）。
 * D1 が漏れても、保存されている値からはトークンを復元できない＝なりすませない。
 */
export function hashSessionToken(token: string): string {
	return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

/** セッションを発行し、生トークンを返す。呼び出し側が Cookie に載せる。 */
export async function createSession(db: Db, userId: string, now = new Date()): Promise<string> {
	const token = generateSessionToken();
	await db.insert(session).values({
		id: hashSessionToken(token),
		userId,
		expiresAt: Math.floor((now.getTime() + SESSION_TTL_MS) / 1000)
	});
	return token;
}

export type ValidatedSession = {
	user: SessionUser;
	/** スライディング更新で期限を延ばしたときだけ入る。Cookie を貼り直すために使う。 */
	renewedExpiresAt: Date | null;
};

/**
 * トークンを検証して、生きていればユーザーを返す。
 *
 * - 期限切れなら行を削除して null（遅延クリーンアップ）
 * - 退会済み（`deleted_at` が NULL でない）ならログイン不可
 * - 残りが閾値を切っていれば期限を 30日に延長する
 */
export async function validateSession(
	db: Db,
	token: string,
	now = new Date()
): Promise<ValidatedSession | null> {
	const sessionId = hashSessionToken(token);

	const rows = await db
		.select({
			expiresAt: session.expiresAt,
			id: user.id,
			email: user.email,
			displayName: user.displayName,
			avatarUrl: user.avatarUrl,
			role: user.role,
			deletedAt: user.deletedAt
		})
		.from(session)
		.innerJoin(user, eq(session.userId, user.id))
		.where(eq(session.id, sessionId))
		.limit(1);

	const row = rows.at(0);
	if (!row) return null;

	const expiresAtMs = row.expiresAt * 1000;
	if (expiresAtMs <= now.getTime()) {
		await db.delete(session).where(eq(session.id, sessionId));
		return null;
	}

	// 退会済みのユーザーはセッションが残っていても入れない。
	if (row.deletedAt !== null) {
		await db.delete(session).where(eq(session.id, sessionId));
		return null;
	}

	let renewedExpiresAt: Date | null = null;
	if (expiresAtMs - now.getTime() < SESSION_RENEW_THRESHOLD_MS) {
		renewedExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
		await db
			.update(session)
			.set({ expiresAt: Math.floor(renewedExpiresAt.getTime() / 1000) })
			.where(eq(session.id, sessionId));
	}

	return {
		user: {
			id: row.id,
			email: row.email,
			displayName: row.displayName,
			avatarUrl: row.avatarUrl,
			role: row.role
		},
		renewedExpiresAt
	};
}

/** ログアウト。該当の1行だけ消す。 */
export async function invalidateSession(db: Db, token: string): Promise<void> {
	await db.delete(session).where(eq(session.id, hashSessionToken(token)));
}

/** 全端末からログアウト。退会処理でも使う。 */
export async function invalidateAllSessions(db: Db, userId: string): Promise<void> {
	await db.delete(session).where(eq(session.userId, userId));
}

/** 期限切れセッションの一括削除。Phase 4 で Cron から呼ぶ想定。 */
export async function deleteExpiredSessions(db: Db, now = new Date()): Promise<void> {
	await db.delete(session).where(lte(session.expiresAt, Math.floor(now.getTime() / 1000)));
}

/** google_sub で引く。email は変わりうるので引き当てキーには使わない。 */
export async function findUserByGoogleSub(db: Db, googleSub: string): Promise<User | null> {
	const rows = await db
		.select()
		.from(user)
		.where(and(eq(user.googleSub, googleSub), isNull(user.deletedAt)))
		.limit(1);
	return rows.at(0) ?? null;
}

export type CreateUserInput = {
	googleSub: string;
	email: string;
	displayName: string;
	avatarUrl: string | null;
	role: User['role'];
};

export async function createUser(db: Db, input: CreateUserInput): Promise<User> {
	const row: User = {
		id: ulid(),
		googleSub: input.googleSub,
		email: input.email,
		displayName: input.displayName,
		avatarUrl: input.avatarUrl,
		role: input.role,
		deletedAt: null,
		createdAt: Math.floor(Date.now() / 1000),
		updatedAt: Math.floor(Date.now() / 1000)
	};
	await db.insert(user).values(row);
	return row;
}
