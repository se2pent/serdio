// dj.js — 前向过程：assemble(6片) → brain → {say, play[], reason, segue}
//         → ncm 解析 queue → tts 合成 say → 广播 now-playing
const context = require("./context");
const brain = require("./brain");
const ncm = require("./ncm");
const tts = require("./tts");
const state = require("./state");

let broadcast = null;
function setBroadcast(fn) { broadcast = fn; }
function emit(data) { broadcast && broadcast(data); }

async function orchestrate({ userInput, toolResults, trigger }) {
  // 1. 组装上下文（6 片）
  const { systemPrompt, userTurn, slot } = await context.assemble({ userInput, toolResults });

  // 2. 大脑决策
  const plan = await brain.think(systemPrompt, userTurn || `（触发：${trigger}）`);
  state.logMessage("dj", plan.say);

  // 3. NCM 解析 play[] → 可播放 queue
  const queue = [];
  for (const p of plan.play.slice(0, 3)) {
    const kw = p.query || `${p.title} ${p.artist}`;
    const hits = await ncm.search(kw, 1);
    if (hits.length) {
      const hit = hits[0];
      queue.push({
        ...hit,
        url: await ncm.songUrl(hit.id),
        lyric: await ncm.lyric(hit.id),
      });
      state.logPlay(hit);
    }
  }

  // 4. TTS 合成 say
  let speech = null;
  try {
    speech = await tts.synthesize(plan.say);
  } catch (e) {
    console.warn("[dj] TTS 失败（文本仍可显示）:", e.message);
  }

  const result = { ...plan, slot, queue, speechUrl: speech ? speech.url : null, trigger, ts: Date.now() };

  // 5. WS 推 now-playing
  emit({ type: "now-playing", plan: result });
  return result;
}

// 用户交互：聊天 + ♡/skip 反馈
async function chat(text) {
  state.logMessage("user", text);
  return orchestrate({ userInput: text, trigger: "chat" });
}

function feedback(action, title) {
  state.markPlay(action, title);
  return orchestrate({
    trigger: "feedback",
    toolResults: `听众对《${title}》做了「${action === "like" ? "喜欢 ♡" : "跳过"}」操作，请在下轮编排中调整。`,
  });
}

module.exports = { orchestrate, chat, feedback, setBroadcast };
