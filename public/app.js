// app.js — PWA 逻辑：Telegram 式聊天流 · 迷你播放器 · 单 <audio> · 先说话后放歌 · 天气情绪
const $ = s => document.querySelector(s);
const audio = $("#audio");

const state = {
  queue: [],
  idx: -1,
  speechUrl: null,
  prefetched: null,   // 预取的下一首
  mode: null,         // 'speech' | 'music' | null
  pendingQueue: false,
  compact: false,     // 翻阅聊天时收起大控件
};

/* ---------- 视图切换 ---------- */
document.querySelectorAll(".tabbar button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabbar button").forEach(b => b.classList.remove("on"));
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    btn.classList.add("on");
    $("#view-" + btn.dataset.view).classList.add("active");
    // 聊天输入栏只属于电台视图
    document.querySelector(".chat-bar").style.display = btn.dataset.view === "player" ? "" : "none";
    if (btn.dataset.view !== "player") $("#btn-top").hidden = true; // 离开电台视图藏回顶钮
    if (btn.dataset.view === "profile") loadProfile("taste");
    if (btn.dataset.view === "settings") loadSettings();
  });
});

/* ---------- 时钟 + 天气情绪换装（英文·居中版） ---------- */
const WX_EN = { sunny: "SUNNY", cloudy: "CLOUDY", overcast: "OVERCAST", rain: "RAIN", snow: "SNOW", fog: "FOG", thunder: "THUNDERSTORM" };
const WX_DESC_EN = { "晴": "CLEAR SKY", "多云": "PARTLY CLOUDY", "阴": "OVERCAST", "毛毛雨": "DRIZZLE", "小雨": "LIGHT RAIN", "中雨": "RAIN", "大雨": "HEAVY RAIN", "阵雨": "SHOWERS", "强阵雨": "HEAVY SHOWERS", "雨": "RAIN", "雪": "SNOW", "雾": "FOG", "霾": "HAZE", "雷雨": "THUNDERSTORM" };

function tickClock() {
  const n = new Date();
  const p = x => String(x).padStart(2, "0");
  $("#clock-time").innerHTML = `${p(n.getHours())}:${p(n.getMinutes())}<span class="sec">:${p(n.getSeconds())}</span>`;
  const date = n.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  $("#clock-date").textContent = date.toUpperCase();
}
setInterval(tickClock, 1000);
tickClock();

async function refreshWeather() {
  try {
    const wx = await (await fetch("/api/weather")).json();
    document.body.className = "wx-" + (wx.mood || "cloudy");
    const el = $("#clock-wx");
    if (wx.ok) {
      const label = WX_DESC_EN[wx.desc] || WX_EN[wx.mood] || "CLOUDY";
      el.textContent = `${label} · ${wx.temp}°C`;
      el.classList.remove("blink");
    } else {
      el.textContent = "WEATHER OFFLINE";
      el.classList.add("blink");
    }
  } catch { /* 忽略 */ }
}
refreshWeather();
setInterval(refreshWeather, 10 * 60 * 1000);

/* ---------- WS /stream ---------- */
let ws;
function connectWS() {
  ws = new WebSocket(`ws://${location.host}/stream`);
  ws.onopen = () => console.log("[ws] connected");
  ws.onclose = () => setTimeout(connectWS, 3000);
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "now-playing") renderPlan(msg.plan);
  };
}
connectWS();

/* ---------- 聊天流 ---------- */
const chatList = $("#chat-list");
const scroller = $("#view-player"); // 单滚动容器：展开区 + 聊天流一起滚

function nearBottom() {
  return scroller.scrollTop + scroller.clientHeight > scroller.scrollHeight - 90;
}
function scrollBottom(force) {
  if (force || nearBottom()) scroller.scrollTop = scroller.scrollHeight;
}

