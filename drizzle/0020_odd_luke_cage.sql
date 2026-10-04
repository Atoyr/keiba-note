CREATE TABLE `mcp_usage` (
	`user_id` text PRIMARY KEY NOT NULL,
	`week_start` integer NOT NULL,
	`reads` integer DEFAULT 0 NOT NULL,
	`writes` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
