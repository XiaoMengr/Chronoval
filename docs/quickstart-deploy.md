# 一分钟启动 Chronoval（极简版）

> **已经帮你构建好镜像**：本页只有 3 步，不用 build、不用理解进阶配置，照抄即可跑起来。

> 开始前：先 `cd` 到仓库目录（和 `docker-compose.quickstart.yml` 同层）。

## 需要的文件

两个文件已放在项目根目录：

| 文件 | 作用 |
| ---- | ---- |
| `docker-compose.quickstart.yml` | 极简 compose（直接用 GHCR 已构建镜像，无需 build） |
| `.env.quickstart.example` | 极简环境变量模板（可整体留空） |

## 三步启动

```bash
# 1. 进入目录，用已构建镜像启动（首次会自动拉取镜像）
docker compose -f docker-compose.quickstart.yml up -d

# 2. （可选）预设环境变量：模板照抄即可，不填也能跑
cp .env.quickstart.example .env

# 3. 打开浏览器
#    http://localhost:3000
```

打开网页后，按 **「首次运行向导」** 填一下管理员邮箱/密码即可开始使用。

## 这个极简版默认做了哪些事

| 项目 | 默认行为 |
| ---- | -------- |
| 数据持久化 | 自动挂载 `./data`，数据库、配置都存在这里 |
| 管理员账号 | 网页向导里手动设置，不用在 `.env` 写 |
| 会话密钥 | 未设置时自动生成并持久化，无需手动 `openssl` |
| 本地存储/媒体库路径 | 已固化在镜像内，无需配置 |

## 我想把旧照片批量导入

导入已有照片有两个途径（二选一即可）：

1. **上传**：网页里直接上传即可，加密后实时落入 `/app/storage`，上传即显示、无需扫描。
2. **外部扫描库（推荐批量）**：把文件夹放进 `./data/library/<相册名>/`，再到「存储设置 → 本地扫描库」添加该目录，放图即自动识别、缩略图就地生成。

纯存储目录（`/app/storage`）**不做**媒体库自动扫描，只存上传照片与缩略图回退。

```bash
mkdir -p data/library
# 按相册放：cp -r ~/家庭相册 data/library/   → 界面里添加容器路径 /app/library/家庭相册
```

## 换端口

改 `docker-compose.quickstart.yml` 里 `ports` 的左侧即可：

```yaml
ports:
  - "8080:3000"   # 用 8080 访问
```

## 常用命令

```bash
docker compose -f docker-compose.quickstart.yml up -d      # 启动
docker compose -f docker-compose.quickstart.yml logs -f    # 看日志
docker compose -f docker-compose.quickstart.yml down       # 停止
docker compose -f docker-compose.quickstart.yml pull       # 更新到最新镜像
docker compose -f docker-compose.quickstart.yml up -d      # 应用更新
```

## 数据备份（就一句话）

```bash
tar -czf chronoval-backup-$(date +%F).tar.gz ./data
```

---

## 进阶配置（需要时才看）

上面留空就能跑。以下按需要解锁，全部是**可选**项，不影响启动。

### 固定会话密钥（公网/多实例建议）

```bash
# .env 里取消注释，用生成的值
openssl rand -base64 32
```

```env
NUXT_SESSION_PASSWORD=你生成的值
```

### 站点标题 / 管理员预填

```env
NUXT_PUBLIC_APP_TITLE=Chronoval
CFRAME_ADMIN_EMAIL=admin@example.com
CFRAME_ADMIN_PASSWORD=你的密码
```

### 地图（在地图上浏览照片位置）

免费方案用 MapLibre，或带令牌的 Mapbox：

```env
NUXT_PUBLIC_MAP_PROVIDER=maplibre
NUXT_PUBLIC_MAP_MAPLIBRE_STYLE=
# 或
NUXT_PUBLIC_MAPBOX_ACCESS_TOKEN=
```

### S3 / 对象存储、更多登录方式、统计等

完整的全部可选变量见仓库根目录 `.env.example`（每项都有注释）。

### 本地扫描库（分散相册，按需）

需要时在 compose 里追加一个目录挂载，把相册放进去在界面里添加：

```yaml
volumes:
  - ./data:/app/data
  - ./data/library:/app/library   # 可选：本地扫描库（每个子目录一个相册）
```