function esc(s) { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }
function escAttr(s) { return esc(s).replace(/"/g, "&quot;"); }

/* ---------- 聊天流：DJ 气泡内可交互队列 ---------- */
function addChat(role, text, queue, speechUrl, speechId) {
  // 去重：连续相同的 DJ 消息不重复入流（如页面刷新时历史重放）
  const last = chatList.querySelector(".msg:last-child");
  if (last && last.classList.contains(role) &&
      last.querySelector(".bubble") && last.querySelector(".bubble").dataset.say === text) return;
  if (!text) return;

  const el = document.createElement("div");
  el.className = "msg " + role;
  const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

  let queueHtml = "";
  if (queue && queue.length) {
    // 新队列入场上任，旧的 live 消息退役为静态存档
    chatList.querySelectorAll(".msg.live").forEach(m => m.classList.remove("live"));
    el.classList.add("live");
    queueHtml = `<div class="msg-queue">` + queue.map((t, i) => `
      <div class="cq-row" data-i="${i}">
        <div class="cq-play">▶</div>
        <div class="cq-info">
          <div class="cq-title">${esc(t.title)}</div>
          <div class="cq-artist">${esc(t.artist)}</div>
          <div class="cq-lyric"></div>
        </div>
        <button class="cq-btn" data-act="like" title="喜欢">♡</button>
        <button class="cq-btn" data-act="skip" title="跳过">⏭</button>
      </div>`).join("") + `</div>`;
  }

  el.innerHTML = `
    <div class="avatar">${role === "user" ? "🎧" : "📻"}</div>
    <div class="msg-body">
      <div class="msg-name">${role === "user" ? "YOU" : "SERDIO"}</div>
      <div class="bubble" data-say="${escAttr(text)}">${esc(text)}</div>
      <div class="msg-foot">
        <span class="msg-time">${time}</span>
        ${role === "dj" ? `<button class="replay-btn" data-id="${speechId || ""}" ${speechUrl ? `data-url="${escAttr(speechUrl)}"` : ""} title="重播这段语音">talking</button>` : ""}
      </div>
      ${queueHtml}
    </div>`;
  chatList.appendChild(el);
  scrollBottom(role === "user");
}

// DJ 语音重播（事件委托）：有 URL 直接播；老消息现场合成后落库再播
chatList.addEventListener("click", async (e) => {
  const btn = e.target.closest(".replay-btn");
  if (!btn) return;
  e.stopPropagation();
  let url = btn.dataset.url;
  if (!url) {
    btn.textContent = "synth…";
    try {
      const j = await (await fetch("/api/tts/replay", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: btn.dataset.id }),
      })).json();
      url = j.url;
      if (url) btn.dataset.url = url;
    } catch { /* 网络错误 */ }
    btn.textContent = "talking";
    if (!url) { btn.textContent = "talking ✗"; setTimeout(() => btn.textContent = "talking", 1500); return; }
  }
  audio.onended = () => setMode(null);
  audio.src = url;
  setMode("speech");
  audio.play().catch(() => { $("#play-hint").textContent = "▶ 点一下屏幕再试（浏览器限制）"; });
});

// 聊天内队列与当前播放状态同步（正在播的卡片亮情绪色 + ★ + 当前歌词句）
function syncChatQueues() {
  const live = chatList.querySelector(".msg.live");
  if (!live) return;
  const curLine = state.mode === "music" && lyricLines[lyricIdx] ? lyricLines[lyricIdx].text : "";
  live.querySelectorAll(".cq-row").forEach(row => {
    const i = +row.dataset.i;
    const isCur = i === state.idx && state.mode === "music";
    row.classList.toggle("playing", isCur);
    row.querySelector(".cq-play").textContent = isCur ? "★" : "▶";
    row.querySelector(".cq-lyric").textContent = isCur ? curLine : "";
  });
}

// 聊天内队列：点击切歌 / ♡ / 跳过（事件委托）
chatList.addEventListener("click", async (e) => {
  const row = e.target.closest(".cq-row");
  if (!row || !row.closest(".msg.live")) return;
  const i = +row.dataset.i;
  const btn = e.target.closest(".cq-btn");
  if (btn) {
    const t = state.queue[i];
    if (!t) return;
    btn.textContent = "…";
    const res = await fetch("/api/feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: btn.dataset.act, title: t.title }),
    });
    const plan = await res.json().catch(() => null);
    if (plan) renderPlan(plan);
    return;
  }
  if (i >= 0 && i < state.queue.length) playAt(i);
});

async function loadHistory() {
  try {
    const j = await (await fetch("/api/history")).json();
    for (const m of j.messages || []) {
      addChat(m.role === "user" ? "user" : "dj", m.content, null, m.speech_url, m.id);
    }
    scrollBottom(true);
  } catch { /* 忽略 */ }
}

