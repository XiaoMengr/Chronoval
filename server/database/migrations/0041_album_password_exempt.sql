ALTER TABLE `albums` ADD `password_exempt_mode` text;--> statement-breakpoint
ALTER TABLE `albums` ADD `password_exempt_users` text;--> statement-breakpoint
ALTER TABLE `scan_album_meta` ADD `password_exempt_mode` text;--> statement-breakpoint
ALTER TABLE `scan_album_meta` ADD `password_exempt_users` text;
