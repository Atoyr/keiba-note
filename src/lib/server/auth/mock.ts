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
 * 2人いるのは、**「他人のメモが1件も出てこない」ことを確かめる**ため。
 * 1人では「自分のメモしか見えない」が成立しているのか、
 * そもそもメモが1つしかないのか区別が付かない。
 */
export const MOCK_USERS = {
	admin: {
		googleSub: 'mock|admin',
		email: 'admin@mock.local',
		displayName: 'モック（admin）',
		role: 'admin' as const
	},
	user: {
		googleSub: 'mock|user',
		email: 'user@mock.local',
		displayName: 'モック（user）',
		role: 'user' as const
	}
};

export type MockUserKey = keyof typeof MOCK_USERS;

export const MOCK_USER_COOKIE = 'mock_user';

export function isMockUserKey(value: string | undefined): value is MockUserKey {
	return value === 'admin' || value === 'user';
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