// 翻阅聊天 → 大控件收起为迷你播放器
// 修复：只有用户主动滚动（wheel/touch）才允许收起，初载自动滚底不触发
// 收起阈值 = 滚过整个展开区（而不是固定 50px），小屏大展开区都适用
let compactArmed = false;
let zoneH = 0;
scroller.addEventListener("wheel", () => { compactArmed = true; }, { passive: true });
scroller.addEventListener("touchstart", () => { compactArmed = true; }, { passive: true });

scroller.addEventListener("scroll", () => {
  updateTopFab(); // 回顶钮显隐（滚过 300px 出现）
  if (!compactArmed) return;

  if (!state.compact) {
    // 展开态：滚过整个展开区 → 收起
    zoneH = $("#player-zone").offsetHeight || zoneH;
    if (scroller.scrollTop > zoneH - 24) {
      state.compact = true;
      $("#mini-bar").hidden = false;
      $("#player-zone").style.display = "none";
      syncMiniBar();
      scroller.scrollTop = Math.max(0, scroller.scrollTop);
    }
  } else if (scroller.scrollTop <= 24) {
    // 收起态：滚回最顶端才展开（与收起阈值拉开距离，防振荡）
    state.compact = false;
    $("#mini-bar").hidden = true;
    $("#player-zone").style.display = "";
  }
});

/* ---------- 回到顶部按钮 ---------- */
function updateTopFab() {
  const inPlayer = !!document.querySelector("#view-player.active");
  $("#btn-top").hidden = !inPlayer || scroller.scrollTop < 300;
}
$("#btn-top").addEventListener("click", () => {
  compactArmed = false; // 平滑滚动途中不再触发收起，防振荡
  scroller.scrollTo({ top: 0, behavior: "smooth" });
  // 回顶同时展开电台区，看到完整 DJ 卡
  state.compact = false;
  $("#mini-bar").hidden = true;
  $("#player-zone").style.display = "";
});

/* ---------- 清屏聊天（只清界面，DJ 的记忆保留在服务器） ---------- */
$("#btn-clear").addEventListener("click", () => {
  if (!chatList.children.length) return;
  if (!confirm("清屏只收起聊天界面，DJ 的记忆和播放记录都保留。继续？")) return;
  chatList.innerHTML = "";
  state.compact = false;
  compactArmed = false;
  $("#mini-bar").hidden = true;
  $("#player-zone").style.display = "";
  scroller.scrollTop = 0;
  addChat("dj", "🧹 聊天已清屏。我的记忆还在，随时点歌或聊两句。", null);
});

function syncMiniBar() {
  const t = state.queue[state.idx];
  const hasTrack = !!t;
  $("#mb-title").textContent = t ? t.title : (state.mode === "speech" ? "DJ 说话中…" : "未在播放");
  $("#mb-artist").textContent = t ? t.artist : "";
  $("#mb-play").textContent = audio.paused ? "▶" : "⏸";
  // 空态：禁用控制按钮（不死控件）
  $("#mb-play").classList.toggle("disabled", !hasTrack && state.mode !== "speech");
  $("#mb-next").classList.toggle("disabled", !hasTrack);
}

/* ---------- 渲染 ---------- */
const SLOT_NAMES = { morning: "晨间档", focus: "专注档", lunch: "午间档", evening: "晚高峰档", night: "夜档", midnight: "深夜档", "weekend-morning": "周末慢启动" };

