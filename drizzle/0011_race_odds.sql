CREATE TABLE `race_odds` (
	`race_id` text NOT NULL,
	`horse_number` integer NOT NULL,
	`win_odds` real,
	`place_odds_min` real,
	`place_odds_max` real,
	`as_of` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`race_id`, `horse_number`),
	FOREIGN KEY (`race_id`) REFERENCES `race`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "race_odds_values" CHECK(
				horse_number BETWEEN 1 AND 18
				AND (win_odds IS NULL OR win_odds > 0)
				AND (place_odds_min IS NULL OR place_odds_min > 0)
				AND (place_odds_max IS NULL OR place_odds_max >= place_odds_min)
			)
);
--> statement-breakpoint
ALTER TABLE `race` ADD `start_time` text;