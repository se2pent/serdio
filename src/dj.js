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

  // 3. TTS 合成 say（先合成，语音地址随消息落库，气泡可重播）
  let speech = null;
  try {
    speech = await tts.synthesize(plan.say);
  } catch (e) {
    console.warn("[dj] TTS 失败（文本仍可显示）:", e.message);
  }
  state.logMessage("dj", plan.say, speech ? speech.url : null);

  // 4. NCM 解析 play[] → 可播放 queue
  // 防重复：近期播过的歌降级，优先选没播过的候选（search 一次给 5 个候选）
  // 标题归一化：剥掉 Live/Remix/翻唱 等后缀再比对，防"换皮重复"
  // 窗口 60 条 ≈ 最近 20 次编排（每次 3 首），覆盖约 2-3 天
  const normTitle = t => t.toLowerCase()
    .replace(/\s*[(（【\[].*?[)）】\]]\s*/g, "")     // 去括号尾巴
    .replace(/\s*(live|remix|cover|acoustic|instrumental|demo|version|卡拉ok|伴奏|现场版?|翻唱|remaster(ed)?)\s*/gi, "")
    .replace(/\s+/g, " ").trim();
  const recentTitles = new Set(state.recentPlays(60).map(p => normTitle(p.title)));
  const queuedTitles = new Set();
  // 重复判定：归一化相等，或一方包含另一方（防"歌手-歌名（Remix）"式换皮）
  const isRepeat = t => {
    const n = normTitle(t);
    if (recentTitles.has(n) || queuedTitles.has(n)) return true;
    for (const r of [...recentTitles, ...queuedTitles]) {
      if (r.length >= 4 && n.length >= 4 && (n.includes(r) || r.includes(n))) return true;
    }
    return false;
  };
  const queue = [];
  for (const p of plan.play.slice(0, 3)) {
    const kw = p.query || `${p.title} ${p.artist}`;
    const hits = await ncm.search(kw, 5);
    if (hits.length) {
      const hit = hits.find(h => !isRepeat(h.title)) || hits.find(h => !queuedTitles.has(normTitle(h.title))) || hits[0];
      queuedTitles.add(normTitle(hit.title));
      queue.push({
        ...hit,
        url: await ncm.songUrl(hit.id),
        lyric: await ncm.lyric(hit.id),
      });
      state.logPlay(hit);
    }
  }

  // 5. 组装结果
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
