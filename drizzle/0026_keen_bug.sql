CREATE TABLE `horse_trait` (
	`user_id` text NOT NULL,
	`horse_id` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `horse_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`horse_id`) REFERENCES `horse`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "horse_trait_tags_json" CHECK(json_valid(tags))
);
