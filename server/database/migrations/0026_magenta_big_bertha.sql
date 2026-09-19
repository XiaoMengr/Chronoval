ALTER TABLE `albums` ADD `uid` text;--> statement-breakpoint
ALTER TABLE `albums` ADD `slug` text;--> statement-breakpoint
CREATE UNIQUE INDEX `albums_uid_unique` ON `albums` (`uid`);--> statement-breakpoint
CREATE UNIQUE INDEX `albums_slug_unique` ON `albums` (`slug`);