// config.js — 加载 .env（零依赖解析）+ 设置页运行时覆盖（prefs 持久，热生效）
const fs = require("fs");
const path = require("path");
const state = require("./state");

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

// 设置页保存的 API 配置优先于 .env
const overrides = state.getPref("api_settings") || {};

module.exports = {
  deepseek: {
    key: overrides.deepseekKey || process.env.DEEPSEEK_API_KEY || "",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  },
  mimo: {
    key: overrides.mimoKey || process.env.MIMO_API_KEY || "",
    baseUrl: process.env.MIMO_BASE_URL || "https://api.xiaomimimo.com/v1",
    model: process.env.MIMO_TTS_MODEL || "mimo-v2.5-tts",
    voice: overrides.mimoVoice || process.env.MIMO_VOICE || "苏打",
  },
  ncm: {
    base: process.env.NCM_API_BASE || "http://localhost:3000",
  },
  station: {
    city: process.env.STATION_CITY || "杭州",
    lat: process.env.STATION_LAT || "30.27",
    lon: process.env.STATION_LON || "120.15",
  },
  port: parseInt(process.env.PORT || "8080", 10),
  token: process.env.API_TOKEN || "", // 访问令牌：.env 设置后开启，公网防裸奔
  // 节律调度开关：定时推送聊天（晨间唤醒/时段编排/整点情绪检查）每次都烧 API 额度
  // .env 设 SCHEDULER_ENABLED=false 关闭；不设或 true 开启
  schedulerEnabled: process.env.SCHEDULER_ENABLED !== "false",
};
