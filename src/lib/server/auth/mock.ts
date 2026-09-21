import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import type { SessionUser } from './session';

/**
 * 開発用のモックユーザー。
 *
 * **このファイルの呼び出し元は必ず `dev` で囲うこと。**
 * `dev` は本番ビルドで静的に false になるため、分岐ごとバンドルから消える。
 * つまりデプロイした Worker にはモックの経路そのものが存在しない。
 *
 * 2人いるのは、あとで公開範囲（shared / private）を試すため。
 * 自分のメモと他人のメモが混ざった状態を作れないと、その挙動を確認できない。
 */
export const MOCK_USERS = {
	owner: {
		googleSub: 'mock|owner',
		email: 'owner@mock.local',
		displayName: 'モック（owner）',
		role: 'owner' as const
	},
	member: {
		googleSub: 'mock|member',
		email: 'member@mock.local',
		displayName: 'モック（member）',
		role: 'member' as const
	}
};

export type MockUserKey = keyof typeof MOCK_USERS;

export const MOCK_USER_COOKIE = 'mock_user';

export function isMockUserKey(value: string | undefined): value is MockUserKey {
	return value === 'owner' || value === 'member';
}

/**
 * モックユーザーを user テーブルに実在させて返す。
 *
 * 行を本当に作るのは、note.author_id などの外部キーが効く状態で
 * メモの書き味を見たいから。ここだけ偽物にすると後で辻褄が合わなくなる。
 */
export async function ensureMockUser(db: Db, key: MockUserKey): Promise<SessionUser> {
	const spec = MOCK_USERS[key];

	const existing = await db
		.select({
			id: user.id,
			email: user.email,
			displayName: user.displayName,
			avatarUrl: user.avatarUrl,
			role: user.role
		})
		.from(user)
		.where(eq(user.googleSub, spec.googleSub))
		.limit(1);

	const found = existing.at(0);
	if (found) return found;

	const now = Math.floor(Date.now() / 1000);
	const row = {
		id: ulid(),
		googleSub: spec.googleSub,
		email: spec.email,
		displayName: spec.displayName,
		avatarUrl: null,
		role: spec.role,
		deletedAt: null,
		createdAt: now,
		updatedAt: now
	};
	await db.insert(user).values(row);

	return {
		id: row.id,
		email: row.email,
		displayName: row.displayName,
		avatarUrl: row.avatarUrl,
		role: row.role
	};
}
