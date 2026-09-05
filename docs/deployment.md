# 部署指南

Chronoval 为**全栈单体**：前端页面与后端 API 由同一个 Nitro 服务托管，因此一个 Docker 容器即可完成部署。本页覆盖标准部署、**只读媒体库目录映射**，以及通过 Gitea Actions 自动构建镜像三种场景。

## 目录结构（理解映射关系）

| 宿主机路径 | 容器路径 | 用途 | 读写 |
| ---------- | -------- | ---- | ---- |
| `./data` | `/app/data` | SQLite 数据库、上传照片原图、缩略图、日志 | 读写（持久化） |
| `./data/storage` | `/app/storage` | **只读媒体库**，其下 `photos/`（图片）与 `videos/`（视频）放入即被自动识别 | 只读 |
| `./data/library` | `/app/library` | **本地扫描库**（分散相册，按容器内路径添加） | 读写 |

> **本地目录即存储**：照片/视频目录是**只读映射**，你只要把文件放进 `/app/storage/photos`、`/app/storage/videos`，应用启动或定时扫描就会自动识别、生成缩略图并展示。**原文件绝不加密、绝不改写、绝不搬移**，始终留在你的目录里；也不需要通过后台上传。这就是"本地存储"式的用法，和 chronoframe 那种"必须上传才会被加密识别"的做法完全不同。

## 方式一：docker compose 一键启动（推荐）

`docker-compose.yml` 默认把宿主机的 `/data/photos`、`/data/videos` 挂到容器内只读目录。首次使用前先创建这两个目录：

```bash
cp .env.example .env
# 编辑 .env：至少设置管理员邮箱/密码 与 NUXT_SESSION_PASSWORD

# 1. 创建媒体库目录（与 compose 卷映射对应）
mkdir -p data/storage/photos data/storage/videos

# 2. 直接把你已有的照片 / 视频复制进去（放进即识别，无需后台上传）
cp ~/photos/*.jpg data/storage/photos/
cp ~/videos/*.mp4 data/storage/videos/

docker compose up -d --build
```

- 服务端口：`3000:3000`（改端口只改 `ports` 左侧即可）
- 本地存储路径、媒体库目录等默认值已固化在镜像内（见 `Dockerfile ENV`），无需在 compose 中重复配置，需要时再在 `.env` 覆盖
- 首次启动会自动扫描 `/app/storage/photos`、`/app/storage/videos` 并生成缩略图（间隔默认 5 分钟，可用 `LIBRARY_SCAN_INTERVAL_MS` 调整）

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
docker compose pull          # 若使用预构建镜像
docker compose up -d --build # 若从源码构建
```

## 方式二：预构建镜像

工作流构建后会推送到 Gitea 内置容器注册表（内网地址），可直接拉取运行：

```bash
docker run -d --name chronoval -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v /data/media:/app/storage:ro \
  --env-file .env \
  172.16.0.1:322/xiaomengr/chronoval:latest
```

> 注册表为内网 HTTP 地址，部署机需将 `172.16.0.1:322` 加入 Docker 的 `insecure-registries` 才能拉取。完整镜像地址（用户级命名空间）为 `172.16.0.1:322/xiaomengr/chronoval:latest`。镜像归属你的用户（owner）命名空间，可在 Gitea 右上角头像 → 你的用户名 → 「软件包」中查看；Gitea 容器镜像不支持绑定到仓库命名空间。

## 通过 Gitea Actions 自动构建镜像

仓库已内置 `.gitea/workflows/docker-build.yml`，触发时机：

- 推送 `main` 分支（生成 `latest` 标签）
- 推送 `v*` 标签
- 手动触发（Actions → Run workflow）

### 前置要求

1. **启用 Gitea Actions**：在 Gitea 管理台开启 Actions，并注册 Runner（推荐 `act_runner`，`DOCKER_MODE` 为 docker）。
2. **内网连通**：Runner 需能访问内网地址 `172.16.0.1:322`（Gitea 服务与 Container 注册表）。
3. **容器注册表**：Gitea 需开启 Package 注册表，用户/组织有推送权限。
4. **Token 权限**：工作流使用 `secrets.GITHUB_TOKEN` 推送镜像并上传离线资源；需具备 **write:package + write contents** 权限。

### 离线资源（版本下载）

为保证内网/离线环境构建可用，工作流会把**离线构建资源压缩包**作为 Release 附件上传到仓库的**版本下载**里：

- Release 标签：`build-offline-assets`
- 附件：`chronoval-src.tar.gz`（源码快照，供离线构建）
- 后续构建可优先从该 Release 附件下载，避免依赖外网源

### 可选 Secrets

| Secret | 默认值 | 说明 |
| ------ | ------ | ---- |
| `GITEA_SERVER_URL` | `http://172.16.0.1:322` | 内网 Gitea 地址/注册表地址 |
| `GITEA_OWNER` | 仓库 owner | 镜像/Release 归属 |
| `GITEA_API_TOKEN` | 用 `GITHUB_TOKEN` | 上传 Release 附件的 API Token |

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