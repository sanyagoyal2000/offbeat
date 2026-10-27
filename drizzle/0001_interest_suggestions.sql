CREATE TABLE `interest_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`city` text NOT NULL,
	`tab` text NOT NULL,
	`source` text NOT NULL,
	`qloo_entity_id` text NOT NULL,
	`name` text NOT NULL,
	`qloo_type` text NOT NULL,
	`image_url` text,
	`rank` integer NOT NULL,
	`india_match` integer DEFAULT false NOT NULL,
	`fetched_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interest_suggestions_unique` ON `interest_suggestions` (`city`,`tab`,`source`,`qloo_entity_id`);--> statement-breakpoint
CREATE INDEX `interest_suggestions_city_tab` ON `interest_suggestions` (`city`,`tab`,`source`,`rank`);