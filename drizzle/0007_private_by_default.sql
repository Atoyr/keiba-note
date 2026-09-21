DROP TABLE `invite`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_note` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`kind` text NOT NULL,
	`race_id` text,
	`horse_id` text,
	`race_entry_id` text,
	`body` text NOT NULL,
	`rating` integer,
	`mark` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`race_id`) REFERENCES `race`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`horse_id`) REFERENCES `horse`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`race_entry_id`) REFERENCES `race_entry`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "note_kind_shape" CHECK(
				(kind = 'race'  AND race_id IS NOT NULL AND horse_id IS NULL     AND race_entry_id IS NULL)
				OR (kind = 'horse' AND race_id IS NULL     AND horse_id IS NOT NULL AND race_entry_id IS NULL)
				OR (kind IN ('entry', 'preview') AND race_id IS NOT NULL AND horse_id IS NOT NULL AND race_entry_id IS NOT NULL)
			),
	CONSTRAINT "note_rating_range" CHECK(rating IS NULL OR (rating >= 1 AND rating <= 5)),
	CONSTRAINT "note_mark_kind" CHECK(mark IS NULL OR kind = 'preview')
);
--> statement-breakpoint
INSERT INTO `__new_note`("id", "author_id", "kind", "race_id", "horse_id", "race_entry_id", "body", "rating", "mark", "visibility", "occurred_at", "created_at", "updated_at") SELECT "id", "author_id", "kind", "race_id", "horse_id", "race_entry_id", "body", "rating", "mark", "visibility", "occurred_at", "created_at", "updated_at" FROM `note`;--> statement-breakpoint
DROP TABLE `note`;--> statement-breakpoint
ALTER TABLE `__new_note` RENAME TO `note`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `note_author_horse` ON `note` (`author_id`,`horse_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `note_author_race_id` ON `note` (`author_id`,`race_id`);--> statement-breakpoint
CREATE INDEX `note_author` ON `note` (`author_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `note_author_entry_kind` ON `note` (`author_id`,`race_entry_id`,`kind`) WHERE race_entry_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `note_author_race` ON `note` (`author_id`,`race_id`) WHERE kind = 'race';--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`google_sub` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`role` text DEFAULT 'user' NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_user`("id", "google_sub", "email", "display_name", "avatar_url", "role", "deleted_at", "created_at", "updated_at") SELECT "id", "google_sub", "email", "display_name", "avatar_url", "role", "deleted_at", "created_at", "updated_at" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_google_sub_unique` ON `user` (`google_sub`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
-- ここから下はスキーマではなくデータの移行。drizzle-kit は生成しないので手で足している。

-- 既存の shared は **すべて private に倒す**。要件が「既定は非公開、共有は都度選ぶ」に
-- 変わったので、以前 shared だったものを unlisted に読み替えると
-- 本人が選んでいない共有が残る。安全側に倒し、共有は選び直してもらう（design.md 第8章 Phase 5）。
UPDATE `note` SET `visibility` = 'private' WHERE `visibility` <> 'private';--> statement-breakpoint

-- owner -> admin, member -> user。想定外の値も user に寄せる。
UPDATE `user` SET `role` = 'admin' WHERE `role` = 'owner';--> statement-breakpoint
UPDATE `user` SET `role` = 'user' WHERE `role` <> 'admin';
