CREATE TABLE `fotos` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`staff_id` text NOT NULL,
	`tipo` text NOT NULL,
	`data` text NOT NULL,
	`created` integer NOT NULL
);
