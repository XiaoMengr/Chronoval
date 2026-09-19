ALTER TABLE `scan_album_meta` ADD `url_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `scan_album_meta_url_key_unique` ON `scan_album_meta` (`url_key`);