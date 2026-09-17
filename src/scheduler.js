// scheduler.js — 节律调度：07:00 规划 · 09:00 早间档 · 小时情绪检查 · 日历 hook
// 可通过 .env 的 SCHEDULER_ENABLED=false 整体关闭（定时推送每次都烧 API 额度）
const context = require("./context");
const brain = require("./brain");
const state = require("./state");
const config = require("./config");
const { orchestrate } = require("./dj");

// 档位触发表（分钟级轮询，命中即触发）
const SLOT_CRON = [
  { slot: "morning", at: ["07:00"], label: "07:00 温和唤醒" },
  { slot: "focus", at: ["09:00"], label: "09:00 早间专注档" },
  { slot: "lunch", at: ["12:30"], label: "午间档" },
  { slot: "evening", at: ["18:30"], label: "晚高峰档" },
  { slot: "midnight", at: ["23:00"], label: "深夜档" },
  { slot: "weekend-morning", at: ["09:30*6", "09:30*0"], label: "周末慢启动" }, // *6=周六 *0=周日
];

let lastFired = {}; // 防重复触发 key -> day
let lastHourlyCheck = 0;

async function fireScheduled(slotCfg) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const key = slotCfg.slot + day;
  if (lastFired[key]) return;

  console.log(`[scheduler] 触发 ${slotCfg.label}`);
  lastFired[key] = true;
  try {
    const plan = await orchestrate({ trigger: `schedule:${slotCfg.slot}` });
    state.savePlan(day, slotCfg.slot, plan);
    broadcast && broadcast({ type: "dj", plan });
  } catch (e) {
    console.error("[scheduler] 编排失败:", e.message);
  }
}

let broadcast = null; // 由 server.js 注入 ws 广播
function setBroadcast(fn) { broadcast = fn; }

function tick() {
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dow = now.getDay();

  for (const cfg of SLOT_CRON) {
    for (const a of cfg.at) {
      const [time, d] = a.split("*");
      if (hhmm === time && (d === undefined || parseInt(d, 10) === dow)) {
        fireScheduled(cfg);
      }
    }
  }

  // 小时情绪检查：整点后第 5 分钟触发轻量检查
  if (now.getMinutes() === 5) {
    const hourKey = now.toISOString().slice(0, 13);
    if (lastHourlyCheck !== hourKey) {
      lastHourlyCheck = hourKey;
      fireHourlyMoodCheck();
    }
  }

  // 日历 hook：每天 07:00:30 刷新（跟早档一起自然发生，无需额外逻辑）
}

async function fireHourlyMoodCheck() {
  console.log("[scheduler] 小时情绪检查");
  try {
    const plan = await orchestrate({ trigger: "hourly-mood-check" });
    broadcast && broadcast({ type: "dj", plan });
  } catch (e) {
    console.error("[scheduler] 情绪检查失败:", e.message);
  }
}

function start() {
  if (!config.schedulerEnabled) {
    console.log("[scheduler] 节律调度已关闭（.env: SCHEDULER_ENABLED=false）—— DJ 只在你主动召唤时工作");
    return;
  }
  setInterval(tick, 30 * 1000); // 每 30s 轮询
  console.log("[scheduler] 节律调度已启动（30s 轮询）");
}

module.exports = { start, setBroadcast };
