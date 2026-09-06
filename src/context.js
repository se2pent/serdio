// context.js — 提示词组装盒子：每次触发把 6 片碎片拼成 prompt
// ①系统提示词 ②用户档案 ③环境注入 ④已检索记忆 ⑤用户输入/工具结果 ⑥执行轨迹
const fs = require("fs");
const path = require("path");
const state = require("./state");
const { getWeather } = require("./weather");

const USER_DIR = path.join(__dirname, "..", "user");
const PROMPTS_DIR = path.join(__dirname, "..", "prompts");

function read(filePath) {
  try { return fs.readFileSync(filePath, "utf8").trim(); } catch { return ""; }
}

function currentSlot(now = new Date()) {
  const h = now.getHours(), day = now.getDay();
  const weekend = day === 0 || day === 6;
  if (h >= 23 || h < 6) return "midnight";
  if (!weekend && h >= 7 && h < 9) return "morning";
  if (weekend && h >= 9 && h < 12) return "weekend-morning";
  if (h >= 9 && h < 12) return "focus";
  if (h >= 12 && h < 14) return "lunch";
  if (h >= 14 && h < 18) return "focus";
  if (h >= 18 && h < 22) return "evening";
  return "night";
}

// 日历：未来 2 小时内的事件
function upcomingEvents(now = new Date()) {
  try {
    const cal = JSON.parse(read(path.join(USER_DIR, "calendar.json")) || "{}");
    const out = [];
    for (const ev of cal.events || []) {
      const evStart = new Date(`${ev.date}T${ev.time === "all-day" ? "00:00" : ev.time}:00`);
      const diffH = (evStart - now) / 3600000;
      if (diffH >= 0 && diffH <= 2) out.push(ev);
      else if (ev.date === now.toISOString().slice(0, 10) && ev.time === "all-day") out.push(ev);
    }
    return out;
  } catch { return []; }
}

async function assemble({ userInput, toolResults } = {}) {
  const now = new Date();
  const weather = await getWeather();
  const slot = currentSlot(now);

  // ② 用户档案
  const profile = [
    "【taste.md】", read(path.join(USER_DIR, "taste.md")),
    "", "【routines.md】", read(path.join(USER_DIR, "routines.md")),
    "", "【mood-rules.md】", read(path.join(USER_DIR, "mood-rules.md")),
    "", "【playlists.json】", read(path.join(USER_DIR, "playlists.json")),
  ].join("\n");

  // ③ 环境注入
  const envText = [
    `当前时间：${now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}（时段档位：${slot}）`,
    weather.ok ? `${weather.city}天气：${weather.desc} ${weather.temp}°C，风速 ${weather.wind} km/h` : `${config_station()}天气：暂不可用`,
    ...(upcomingEvents(now).length ? ["近 2 小时日程：", ...upcomingEvents(now).map(e => `- ${e.time} ${e.title}（${e.note || ""}）`)] : []),
  ].join("\n");

  // ④ 已检索记忆
  const recentMsgs = state.recentMessages(8).map(m => `[${m.role}] ${m.content}`).join("\n") || "（暂无对话）";
  const recentPlays = state.recentPlays(8).map(p =>
    `${p.title} - ${p.artist}${p.liked ? " ♡ liked" : ""}${p.skipped ? " ⏭ skipped" : ""} @${p.played_at}`
  ).join("\n") || "（暂无播放记录）";
  const memory = `近期对话：\n${recentMsgs}\n\n近期播放：\n${recentPlays}`;

  // ⑥ 执行轨迹
  const today = now.toISOString().slice(0, 10);
  const plans = state.todayPlans(today);
  const trajectory = plans.length
    ? plans.map(p => `[${p.created_at}] ${p.slot}: ${p.say || "(编排)"}`).join("\n")
    : "（今日尚无编排）";

  const systemPrompt = [
    read(path.join(PROMPTS_DIR, "dj-persona.md")),
    "\n===== 用户口味档案 =====\n" + profile,
    "\n===== 当前环境 =====\n" + envText,
    "\n===== 记忆（检索）=====\n" + memory,
    "\n===== 今日执行轨迹 =====\n" + trajectory,
  ].join("\n");

  // ⑤ 用户输入 / 工具结果
  const userTurn = [
    userInput ? `听众说：${userInput}` : "（定时触发，请按当前档位主动编排）",
    toolResults ? `工具结果：${toolResults}` : "",
  ].filter(Boolean).join("\n");

  return { systemPrompt, userTurn, slot, weather, fragmentCount: 6 };
}

function config_station() { return "本地"; }

module.exports = { assemble, currentSlot, upcomingEvents };
