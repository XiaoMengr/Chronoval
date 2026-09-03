# Chronoval

> 自托管的个人摄影画廊 —— 基于 Nuxt 4 的轻量全栈应用。

丝滑的照片展示与管理系统，支持多种图片格式、EXIF 元数据解析、地图浏览、Live Photo 等能力。视觉风格为**极简暗色 + 透明 + 高斯模糊**（灵感来自 Afilmory），图片查看器采用 WebGL 高性能渲染（承自 ChronoFrame）。

## 特性

### 图片管理
- 在线浏览与上传：拖拽 / 批量 / 断点续传，上传队列可视化
- 智能 EXIF 解析：自动提取拍摄时间、相机参数、地理位置
- 位置识别：基于 Nominatim 的反向地理编码，自动识别拍摄城市/地点
- 多格式支持：JPEG / PNG / WebP / GIF / BMP / TIFF / HEIC / HEIF / MOV / MP4
- Live Photo：iOS 实况照片自动配对与视频动态预览
- 智能缩略图：基于 ThumbHash 的高效占位 + 纹理渐进加载
- 照片反应与相册：收藏/心情标记，多相册组织

### 浏览体验
- 首页「Afilmory 风格」：固定玻璃顶栏（渐变模糊遮罩）+ 极简瀑布流，卡片悬停渐显信息层
- 图片查看器（ChronoFrame 风格）：WebGL 高性能缩放平移，EXIF 信息面板，底部缩略图画廊
- 分享（Afilmory 风格）：生成分享链接 / 嵌入代码 / 原生 Web Share / 一键复制 / 下载原图与 OG 预览图
- 地图视图：在 Mapbox / MapLibre 上聚合展示拍摄位置，时间线动画与参数分析
- 筛选与排序：按标签 / 相机 / 镜头 / 城市 / 评分过滤

### 后台与运维
- 管理后台：照片 / 相册 / 上传队列 / 实时日志 / 系统监控 / 日历热图
- 引导式初始化：6 步向导完成管理员、站点、存储、地图配置
- 多语言：中简 / 中繁 / 英文 / 日文 / 俄文

## 技术栈

| 领域 | 技术 |
|---|---|
| 框架 | Nuxt 4 · Vue 3 · TypeScript |
| UI | Nuxt UI · TailwindCSS · Motion (Framer Motion) |
| 数据库 | SQLite (better-sqlite3) · Drizzle ORM |
| 状态 | Pinia |
| 存储 | 本地文件 / S3 兼容 / OpenList |
| 图片 | Sharp · ThumbHash · WebGL 查看器（自研组件） |
| 部署 | Docker（多阶段构建 + scratch 运行时） |

## 快速开始（Docker）

推荐使用 Docker 部署，一条命令即可启动前后端（本应用为全栈单体，一个容器同时提供页面与 API）。

```bash
# 1. 复制环境变量模板并填写
cp .env.example .env

# 2. 编辑 .env，至少设置：
#    - CFRAME_ADMIN_EMAIL、CFRAME_ADMIN_PASSWORD  管理员账号
#    - NUXT_SESSION_PASSWORD（32 位随机串）会话密钥
NUXT_SESSION_PASSWORD="$(openssl rand -hex 16)"

# 3. 启动（首次会自动构建镜像）
docker compose up -d --build

# 4. 访问
# 打开 http://localhost:3000
```

### 数据目录（单目录映射）

所有数据均持久化在宿主机 **`./data`** 目录中，备份/迁移只需复制这一个目录：

```
data/
├── app.sqlite3        # SQLite 数据库（照片元数据、相册、设置、账号）
└── storage/           # 本地存储的照片原图与缩略图（使用 local 存储时）
```

> 默认本地存储路径在容器内为 `/app/data/storage`，与 `./data` 卷一一对应。

## 配置

完整环境变量参考见 [docs/configuration.md](docs/configuration.md) 与 `.env.example`。

关键项：

| 环境变量 | 说明 | 默认 |
|---|---|---|
| `CFRAME_ADMIN_EMAIL` | 管理员邮箱（必填） | - |
| `CFRAME_ADMIN_PASSWORD` | 管理员密码 | `CF1234@!` |
| `NUXT_SESSION_PASSWORD` | 会话加密密钥（必填，32 位） | - |
| `NUXT_PUBLIC_APP_TITLE` | 站点标题 | `Chronoval` |
| `NUXT_STORAGE_PROVIDER` | 存储方案 `local`/`s3`/`openlist` | `local` |
| `NUXT_PROVIDER_LOCAL_PATH` | 本地存储路径 | `./data/storage` |
| `NUXT_PUBLIC_MAP_PROVIDER` | 地图 `maplibre`/`mapbox` | `maplibre` |

## 本地开发

```bash
# 环境要求：Node.js 20+ · pnpm 9+
pnpm install
cp .env.example .env   # 按需配置

# 构建内部 WebGL 依赖包
pnpm build:deps

# 开发模式
pnpm dev

# 生产构建 / 预览
pnpm build
pnpm preview

# 数据库迁移
pnpm db:generate && pnpm db:migrate
```

### 项目结构

```
chronoval/
├── app/                  # Nuxt 前端
│   ├── components/       # 组件（ui/ photo/ masonry/ map/ ...）
│   ├── layouts/          # 布局（masonry/ dashboard/ onboarding）
│   ├── pages/            # 页面路由
│   ├── composables/      # 组合式函数
│   └── stores/           # Pinia 状态
├── server/               # 后端（Nitro API + 服务）
│   ├── api/              # API 路由
│   ├── database/         # Drizzle schema 与迁移
│   ├── services/         # 图片/存储/EXIF/队列 等业务服务
│   └── routes/           # 图片/缩略图/存储代理路由
├── packages/webgl-image/ # WebGL 图片查看器（独立构建）
├── i18n/                 # 国际化
├── shared/               # 共享类型与工具
├── Dockerfile            # 多阶段 Docker 构建
├── docker-compose.yml    # 一键启动
└── .gitea/workflows/     # Gitea Actions：自动构建 Docker 镜像
```

## 通过 Gitea 自动构建 Docker 镜像

仓库已内置 Gitea Actions 工作流（`.gitea/workflows/docker-build.yml`）。推送到私有 Gitea 的 `main` 分支或 `v*` 标签后，Runner 会自动构建并将其推送到该 Gitea 实例的内置容器注册表：

```bash
docker pull <your-gitea-host>/<owner>/chronoval:latest
```

详情见 [docs/deployment.md](docs/deployment.md)。

## 常见问题

- **如何创建管理员？** 首次启动时依据 `CFRAME_ADMIN_EMAIL` / `CFRAME_ADMIN_PASSWORD` 环境变量自动创建；也可在登录页注册首个用户（需与站点配置一致）。
- **支持哪些格式的实况照片？** `.heic` 与 `.mov` 文件名一致（如 `IMG_1234.heic` / `IMG_1234.mov`）会自动配对为 Live Photo。
- **如何指定地图服务？** 地图用于浏览拍摄位置。注册 MapLibre（MapTiler Token）或 Mapbox 获取访问令牌后配置到环境变量。
- **照片存哪里？** 默认本地存储于 `./data/storage`（Docker 卷对应宿主机 `./data`）；也可切换为 S3 兼容或 OpenList 存储。

## 许可证

[MIT](LICENSE)

> 本项目是在 [ChronoFrame](https://github.com/HoshinoSuzumi/chronoframe)（MIT）基础上定制改造的个人画廊，视觉与部分交互参考了 [Afilmory](https://github.com/Afilmory/Afilmory)。致谢原作者。