function renderPlan(plan, auto = true) {
  const hasQueue = !!(plan.queue && plan.queue.length);
  if (plan.say) {
    $("#dj-say").textContent = plan.say;
    $("#dj-reason").textContent = plan.reason ? "编排理由：" + plan.reason : "";
    pulseDJ();
    addChat("dj", plan.say, hasQueue ? plan.queue : null, plan.speechUrl);  }
  $("#slot-badge").textContent = SLOT_NAMES[plan.slot] || plan.slot || "—";

  if (hasQueue) {
    state.queue = plan.queue;
    state.idx = -1;
    state.prefetched = null;
    renderQueue();
  }
  syncMiniBar();

  // auto=false：页面初载只恢复界面，不自动开播
  if (!auto) {
    // 但语音重播条要恢复（刷新后仍可重播 DJ 语音）
    if (plan.speechUrl) {
      state.speechUrl = plan.speechUrl;
      $("#tts-bar").hidden = false;
    }
    return;
  }

  const trigger = plan.trigger || "";
  const musicBusy = state.mode === "music" && !audio.paused;
  const userActed = trigger === "chat" || trigger === "feedback" || trigger === "next";

  if (plan.speechUrl) {
    state.speechUrl = plan.speechUrl;
    $("#tts-bar").hidden = false;

    // 打断规则：空闲→先说话；用户主动操作→先说话；
    // 音乐播放中收到调度推送→不打断，这首歌放完自动接新队列
    const speechPlaying = state.mode === "speech";
    const interrupt = !musicBusy || userActed;

    if (speechPlaying && !userActed) return; // DJ 说话中来了新编排：不重说
    if (interrupt) {
      playSpeech(plan.speechUrl, hasQueue);
    } else {
      $("#play-hint").textContent = "🎙️ DJ 有新话，这首播完就换";
      audio.onended = () => { if (state.queue.length) playAt(0); };
    }
  } else if (hasQueue && !musicBusy) {
    playAt(0);
  }
}

/* ---------- 播放状态：动效 + 提示 ---------- */
function setMode(m) {
  state.mode = m;
  document.querySelectorAll(".eq").forEach(eq => eq.hidden = m !== "music");
  const hint = $("#play-hint");
  if (m === "speech") hint.textContent = "🎙️ DJ 说话中…";
  else if (m === "music") hint.textContent = "♪ 音乐播放中";
  else hint.textContent = "";
  syncMiniBar();
}

function fmt(s) {
  if (!isFinite(s) || s < 0) return "--:--";
  s = Math.floor(s);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/* 先说话 → 说完接歌 */
function playSpeech(url, thenQueue) {
  state.pendingQueue = thenQueue;
  setMode("speech");
  audio.src = url;
  audio.onended = () => {
    if (state.pendingQueue) playAt(0);
    else setMode(null);
  };
  audio.play().catch(() => {
    $("#play-hint").textContent = "▶ 点「播放 DJ 语音」开始";
  });
}

function renderQueue() {
  $("#queue").innerHTML = state.queue.map((t, i) => `
    <div class="track ${i === state.idx ? "playing" : ""}" data-i="${i}">
      <div class="t-info">
        <div class="t-title">${i + 1}. ${esc(t.title)}</div>
        <div class="t-artist">${esc(t.artist)} · ${t.source === "mock" ? "mock" : "网易云"}</div>
      </div>
      <div class="t-actions">
        <button data-act="like" title="喜欢">♡</button>
        <button data-act="skip" title="跳过">⏭</button>
      </div>
    </div>`).join("");
  bindTrackActions();
  syncMiniBar();
}

function bindTrackActions() {
  document.querySelectorAll(".track .t-actions button").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const i = +e.target.closest(".track").dataset.i;
      const t = state.queue[i];
      e.target.textContent = "…";
      const res = await fetch("/api/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: btn.dataset.act, title: t.title }),
      });
      const plan = await res.json().catch(() => null);
      if (plan) renderPlan(plan);
    });
  });
}

/* ---------- 歌词显示 ---------- */
let lyricLines = [];   // [{t(秒), text}]
let lyricIdx = -1;

// 解析 LRC：支持一行多时间戳 [00:01.02][00:05]歌词
function parseLrc(lrc) {
  const out = [];
  for (const raw of (lrc || "").split("\n")) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of stamps) out.push({ t: (+m[1]) * 60 + (+m[2]), text });
  }
  return out.sort((a, b) => a.t - b.t).filter(l => l.text);
}

function setLyrics(lrc) {
  lyricLines = parseLrc(lrc);
  lyricIdx = -1;
  const box = $("#lyrics");
  const inner = $("#lyrics-inner");
  if (!lyricLines.length) { box.hidden = true; inner.innerHTML = ""; return; }
  inner.innerHTML = lyricLines.map((l, i) => `<div class="lyr" data-i="${i}">${esc(l.text)}</div>`).join("");
  box.hidden = false;
}

