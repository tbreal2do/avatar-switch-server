// 极简轮询服务器（前后端一体）
//   • API：POST /api/avatar/select、GET /api/avatar/poll|version|current、/healthz
//   • 静态文件：public/ 目录
//   • SPA fallback：未知路径返回 index.html（前端路由）
//   • 支持 Range 请求（视频可拖动）
// 运行：node server.mjs

import { createServer } from "node:http";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, resolve, sep } from "node:path";

const PORT       = Number(process.env.PORT       || 8080);
const PUBLIC_DIR = process.env.PUBLIC_DIR         || "./public";
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN     || "*";

// ─────────────────────────────────────── 状态 ──
let state = {
  imageId: 1,                                // 默认 labubu-light
  version: 0,
  updatedAt: new Date().toISOString(),
};

// ─────────────────────────────────────── 工具 ──
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
  ".mp4":  "video/mp4",
  ".webm": "video/webm",
  ".txt":  "text/plain; charset=utf-8",
};

function sendJson(res, status, obj) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin":  ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(obj));
}

function sendEmpty(res, status, extra = {}) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    ...extra,
  });
  res.end();
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "", size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024) { reject(new Error("payload too large")); req.destroy(); return; }
      buf += chunk;
    });
    req.on("end", () => { if (!buf) return resolve({}); try { resolve(JSON.parse(buf)); } catch { reject(new Error("invalid JSON")); } });
    req.on("error", reject);
  });
}

// 防穿越：把 url 拼到 PUBLIC_DIR 下，确保不出 public/
function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const cleaned = decoded.replace(/\/{2,}/g, "/").replace(/^\/+/, "");
  const full = resolve(PUBLIC_DIR, cleaned || "index.html");
  if (!full.startsWith(resolve(PUBLIC_DIR) + sep) && full !== resolve(PUBLIC_DIR, "index.html")) {
    return null;
  }
  return full;
}

// ─────────────────────────────── 静态文件（含 Range） ──
async function serveStatic(req, res, filePath, fallbackIndex = false) {
  try {
    const s = await stat(filePath);
    if (!s.isFile()) return false;

    const total = s.size;
    const mime  = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
    const headers = {
      "Content-Type": mime,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    };
    // Vite 产物里 assets/* 文件名带 hash，长期缓存；index.html 不缓存
    if (filePath.includes(`${sep}assets${sep}`)) {
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    } else {
      headers["Cache-Control"] = "no-cache";
    }

    // Range 请求（如视频拖动）
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!m) { res.writeHead(416, { "Content-Range": `bytes */${total}` }); return res.end(); }
      let start = m[1] === "" ? null : Number(m[1]);
      let end   = m[2] === "" ? null : Number(m[2]);
      const last = total - 1;
      if (start === null && end === null) { res.writeHead(416); return res.end(); }
      if (start === null) { start = Math.max(0, total - end); end = last; }
      if (end   === null) { end = last; }
      start = Math.max(0, start);
      end   = Math.min(last, end);
      if (start > end) { res.writeHead(416, { "Content-Range": `bytes */${total}` }); return res.end(); }
      const chunksize = end - start + 1;
      headers["Content-Range"]  = `bytes ${start}-${end}/${total}`;
      headers["Content-Length"] = chunksize;
      res.writeHead(206, headers);
      const stream = createReadStream(filePath, { start, end });
      stream.on("error", () => res.destroy());
      stream.pipe(res);
      return true;
    }

    // 普通 GET/HEAD
    headers["Content-Length"] = total;
    if (req.method === "HEAD") { res.writeHead(200, headers); return res.end(); }
    res.writeHead(200, headers);
    const stream = createReadStream(filePath);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
    return true;
  } catch {
    return false;
  }
}

// ──────────────────────────────────── HTTP 路由 ──
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  // CORS 预检
  if (req.method === "OPTIONS") return sendEmpty(res, 204);

  // ─── API ───
  if (pathname === "/healthz" && req.method === "GET") {
    return sendJson(res, 200, { ok: true, version: state.version });
  }

  if (pathname === "/api/avatar/select" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const id = Number(body.imageId);
      if (!Number.isInteger(id) || id < 1 || id > 6) {
        return sendJson(res, 400, { code: 1, message: "imageId 必须是 1–6" });
      }
      state = { imageId: id, version: state.version + 1, updatedAt: new Date().toISOString() };
      console.log(`[select] imageId=${id} version=${state.version}`);
      return sendJson(res, 200, { code: 0, data: state });
    } catch (e) {
      return sendJson(res, 400, { code: 1, message: e.message });
    }
  }

  if (pathname === "/api/avatar/version" && req.method === "GET") {
    return sendJson(res, 200, { version: state.version, imageId: state.imageId });
  }

  if (pathname === "/api/avatar/current" && req.method === "GET") {
    return sendJson(res, 200, state);
  }

  if (pathname === "/api/avatar/poll" && req.method === "GET") {
    const since = Number(url.searchParams.get("since") ?? -1);
    if (state.version > since) return sendJson(res, 200, state);
    return sendEmpty(res, 304, { ETag: String(state.version) });
  }

  // ─── 静态文件 / SPA fallback ───
  if (req.method === "GET" || req.method === "HEAD") {
    const filePath = safePath(pathname);
    if (!filePath) return sendJson(res, 403, { code: 1, message: "forbidden" });

    // 1) 真实文件
    if (await serveStatic(req, res, filePath)) return;

    // 2) SPA fallback：未知路径回 index.html（让前端路由处理）
    if (req.method === "GET" && !pathname.startsWith("/api/")) {
      const indexPath = resolve(PUBLIC_DIR, "index.html");
      if (await serveStatic(req, res, indexPath)) return;
    }
  }

  sendJson(res, 404, { code: 1, message: "not found" });
});

server.listen(PORT, () => {
  console.log(`🚀 server  http://localhost:${PORT}`);
  console.log(`   前端 /  API /api/avatar/...  静态文件 ${PUBLIC_DIR}/`);
});