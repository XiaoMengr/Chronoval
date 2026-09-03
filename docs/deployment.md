# 部署指南

Chronoval 为**全栈单体**：前端页面与后端 API 由同一个 Nitro 服务托管，因此一个 Docker 容器即可完成部署。本页覆盖标准部署与通过 Gitea Actions 自动构建镜像两种方式。

## 方式一：docker compose 一键启动（推荐）

```bash
cp .env.example .env
# 编辑 .env：至少设置管理员邮箱/密码 与 NUXT_SESSION_PASSWORD

docker compose up -d --build
```

- 服务端口：`3000:3000`（改端口只改 `ports` 左侧即可）
- 数据目录：宿主机 `./data` → 容器 `/app/data`（**单目录映射**，含 SQLite 数据库与照片）
- 应用在容器内使用本地存储的路径为 `NUXT_PROVIDER_LOCAL_PATH=/app/data/storage`

### 升级

```bash
docker compose pull          # 若使用预构建镜像
docker compose up -d --build # 若从源码构建
```

## 方式二：预构建镜像

工作流构建后会推送到 Gitea 内置容器注册表，可直接拉取运行：

```bash
docker run -d --name chronoval -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  <your-gitea-host>/<owner>/chronoval:latest
```

## 通过 Gitea Actions 自动构建镜像

仓库已内置 `.gitea/workflows/docker-build.yml`，触发时机：

- 推送 `main` 分支（生成 `latest` 标签）
- 推送 `v*` 标签
- 手动触发（Actions → Run workflow）

### 前置要求

1. **启用 Gitea Actions**：在 Gitea 管理台开启 Actions，并注册 Runner（推荐 `act_runner`，`DOCKER_MODE` 为 docker）。
2. **启用容器注册表**：Gitea 需开启 Package 注册表，并确保当前用户/组织有推送权限。
3. **Token 权限**：工作流使用 `secrets.GITHUB_TOKEN` 推送镜像；需为仓库/用户生成带 **write:package** 权限的 Token 并配置为 `GITHUB_TOKEN`（Gitea Actions 默认提供，必要时在仓库 Secrets 中覆盖）。

### 工作流说明

- 使用 `docker/metadata-action` 自动生成 `latest`、分支名、`sha-*`、`v*` 等标签。
- 使用 Buildx 多架构缓存（`type=gha`，需 Runner 支持 Docker）。
- 镜像地址自动解析为：`<gitea server_url>/<owner>/<repo>`。

构建产物 Dockerfile 为多阶段构建（依赖 → 构建 → scratch 运行时），精简且自带 `exiftool`、`perl` 运行时依赖，镜像体积小、可直接运行。

## 数据备份

因为采用单目录映射，备份只需：

```bash
tar -czf chronoval-backup-$(date +%F).tar.gz ./data
```

恢复：在目标机解压后重启容器即可。

## 常见部署问题

- **为什么端口访问后一直在加载？** 首次启动会执行数据库迁移并创建模型，稍等片刻；确保 `NUXT_SESSION_PASSWORD` 已设置。
- **地图不显示？** 需配置 MapLibre/Mapbox 令牌；中国大陆网络可配置 `NUXT_NOMINATIM_BASE_URL` 为可用代理。
- **上传照片报错？** 检查存储配置：本地存储需确认 `./data/storage` 可写；S3 需校验密钥与桶权限；同时可在后台 → 设置 → 系统 调整重复文件检测策略。