function syncLyrics() {
  if (!lyricLines.length || state.mode !== "music") return;
  const t = audio.currentTime + 0.3; // 轻微提前，对齐感知
  let i = lyricIdx;
  if (i >= 0 && lyricLines[i] && t >= lyricLines[i].t && (i + 1 >= lyricLines.length || t < lyricLines[i + 1].t)) return; // 未换行
  i = lyricLines.findIndex(l => l.t > t) - 1;
  if (i < -1) i = lyricLines.length - 1;
  if (i === lyricIdx) return;
  lyricIdx = i;
  const inner = $("#lyrics-inner");
  inner.querySelectorAll(".lyr.on").forEach(el => el.classList.remove("on"));
  if (i < 0) return; // 前奏未开唱
  const el = inner.querySelector(`.lyr[data-i="${i}"]`);
  if (el) {
    el.classList.add("on");
    const box = $("#lyrics");
    box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
  }
  syncChatQueues(); // 歌词句同步到聊天流的正在播放卡片
}

async function playAt(i) {
  if (i < 0 || i >= state.queue.length) return;
  state.idx = i;
  const t = state.queue[i];
  setLyrics(t.lyric); // 随歌换词
  state.mode = "music";
  setMode("music");
  audio.onended = null;

  // 链接缺失时现场补取（NCM 服务重启/直链过期的兜底）
  if (!t.url) {
    $("#play-hint").textContent = "↻ 正在获取播放链接…";
    try {
      const j = await (await fetch("/api/song/url?id=" + t.id)).json();
      t.url = j.url;
    } catch { /* 保持 null */ }
  }

  if (t.url) {
    audio.src = t.url;
    audio.play().catch(() => console.warn("autoplay blocked"));
  } else {
    $("#play-hint").textContent = "⚠ 这首暂时拿不到链接（可能需要 VIP），试试别的";
  }
  renderQueue();
  syncChatQueues();
  prefetchNext();
}

function prefetchNext() {
  const next = state.queue[state.idx + 1];
  if (next && next.url && !state.prefetched) {
    const a = new Audio();
    a.preload = "auto";
    a.src = next.url;
    state.prefetched = a;
  }
}

function pulseDJ() {
  const el = $("#dj-speaking");
  el.classList.add("speaking");
  setTimeout(() => el.classList.remove("speaking"), 2500);
}

