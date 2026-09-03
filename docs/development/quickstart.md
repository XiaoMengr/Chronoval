# 本地开发

环境要求：Node.js 20+ · pnpm 9+

```bash
# 安装依赖
pnpm install

# 配置环境变量（按需填写）
cp .env.example .env

# 构建内部 WebGL 依赖包
pnpm build:deps

# 开发模式（HMR 热更新）
pnpm dev

# 生产构建 / 预览
pnpm build
pnpm preview

# 数据库迁移（新增字段后使用）
pnpm db:generate && pnpm db:migrate
```

## 项目结构

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

> 更深入的后端开发指引见 [API 开发](api.md)、[贡献指南](contributing.md)、[如何新增设置项](how-to-add-setting.md)。