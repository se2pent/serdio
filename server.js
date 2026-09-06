// server.js — Serdio 入口：HTTP + WS /stream + 静态 PWA + 调度器
const http = require("http");
const express = require("express");
const { WebSocketServer } = require("ws");
const path = require("path");
const config = require("./src/config");
const { createRouter } = require("./src/router");
const scheduler = require("./src/scheduler");
const dj = require("./src/dj");

const app = express();

// ---- 访问令牌守卫：.env 设 API_TOKEN 后，所有数据接口需验密码 ----
// 静态外壳开放（无敏感数据，且需先有壳才能输密码）；数据接口全守卫
const API_TOKEN = process.env.API_TOKEN || "";
function hasValidToken(req) {
  if (!API_TOKEN) return true; // 未设置 = 关闭认证（局域网自用）
  const m = (req.headers.cookie || "").match(/serdio_token=([^;]+)/);
  const cand = (m && decodeURIComponent(m[1])) || req.query.token || req.headers["x-api-token"];
  return cand === API_TOKEN;
}
app.use((req, res, next) => {
  const guarded = req.path.startsWith("/api/") || req.path.startsWith("/tts/") || req.path.startsWith("/mock-audio/");
  if (!guarded) return next();
  const authProbe = req.path === "/api/token" && req.method === "POST"; // 登录口自放行
  const authProbe2 = req.path === "/api/token/required"; // 前端启动探测也放行
  if (authProbe || authProbe2) return next();
  if (hasValidToken(req)) return next();
  res.status(401).json({ error: "unauthorized" });
});

app.use(createRouter());
// 像素字体（fontsource 本地包）
app.use("/fonts", express.static(path.join(__dirname, "node_modules", "@fontsource", "fusion-pixel-12px-proportional-sc")));
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({
  server,
  path: "/stream",
  verifyClient: (info) => {
    if (!API_TOKEN) return true; // 认证关闭
    const c = info.req.headers.cookie || "";
    const q = new URL(info.req.url, "http://x").searchParams.get("token");
    return c.includes("serdio_token=" + API_TOKEN) || q === API_TOKEN;
  },
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const c of wss.clients) {
    if (c.readyState === 1) c.send(msg);
  }
}

dj.setBroadcast(broadcast);
scheduler.setBroadcast(broadcast);

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello", station: "Serdio", ts: Date.now() }));
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
    } catch { /* ignore */ }
  });
});

scheduler.start();

server.listen(config.port, () => {
  console.log(`
  ┌─────────────────────────────────────────┐
  │   📻 Serdio · 个人 AI 电台               │
  │   PWA:  http://localhost:${config.port}          │
  │   WS:   ws://localhost:${config.port}/stream    │
  └─────────────────────────────────────────┘
  大脑: ${config.deepseek.key && config.deepseek.key !== "PENDING" ? "DeepSeek ✅" : "未配置 Key（演示模式）"}
  声音: ${config.mimo.key && config.mimo.key !== "PENDING" ? "MiMo TTS ✅" : "未配置 Key（无语音）"}
  音乐: ${config.ncm.base}
  `);
});
