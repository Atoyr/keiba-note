CREATE TABLE `jockey_note` (
	`user_id` text NOT NULL,
	`jockey` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `jockey`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "jockey_note_tags_json" CHECK(json_valid(tags))
);
--> statement-breakpoint
CREATE INDEX `entry_jockey` ON `race_entry` (`jockey`);