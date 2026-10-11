#!/usr/bin/env bash
# 手动触发 Render 部署
# 用法：
#   1. 从 Render Dashboard → Service → Settings → Deploy Hook 复制 URL
#   2. RENDER_DEPLOY_HOOK=https://api.render.com/deploy/srv-xxx?key=yyy ./scripts/deploy.sh
#   或：./scripts/deploy.sh https://api.render.com/deploy/srv-xxx?key=yyy
set -euo pipefail

HOOK="${1:-${RENDER_DEPLOY_HOOK:-}}"

if [[ -z "$HOOK" ]]; then
  cat >&2 <<EOF
❌ 未设置 deploy hook URL

获取方式：
  1. 打开 https://dashboard.render.com 进入服务
  2. 左侧 Settings → Deploy Hook
  3. 复制 "Deploy Hook URL"

使用方式（二选一）：
  export RENDER_DEPLOY_HOOK='https://api.render.com/deploy/srv-xxx?key=yyy'
  ./scripts/deploy.sh

  ./scripts/deploy.sh 'https://api.render.com/deploy/srv-xxx?key=yyy'
EOF
  exit 1
fi

echo "🚀 触发 Render 部署..."
RESPONSE=$(curl -sS -X POST "$HOOK" -w "\nHTTP_CODE:%{http_code}")

echo "$RESPONSE"
HTTP_CODE=$(echo "$RESPONSE" | grep "^HTTP_CODE:" | cut -d: -f2)

if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "201" || "$HTTP_CODE" == "202" ]]; then
  echo "✅ 已触发，Render 正在部署（约 30-90 秒）"
  echo "   查看状态：https://dashboard.render.com"
else
  echo "❌ 失败，HTTP $HTTP_CODE"
  exit 1
fi