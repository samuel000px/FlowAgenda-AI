CREATE TABLE `whatsapp_connections` (
	`room` text PRIMARY KEY NOT NULL,
	`phone_id` text NOT NULL,
	`secrets` text NOT NULL,
	`settings` text NOT NULL,
	`verified` integer DEFAULT 0 NOT NULL,
	`webhook_verified` integer DEFAULT 0 NOT NULL,
	`received` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_connections_phone_id_unique` ON `whatsapp_connections` (`phone_id`);