CREATE TABLE `summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`scope` text NOT NULL,
	`text` text NOT NULL,
	`importance` integer NOT NULL,
	`salience` real NOT NULL,
	`created_at` integer NOT NULL,
	`event_seq_from` integer NOT NULL,
	`event_seq_to` integer NOT NULL
);
