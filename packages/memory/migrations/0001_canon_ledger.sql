CREATE TABLE `canon_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`predicate` text NOT NULL,
	`object` text NOT NULL,
	`event_seq` integer NOT NULL,
	`status` text NOT NULL
);
