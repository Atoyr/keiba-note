CREATE TABLE `oauth_client` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`redirect_uris` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_code` (
	`id` text PRIMARY KEY NOT NULL,
	`grant_id` text NOT NULL,
	`scopes` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`code_challenge` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`grant_id`) REFERENCES `oauth_grant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauth_code_grant` ON `oauth_code` (`grant_id`);--> statement-breakpoint
CREATE INDEX `oauth_code_expires` ON `oauth_code` (`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_grant` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`scopes` text NOT NULL,
	`last_used_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_grant_user_client` ON `oauth_grant` (`user_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `oauth_token` (
	`id` text PRIMARY KEY NOT NULL,
	`grant_id` text NOT NULL,
	`kind` text NOT NULL,
	`scopes` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`grant_id`) REFERENCES `oauth_grant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauth_token_grant` ON `oauth_token` (`grant_id`);--> statement-breakpoint
CREATE INDEX `oauth_token_expires` ON `oauth_token` (`expires_at`);