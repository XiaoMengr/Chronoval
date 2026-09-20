-- 清理既有重复：同一 (album_id, photo_id) 只保留 id 最小的一行。
-- 该表此前缺少唯一约束，历史数据可能已产生重复行；若不清除，下面的唯一索引会创建失败。
DELETE FROM `album_photos`
WHERE `id` NOT IN (
  SELECT MIN(`id`)
  FROM `album_photos`
  GROUP BY `album_id`, `photo_id`
);--> statement-breakpoint
CREATE UNIQUE INDEX `album_photos_album_photo_unique` ON `album_photos` (`album_id`,`photo_id`);