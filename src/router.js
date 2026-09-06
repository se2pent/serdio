// router.js — 意图分流 + HTTP Contract（PWA ↔ server 的 6 条线）
const express = require("express");
const path = require("path");
const fs = require("fs");
const dj = require("./dj");
const state = require("./state");
const context = require("./context");
const config = require("./config");
const { getWeather, geocode, activeCity } = require("./weather");
const tts = require("./tts");
const ncm = require("./ncm");

const TTS_CACHE = path.join(__dirname, "..", "tts-cache");

// mock 音频：程序化生成 20s 轻氛围 WAV（mock 曲目兜底可播）
function generateMockWav(id) {
  const sampleRate = 22050, seconds = 20;
  const n = sampleRate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  const seed = parseInt(String(id).replace(/\D/g, "").slice(0, 4) || "42", 10);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.1 * t);
    const v = Math.sin(2 * Math.PI * (180 + (seed % 5) * 40) * t) * 0.25 * env
      + Math.sin(2 * Math.PI * 272 * t) * 0.1 * Math.sin(2 * Math.PI * 0.07 * t);
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, v * 32767)), 44 + i * 2);
  }
  return buf;
}

function createRouter() {
  const r = express.Router();
  r.use(express.json());

  // ① POST /api/chat — 对 DJ 说话
  r.post("/api/chat", async (req, res) => {
    try {
      const text = String(req.body.text || "").trim();
      if (!text) return res.status(400).json({ error: "text required" });
      const plan = await dj.chat(text);
      res.json(plan);
    } catch (e) {
      console.error("[router] /api/chat:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ② GET /api/now — 当前正在播（含上一次编排）
  r.get("/api/now", (req, res) => {
    const plans = state.todayPlans(new Date().toISOString().slice(0, 10));
    const last = plans.length ? plans[plans.length - 1] : null;
    res.json({
      playing: last,
      slot: context.currentSlot(),
      station: "Serdio",
    });
  });

  // ③ GET /api/next — 请求下一首/下一档
  r.get("/api/next", async (req, res) => {
    try {
      const plan = await dj.orchestrate({ trigger: "next" });
      res.json(plan);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ④ GET /api/taste — 口味档案读取（Profile 视图用）
  r.get("/api/taste", (req, res) => {
    const read = f => { try { return fs.readFileSync(path.join(__dirname, "..", "user", f), "utf8"); } catch { return ""; } };
    res.json({
      taste: read("taste.md"),
      routines: read("routines.md"),
      moodRules: read("mood-rules.md"),
      playlists: JSON.parse(read("playlists.json") || "{}"),
      recentPlays: state.recentPlays(20),
    });
  });

  // ⑤ GET /api/plan/today — 今日编排轨迹
  r.get("/api/plan/today", (req, res) => {
    res.json({ day: new Date().toISOString().slice(0, 10), plans: state.todayPlans(new Date().toISOString().slice(0, 10)) });
  });

  // ⑥ WS /stream — 见 server.js

  // ⑥b 访问令牌登录：POST /api/token（守卫中间件对此路径放行，自行校验）
  r.post("/api/token", (req, res) => {
    const { token } = req.body || {};
    if (!config.token) return res.json({ ok: true, authOff: true }); // 服务器未启用认证
    if (!token || token !== config.token) {
      console.log("[router] 令牌校验失败");
      return res.status(401).json({ error: "wrong token" });
    }
    res.setHeader("Set-Cookie",
      `serdio_token=${encodeURIComponent(token)}; Path=/; Max-Age=31536000; SameSite=Lax`);
    console.log("[router] 令牌校验通过，cookie 已下发（一年有效）");
    res.json({ ok: true });
  });
  r.get("/api/token/required", (req, res) => {
    res.json({ required: !!config.token });
  });

  // ⑦ GET /api/history — 对话历史（聊天界面用）
  r.get("/api/history", (req, res) => {
    res.json({ messages: state.recentMessages(50) });
  });

  // ⑧ GET /api/song/url — 按需补取播放直链（点歌时链接缺失/失效的兜底）
  r.get("/api/song/url", async (req, res) => {
    try {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "id required" });
      res.json({ url: await ncm.songUrl(id) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ⑨ GET/POST /api/settings — API 配置（Key 脱敏返回，保存热生效）
  r.get("/api/settings", (req, res) => {
    const mask = k => (k && k.length > 8 ? k.slice(0, 4) + "****" + k.slice(-4) : k ? "****" : "");
    res.json({
      deepseekKey: mask(config.deepseek.key),
      deepseekConfigured: !!(config.deepseek.key && config.deepseek.key !== "PENDING"),
      mimoKey: mask(config.mimo.key),
      mimoConfigured: !!(config.mimo.key && config.mimo.key !== "PENDING"),
      mimoVoice: config.mimo.voice,
      mimoVoices: ["mimo_default", "冰糖", "茉莉", "苏打", "白桦", "Mia", "Chloe", "Milo", "Dean"],
    });
  });
  r.post("/api/settings", (req, res) => {
    try {
      const { deepseekKey, mimoKey, mimoVoice } = req.body || {};
      const ov = state.getPref("api_settings") || {};
      if (deepseekKey && deepseekKey.trim()) ov.deepseekKey = deepseekKey.trim();
      if (mimoKey && mimoKey.trim()) ov.mimoKey = mimoKey.trim();
      if (mimoVoice) ov.mimoVoice = mimoVoice;
      state.setPref("api_settings", ov);
      // 热生效：模块都持有 config 对象引用，原地改属性即可
      if (ov.deepseekKey) config.deepseek.key = ov.deepseekKey;
      if (ov.mimoKey) config.mimo.key = ov.mimoKey;
      if (ov.mimoVoice) config.mimo.voice = ov.mimoVoice;
      console.log("[router] 设置已更新: DeepSeek", ov.deepseekKey ? "✓" : "-", "MiMo", ov.mimoKey ? "✓" : "-", "音色", ov.mimoVoice || "-");
      res.json({ saved: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ⑩ NCM 账号扫码登录（设置页内完成，cookie 持久到 .data/ncm-cookie.txt）
  r.get("/api/ncm-login/status", async (req, res) => {
    try {
      const cookie = ncm.getCookie();
      if (!cookie) return res.json({ loggedIn: false });
      const j = await fetch(config.ncm.base + "/login/status?cookie=" + encodeURIComponent(cookie),
        { signal: AbortSignal.timeout(6000) }).then(r => r.json());
      if (j.data && j.data.code === 200 && j.data.profile) {
        res.json({ loggedIn: true, nickname: j.data.profile.nickname, avatarUrl: j.data.profile.avatarUrl });
      } else {
        res.json({ loggedIn: false, stale: true }); // 有 cookie 但已失效
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  r.get("/api/ncm-login/qr", async (req, res) => {
    try {
      const ts = Date.now();
      const keyRes = await fetch(config.ncm.base + "/login/qr/key?timestamp=" + ts, { signal: AbortSignal.timeout(6000) }).then(r => r.json());
      const key = keyRes.data.unikey;
      const qr = await fetch(config.ncm.base + `/login/qr/create?key=${encodeURIComponent(key)}&qrimg=true&timestamp=` + ts,
        { signal: AbortSignal.timeout(6000) }).then(r => r.json());
      res.json({ key, qrimg: qr.data.qrimg }); // data:image/png;base64,…
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  r.get("/api/ncm-login/check", async (req, res) => {
    try {
      const key = req.query.key;
      if (!key) return res.status(400).json({ error: "key required" });
      const j = await fetch(config.ncm.base + "/login/qr/check?key=" + encodeURIComponent(key) + "&timestamp=" + Date.now(),
        { signal: AbortSignal.timeout(6000) }).then(r => r.json());
      if (j.code === 803 && j.cookie) {
        fs.writeFileSync(path.join(__dirname, "..", ".data", "ncm-cookie.txt"), j.cookie);
        ncm.refreshCookie();
        console.log("[router] NCM 扫码登录成功，cookie 已保存");
      }
      res.json({ code: j.code, message: j.message || "" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 退出登录：删除本地 cookie
  r.post("/api/ncm-logout", (req, res) => {
    try {
      const f = path.join(__dirname, "..", ".data", "ncm-cookie.txt");
      if (fs.existsSync(f)) fs.unlinkSync(f);
      ncm.refreshCookie();
      console.log("[router] NCM 已退出登录");
      res.json({ done: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- 支线：反馈 / TTS / 天气 / mock 音频 ---
  r.post("/api/feedback", async (req, res) => {
    try {
      const { action, title } = req.body;
      const plan = await dj.feedback(action, title);
      res.json(plan);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  r.get("/api/weather", async (req, res) => res.json(await getWeather()));

  // 城市选择：GET 当前 / POST 切换（geocode + prefs 持久）
  r.get("/api/city", (req, res) => res.json(activeCity()));
  r.post("/api/city", async (req, res) => {
    try {
      const name = String(req.body.name || "").trim();
      if (!name) return res.status(400).json({ error: "name required" });
      const hit = await geocode(name);
      if (!hit) return res.status(404).json({ error: "城市未找到" });
      state.setPref("city", hit);
      console.log("[router] 城市切换:", hit.name, hit.lat, hit.lon);
      res.json({ saved: hit, weather: await getWeather() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  r.get("/tts/:file", (req, res) => {
    const f = path.basename(req.params.file);
    const p = path.join(TTS_CACHE, f);
    if (!fs.existsSync(p)) return res.status(404).end();
    res.type(f.endsWith(".wav") ? "audio/wav" : "audio/mpeg").send(fs.readFileSync(p));
  });

  r.get("/mock-audio/:file", (req, res) => {
    res.type("audio/wav").send(generateMockWav(req.params.file));
  });

  return r;
}

module.exports = { createRouter };
