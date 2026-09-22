PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_note` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`kind` text NOT NULL,
	`race_id` text,
	`horse_id` text,
	`race_entry_id` text,
	`body` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
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
	CONSTRAINT "note_tags_json" CHECK(json_valid(tags)),
	CONSTRAINT "note_mark_kind" CHECK(mark IS NULL OR kind = 'preview')
);
--> statement-breakpoint
INSERT INTO `__new_note`("id", "author_id", "kind", "race_id", "horse_id", "race_entry_id", "body", "tags", "mark", "visibility", "occurred_at", "created_at", "updated_at") SELECT "id", "author_id", "kind", "race_id", "horse_id", "race_entry_id", "body", "tags", "mark", "visibility", "occurred_at", "created_at", "updated_at" FROM `note`;--> statement-breakpoint
DROP TABLE `note`;--> statement-breakpoint
ALTER TABLE `__new_note` RENAME TO `note`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `note_author_horse` ON `note` (`author_id`,`horse_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `note_author_race_id` ON `note` (`author_id`,`race_id`);--> statement-breakpoint
CREATE INDEX `note_author` ON `note` (`author_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `note_author_entry_kind` ON `note` (`author_id`,`race_entry_id`,`kind`) WHERE race_entry_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `note_author_race` ON `note` (`author_id`,`race_id`) WHERE kind = 'race';