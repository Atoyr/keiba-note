-- drizzle-kit が生成した INSERT ... SELECT は、旧テーブルに存在しない `mark` を
-- 選択していたため NULL に差し替えてある。列の追加と CHECK 制約の変更が
-- 同時に起きると起きる不整合。
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
	`visibility` text DEFAULT 'shared' NOT NULL,
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
INSERT INTO `__new_note`("id", "author_id", "kind", "race_id", "horse_id", "race_entry_id", "body", "rating", "mark", "visibility", "occurred_at", "created_at", "updated_at") SELECT "id", "author_id", "kind", "race_id", "horse_id", "race_entry_id", "body", "rating", NULL, "visibility", "occurred_at", "created_at", "updated_at" FROM `note`;--> statement-breakpoint
DROP TABLE `note`;--> statement-breakpoint
ALTER TABLE `__new_note` RENAME TO `note`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `note_horse_timeline` ON `note` (`horse_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `note_race` ON `note` (`race_id`);--> statement-breakpoint
CREATE INDEX `note_author` ON `note` (`author_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `note_author_entry_kind` ON `note` (`author_id`,`race_entry_id`,`kind`) WHERE race_entry_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `note_author_race` ON `note` (`author_id`,`race_id`) WHERE kind = 'race';