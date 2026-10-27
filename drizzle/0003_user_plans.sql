CREATE TABLE `user_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`city` text NOT NULL,
	`event_id` text NOT NULL,
	`session_id` text NOT NULL,
	`tier_id` text NOT NULL,
	`party` integer NOT NULL,
	`currency` text NOT NULL,
	`tickets_total_amount` integer NOT NULL,
	`dinner_json` text,
	`total_amount` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `event_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_plans_user_session` ON `user_plans` (`user_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `user_plans_user` ON `user_plans` (`user_id`,`created_at`);