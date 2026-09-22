-- 0038: 音乐盒（BGM）
-- 新增 music 表：存储后台上传的背景音乐元数据（音频文件存在存储后端）。
-- albums.scan_album_meta 各自增加 bgm_music_id，用于把 BGM 绑定到普通相簿/扫描库相簿。
CREATE TABLE `music` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`filename` text NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text DEFAULT 'audio/mpeg' NOT NULL,
	`duration` real,
	`file_size` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `music_storage_key_unique` ON `music` (`storage_key`);--> statement-breakpoint
ALTER TABLE `albums` ADD `bgm_music_id` integer REFERENCES music(id);--> statement-breakpoint
ALTER TABLE `scan_album_meta` ADD `bgm_music_id` integer REFERENCES music(id);