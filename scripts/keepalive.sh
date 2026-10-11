#!/usr/bin/env bash
# 反 Render 休眠：每 14 分钟 ping 一次健康检查
# 用法：
#   SERVER=https://xxx.onrender.com ./scripts/keepalive.sh        # 前台常驻
#   或加入 crontab：
#   */14 * * * * /path/to/keepalive.sh >> /var/log/keepalive.log 2>&1
set -euo pipefail

SERVER="${SERVER:-http://localhost:8080}"
INTERVAL="${INTERVAL:-840}"     # 14 分钟（Render 阈值 15 分钟，留 1 分钟余量）

echo "💓 keepalive → $SERVER/healthz  每 ${INTERVAL}s"

while true; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$SERVER/healthz" || echo "000")
  TS=$(date '+%Y-%m-%d %H:%M:%S')
  if [[ "$CODE" == "200" ]]; then
    echo "[$TS] ✓ $CODE"
  else
    echo "[$TS] ✗ $CODE  (server 可能正在冷启动，下次会自动恢复)"
  fi
  sleep "$INTERVAL"
done