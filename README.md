# Chronoval

> 自托管的个人摄影画廊 —— 基于 Nuxt 4 的轻量全栈单体应用，一个容器同时提供页面与 API。

极简暗色 · 透明 · 高斯模糊（灵感 Afilmory），WebGL 高性能图片查看器（承自 ChronoFrame）。

## 特性

- 照片与视频「本地目录即存储」：直接放进映射目录即自动识别、生成缩略图，**无需后台上传**；原文件只读挂载，绝不加密或改写
- 「本地扫描库」独立存储方式：按文件夹管理外部相册，缩略图就地生成到相册 `thumbnails/` 子目录，与加密上传完全分离、统一首页画廊显示
- 图片查看器：WebGL 高性能缩放平移、Exif 信息面板、底部缩略图画廊
- 分享：生成分享链接 / 嵌入代码 / 原生 Web Share / 一键复制 / 下载原图与 OG 预览图
- 多格式：JPEG / PNG / WebP / GIF / TIFF / HEIC / MOV / MP4，Live Photo 自动配对
- 地图浏览：MapLibre / Mapbox 聚合拍摄位置，反向地理编码识别城市
- 管理后台：相册 / 上传队列 / 实时日志 / 系统监控 / 日历热图

## 快速开始（Docker）

一条命令即可启动前后端：

```bash
# 1. 复制并填写 .env（参考下方「.env 参考」）
cp .env.example .env

# 2. 启动
docker compose up -d --build

# 3. 访问 http://localhost:3000
```

### .env 参考

```bash
# ---- 必填 ----
# 管理员账号（首次启动自动创建）
CFRAME_ADMIN_EMAIL=you@example.com
CFRAME_ADMIN_PASSWORD=your-password

# 会话加密密钥（必填，32 位随机串）
NUXT_SESSION_PASSWORD="$(openssl rand -hex 16)"
# 分享 OG 图签名密钥（可选，用下方命令生成）
# NUXT_OG_IMAGE_SECRET="$(npx nuxt-og-image generate-secret)"

# ---- 站点信息（可选）----
NUXT_PUBLIC_APP_TITLE=Chronoval        # 站点标题
NUXT_PUBLIC_APP_SLOGAN=                # 站点标语
NUXT_PUBLIC_APP_AUTHOR=                # 作者署名（首页页脚）
NUXT_PUBLIC_APP_AVATAR_URL=            # 站点头像 URL
NUXT_PUBLIC_COLOR_MODE_PREFERENCE=dark # 主题：light / dark / system

# ---- 地图（可选，用于浏览拍摄位置）----
NUXT_PUBLIC_MAP_PROVIDER=maplibre      # maplibre(免费) / mapbox
NUXT_PUBLIC_MAP_MAPLIBRE_STYLE=        # MapLibre 样式 URL
NUXT_PUBLIC_MAPBOX_ACCESS_TOKEN=       # Mapbox 前端令牌

# ---- 存储（默认本地文件系统，无需改动）----
NUXT_STORAGE_PROVIDER=local            # local / s3 / openlist
```

### docker-compose.yml

```yaml
services:
  chronoval:
    image: chronoval:latest
    container_name: chronoval
    restart: unless-stopped
    ports:
      - '3000:3000'              # 宿主机端口:容器端口
    environment:
      # 本地文件存储：上传照片落盘位置（prefix=photos/ 即写入宿主 ./data/storage/photos）
      NUXT_STORAGE_PROVIDER: local
      NUXT_PROVIDER_LOCAL_PATH: /app/data/storage
      NUXT_PROVIDER_LOCAL_PREFIX: photos/
      # 媒体库目录：指向 /app/storage 下的两个子目录
      LIBRARY_PHOTOS_PATH: /app/storage/photos
      LIBRARY_VIDEOS_PATH: /app/storage/videos
      LIBRARY_ENABLED: 'true'
    env_file:
      - .env                     # 管理员账号、会话密钥、站点信息等
    volumes:
      - ./data:/app/data                          # ① 数据目录（SQLite + 配置，可写）
      - ./data/storage:/app/storage:ro            # ② 媒体库照片/视频目录（含 photos/ 与 videos/ 子目录）
      - ./data/library:/app/library            # ③ 本地扫描库根（每个子目录 = 一个相册，可写）
```

> **①②③ 三个目录统一在项目 `./data` 下一个备份/迁移**。启动前先在宿主机建好媒体库子目录：`mkdir -p data/storage/photos data/storage/videos`（在 `docker-compose.yml` 所在目录执行）。
>
> **① 数据目录**：SQLite 数据库、上传图片与缩略图、配置。上传经 `NUXT_PROVIDER_LOCAL_PATH=/app/data/storage` + `prefix=photos/` 落盘到宿主 `./data/storage/photos`。
>
> **② 媒体库照片/视频目录**：只读挂载。照片放入 `./data/storage/photos`、视频放入 `./data/storage/videos` 即被自动识别并生成缩略图（默认每 5 分钟扫描，也可后台手动触发），原文件绝不加密或改写。缩略图集中写入可写数据目录。注意：一旦在后台新建并**启用**任何「本地扫描库」，本机制即被忽略，统一改由扫描库接管。
>
> **③ 本地扫描库根**：见下文「本地扫描库」小节，适合按相册管理、需要缩略图跟随相册场景。该目录已挂载为**可写**（rw），缩略图可就地生成。

