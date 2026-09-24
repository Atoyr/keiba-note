import { relations, sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
// 型だけの import。$lib エイリアスを解決しない drizzle-kit から読めるよう相対パスにする。
import type { NoteTag } from '../../schemas/note';

/**
 * Drizzle スキーマ。docs/product.md 第5章に対応する。
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
	/** 表示用。`ADMIN_EMAIL` との突き合わせにも使う。 */
	email: text('email').notNull().unique(),
	displayName: text('display_name').notNull(),
	avatarUrl: text('avatar_url'),
	/**
	 * `admin` / `user`。admin はメンテ用の区分で、マスタ（馬・レース・出走馬）の
	 * 修正とユーザーの凍結だけを行う。**admin でも他人のメモは読めない**
	 * （サービス層が例外なく author_id で絞ることの帰結。product.md 第4章）。
	 */
	role: text('role', { enum: ['admin', 'user'] })
		.notNull()
		.default('user'),
	/** 退会は論理削除。NULL 以外はログイン不可（product.md 第9章 #8）。 */
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
		// **birth_year が NULL の行は horse_name_birth では一意にならない。**
		// SQLite は NULL 同士を別物として扱うため、生年不明の同名馬が何頭でも入ってしまう。
		// 投入スクリプトは生年が分かる前に馬を作る（出走予定の段階では性齢が未公表）ので、
		// この穴を塞いでおかないと「あとから生年を埋める」経路で重複が増える。
		uniqueIndex('horse_name_no_birth')
			.on(t.name)
			.where(sql`birth_year IS NULL`),
		// external_ref を引き当てキーに使うなら一意でなければ意味がない。
		uniqueIndex('horse_external_ref')
			.on(t.externalRef)
			.where(sql`external_ref IS NOT NULL`),
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
		/** 発走時刻 `HH:MM`（JST）。オッズを取りに行く時間帯を決める（`services/odds.ts`）。 */
		startTime: text('start_time'),
		/**
		 * 取得元のレース ID。`nk-202606040911`（netkeiba の race_id）の形。
		 * **オッズを取りに行くのは、これと発走時刻が入った当日のレースだけ。**
		 */
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
 * レース側・馬側の両方から JOIN なしで読める（docs/product.md 第2章）。
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
		 *
		 * `race_preview`（レースの見立て）と `race`（ふりかえり）も同じ関係。
		 * 列の埋まり方は同じで、**開催前に書いたものが開催後の保存で消えない**ように分ける。
		 */
		kind: text('kind', { enum: ['race', 'horse', 'entry', 'preview', 'race_preview'] }).notNull(),
		raceId: text('race_id').references(() => race.id, { onDelete: 'cascade' }),
		horseId: text('horse_id').references(() => horse.id, { onDelete: 'cascade' }),
		raceEntryId: text('race_entry_id').references(() => raceEntry.id, { onDelete: 'cascade' }),
		/** Markdown。 */
		body: text('body').notNull(),
		/**
		 * 付けた札。`次走買い` `不利` など**固定の選択肢**から複数。JSON の配列で持つ。
		 * 選択肢の正は `$lib/schemas/note` の `NOTE_TAGS`。
		 *
		 * 別テーブルに正規化していないのは、**札で検索する画面が無い**ため。
		 * 読むのはいつも「このメモに何が付いているか」で、note を引けば一緒に来る形が要る。
		 * 札で横断検索したくなったら、そのとき正規化する。
		 */
		tags: text('tags', { mode: 'json' })
			.$type<NoteTag[]>()
			.notNull()
			.default(sql`'[]'`),
		/**
		 * 予想印。`preview`（出走前メモ）にだけ付く。
		 * 本文が空でも印だけ残せる（「◎だけ付けておく」が成立する）。
		 */
		mark: text('mark', { enum: ['◎', '○', '▲', '△', '×'] }),
		/**
		 * `private`（既定・本人だけ）/ `unlisted`（リンクを知っている人だけ）。
		 *
		 * **この列を見てよいのは共有ページ `/notes/[id]` だけ。**
		 * ログイン中の読みはすべて `author_id = :viewer` で閉じているので、
		 * 公開範囲の判定がそもそも要らない（product.md 第2章 2-2）。
		 */
		visibility: text('visibility', { enum: ['private', 'unlisted'] })
			.notNull()
			.default('private'),
		/** タイムライン用。レース紐付きならレース日、それ以外は記入日。`YYYY-MM-DD`。 */
		occurredAt: text('occurred_at').notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		// **インデックスは author_id で始める。** ログイン中の読みはすべて
		// `WHERE author_id = :viewer` で絞られるので、先頭が race_id / horse_id の
		// ままだと自分のメモを読むだけで他人の行までスキャンする。
		// D1 はスキャンした行数で課金されるため、可視性の話であると同時にコストの話でもある。
		index('note_author_horse').on(t.authorId, t.horseId, t.occurredAt),
		index('note_author_race_id').on(t.authorId, t.raceId),
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
		// 見立て（開催前のレースのメモ）も1人・1レースにつき1本。
		// **`note_author_race` に相乗りさせない。** 同じ (author_id, race_id) で
		// 事前と事後の2行が立つので、kind ごとに別の部分ユニークで持つ。
		uniqueIndex('note_author_race_preview')
			.on(t.authorId, t.raceId)
			.where(sql`kind = 'race_preview'`),
		// kind ごとにどの列が埋まるかを DB 側で強制する。
		// サービス層のバグでちぐはぐな行が入るのを防ぐ最後の砦。
		check(
			'note_kind_shape',
			sql`
				(kind IN ('race', 'race_preview') AND race_id IS NOT NULL AND horse_id IS NULL AND race_entry_id IS NULL)
				OR (kind = 'horse' AND race_id IS NULL     AND horse_id IS NOT NULL AND race_entry_id IS NULL)
				OR (kind IN ('entry', 'preview') AND race_id IS NOT NULL AND horse_id IS NOT NULL AND race_entry_id IS NOT NULL)
			`
		),
		// 中身が選択肢のどれかであることはサービス層（valibot）が保証する。
		// DB 側で見られるのは「JSON として壊れていないか」まで。
		check('note_tags_json', sql`json_valid(tags)`),
		// 印は出走前メモ専用。ふりかえりのメモに付いていたら整合していない。
		check('note_mark_kind', sql`mark IS NULL OR kind = 'preview'`)
	]
);

