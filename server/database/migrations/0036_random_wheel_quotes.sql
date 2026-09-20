-- 0036: 「随机照片轮经典语录」扩展功能
-- 新增两个字段：
--   random_quotes_enabled：是否在随机照片轮旋转时轮播经典语录（扩展功能，默认开启；可在相簿编辑「扩展」中关闭）
--   random_quotes：自定义语录文本（每行一条）；空 = 使用内置语录
-- 普通相簿 + 扫描库相簿元数据各加一遍。
ALTER TABLE `albums` ADD `random_quotes_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `albums` ADD `random_quotes` text;--> statement-breakpoint
ALTER TABLE `scan_album_meta` ADD `random_quotes_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `scan_album_meta` ADD `random_quotes` text;