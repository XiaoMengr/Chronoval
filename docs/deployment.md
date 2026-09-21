# 部署指南

Chronoval 为**全栈单体**：前端页面与后端 API 由同一个 Nitro 服务托管，因此一个 Docker 容器即可完成部署。本页覆盖标准部署、**只读媒体库目录映射**，以及通过 GitHub Actions 自动构建镜像三种场景。

## 目录结构（理解映射关系）

| 宿主机路径 | 容器路径 | 用途 | 读写 |
| ---------- | -------- | ---- | ---- |
| `./data` | `/app/data` | SQLite 数据库、上传照片原图、缩略图、日志 | 读写（持久化） |
| `./data/storage` | `/app/storage` | **只读媒体库**，其下 `photos/`（图片）与 `videos/`（视频）放入即被自动识别 | 只读 |
| `./data/library` | `/app/library` | **本地扫描库**（分散相册，按容器内路径添加） | 读写 |

> **本地目录即存储**：照片/视频目录是**只读映射**，你只要把文件放进 `/app/storage/photos`、`/app/storage/videos`，应用启动或定时扫描就会自动识别、生成缩略图并展示。**原文件绝不加密、绝不改写、绝不搬移**，始终留在你的目录里；也不需要通过后台上传。这就是"本地存储"式的用法，和 chronoframe 那种"必须上传才会被加密识别"的做法完全不同。

## 方式一：docker compose 一键启动（推荐，默认拉取已构建镜像）

拿现成镜像，直拉即用，无需编译：
`docker-compose.yml` 默认使用 GHCR 已构建镜像 `ghcr.io/xiaomengr/chronoval:latest`（`docker compose up -d` 会自动拉取）。首次使用前先创建媒体库目录：

```bash
cp .env.example .env
# .env 默认不填也可正常完成首次安装：
#   - 管理员邮箱/密码：在打开网页后的【首次运行引导向导】里填写即可
#   - NUXT_SESSION_PASSWORD：未设置时应用首次启动会自动生成随机密钥，
#     并持久化到 ./data/.session-password，之后启动复用，无需手动 openssl
#   仅当需要高级覆盖（S3 存储 / 地图 / 主题 / 固定会话密钥等）时才编辑 .env

# 1. 创建媒体库目录（与 compose 卷映射对应）
mkdir -p data/storage/photos data/storage/videos

# 2. 直接把你已有的照片 / 视频复制进去（放进即识别，无需后台上传）
cp ~/photos/*.jpg data/storage/photos/
cp ~/videos/*.mp4 data/storage/videos/

# 3. 启动：默认从 GHCR 拉取已构建镜像（首次会自动 pull latest）
docker compose up -d
```

- 服务端口：`3000:3000`（改端口只改 `ports` 左侧即可）
- 镜像来源：`ghcr.io/xiaomengr/chronoval:latest`（由 GitHub Actions 自动构建推送；可改 tag 固定到某版本，如 `1.0.0.4`）
- 本地存储路径、媒体库目录等默认值已固化在镜像内（见 `Dockerfile ENV`），无需在 compose 中重复配置，需要时再在 `.env` 覆盖
- 首次启动会自动扫描 `/app/storage/photos`、`/app/storage/videos` 并生成缩略图（间隔默认 5 分钟，可用 `LIBRARY_SCAN_INTERVAL_MS` 调整）

> 从源码本地构建只是**可选**：想自己编译时改用 `docker compose up -d --build`（会用仓库内 Dockerfile 构建本地镜像）。日常上线直接用上面的远程拉取即可。

### 使用自定义目录映射

若要挂任意宿主机路径，把 docker-compose 的 volumes 改为你的绝对路径即可：

```yaml
volumes:
  - ./data:/app/data
  - /data/media:/app/storage:ro   # ← 换成你的媒体根目录，其下需含 photos/ 与 videos/ 子目录
  - ./data/library:/app/library
```

> 视频目录与图片目录同属 `/app/storage` 挂载点下的 `videos/`、`photos/` 两个子目录。若目录内既有照片又有视频，也都能被识别：普通图片走图片流程，视频用 ffmpeg 抽帧生成缩略图并支持在查看器中播放。

### 升级

```bash
docker compose pull          # 拉取最新镜像（默认远程镜像，无需 --build）
docker compose up -d
# 只有从源码本地构建时才用：docker compose up -d --build
```

## 方式二：预构建镜像

工作流构建后会推送镜像到 GitHub 容器镜像仓库（GHCR），可直接拉取运行：

```bash
docker run -d --name chronoval -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v /data/media:/app/storage:ro \
  --env-file .env \
  ghcr.io/xiaomengr/chronoval:latest
```

> 镜像是 HTTPS 的 GHCR 地址，无需配置 `insecure-registries`。若镜像未设为公开，需先 `docker login ghcr.io --username XiaoMengr` 并按提示输入 GitHub 访问令牌（PAT，权限 `read:packages`）。

## 通过 GitHub Actions 自动构建镜像

仓库已内置 `.github/workflows/publish-images.yml`，触发时机：

- 推送 `v*` 标签（生成对应版本镜像与 GitHub Release 草稿）
- 仅推送到 GHCR（多架构 `linux/amd64`, `linux/arm64`）

### 前置要求

1. **GHCR**：使用 Actions 内置的 `GITHUB_TOKEN`（`packages: write`）即可推送，无需额外配置。

### 触发发布

打一个 `v*` 标签即可触发完整构建并生成镜像与 Release：

```bash
git tag v1.0.0
git push github v1.0.0
```

> 在 GitHub → Actions → 对应运行记录中可看到 `ghcr.io/xiaomengr/chronoval:<tag>` 的推送结果；已推送的镜像可在 GitHub → 你的头像 → 你的仓库包（Packages）查看。注意镜像版本 tag 是去掉 `v` 前缀的（如 `v1.0.0.4` 标签对应镜像 `ghcr.io/xiaomengr/chronoval:1.0.0.4`）。

## 数据备份

因为采用单目录映射，备份只需：

```bash
tar -czf chronoval-backup-$(date +%F).tar.gz ./data
```

恢复：在目标机解压后重启容器即可（照片/视频目录可另行备份，不在应用数据目录内）。

## 常见部署问题

- **为什么端口访问后一直在加载？** 首次启动会执行数据库迁移并创建模型，稍等片刻；确保 `NUXT_SESSION_PASSWORD` 已设置。
- **我把照片放进目录了但没显示？** 默认扫描间隔 5 分钟；可在 Dashboard 手动触发扫描，或把 `LIBRARY_SCAN_INTERVAL_MS` 调小。
- **视频没有缩略图？** 确认镜像包含 ffmpeg（本仓库 Dockerfile 已内置），且视频格式受支持（mp4/mov/m4v/mkv/webm 等）。
- **地图不显示？** 需配置 MapLibre/Mapbox 令牌；中国大陆网络可配置 `NUXT_NOMINATIM_BASE_URL` 为可用代理。
- **上传照片报错？** 检查存储配置：本地存储需确认 `./data/storage` 可写；S3 需校验密钥与桶权限；同时可在后台 → 设置 → 系统 调整重复文件检测策略。