#!/usr/bin/env bash
# 一键 push 到 main，Render 会自动部署（前提是在 Dashboard 开启了 Auto-Deploy）
# 用法：./scripts/push.sh "提交说明"
set -euo pipefail

MSG="${1:-deploy: $(date '+%Y-%m-%d %H:%M:%S')}"

# 检查是否 git 仓库
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ 当前目录不是 git 仓库。请先："
  echo "   git init && git remote add origin <你的仓库地址>"
  exit 1
fi

# 检查是否有远程
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "❌ 未配置 origin 远程仓库。"
  echo "   git remote add origin <你的仓库地址>"
  exit 1
fi

# 检查分支
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" && "$BRANCH" != "master" ]]; then
  echo "⚠️  当前分支：$BRANCH（Render 通常监听 main/master）"
  read -rp "继续 push 到 $BRANCH？(y/N) " yn
  [[ "$yn" =~ ^[Yy]$ ]] || exit 1
fi

echo "📦 暂存改动..."
git add -A

if git diff --cached --quiet; then
  echo "ℹ️  无改动可提交。"
else
  echo "📝 提交：$MSG"
  git commit -m "$MSG"
fi

echo "⬆️  推送到 origin/$BRANCH ..."
git push origin "$BRANCH"

echo ""
echo "🚀 Render 将在 ~30 秒内开始部署"
echo "   状态：https://dashboard.render.com"