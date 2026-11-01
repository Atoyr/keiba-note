CREATE TABLE `insight_word` (
	`user_id` text NOT NULL,
	`word` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `word`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `race_entry_insight` (
	`user_id` text NOT NULL,
	`race_entry_id` text NOT NULL,
	`race_id` text NOT NULL,
	`horse_id` text NOT NULL,
	`words` text DEFAULT '[]' NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `race_entry_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`race_entry_id`) REFERENCES `race_entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`race_id`) REFERENCES `race`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`horse_id`) REFERENCES `horse`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "insight_words_json" CHECK(json_valid(words))
);
--> statement-breakpoint
CREATE INDEX `insight_user_horse` ON `race_entry_insight` (`user_id`,`horse_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `insight_user_race` ON `race_entry_insight` (`user_id`,`race_id`);