import { relations, sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

/**
 * Drizzle スキーマ。docs/design.md 第5章に対応する。
 *
 * - ID は ULID（時系列ソート可能）
 * - 日時は unixepoch 整数。`occurred_at` は `YYYY-MM-DD` 文字列（JST 固定）
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

export const horse = sqliteTable(
	'horse',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		nameKana: text('name_kana'),
		sex: text('sex', { enum: ['牡', '牝', 'セ'] }),
		birthYear: integer('birth_year'),
		trainer: text('trainer'),
		ownerName: text('owner_name'),
		sire: text('sire'),
		dam: text('dam'),
		/** プロフィール欄の常設メモ。タイムラインとは別物。 */
		profileMemo: text('profile_memo'),
		/** netkeiba の馬ID等。将来の取り込み用に最初から置いておく。 */
		externalRef: text('external_ref'),
		createdBy: text('created_by').references(() => user.id),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		// 同名馬対策。世代が違えば別馬として登録できる。
		uniqueIndex('horse_name_birth').on(t.name, t.birthYear),
		index('horse_name').on(t.name)
	]
);

export const race = sqliteTable(
	'race',
	{
		id: text('id').primaryKey(),
		/** `YYYY-MM-DD`。JST 固定。 */
		date: text('date').notNull(),
		/** JRA の10場のみ。地方・海外は扱わない（今週の重賞を確実に引くため）。 */
		course: text('course', {
			enum: ['札幌', '函館', '福島', '新潟', '東京', '中山', '中京', '京都', '阪神', '小倉']
		}).notNull(),
		raceNumber: integer('race_number'),
		name: text('name'),
		grade: text('grade', { enum: ['G1', 'G2', 'G3', 'L', 'OP'] }),
		className: text('class_name'),
		surface: text('surface', { enum: ['芝', 'ダート', '障害'] }),
		distance: integer('distance'),
		direction: text('direction', { enum: ['右', '左', '直線'] }),
		trackCondition: text('track_condition', { enum: ['良', '稍重', '重', '不良'] }),
		weather: text('weather'),
		externalRef: text('external_ref'),
		createdBy: text('created_by').references(() => user.id),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index('race_date').on(t.date),
		uniqueIndex('race_ident').on(t.date, t.course, t.raceNumber)
	]
);

export const raceEntry = sqliteTable(
	'race_entry',
	{
		id: text('id').primaryKey(),
		raceId: text('race_id')
			.notNull()
			.references(() => race.id, { onDelete: 'cascade' }),
		horseId: text('horse_id')
			.notNull()
			.references(() => horse.id),
		bracket: integer('bracket'),
		horseNumber: integer('horse_number'),
		jockey: text('jockey'),
		weightCarried: real('weight_carried'),
		horseWeight: integer('horse_weight'),
		horseWeightDiff: integer('horse_weight_diff'),
		odds: real('odds'),
		popularity: integer('popularity'),
		/** NULL = 未確定／除外。 */
		finishPosition: integer('finish_position'),
		finishTime: text('finish_time'),
		margin: text('margin'),
		/** 通過順（`3-3-2-2`）。 */
		passing: text('passing'),
		last3f: real('last_3f')
	},
	(t) => [
		uniqueIndex('entry_race_horse').on(t.raceId, t.horseId),
		uniqueIndex('entry_race_number').on(t.raceId, t.horseNumber),
		index('entry_horse').on(t.horseId)
	]
);

/**
 * メモ。本アプリの中心。
 *
 * レースのメモも馬のメモも1テーブルに統一し、「どのレースの」「どの馬の」を
 * **非正規化して持つ**。これにより馬のタイムラインが
 * `WHERE horse_id = ? ORDER BY occurred_at DESC` の1クエリで済み、
 * レース側・馬側の両方から JOIN なしで読める（docs/design.md 第2章）。
 *
 * `entry` のとき race_id / horse_id は race_entry から導出できるが、あえて持つ。
 * 整合性はサービス層（race_entry から値をコピーして INSERT する）で担保する。
 */
export const note = sqliteTable(
	'note',
	{
		id: text('id').primaryKey(),
		authorId: text('author_id')
			.notNull()
			.references(() => user.id),
		/**
		 * `preview` は出走前メモ。列の埋まり方は `entry` と同じで、
		 * 「レース前にどう見ていたか」と「実際どうだったか」を別の行として残すために分ける。
		 */
		kind: text('kind', { enum: ['race', 'horse', 'entry', 'preview'] }).notNull(),
		raceId: text('race_id').references(() => race.id, { onDelete: 'cascade' }),
		horseId: text('horse_id').references(() => horse.id, { onDelete: 'cascade' }),
		raceEntryId: text('race_entry_id').references(() => raceEntry.id, { onDelete: 'cascade' }),
		/** Markdown。 */
		body: text('body').notNull(),
		/** 次走期待度 1–5。任意。 */
		rating: integer('rating'),
		visibility: text('visibility', { enum: ['shared', 'private'] })
			.notNull()
			.default('shared'),
		/** タイムライン用。レース紐付きならレース日、それ以外は記入日。`YYYY-MM-DD`。 */
		occurredAt: text('occurred_at').notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index('note_horse_timeline').on(t.horseId, t.occurredAt),
		index('note_race').on(t.raceId),
		index('note_author').on(t.authorId, t.createdAt),
		// 「1人・1出走馬・1種別につきメモは1本、編集＝上書き」を DB 側で保証する。
		// これがあるので保存側は ON CONFLICT で upsert でき、
		// 既存メモの id をフォームに持ち回す必要がない（＝競合で二重に増えない）。
		//
		// **kind を含めているのが肝。** 含めないと、予想画面で書いた出走前メモが
		// ふりかえりの保存で上書きされて消える。事前と事後は別の行として残す。
		uniqueIndex('note_author_entry_kind')
			.on(t.authorId, t.raceEntryId, t.kind)
			.where(sql`race_entry_id IS NOT NULL`),
		uniqueIndex('note_author_race')
			.on(t.authorId, t.raceId)
			.where(sql`kind = 'race'`),
		// kind ごとにどの列が埋まるかを DB 側で強制する。
		// サービス層のバグでちぐはぐな行が入るのを防ぐ最後の砦。
		check(
			'note_kind_shape',
			sql`
				(kind = 'race'  AND race_id IS NOT NULL AND horse_id IS NULL     AND race_entry_id IS NULL)
				OR (kind = 'horse' AND race_id IS NULL     AND horse_id IS NOT NULL AND race_entry_id IS NULL)
				OR (kind IN ('entry', 'preview') AND race_id IS NOT NULL AND horse_id IS NOT NULL AND race_entry_id IS NOT NULL)
			`
		),
		check('note_rating_range', sql`rating IS NULL OR (rating >= 1 AND rating <= 5)`)
	]
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

export type Horse = typeof horse.$inferSelect;
export type Race = typeof race.$inferSelect;
export type RaceEntry = typeof raceEntry.$inferSelect;
export type Note = typeof note.$inferSelect;
export type NoteKind = Note['kind'];
export type NoteVisibility = Note['visibility'];
export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Invite = typeof invite.$inferSelect;
export type UserRole = User['role'];
