CREATE TABLE `reflection_cursor` (
	`id` integer PRIMARY KEY NOT NULL,
	`reflected_through_seq` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `reflection_cursor` (`id`, `reflected_through_seq`) VALUES (0, 0);
