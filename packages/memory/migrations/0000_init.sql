CREATE TABLE `events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`version` integer PRIMARY KEY NOT NULL,
	`state` text NOT NULL
);
