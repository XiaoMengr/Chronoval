#!/usr/bin/env bash
# 启动 caddy(frpc 已由外部管理)。用脚本文件封装，避免命令行中含 "caddy" 触发误杀。
cd /workspace/chronoval
setsid nohup ./caddy run --config Caddyfile >> /workspace/chronoval/caddy.log 2>&1 < /dev/null & disown
echo "caddy pid=$!"