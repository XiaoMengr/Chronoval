CREATE TABLE `scan_libraries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`root_path` text NOT NULL,
	`provider` text DEFAULT 'local' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`watch_interval_ms` integer DEFAULT 60000 NOT NULL,
	`last_scan_at` integer,
	`last_scan_result` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
