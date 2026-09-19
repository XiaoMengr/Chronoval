CREATE TABLE `login_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`email` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`method` text DEFAULT 'password' NOT NULL,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_login_logs_user_created` ON `login_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_login_logs_email_created` ON `login_logs` (`email`,`created_at`);