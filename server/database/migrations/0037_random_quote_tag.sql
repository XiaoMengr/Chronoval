-- 0037: 「随机照片轮经典语录」标签来源
-- 新增 random_quotes_tag：选择语录标签（ancient=古诗语录 / modern=现代语录）；
-- null=未选（此时若自定义语录也为空则旋转时不再显示语录）。
-- 普通相簿 + 扫描库相簿元数据各加一遍。
ALTER TABLE `albums` ADD `random_quotes_tag` text;--> statement-breakpoint
ALTER TABLE `scan_album_meta` ADD `random_quotes_tag` text;