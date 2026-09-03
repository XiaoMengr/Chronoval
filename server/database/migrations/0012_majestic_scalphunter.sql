ALTER TABLE `photos` ADD `type` text DEFAULT 'image' NOT NULL;--> statement-breakpoint
ALTER TABLE `photos` ADD `source` text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE `photos` ADD `library_mount` text;--> statement-breakpoint
ALTER TABLE `photos` ADD `library_path` text;