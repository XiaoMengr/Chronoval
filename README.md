# Chronoval

> 自托管的个人摄影画廊 —— 基于 Nuxt 4 的轻量全栈单体应用，一个容器同时提供页面与 API。

极简暗色 · 透明 · 高斯模糊（灵感 Afilmory），WebGL 高性能图片查看器（承自 ChronoFrame）。

## 特性

- 照片与视频「本地目录即存储」：直接放进映射目录即自动识别、生成缩略图，**无需后台上传**；原文件只读挂载，绝不加密或改写
- 图片查看器：WebGL 高性能缩放平移、Exif 信息面板、底部缩略图画廊
- 分享：生成分享链接 / 嵌入代码 / 原生 Web Share / 一键复制 / 下载原图与 OG 预览图
- 多格式：JPEG / PNG / WebP / GIF / TIFF / HEIC / MOV / MP4，Live Photo 自动配对
- 地图浏览：MapLibre / Mapbox 聚合拍摄位置，反向地理编码识别城市
- 管理后台：相册 / 上传队列 / 实时日志 / 系统监控 / 日历热图

## 快速开始（Docker）

一条命令即可启动前后端：

```bash
# 1. 复制并填写 .env（必填项见下）
cp .env.example .env

# 2. 启动
docker compose up -d --build

# 3. 访问 http://localhost:3000
```

### .env 必填项

```bash
# 管理员账号（首次启动自动创建）
CFRAME_ADMIN_EMAIL=you@example.com
CFRAME_ADMIN_PASSWORD=your-password

# 会话密钥（32 位随机串，必填）
NUXT_SESSION_PASSWORD="$(openssl rand -hex 16)"
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
    env_file:
      - .env                     # 管理员账号、会话密钥、站点信息等
    volumes:
      - ./data:/app/data                                   # 数据目录（SQLite + 上传照片/缩略图）
      - /data/photos:/app/photos:ro   # ← 换成你的照片目录
      - /data/videos:/app/videos:ro   # ← 换成你的视频目录（独立文件夹）
```

> 只读媒体库目录：照片 / 视频直接放入即自动识别（默认每 5 分钟扫描，也可后台手动触发），原文件只读挂载、绝不加密或改写，缩略图写入可写数据目录。视频用 ffmpeg 抽帧缩略图并支持直接播放。

### 应用数据目录（单目录映射）

所有数据持久化在宿主机 `./data`，备份 / 迁移只需复制这一个目录：

```
data/
├── app.sqlite3        # SQLite 数据库（元数据、相册、设置、账号）
└── storage/           # 上传照片原图与缩略图（local 存储时）
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