/**
 * 最新の単勝・複勝オッズ。1レース・1馬番につき1行で、**履歴は持たない。**
 *
 * マスタ（race / race_entry）と違い、PR を通さず Cron が取得元から書く唯一のテーブル
 * （docs/product.md 第1章の例外）。表示専用で、メモからも馬柱からも参照しない。
 *
 * 取得に失敗した回は何も書かない。前回うまく取れた値が、その時点（`as_of`）とともに残る。
 * 馬番で持つのは、オッズが馬番に付くものだから。馬番が決まる前（枠順確定前）には
 * 取得元もオッズを出さない（出るのは予想オッズで、parser が読まない）。
 */
export const raceOdds = sqliteTable(
	'race_odds',
	{
		raceId: text('race_id')
			.notNull()
			.references(() => race.id, { onDelete: 'cascade' }),
		horseNumber: integer('horse_number').notNull(),
		winOdds: real('win_odds'),
		placeOddsMin: real('place_odds_min'),
		placeOddsMax: real('place_odds_max'),
		/** オッズの時点（unixepoch）。画面の「14:30時点」。 */
		asOf: integer('as_of').notNull(),
		/** 取りに行った時刻（unixepoch）。 */
		fetchedAt: integer('fetched_at').notNull()
	},
	(t) => [
		// レース単位で読むので race_id が先頭。別にインデックスは要らない。
		primaryKey({ columns: [t.raceId, t.horseNumber] }),
		// 値の検査は validateRaceOdds が先にしている。ここは壊れた値が入らないための最後の砦。
		check(
			'race_odds_values',
			sql`
				horse_number BETWEEN 1 AND 18
				AND (win_odds IS NULL OR win_odds > 0)
				AND (place_odds_min IS NULL OR place_odds_min > 0)
				AND (place_odds_max IS NULL OR place_odds_max >= place_odds_min)
			`
		)
	]
);

/**
 * data/races/*.yaml の適用状況。
 *
 * 投入スクリプトは実行のたびに全ファイルを流し直していたが、開催日ごとに
 * ファイルが増える設計なので、いずれ「今週ぶんを入れるために過去1年を再適用する」ことになる。
 * ファイル内容のハッシュを覚えておき、**変わったファイルだけ**を流す。
 *
 * 置き場所を D1 にしているのは、適用状況が**投入先ごとに違う**から。
 * ローカル D1 と本番 D1 では進み方が別で、リポジトリ内のファイルでは片方しか表せない。
 * 状態をデータと同じ場所に置けば、ずれようがない。
 */
export const dataImport = sqliteTable('data_import', {
	/** `data/races/` からの相対ファイル名。`2026-09-26.yaml` */
	file: text('file').primaryKey(),
	/** ファイル内容の SHA-256（hex）。 */
	hash: text('hash').notNull(),
	appliedAt: integer('applied_at')
		.notNull()
		.default(sql`(unixepoch())`)
});

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session)
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, { fields: [session.userId], references: [user.id] })
}));

export type Horse = typeof horse.$inferSelect;
export type Race = typeof race.$inferSelect;
export type RaceEntry = typeof raceEntry.$inferSelect;
export type RaceOddsRow = typeof raceOdds.$inferSelect;
export type Note = typeof note.$inferSelect;
export type NoteKind = Note['kind'];
export type NoteVisibility = Note['visibility'];
export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type UserRole = User['role'];
export type DataImport = typeof dataImport.$inferSelect;
