import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Drizzle スキーマ。docs/design.md 第5章に対応する。
 *
 * - ID は ULID（時系列ソート可能）
 * - 日時は unixepoch 整数。`occurred_at` のような日付だけの列は `YYYY-MM-DD` 文字列（Phase 3）
 *
 * Phase 1 では認証まわりの user / session / invite のみ。
 * horse / race / race_entry / note は Phase 2 以降で足す。
 */

const createdAt = () =>
	integer('created_at')
		.notNull()
		.default(sql`(unixepoch())`);

const updatedAt = () =>
	integer('updated_at')
		.notNull()
		.default(sql`(unixepoch())`);

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	/** Google の `sub`。ログイン時の引き当てキー。email は変わりうるので使わない。 */
	googleSub: text('google_sub').notNull().unique(),
	/** 表示と招待の照合に使う。 */
	email: text('email').notNull().unique(),
	displayName: text('display_name').notNull(),
	avatarUrl: text('avatar_url'),
	/** `owner` / `member`。招待を出せるのは owner だけ。 */
	role: text('role', { enum: ['owner', 'member'] })
		.notNull()
		.default('member'),
	/** 退会は論理削除。NULL 以外はログイン不可（design.md 第9章 #8）。 */
	deletedAt: integer('deleted_at'),
	createdAt: createdAt(),
	updatedAt: updatedAt()
});

export const session = sqliteTable(
	'session',
	{
		/** セッショントークンの SHA-256 ハッシュ（hex）。生トークンは保存しない。 */
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** unixepoch。スライディングで延長される。 */
		expiresAt: integer('expires_at').notNull(),
		createdAt: createdAt()
	},
	(t) => [
		// 「全端末からログアウト」用
		index('session_user').on(t.userId),
		// 期限切れの一括削除用
		index('session_expires').on(t.expiresAt)
	]
);

export const invite = sqliteTable(
	'invite',
	{
		id: text('id').primaryKey(),
		/** URL に乗せる乱数（24バイト以上）。 */
		code: text('code').notNull().unique(),
		/** 宛先を固定する場合。NULL なら誰でも1回使える。 */
		email: text('email'),
		invitedBy: text('invited_by')
			.notNull()
			.references(() => user.id),
		/** 既定7日。 */
		expiresAt: integer('expires_at').notNull(),
		/** NULL なら未使用。 */
		usedAt: integer('used_at'),
		/** 使った結果できた user。 */
		usedBy: text('used_by').references(() => user.id),
		createdAt: createdAt()
	},
	(t) => [index('invite_invited_by').on(t.invitedBy)]
);

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	invites: many(invite)
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, { fields: [session.userId], references: [user.id] })
}));

export const inviteRelations = relations(invite, ({ one }) => ({
	invitedByUser: one(user, { fields: [invite.invitedBy], references: [user.id] })
}));

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Invite = typeof invite.$inferSelect;
export type UserRole = User['role'];
