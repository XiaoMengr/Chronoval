<p align="center">
  <img src="docs/public/logo.png" width="90" alt="Chronoval">
</p>

<h1 align="center">Chronoval</h1>

<p align="center">
  自托管的个人摄影画廊 · 一个容器同时提供页面与 API
</p>

<p align="center">
  <img alt="Nuxt" src="https://img.shields.io/badge/Nuxt-4-00DC82">
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3-42b883">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-%E2%9C%93-2496ED">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-%E2%9C%93-003B57">
  <img alt="version" src="https://img.shields.io/badge/Version-v1.0.0.4-green">
  <img alt="license" src="https://img.shields.io/badge/License-MIT-blue">
</p>

照片 / 视频放进 `data/storage` 下的对应目录即被自动识别；WebGL 高清查看、Exif 信息、地图浏览、分享链接，管理后台一键搞定。

## 特性

**存储与安全**

- **上传加密**：后台上传的照片以加密形式存储为 blob，未授权无法直接读取原图，支持缩略图遮罩预览
- **本地目录即存储**：照片/视频目录只读挂载，文件放进即自动识别、生成缩略图；原文件绝不加密、改写、搬移
- **外部库引用**：三态存储——加密上传、只读媒体库、本地扫描库；文件夹即相簿，目录内照片自动汇聚预览成相簿

**查看与浏览**

- **360° 全景查看**：支持全景照片的 360 自由视角浏览（`PanoramaViewer`）
- **WebGL 高性能查看器**：高清缩放、平移、雾面过渡，多机位
- **Exif 信息**：相机参数、拍摄时间、地理位置展示
- **Live Photo 自动配对**：图片 + 视频配对播放
- **地图浏览**：MapLibre / Mapbox 聚合拍摄位置，反向地理编码识别城市
- **多格式支持**：JPEG / PNG / WebP / GIF / TIFF / HEIC / AVIF + MOV / MP4

**分享与协作**

- **分享链接**：公开链接 / 嵌入代码 / 原生 Web Share / 下载原图
- **反应互动**：照片 Reactions（点赞/表情）可视化

**管理后台**

- **相册管理**：创建、排序、封面；上传队列实时进度
- **系统监控**：实时日志、健康状态、日历热图
- **回收站**：删除照片可恢复

## 快速开始

镜像已构建并发布到 GHCR，几行命令即可启动：

```bash
git clone https://github.com/XiaoMengr/Chronoval.git && cd Chronoval

cp .env.example .env
mkdir -p data/storage/photos data/storage/videos
docker compose up -d

# 打开 http://localhost:3000，按向导设置管理员
```

## 文档

| 文档 | 说明 |
| --- | --- |
| [一分钟启动](docs/quickstart-deploy.md) | 极简 3 步部署 |
| [部署指南](docs/deployment.md) | Docker / 镜像 / 目录映射 / 备份 |
| [快速上手](docs/guide/getting-started.md) | 安装 / 配置 / 升级 |
| [配置参考](docs/configuration.md) | 全部环境变量 |
| [完整文档站](docs/index.md) | 全部文档索引 |

> 镜像由 GitHub Actions 自动构建并推送至 GHCR：`ghcr.io/xiaomengr/chronoval:latest`

[MIT](LICENSE) · 基于 [ChronoFrame](https://github.com/HoshinoSuzumi/chronoframe)（MIT）定制，视图参考 [Afilmory](https://github.com/Afilmory/Afilmory)