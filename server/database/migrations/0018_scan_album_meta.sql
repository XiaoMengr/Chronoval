CREATE TABLE `scan_album_meta` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mount` text NOT NULL,
	`rel_path` text DEFAULT '' NOT NULL,
	`title` text,
	`description` text,
	`cover_photo_id` text,
	`is_hidden` integer DEFAULT false NOT NULL,
	`slug` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`cover_photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scan_album_meta_mount_relpath_unique` ON `scan_album_meta` (`mount`,`rel_path`);--> statement-breakpoint
CREATE UNIQUE INDEX `scan_album_meta_slug_unique` ON `scan_album_meta` (`slug`);