### 本地扫描库（独立存储方式）

除「后台上传（加密 blob 存储）」和「传统只读媒体库」外，Chronoval 提供第三种独立存储方式：**本地扫描库**。它把普通照片 / 视频按文件夹作为**可配置的引用源**，丢进去即自动扫描、自动生成缩略图，且与加密上传**完全分离**（数据库用 `source: 'library'` 区分，绝不混入上传 blob）。

#### 概念

- 每个扫描库 = 一个容器内绝对路径（相册），在「管理后台 → 存储设置 → 本地扫描库」中添加，可单独开关、配置轮询间隔、手动触发扫描。
- 原图**只读引用**该目录（不加密、不改写），缩略图**就地生成**到该相册目录下的 `thumbnails/` 子目录，随相册一起管理。
- 所有扫描库照片与上传照片**统一出现在首页画廊**（`/api/photos` 返回全部 `photos`，不做来源隔离）。
- 一条扫描库都不启用时，才回退到传统的 `/app/photos`、`/app/videos` 环境变量目录。

#### 推荐挂载

```yaml
volumes:
  - ./data:/app/data                        # SQLite + 上传 blob（保持原样，独立）
  - ./data/storage:/app/storage:ro          # 媒体库照片/视频（含 photos/ 与 videos/ 子目录）
  - ./data/library:/app/library            # 外部引用库根：一层目录一个相册
```

> 缩略图就地生成要求外部库目录**可写**，本目录已挂载为 `rw`（区别于只读媒体库的 `ro`），缩略图就地写入相册 `thumbnails/`。

#### 使用步骤

1. 在宿主机按相册建目录，如 `./data/library/家庭相册`、`./data/library/旅行视频`（相对项目根），放入照片 / 视频。
2. 进入「管理后台 → 存储设置 → 本地扫描库」，点「添加扫描库」。
3. 根路径填**容器内**绝对路径，例如 `/app/library/家庭相册`（不是宿主机路径）。名称留空则自动取文件夹名。
4. 保存后点该行的「扫描」立即触发，或等自动轮询（间隔可在表单里配置，默认 60 秒）。
5. 缩略图自动生成在 `/app/library/家庭相册/thumbnails/`，照片出现在首页画廊。

#### 要点

- **填容器内路径，不是宿主机路径**：宿主 `./data/library` 可见，容器内是 `/app/library`。
- 新增相册无需改 compose / 无需重启：外部库下一层子目录 + 界面加一条即可。
- 相册目录被扫描时，`thumbnails/`、隐藏目录会自动跳过，不会被当原图重复入索引。
- 删除扫描库照片只删缩略图与数据库记录，**不删外部原文件**。删除整个扫描库会一并清理其索引记录。
- 容器需对挂载目录有读写权限，NAS / 外部盘注意 uid / gid。

### 应用数据目录（单目录映射）

所有数据持久化在宿主机项目根 `./data`，备份 / 迁移只需复制这一个目录：

```
data/
├── app.sqlite3              # SQLite 数据库（元数据、相册、设置、账号）
├── storage/                 # 媒体库照片/视频（只读挂载到 /app/storage）
│   ├── photos/              # 图片（LIBRARY_PHOTOS_PATH=/app/storage/photos），上传也落盘于此
│   └── videos/              # 视频（LIBRARY_VIDEOS_PATH=/app/storage/videos）
└── library/                 # 本地扫描库根（挂载到 /app/library，每个子目录=一个相册）
```

## 文档导航

| 主题 | 链接 |
|---|---|
| 部署与目录映射 | [docs/deployment.md](docs/deployment.md) |
| 全部环境变量参考 | [docs/configuration.md](docs/configuration.md) |
| 本地开发与项目结构 | [docs/development/quickstart.md](docs/development/quickstart.md) |
| 用户指南（安装/升级） | [docs/guide/getting-started.md](docs/guide/getting-started.md) |
| 完整文档站 | [docs/index.md](docs/index.md) |

> 镜像通过内置 Gitea Actions 自动构建推送至内网注册表：`172.16.0.1:322/xiaomengr/chronoval:latest`（`docker pull` 即可获取）。

## 许可证

[MIT](LICENSE)

> 本项目基于 [ChronoFrame](https://github.com/HoshinoSuzumi/chronoframe)（MIT）定制改造，视觉与部分交互参考 [Afilmory](https://github.com/Afilmory/Afilmory)。致谢原作者。