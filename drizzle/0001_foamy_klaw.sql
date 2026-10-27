CREATE TABLE `calendar_connections` (
	`room` text PRIMARY KEY NOT NULL,
	`tokens` text NOT NULL,
	`calendar` text NOT NULL,
	`day` text NOT NULL,
	`entries` text DEFAULT '{}' NOT NULL,
	`synced` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`retry` integer DEFAULT 0 NOT NULL,
	`lock` text DEFAULT '' NOT NULL,
	`lease` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calendar_oauth` (
	`state` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`verifier` text NOT NULL,
	`day` text NOT NULL,
	`expires` integer NOT NULL
);
