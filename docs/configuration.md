# 配置参考

Chronoval 的所有配置通过环境变量提供（Docker 场景写入 `.env`，开发场景写入本地环境）。以下按模块列出全部变量及说明。

## 管理员与站点

| 变量 | 说明 | 默认 |
|---|---|---|
| `CFRAME_ADMIN_EMAIL` | 管理员邮箱（首次启动自动创建账号，必填） | - |
| `CFRAME_ADMIN_NAME` | 管理员用户名 | `ChronoFrame` |
| `CFRAME_ADMIN_PASSWORD` | 管理员密码 | `CF1234@!` |
| `NUXT_PUBLIC_APP_TITLE` | 站点标题 | `Chronoval` |
| `NUXT_PUBLIC_APP_SLOGAN` | 站点标语 | - |
| `NUXT_PUBLIC_APP_AUTHOR` | 作者署名（首页页脚） | - |
| `NUXT_PUBLIC_APP_AVATAR_URL` | 站点头像图片 URL | - |
| `NUXT_PUBLIC_COLOR_MODE_PREFERENCE` | 主题偏好 `light` / `dark` / `system` | `dark` |

## 会话与安全

| 变量 | 说明 | 默认 |
|---|---|---|
| `NUXT_SESSION_PASSWORD` | 会话加密密钥，**建议 32 位随机串，必填** | - |
| `NUXT_OG_IMAGE_SECRET` | 分享 OG 图签名密钥，用 `npx nuxt-og-image generate-secret` 生成 | - |

## 存储

| 变量 | 说明 | 默认 |
|---|---|---|
| `NUXT_STORAGE_PROVIDER` | 存储方案：`local` / `s3` / `openlist` | `local` |
| `NUXT_PROVIDER_LOCAL_PATH` | 本地存储根路径 | `./data/storage` |
| `NUXT_PROVIDER_LOCAL_BASE_URL` | 本地图片访问基址 | `/storage` |

### S3 兼容存储
`NUXT_STORAGE_PROVIDER=s3` 时启用：

| 变量 | 说明 |
|---|---|
| `NUXT_PROVIDER_S3_ENDPOINT` | S3 端点地址 |
| `NUXT_PROVIDER_S3_BUCKET` | 存储桶名称 |
| `NUXT_PROVIDER_S3_REGION` | 区域（默认 `auto`） |
| `NUXT_PROVIDER_S3_ACCESS_KEY_ID` | Access Key |
| `NUXT_PROVIDER_S3_SECRET_ACCESS_KEY` | Secret Key |
| `NUXT_PROVIDER_S3_PREFIX` | 对象前缀（默认 `photos/`） |
| `NUXT_PROVIDER_S3_CDN_URL` | CDN 加速地址（可选） |
| `NUXT_PROVIDER_S3_FORCE_PATH_STYLE` | 强制路径风格（默认 `false`） |

### OpenList 存储
`NUXT_STORAGE_PROVIDER=openlist` 时启用（用于阿里云盘等 OpenList 挂载的存储）：

| 变量 | 说明 |
|---|---|
| `NUXT_PROVIDER_OPENLIST_BASE_URL` | OpenList 服务地址 |
| `NUXT_PROVIDER_OPENLIST_ROOT_PATH` | 根目录（如 `/115pan/chronoval/photos`） |
| `NUXT_PROVIDER_OPENLIST_TOKEN` | 鉴权 Token |
| `NUXT_PROVIDER_OPENLIST_ENDPOINT_*` | 上传/下载/列表/删除/元数据等接口路径 |
| `NUXT_PROVIDER_OPENLIST_CDN_URL` | CDN 加速地址（可选） |

## 地图

| 变量 | 说明 | 默认 |
|---|---|---|
| `NUXT_PUBLIC_MAP_PROVIDER` | 地图供应商 `maplibre` / `mapbox` | `maplibre` |
| `NUXT_PUBLIC_MAP_MAPLIBRE_STYLE` | MapLibre 样式 URL | - |
| `NUXT_PUBLIC_MAP_MAPBOX_STYLE` | Mapbox 样式 URL | - |
| `NUXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | Mapbox 前端访问令牌 | - |
| `NUXT_MAPBOX_ACCESS_TOKEN` | Mapbox 服务端令牌（反向地理编码用） | - |
| `NUXT_NOMINATIM_BASE_URL` | 自定义 Nominatim 地址（国内可用代理） | `https://nominatim.openstreetmap.org` |

## 登录（OAuth）

| 变量 | 说明 | 默认 |
|---|---|---|
| `NUXT_PUBLIC_OAUTH_GITHUB_ENABLED` | 是否启用 GitHub 登录 | `false` |
| `NUXT_OAUTH_GITHUB_CLIENT_ID` | GitHub OAuth App ID | - |
| `NUXT_OAUTH_GITHUB_CLIENT_SECRET` | GitHub OAuth 密钥 | - |

## 上传

| 变量 | 说明 | 默认 |
|---|---|---|
| `NUXT_UPLOAD_MIME_WHITELIST_ENABLED` | 是否启用 MIME 白名单 | `true` |
| `NUXT_UPLOAD_MIME_WHITELIST` | 允许上传的 MIME 列表 | `image/jpeg,image/png,...` |

重复文件检测与处理模式（跳过/警告/拦截）在 **后台 → 设置 → 系统** 页面配置，无需环境变量。

## 统计

| 变量 | 说明 | 默认 |
|---|---|---|
| `NUXT_PUBLIC_GTAG_ID` | Google Analytics（GA4）测量 ID | - |
| `NUXT_PUBLIC_ANALYTICS_MATOMO_ENABLED` | 是否启用 Matomo | `false` |
| `NUXT_PUBLIC_ANALYTICS_MATOMO_URL` | Matomo 地址 | - |
| `NUXT_PUBLIC_ANALYTICS_MATOMO_SITE_ID` | Matomo 站点 ID | - |

> 未覆盖的少数高级项（如允许不安全 Cookie）为兼容历史而保留，不建议在生产使用。