import { encodeBase32LowerCaseNoPadding } from '@oslojs/encoding';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Db } from '$lib/server/db';
import { invite, user, type Invite } from '$lib/server/db/schema';

/** 招待コードの既定の有効期間。7日。 */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 招待を持ち回すための Cookie。/invite/[code] で置き、callback で読む。 */
export const INVITE_COOKIE = 'invite_code';
export const INVITE_COOKIE_TTL_SECONDS = 60 * 30;

/**
 * 招待コードを作る。32バイト（design.md の「24バイト以上」を満たす）の乱数。
 * URL に乗るので base32。
 */
export function generateInviteCode(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return encodeBase32LowerCaseNoPadding(bytes);
}

export async function createInvite(
	db: Db,
	params: { invitedBy: string; email: string | null; now?: Date }
): Promise<Invite> {
	const now = params.now ?? new Date();
	const row: Invite = {
		id: ulid(),
		code: generateInviteCode(),
		email: params.email?.trim().toLowerCase() || null,
		invitedBy: params.invitedBy,
		expiresAt: Math.floor((now.getTime() + INVITE_TTL_MS) / 1000),
		usedAt: null,
		usedBy: null,
		createdAt: Math.floor(now.getTime() / 1000)
	};
	await db.insert(invite).values(row);
	return row;
}

/**
 * 引いてきた招待が、この email で使えるかどうかの判断。
 *
 * DB アクセスを含まない純粋な関数に切り出してある。
 * **使用済み・期限切れ・宛先不一致を区別して返さない**のが肝で、
 * 呼び出し側は一律で同じエラー文言にする（状態を漏らさないため）。
 */
export function isInviteUsable(row: Invite, email: string, now = new Date()): boolean {
	if (row.usedAt !== null) return false;
	if (row.expiresAt * 1000 <= now.getTime()) return false;
	// 宛先が指定されている招待は、その address でしか使えない。
	if (row.email !== null && row.email !== email.trim().toLowerCase()) return false;
	return true;
}

/**
 * 招待が使えるならその行を返す。使えない理由は呼び出し側に伝えない。
 * 存在しないコードも使用済みも期限切れも等しく null。
 */
export async function findUsableInvite(
	db: Db,
	code: string,
	email: string,
	now = new Date()
): Promise<Invite | null> {
	const rows = await db
		.select()
		.from(invite)
		.where(and(eq(invite.code, code), isNull(invite.usedAt)))
		.limit(1);

	const row = rows.at(0);
	if (!row) return null;
	return isInviteUsable(row, email, now) ? row : null;
}

/**
 * 招待を消費する。`used_at IS NULL` を条件に入れることで、
 * 同じコードの同時使用を DB 側で1回に絞る。消費できたら true。
 */
export async function consumeInvite(
	db: Db,
	inviteId: string,
	usedBy: string,
	now = new Date()
): Promise<boolean> {
	const result = await db
		.update(invite)
		.set({ usedAt: Math.floor(now.getTime() / 1000), usedBy })
		.where(and(eq(invite.id, inviteId), isNull(invite.usedAt)))
		.returning({ id: invite.id });

	return result.length > 0;
}

export type InviteListItem = {
	id: string;
	code: string;
	email: string | null;
	expiresAt: number;
	usedAt: number | null;
	usedByName: string | null;
	createdAt: number;
};

/** メンバー管理画面で出す招待の一覧。 */
export async function listInvites(db: Db): Promise<InviteListItem[]> {
	const usedByUser = user;
	return db
		.select({
			id: invite.id,
			code: invite.code,
			email: invite.email,
			expiresAt: invite.expiresAt,
			usedAt: invite.usedAt,
			usedByName: usedByUser.displayName,
			createdAt: invite.createdAt
		})
		.from(invite)
		.leftJoin(usedByUser, eq(invite.usedBy, usedByUser.id))
		.orderBy(desc(invite.createdAt))
		.limit(50);
}

/** 未使用の招待を取り消す。 */
export async function revokeInvite(db: Db, inviteId: string): Promise<boolean> {
	const result = await db
		.delete(invite)
		.where(and(eq(invite.id, inviteId), isNull(invite.usedAt)))
		.returning({ id: invite.id });
	return result.length > 0;
}