function esc(s) { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

/* ---------- 进度条 + 播放状态监听 ---------- */
audio.addEventListener("play", () => {
  $("#btn-play").textContent = "⏸";
  $("#mb-play").textContent = "⏸";
  if (state.mode) setMode(state.mode);
  syncChatQueues();
});
audio.addEventListener("pause", () => {
  $("#btn-play").textContent = "▶";
  $("#mb-play").textContent = "▶";
  document.querySelectorAll(".eq").forEach(eq => eq.hidden = true);
  if (state.mode === "music") $("#play-hint").textContent = "⏸ 已暂停";
  syncChatQueues();
});
audio.addEventListener("ended", () => {
  document.querySelectorAll(".eq").forEach(eq => eq.hidden = true);
});

// 播放出错（直链过期等）：刷新链接重试一次
let retriedSongKey = "";
audio.addEventListener("error", async () => {
  const t = state.queue[state.idx];
  if (!t) return;
  const key = String(t.id);
  if (retriedSongKey === key) {
    $("#play-hint").textContent = "⚠ 这首播放失败，试试别的";
    return;
  }
  retriedSongKey = key;
  $("#play-hint").textContent = "↻ 链接失效，刷新重试…";
  try {
    const j = await (await fetch("/api/song/url?id=" + t.id)).json();
    if (j.url) {
      t.url = j.url;
      audio.src = j.url;
      audio.play().catch(() => {});
    }
  } catch { /* 放弃 */ }
});

function updateProgress() {
  if (!isFinite(audio.duration) || !audio.duration) return;
  const pct = (audio.currentTime / audio.duration * 100).toFixed(2) + "%";
  $("#progress-fill").style.width = pct;
  $("#mb-progress-fill").style.width = pct;
  $("#progress-time").textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
}
audio.addEventListener("loadedmetadata", () => {
  $("#progress").hidden = false;
  $("#progress-time").hidden = false;
  $("#progress-fill").style.width = "0%";
  $("#mb-progress-fill").style.width = "0%";
  $("#progress-time").textContent = `00:00 / ${fmt(audio.duration)}`;
});
audio.addEventListener("timeupdate", () => { updateProgress(); syncLyrics(); });

$("#progress").addEventListener("click", (e) => {
  if (!isFinite(audio.duration) || !audio.duration) return;
  const r = e.currentTarget.getBoundingClientRect();
  audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
});
$("#mb-progress").addEventListener("click", (e) => {
  if (!isFinite(audio.duration) || !audio.duration) return;
  const r = e.currentTarget.getBoundingClientRect();
  audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
});

/* ---------- 播放控制（大控件 + 迷你条镜像） ---------- */
function togglePlay() {
  if (!audio.src && state.queue.length) return playAt(0);
  if (audio.paused) { audio.play().catch(() => {}); }
  else { audio.pause(); }
}
$("#btn-play").addEventListener("click", togglePlay);
$("#mb-play").addEventListener("click", togglePlay);

async function playNext() {
  if (state.idx + 1 < state.queue.length) return playAt(state.idx + 1);
  const res = await fetch("/api/next");
  const plan = await res.json().catch(() => null);
  if (plan) renderPlan(plan);
}
$("#btn-next").addEventListener("click", playNext);
$("#mb-next").addEventListener("click", playNext);

$("#btn-prev").addEventListener("click", () => {
  if (state.idx > 0) playAt(state.idx - 1);
});
$("#btn-tts-play").addEventListener("click", () => {
  if (state.speechUrl) playSpeech(state.speechUrl, state.queue.length > 0);
});

/* ---------- 聊天输入 ---------- */
$("#btn-send").addEventListener("click", sendChat);
$("#chat-input").addEventListener("keydown", e => { if (e.key === "Enter") sendChat(); });

async function sendChat() {
  const text = $("#chat-input").value.trim();
  if (!text) return;
  $("#chat-input").value = "";
  addChat("user", text, null);
  addChat("dj", "…", null); // typing 占位
  const typing = chatList.querySelector(".msg:last-child .bubble");
  try {
    const res = await fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const plan = await res.json();
    if (typing && typing.closest(".msg")) typing.closest(".msg").remove(); // 移除占位
    renderPlan(plan);
  } catch (e) {
    if (typing && typing.closest(".msg")) typing.closest(".msg").remove();
    addChat("dj", "（出错了：" + e.message + "）", null);
  }
}

/* ---------- Profile / Settings ---------- */
let profileData = null;

// 轻量 markdown 渲染（标题/粗体/列表/换行），档案页专用
function mdLite(src) {
  let h = esc(src || "");
  h = h.replace(/^#### (.*)$/gm, '<div class="md-h4">$1</div>');
  h = h.replace(/^### (.*)$/gm, '<div class="md-h3">$1</div>');
  h = h.replace(/^## (.*)$/gm, '<div class="md-h2">$1</div>');
  h = h.replace(/^# (.*)$/gm, '<div class="md-h1">$1</div>');
  h = h.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  h = h.replace(/^\s*[-•] (.*)$/gm, '<div class="md-li">· $1</div>');
  h = h.replace(/^\s*(\d+)\. (.*)$/gm, '<div class="md-li">$1. $2</div>');
  h = h.replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>");
  return h;
}

async function loadProfile(tab) {
  if (!profileData) {
    profileData = await (await fetch("/api/taste")).json();
  }
  const c = $("#profile-content");
  if (tab === "recent") {
    c.textContent = profileData.recentPlays.length
      ? profileData.recentPlays.map(p => `${p.played_at}  ${p.title} - ${p.artist}${p.liked ? "  ♡" : ""}${p.skipped ? "  ⏭" : ""}`).join("\n")
      : "（还没有播放记录）";
  } else {
    c.innerHTML = profileData[tab] ? mdLite(profileData[tab]) : "（空）";
  }
  document.querySelectorAll(".profile-tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
}
document.querySelectorAll(".profile-tabs button").forEach(b =>
  b.addEventListener("click", () => loadProfile(b.dataset.tab)));

async function loadSettings() {
  loadNcmStatus();
  const now = await (await fetch("/api/now")).json();
  const wx = await (await fetch("/api/weather")).json();
  $("#city-status").textContent = `当前：${wx.city}（${wx.ok ? wx.desc + " " + wx.temp + "°C" : "天气源不可用"}）`;
  const playing = now.playing;
  $("#set-brain").textContent = playing && playing.reason === "no-key fallback" ? "未配置 Key（演示模式）" : "已连接";
  $("#set-brain").className = "status " + (playing && playing.reason === "no-key fallback" ? "bad" : "ok");
  $("#set-tts").textContent = playing && playing.speechUrl ? "已连接" : "未验证（触发一次编排后可见）";
  $("#set-tts").className = "status " + (playing && playing.speechUrl ? "ok" : "");
  const ncmTrack = state.queue.find(t => t.source);
  const ncmOk = ncmTrack && (ncmTrack.source === "ncm" || ncmTrack.source === "ncm-official");
  $("#set-ncm").textContent = ncmTrack ? (ncmOk ? (ncmTrack.source === "ncm-official" ? "网易云官方开放平台" : "网易云已连接") : "未连接（mock 模式）") : "待验证";
  $("#set-ncm").className = "status " + (ncmOk ? "ok" : "bad");

  // API 配置区
  try {
    const s = await (await fetch("/api/settings")).json();
    $("#set-deepseek").value = "";
    $("#set-deepseek").placeholder = s.deepseekConfigured ? `当前 ${s.deepseekKey}（留空不修改）` : "sk-…（未配置）";
    $("#key-deepseek-status").textContent = s.deepseekConfigured ? "✅ 已配置" : "⚠ 未配置（演示模式）";
    $("#key-deepseek-status").className = "key-status " + (s.deepseekConfigured ? "ok" : "warn");
    $("#set-mimo").value = "";
    $("#set-mimo").placeholder = s.mimoConfigured ? `当前 ${s.mimoKey}（留空不修改）` : "sk-…（未配置）";
    $("#key-mimo-status").textContent = s.mimoConfigured ? "✅ 已配置" : "⚠ 未配置（无语音）";
    $("#key-mimo-status").className = "key-status " + (s.mimoConfigured ? "ok" : "warn");
    const sel = $("#set-voice");
    if (!sel.dataset.filled) {
      sel.innerHTML = s.mimoVoices.map(v => `<option>${v}</option>`).join("");
      sel.dataset.filled = "1";
    }
    sel.value = s.mimoVoice;
    if (sel.value !== s.mimoVoice) { sel.insertAdjacentHTML("afterbegin", `<option>${s.mimoVoice}</option>`); sel.value = s.mimoVoice; }
  } catch { /* 忽略 */ }
}

/* ---------- 保存 API 配置 ---------- */
$("#btn-save-settings").addEventListener("click", async () => {
  const btn = $("#btn-save-settings");
  const deepseekKey = $("#set-deepseek").value.trim();
  const mimoKey = $("#set-mimo").value.trim();
  const mimoVoice = $("#set-voice").value;
  if (!deepseekKey && !mimoKey && !mimoVoice) {
    $("#settings-status").textContent = "没有要保存的修改";
    return;
  }
  btn.disabled = true;
  $("#settings-status").textContent = "保存中…";
  try {
    const res = await fetch("/api/settings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deepseekKey, mimoKey, mimoVoice }),
    });
    const j = await res.json();
    $("#settings-status").textContent = j.saved ? "✅ 已保存并热生效" : "❌ " + (j.error || "保存失败");
    if (j.saved) {
      $("#set-deepseek").value = "";
      $("#set-mimo").value = "";
      loadSettings();
    }
  } catch (e) {
    $("#settings-status").textContent = "❌ " + e.message;
  }
  btn.disabled = false;
});

/* ---------- 退出 NCM 登录（服务端路由见下） ---------- */

/* ---------- 城市切换 ---------- */
$("#btn-city").addEventListener("click", async () => {
  const name = ($("#city-custom").value.trim() || $("#city-preset").value).trim();
  if (!name) { $("#city-status").textContent = "请先选或输入城市"; return; }
  const btn = $("#btn-city");
  btn.disabled = true;
  $("#city-status").textContent = "切换中…";
  try {
    const res = await fetch("/api/city", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = await res.json();
    if (j.saved) {
      $("#city-status").textContent = `✅ 已切换到 ${j.saved.name}`;
      $("#city-custom").value = "";
      refreshWeather();
    } else {
      $("#city-status").textContent = "❌ " + (j.error || "切换失败");
    }
  } catch (e) {
    $("#city-status").textContent = "❌ " + e.message;
  }
  btn.disabled = false;
});

/* ---------- 网易云账号扫码登录 ---------- */
let ncmPollTimer = null;

async function loadNcmStatus() {
  const el = $("#ncm-login-status");
  try {
    const s = await (await fetch("/api/ncm-login/status")).json();
    if (s.loggedIn) {
      el.innerHTML = `✅ 已登录：<b>${esc(s.nickname)}</b>（VIP 歌曲完整播放已生效）`;
    } else if (s.stale) {
      el.textContent = "⚠ 登录态已过期，请重新扫码";
    } else {
      el.textContent = "未登录（VIP 歌曲只有 30 秒试听）";
    }
  } catch (e) {
    el.textContent = "状态获取失败：" + e.message;
  }
}

$("#btn-ncm-login").addEventListener("click", async () => {
  const area = $("#ncm-qr-area");
  const hint = $("#ncm-qr-hint");
  try {
    $("#btn-ncm-login").disabled = true;
    hint.textContent = "生成二维码中…";
    area.hidden = false;
    const j = await (await fetch("/api/ncm-login/qr")).json();
    $("#ncm-qr-img").src = j.qrimg;
    hint.textContent = "网易云 App → 扫一扫 → 确认登录";
    // 轮询扫码状态（最多 3 分钟）
    clearInterval(ncmPollTimer);
    const started = Date.now();
    ncmPollTimer = setInterval(async () => {
      if (Date.now() - started > 180000) {
        clearInterval(ncmPollTimer);
        hint.textContent = "二维码已过期，请重新生成";
        return;
      }
      try {
        const c = await (await fetch("/api/ncm-login/check?key=" + encodeURIComponent(j.key))).json();
        if (c.code === 802) hint.textContent = "已扫码，请在手机上确认…";
        if (c.code === 803) {
          clearInterval(ncmPollTimer);
          area.hidden = true;
          loadNcmStatus();
          refreshWeather();
        }
        if (c.code === 800) {
          clearInterval(ncmPollTimer);
          hint.textContent = "二维码已过期，请重新生成";
        }
      } catch { /* 轮询失败继续 */ }
    }, 2000);
  } catch (e) {
    hint.textContent = "生成失败：" + e.message;
    $("#btn-ncm-login").disabled = false;
  }
});

$("#btn-ncm-logout").addEventListener("click", async () => {
  try {
    await fetch("/api/ncm-logout", { method: "POST" });
    loadNcmStatus();
  } catch (e) {
    $("#ncm-login-status").textContent = "退出失败：" + e.message;
  }
});

/* ---------- SW 更新自动生效（根治"刷两次"） ---------- */
if ("serviceWorker" in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    location.reload(); // 新 SW 接管时自动刷新一次，用户无感升级
  });
}

/* ---------- 访问令牌 ---------- */
function showAuth() {
  $("#auth-overlay").hidden = false;
}
$("#btn-auth").addEventListener("click", async () => {
  const token = $("#auth-token").value.trim();
  if (!token) return;
  $("#btn-auth").disabled = true;
  $("#auth-err").textContent = "验证中…";
  try {
    const res = await fetch("/api/token", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      location.reload(); // cookie 已下发，刷新进入
      return;
    }
    $("#auth-err").textContent = "密码不对，再试一次";
  } catch (e) {
    $("#auth-err").textContent = "网络错误：" + e.message;
  }
  $("#btn-auth").disabled = false;
});
$("#auth-token").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#btn-auth").click();
});

/* ---------- 初始化 ---------- */
(async () => {
  // 访问令牌探测：服务器启用认证且本机未解锁 → 只显示密码层，不初始化
  try {
    const need = await (await fetch("/api/token/required")).json();
    if (need.required) {
      const probe = await fetch("/api/now");
      if (probe.status === 401) { showAuth(); return; }
    }
  } catch { /* 探测失败继续走原流程 */ }

  await loadHistory();
  const now = await (await fetch("/api/now")).json();
  $("#slot-badge").textContent = SLOT_NAMES[now.slot] || now.slot;
  if (now.playing) renderPlan(now.playing, false);
  else {
    $("#dj-say").textContent = "电台就绪。点「下一档」让我开始编排，或直接跟我说句话。";
    addChat("dj", "电台就绪。点「下一档」让我开始编排，或直接跟我说句话。", null);
  }
  scrollBottom(true);
})();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
