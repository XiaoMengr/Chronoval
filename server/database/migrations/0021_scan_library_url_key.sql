ALTER TABLE `scan_libraries` ADD `url_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `scan_libraries_url_key_unique` ON `scan_libraries` (`url_key`);