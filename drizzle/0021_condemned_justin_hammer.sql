CREATE INDEX `oauth_client_created` ON `oauth_client` (`created_at`);--> statement-breakpoint
CREATE INDEX `oauth_grant_client` ON `oauth_grant` (`client_id`);