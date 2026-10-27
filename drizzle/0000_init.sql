CREATE TABLE `board_items` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`event_id` text NOT NULL,
	`added_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `board_items_board_event` ON `board_items` (`board_id`,`event_id`);--> statement-breakpoint
CREATE TABLE `board_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text,
	`budget_max` integer,
	`date_from` text,
	`date_to` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `board_participants_unique` ON `board_participants` (`board_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `board_participants_user` ON `board_participants` (`user_id`);--> statement-breakpoint
CREATE TABLE `board_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `board_votes_unique` ON `board_votes` (`board_id`,`event_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`city` text NOT NULL,
	`city_name` text NOT NULL,
	`currency` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `booked_seats` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`seat` text NOT NULL,
	`booking_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `event_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booked_seats_session_seat` ON `booked_seats` (`session_id`,`seat`);--> statement-breakpoint
CREATE INDEX `booked_seats_booking` ON `booked_seats` (`booking_id`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`session_id` text NOT NULL,
	`tier_id` text NOT NULL,
	`qty` integer NOT NULL,
	`currency` text NOT NULL,
	`unit_price_amount` integer NOT NULL,
	`fee_per_ticket_amount` integer NOT NULL,
	`ticket_total_amount` integer NOT NULL,
	`fee_amount` integer NOT NULL,
	`fee_label` text NOT NULL,
	`status` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`promo_json` text,
	`cancelled_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `event_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tier_id`) REFERENCES `ticket_tiers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_user_idem` ON `bookings` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `bookings_event` ON `bookings` (`event_id`);--> statement-breakpoint
CREATE INDEX `bookings_user` ON `bookings` (`user_id`);--> statement-breakpoint
CREATE TABLE `event_audience` (
	`id` text PRIMARY KEY NOT NULL,
	`connected_ids_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_qloo_links` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`qloo_entity_id` text NOT NULL,
	`qloo_type` text NOT NULL,
	`name` text NOT NULL,
	`link_kind` text NOT NULL,
	`match_quality` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`resolved_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_qloo_links_entity` ON `event_qloo_links` (`qloo_entity_id`);--> statement-breakpoint
CREATE INDEX `event_qloo_links_event` ON `event_qloo_links` (`event_id`);--> statement-breakpoint
CREATE TABLE `event_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`is_cancelled` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_sessions_event` ON `event_sessions` (`event_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`organizer_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`venue_name` text NOT NULL,
	`area` text NOT NULL,
	`address` text,
	`city` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`timezone` text NOT NULL,
	`currency` text NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`capacity` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`is_sample` integer DEFAULT false NOT NULL,
	`details_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organizer_id`) REFERENCES `organizers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_city_starts` ON `events` (`city`,`starts_at`);--> statement-breakpoint
CREATE INDEX `events_status` ON `events` (`status`);--> statement-breakpoint
CREATE INDEX `events_organizer` ON `events` (`organizer_id`);--> statement-breakpoint
CREATE TABLE `films` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`qloo_name` text,
	`qloo_id` text,
	`year` integer NOT NULL,
	`language` text NOT NULL,
	`description` text,
	`image_url` text,
	`genres_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text,
	`kind` text NOT NULL,
	`is_simulated` integer DEFAULT false NOT NULL,
	`experiment_id` text,
	`variant_id` text,
	`audience_id` text,
	`selection_probability` real,
	`booking_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `interactions_event_kind` ON `interactions` (`event_id`,`kind`,`is_simulated`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_attempts_email` ON `login_attempts` (`email`,`created_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`href` text,
	`is_read` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notifications_user` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `organizer_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`organizer_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organizer_id`) REFERENCES `organizers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizer_accounts_email_unique` ON `organizer_accounts` (`email`);--> statement-breakpoint
CREATE TABLE `organizer_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `organizer_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `organizers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`city` text NOT NULL,
	`contact_email` text,
	`about` text DEFAULT '' NOT NULL,
	`is_sample` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `promo_experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`organizer_id` text NOT NULL,
	`audience_json` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text,
	`copy_source` text NOT NULL,
	`variants_json` text NOT NULL,
	`real_counts_json` text NOT NULL,
	`sim_counts_json` text NOT NULL,
	`simulation_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `promo_experiments_event` ON `promo_experiments` (`event_id`);--> statement-breakpoint
CREATE TABLE `qloo_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`response_json` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `qloo_cache_expires` ON `qloo_cache` (`expires_at`);--> statement-breakpoint
CREATE TABLE `qloo_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `restaurants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`city` text NOT NULL,
	`area` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`cost_per_person_amount` integer NOT NULL,
	`currency` text NOT NULL,
	`opens` text NOT NULL,
	`closes` text NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`image` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `saved_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_events_user_event` ON `saved_events` (`user_id`,`event_id`);--> statement-breakpoint
CREATE TABLE `saved_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`query` text NOT NULL,
	`city` text NOT NULL,
	`city_name` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `saved_searches_user` ON `saved_searches` (`user_id`);--> statement-breakpoint
CREATE TABLE `ticket_tiers` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`session_id` text NOT NULL,
	`name` text NOT NULL,
	`price_amount` integer NOT NULL,
	`capacity` integer NOT NULL,
	`sold` integer DEFAULT 0 NOT NULL,
	`seed_sold` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `event_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ticket_tiers_session` ON `ticket_tiers` (`session_id`);--> statement-breakpoint
CREATE INDEX `ticket_tiers_event` ON `ticket_tiers` (`event_id`);--> statement-breakpoint
CREATE TABLE `title_labs` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`organizer_id` text NOT NULL,
	`status` text NOT NULL,
	`config_json` text NOT NULL,
	`clusters_json` text NOT NULL,
	`simulation_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `title_labs_event_id_unique` ON `title_labs` (`event_id`);--> statement-breakpoint
CREATE TABLE `title_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`title` text NOT NULL,
	`hook` text NOT NULL,
	`anchor_link_id` text,
	`anchor_json` text NOT NULL,
	`llm_prior` real NOT NULL,
	`priors_json` text NOT NULL,
	`prior_source` text NOT NULL,
	`origin` text NOT NULL,
	`review_json` text NOT NULL,
	`is_approved` integer DEFAULT false NOT NULL,
	`status` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`anchor_link_id`) REFERENCES `event_qloo_links`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `title_variants_event` ON `title_variants` (`event_id`);--> statement-breakpoint
CREATE TABLE `user_anchors` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`qloo_entity_id` text NOT NULL,
	`qloo_type` text NOT NULL,
	`name` text NOT NULL,
	`image_url` text,
	`detail` text,
	`position` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_anchors_user_entity` ON `user_anchors` (`user_id`,`qloo_entity_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`anon_cookie_id` text NOT NULL,
	`display_name` text,
	`home_city` text,
	`home_lat` real,
	`home_lng` real,
	`radius_km` real,
	`prefs_json` text,
	`audience_opt_in` integer DEFAULT false NOT NULL,
	`taste_notes_json` text,
	`taste_skipped` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_anon_cookie_id_unique` ON `users` (`anon_cookie_id`);--> statement-breakpoint
CREATE TABLE `variant_events` (
	`id` text PRIMARY KEY NOT NULL,
	`variant_id` text NOT NULL,
	`user_id` text,
	`cluster_key` text NOT NULL,
	`kind` text NOT NULL,
	`is_simulated` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `title_variants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `variant_events_variant_cluster_kind` ON `variant_events` (`variant_id`,`cluster_key`,`kind`);--> statement-breakpoint
CREATE INDEX `variant_events_created` ON `variant_events` (`is_simulated`,`created_at`);--> statement-breakpoint
CREATE TABLE `wish_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`wish_id` text NOT NULL,
	`event_id` text NOT NULL,
	`organizer_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`wish_id`) REFERENCES `wishes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wish_proposals_wish_event` ON `wish_proposals` (`wish_id`,`event_id`);--> statement-breakpoint
CREATE TABLE `wish_qloo_links` (
	`id` text PRIMARY KEY NOT NULL,
	`wish_id` text NOT NULL,
	`qloo_entity_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`wish_id`) REFERENCES `wishes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wish_qloo_links_wish` ON `wish_qloo_links` (`wish_id`);--> statement-breakpoint
CREATE TABLE `wishes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`raw_text` text DEFAULT '' NOT NULL,
	`genre` text,
	`keywords_json` text DEFAULT '[]' NOT NULL,
	`day_pref` text,
	`budget_amount` integer,
	`currency` text NOT NULL,
	`city` text NOT NULL,
	`city_name` text NOT NULL,
	`area` text,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`radius_km` real NOT NULL,
	`opted_in` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`is_sample` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wishes_city` ON `wishes` (`city`,`opted_in`);--> statement-breakpoint
CREATE INDEX `wishes_user` ON `wishes` (`user_id`);