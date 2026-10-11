# Avatar Switch Server — Render 部署包

零依赖 Node.js server，前后端一体，已为 Render 优化。

---

## 文件结构

```
avatar-server/
├── server.mjs              # 服务端
├── device.mjs              # 模拟被控设备（本地测试用，Render 不会跑）
├── package.json            # 告诉 Render 怎么启动
├── public/                 # 前端 dist
│   ├── index.html
│   └── assets/
├── scripts/
│   ├── push.sh             # git push 触发自动部署
│   ├── deploy.sh           # 手动触发部署（用 Render Deploy Hook）
│   └── keepalive.sh        # 反休眠心跳（可选）
├── .github/workflows/
│   └── deploy.yml          # GitHub Action 自动触发部署（可选）
├── .gitignore
└── README.md
```

---

## 部署到 Render（5 分钟）

### 1. 上传到 GitHub（一次性）

```bash
cd avatar-server

git init
git add .
git commit -m "init: avatar switch server"

# 在 github.com 新建一个空仓库（不要勾选 "Add README"）
git remote add origin git@github.com:<你的用户名>/<repo>.git
git push -u origin main
```

### 2. 在 Render 创建服务

1. https://render.com 用 GitHub 登录
2. 点 **New +** → **Web Service**
3. 选择刚才的 repo → **Connect**
5. 填表：

| 项 | 填什么 |
|----|--------|
| **Name** | `avatar-switch-server`（决定子域名） |
| **Region** | `Singapore`（国内访问最稳） |
| **Branch** | `main` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free` |

6. 点 **Create Web Service**

⏳ 等待 2-3 分钟，看到日志里 `🚀 server http://localhost:10000` 即启动成功。

地址：`https://avatar-switch-server.onrender.com`

### 3. 开启 Auto-Deploy（默认就开）

Service 页面 → 顶部 → **Auto-Deploy** 开关 → ON。

之后每次 `git push origin main`，Render 自动拉取并部署，**无需任何额外操作**。

### 4. 配置前端

打开前端 → ⚙️ → 后端设置：
- 请求模式：真实请求
- 后端地址：`https://avatar-switch-server.onrender.com/api/avatar/select`

---

## 自动部署

### 方式 A：Render 内置 Auto-Deploy（推荐）

> Service → Settings → Auto-Deploy = ON

```bash
# 本地改动后
./scripts/push.sh "feat: 新增 XX"
# → git push → Render 自动部署
```

零配置，**这就是你要的「git push 后自动触发」**。

### 方式 B：GitHub Action（可选，进阶）

只有当你需要 **push 前先跑测试 / lint** 或加 **通知** 时才用：

1. GitHub repo → Settings → Secrets and variables → Actions
2. New repository secret：
   - Name：`RENDER_DEPLOY_HOOK`
   - Value：Render Dashboard → Service → Settings → **Deploy Hook** URL
3. 之后 push 也会触发 action → action 调用 hook → Render 部署

### 方式 C：本地手动触发

```bash
export RENDER_DEPLOY_HOOK='https://api.render.com/deploy/srv-xxx?key=yyy'
./scripts/deploy.sh
```

---

## 防 Render 休眠（重要！）

Render 免费版 15 分钟无活动就休眠，**第一次唤醒要 20-50 秒**。我们的轮询设备会一直保持活跃，但如果你没有持续运行 device，推荐加心跳。

### 方法 1：cron-job.org（最简单，免费）

https://cron-job.org 注册 → New Cronjob：
- URL: `https://avatar-switch-server.onrender.com/healthz`
- Every 14 minutes

### 方法 2：另一台机器跑 keepalive.sh

```bash
SERVER=https://avatar-switch-server.onrender.com ./scripts/keepalive.sh
```

扔到任何一台 24 小时在线的机器（NAS、旧手机、旧电脑都OK）。

### 方法 3：付费解决

Render Starter $7/月，永不休眠。

---

## 升级前端

```bash
# 1. 重新构建前端（源码在 .rar 里）
cd ../frontend-src
pnpm install
pnpm build

# 2. 把 dist 拷过来
rm -rf ../avatar-server/public/*
cp -r dist/* ../avatar-server/public/

# 3. 提交并推送（Auto-Deploy 会自动触发）
cd ../avatar-server
./scripts/push.sh "chore: rebuild frontend"
```

不需要重启 server，浏览器刷新即可（`index.html` 是 no-cache）。

---

## 故障排查

| 现象 | 排查 |
|------|------|
| 部署日志里 `npm install` 卡住 | 检查 `package.json` 是否在根目录；`engines.node >= 18` |
| 部署成功但访问 502 | 看 Render logs 里有没有 `🚀 server` 字样；冷启动会等 30 秒 |
| 首次访问很慢（>10 秒） | Render 在拉起休眠实例，正常；用 keepalive 解决 |
| 前端报错「CORS」 | 服务端 `ALLOW_ORIGIN` 环境变量设为 `*` 或你的域名；Render Dashboard → Environment |
| `git push` 后没自动部署 | 检查 Service → Auto-Deploy 开关；Branch 设置对不对 |
| 想看实时日志 | Render Dashboard → Service → Logs（右上角有 "Live" 切换） |

---

## Render 环境变量（可选）

在 Service → Environment 设置：

| Key | Value | 说明 |
|-----|-------|------|
| `PORT` | (Render 自动设) | 不要改 |
| `ALLOW_ORIGIN` | `https://your-app.example.com` | 生产环境替代 `*` |
| `PUBLIC_DIR` | `./public` | 默认即可 |

---

## 一键操作清单

```bash
# 第一次
git init && git add . && git commit -m "init"
git remote add origin git@github.com:<你>/<repo>.git
git push -u origin main
# → 去 Render Dashboard 创建 Web Service，结束

# 之后每次更新
./scripts/push.sh "改了点东西"

# 本地测试
npm start
# 浏览器打开 http://localhost:8080/
```