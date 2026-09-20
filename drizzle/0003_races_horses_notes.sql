CREATE TABLE `horse` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_kana` text,
	`sex` text,
	`birth_year` integer,
	`trainer` text,
	`owner_name` text,
	`sire` text,
	`dam` text,
	`profile_memo` text,
	`external_ref` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `horse_name_birth` ON `horse` (`name`,`birth_year`);--> statement-breakpoint
CREATE INDEX `horse_name` ON `horse` (`name`);--> statement-breakpoint
CREATE TABLE `note` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`kind` text NOT NULL,
	`race_id` text,
	`horse_id` text,
	`race_entry_id` text,
	`body` text NOT NULL,
	`rating` integer,
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
				OR (kind = 'entry' AND race_id IS NOT NULL AND horse_id IS NOT NULL AND race_entry_id IS NOT NULL)
			),
	CONSTRAINT "note_rating_range" CHECK(rating IS NULL OR (rating >= 1 AND rating <= 5))
);
--> statement-breakpoint
CREATE INDEX `note_horse_timeline` ON `note` (`horse_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `note_race` ON `note` (`race_id`);--> statement-breakpoint
CREATE INDEX `note_author` ON `note` (`author_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `note_author_entry` ON `note` (`author_id`,`race_entry_id`) WHERE race_entry_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `note_author_race` ON `note` (`author_id`,`race_id`) WHERE kind = 'race';--> statement-breakpoint
CREATE TABLE `race` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`course` text NOT NULL,
	`race_number` integer,
	`name` text,
	`grade` text,
	`class_name` text,
	`surface` text,
	`distance` integer,
	`direction` text,
	`track_condition` text,
	`weather` text,
	`external_ref` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `race_date` ON `race` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `race_ident` ON `race` (`date`,`course`,`race_number`);--> statement-breakpoint
CREATE TABLE `race_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`race_id` text NOT NULL,
	`horse_id` text NOT NULL,
	`bracket` integer,
	`horse_number` integer,
	`jockey` text,
	`weight_carried` real,
	`horse_weight` integer,
	`horse_weight_diff` integer,
	`odds` real,
	`popularity` integer,
	`finish_position` integer,
	`finish_time` text,
	`margin` text,
	`passing` text,
	`last_3f` real,
	FOREIGN KEY (`race_id`) REFERENCES `race`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`horse_id`) REFERENCES `horse`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entry_race_horse` ON `race_entry` (`race_id`,`horse_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `entry_race_number` ON `race_entry` (`race_id`,`horse_number`);--> statement-breakpoint
CREATE INDEX `entry_horse` ON `race_entry` (`horse_id`);