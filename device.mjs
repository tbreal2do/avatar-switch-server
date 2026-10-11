// 模拟被控设备：每 1 秒轮询一次 server，应用收到的形象切换
// 运行：node device.mjs
//
// 演示如何在轮询时高效判断状态变化：
//   • 先 GET /version（轻量）
//   • version 变了才 GET /current 拉完整数据
//   • 或者直接 GET /poll?since=<lastVersion>，由 server 决定要不要返回

import { setTimeout as wait } from "node:timers/promises";

const SERVER = process.env.SERVER || "http://localhost:8080";
const POLL_MS = Number(process.env.POLL_MS || 1000);

const AVATAR_NAMES = {
  1: "labubu-light", 2: "miku-light", 3: "mario-light",
  4: "labubu-dark",  5: "miku-dark",  6: "mario-dark",
};

let lastVersion = -1;       // 首次轮询用 -1，保证能拿到初始状态
let lastImageId = 0;

async function poll() {
  try {
    // 方式 1：用 /poll 让 server 判断（最省流量的标准做法）
    const res = await fetch(`${SERVER}/api/avatar/poll?since=${lastVersion}`);
    if (res.status === 304) {
      process.stdout.write(".");
      return;
    }
    const data = await res.json();
    if (data.imageId !== lastImageId) {
      console.log(`\n[v${data.version}] 切换形象 → ${data.imageId} (${AVATAR_NAMES[data.imageId]}) @ ${data.updatedAt}`);
      lastImageId = data.imageId;
    }
    lastVersion = data.version;
  } catch (e) {
    console.error(`\n[error] ${e.message}`);
  }
}

console.log(`📡 开始轮询 ${SERVER}，间隔 ${POLL_MS}ms（Ctrl+C 停止）`);
while (true) {
  await poll();
  await wait(POLL_MS);
}