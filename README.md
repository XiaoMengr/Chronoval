# Chronoval

> 自托管的个人摄影画廊 —— 基于 Nuxt 4 的轻量全栈单体应用，一个容器同时提供页面与 API。

极简暗色 · 透明 · 高斯模糊（灵感 Afilmory），WebGL 高性能图片查看器（承自 ChronoFrame）。支持照片与视频目录直接挂载、EXIF 解析、地图浏览、Live Photo、分享、多语言。

## 快速开始（Docker）

推荐 Docker 部署，一条命令即可启动前后端：

```bash
# 1. 复制并填写环境变量模板
cp .env.example .env

# 2. 编辑 .env，至少设置：
#    - CFRAME_ADMIN_EMAIL、CFRAME_ADMIN_PASSWORD  管理员账号
#    - NUXT_SESSION_PASSWORD（32 位随机串）会话密钥
NUXT_SESSION_PASSWORD="$(openssl rand -hex 16)"

# 3. 启动（首次自动构建镜像）
docker compose up -d --build

# （可选）把照片 / 视频直接放进映射目录，应用自动识别，无需后台上传
mkdir -p /data/photos /data/videos
cp ~/photos/*.jpg /data/photos/
cp ~/videos/*.mp4 /data/videos/

# 4. 访问
# 打开 http://localhost:3000
```

### 应用数据目录（单目录映射）

所有数据持久化在宿主机 **`./data`**，备份/迁移只需复制这一个目录：

```
data/
├── app.sqlite3        # SQLite 数据库（元数据、相册、设置、账号）
└── storage/           # 上传照片原图与缩略图（local 存储时）
```

### 只读媒体库目录（本地目录即存储，放入即识别）

`docker-compose.yml` 默认把宿主机 `/data/photos`、`/data/videos` 只读挂载到容器内：

- 照片/视频直接放入即自动识别，生成缩略图并展示，**无需后台上传**（默认每 5 分钟扫描一次，可在管理后台手动触发）
- **原文件只读挂载，绝不加密、改写或搬移**；缩略图写入可写数据目录
- 视频用 ffmpeg 抽帧缩略图，并支持查看器内直接播放
- 想换宿主机目录，改 volumes 左侧即可：

```yaml
volumes:
  - ./data:/app/data
  - /data/photos:/app/photos:ro   # ← 换成你的照片目录
  - /data/videos:/app/videos:ro   # ← 换成你的视频目录（独立文件夹）
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