CREATE TABLE `data_import` (
	`file` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`applied_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `horse_name_no_birth` ON `horse` (`name`) WHERE birth_year IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `horse_external_ref` ON `horse` (`external_ref`) WHERE external_ref IS NOT NULL;