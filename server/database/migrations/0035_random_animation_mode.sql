-- 0035: 「随机照片盒动画」三态模式（default/wheel/compat）
-- 旧版本只有布尔开关 random_wheel_animation（迁移 0034 引入）。这里新增三态文本列
-- random_animation，并回填：原先开启轮盘的相簿 → 'wheel'，其余保持 'default'。
ALTER TABLE `albums` ADD `random_animation` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
UPDATE `albums` SET `random_animation` = 'wheel' WHERE `random_wheel_animation` = 1;--> statement-breakpoint
ALTER TABLE `scan_album_meta` ADD `random_animation` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
UPDATE `scan_album_meta` SET `random_animation` = 'wheel' WHERE `random_wheel_animation` = 1;