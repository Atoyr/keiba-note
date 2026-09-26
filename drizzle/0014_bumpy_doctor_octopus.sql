CREATE TABLE `race_share` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`race_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`race_id`) REFERENCES `race`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `race_share_author_race` ON `race_share` (`author_id`,`race_id`);--> statement-breakpoint
ALTER TABLE `user` ADD `public_name` text;