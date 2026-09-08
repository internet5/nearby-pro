#!/usr/bin/env bash
# 中间件一键部署（在 Linux 服务器上执行）：建 /data 目录、同步 nginx 配置、拷证书、启动
# 证书来源（优先级从高到低）：命令行参数目录 > 仓库内 nginx/ssl/（随目录一起上传） > 报错提示
# 用法（任意目录均可）：
#   ./deploy.sh                    # 日常：同步 conf + 证书 + 启动/刷新 nginx
#   ./deploy.sh /path/证书目录     # 指定证书目录（含 *.crt *.key）
set -e

# 本脚本所在目录即 docker/middleware-deploy
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p /data/postgis /data/redis
mkdir -p /data/nginx/conf /data/nginx/ssl /data/nginx/logs

# 同步 nginx 配置（仓库 -> /data/nginx/conf）
cp "$BASE_DIR"/nginx/conf/*.conf /data/nginx/conf/
echo "✓ nginx 配置已同步: /data/nginx/conf/"

# 证书：优先命令行参数目录，其次仓库内 nginx/ssl/（整个目录直接拷上服务器时证书就在里面）
CERT_SRC=""
if [ -n "$1" ]; then
  CERT_SRC="$1"
elif ls "$BASE_DIR"/nginx/ssl/*.crt >/dev/null 2>&1; then
  CERT_SRC="$BASE_DIR/nginx/ssl"
fi
if [ -n "$CERT_SRC" ]; then
  cp "$CERT_SRC"/*.crt "$CERT_SRC"/*.key /data/nginx/ssl/
  echo "✓ 证书已拷入: /data/nginx/ssl/（来自 $CERT_SRC）"
else
  echo "⚠ 没找到证书（仓库 nginx/ssl/ 为空且未传参数），两种方式任选："
  echo "  1. 把证书放进 docker/middleware-deploy/nginx/ssl/ 后重跑 ./deploy.sh"
  echo "  2. scp 上传后传参：./deploy.sh /path/证书目录"
  exit 1
fi

# 启动中间件（compose 配置有变化会自动重建），并重启 nginx 读取新挂载的配置
cd "$BASE_DIR"
docker compose up -d
docker compose restart nginx
docker compose ps
