CREATE TABLE `user_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_sessions_user` ON `user_sessions` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `username` text;--> statement-breakpoint
ALTER TABLE `users` ADD `password_salt` text;--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);