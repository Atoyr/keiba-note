ALTER TABLE `oauth_token` ADD `parent_id` text;--> statement-breakpoint
CREATE INDEX `oauth_token_parent` ON `oauth_token` (`parent_id`);