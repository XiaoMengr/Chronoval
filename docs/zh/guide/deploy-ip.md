# 独立 IP 访问（macvlan 网络）

不想占用宿主机端口、想让 Chronoval 在局域网拥有**自己独立的 IP**，通过 **macvlan** 网络给容器分配专属 IP，浏览器访问 `http://<独立IP>:3000` 即可，行为如同一台局域网内独立的小主机。

本方案**不做本地编译**，直接用内网 Gitea 注册表现成镜像 `172.16.0.1:322/xiaomengr/chronoval:<tag>`（`latest`=最新主分支构建；`1.0.0.4`=稳定版），改几个参数即可秒起。完整配置文件见根目录 [`docker-compose.ip.yml`](../../../docker-compose.ip.yml)。

## 一次性准备

```bash
# 1. 让 Docker 信任内网 http 镜像仓库（编辑 /etc/docker/daemon.json，再重启 docker）
#    { "insecure-registries": ["172.16.0.1:322"] }
#    sudo systemctl restart docker

# 2. 登录内网仓库（镜像非公开时需要）
docker login 172.16.0.1:322 --username <你的Gitea用户名>
```

## 启动

`macvlan` 网络已**内置**在 compose 里，网关、子网、IP 均可直接在文件内自定义，无需手动 `docker network create`：

```bash
# 建好数据目录并准备环境文件
mkdir -p data/storage/photos data/storage/videos
cp .env.example .env            # 管理员账号/站点信息可在网页首次引导里填

# 按你的局域网改 docker-compose.ip.yml 里四处（文件内有注释标明）：
#   ① parent   宿主机物理网卡名（ip addr 查看，如 eth0）
#   ② gateway  路由器/网关 IP（默认 192.168.1.1）
#   ③ subnet   局域网网段（默认 192.168.1.0/24）
#   ④ 容器IP   改成局域网内一个空闲 IP（默认 192.168.1.50）

# 直接拉取镜像启动（注意没有 --build）
docker compose -f docker-compose.ip.yml up -d

# 访问 http://192.168.1.50:3000
```

## 要点

- **无 `ports` 端口映射**：独立 IP 已直接监听 3000，不占宿主机端口。
- **网关/子网/IP 全部文件内自定义**：见 compose 的 `networks.net_chronoval` → `ipam.gateway`、`ipam.subnet`。
- **换版本/换 IP 无需重建**：改 `image` tag、`ipv4_address` 或 `ipam` 后 `docker compose -f docker-compose.ip.yml up -d`，卷内数据保持不变；改网络参数建议先 `down` 再 `up`。
- 仅支持 **Linux**（macvlan 依赖物理网卡）；数据目录、媒体库、扫描库挂载与默认 compose 完全一致。
- 若还需容器**主动访问宿主机**（如反代到宿主进程），macvlan 对接回有限制，请改用 `network_mode: host`。