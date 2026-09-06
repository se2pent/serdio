// ncm.js — MUSIC 层：官方开放平台 CLI 优先（search），本地 NeteaseCloudMusicApi 兜底（song_url/lyric）
// 官方 search 返回 originalId（网易云数字ID），可直接走本地直链接口播放
const config = require("./config");
const crypto = require("crypto");
const fs = require("fs");
const { execFile } = require("child_process");
const path = require("path");

// 本地 NCM 登录态（设置页扫码后保存），VIP 歌完整播放靠它
const COOKIE_FILE = path.join(__dirname, "..", ".data", "ncm-cookie.txt");
let _cookieCache = null;
function getCookie() {
  if (_cookieCache === null) {
    try { _cookieCache = fs.readFileSync(COOKIE_FILE, "utf8").trim(); }
    catch { _cookieCache = ""; }
  }
  return _cookieCache;
}
function refreshCookie() { _cookieCache = null; }

// 直接用 node 跑 CLI 的 JS 入口（Windows spawn .cmd 会 EINVAL，且避免 shell 编码问题）
const NCM_CLI_JS = path.join(__dirname, "..", "node_modules", "@music163", "ncm-cli", "dist", "index.js");
const NODE_EXE = process.execPath;

const MOCK_TRACKS = [
  { title: "雨中钢琴", artist: "Serdio Mock", query: "钢琴 雨声", mood: "calm" },
  { title: "城市晨光", artist: "Serdio Mock", query: "民谣 清晨", mood: "gentle" },
  { title: "专注循环", artist: "Serdio Mock", query: "lofi instrumental", mood: "focus" },
  { title: "夜色微醺", artist: "Serdio Mock", query: "city pop", mood: "uplift" },
  { title: "深夜氛围", artist: "Serdio Mock", query: "ambient piano", mood: "calm" },
];

async function ncmFetch(endpoint, params = {}) {
  const url = new URL(config.ncm.base + endpoint);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const ck = getCookie();
  if (ck) url.searchParams.set("cookie", ck);
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`NCM ${endpoint} HTTP ${res.status}`);
  return res.json();
}

// 官方 CLI 搜索（登录态、含版权信息）
function officialSearch(keyword, limit) {
  return new Promise((resolve) => {
    execFile(NODE_EXE, [NCM_CLI_JS, "search", "song", "--keyword", keyword, "--limit", String(limit), "--output", "json"],
      { timeout: 20000, windowsHide: true }, (err, stdout) => {
        if (err) return resolve(null);
        try {
          const j = JSON.parse(stdout);
          const recs = (j.data && (Array.isArray(j.data) ? j.data : j.data.records)) || [];
          resolve(recs.map(r => ({
            id: r.originalId,
            title: r.name,
            artist: (r.artists || []).map(a => a.name).join("/"),
            album: r.album ? r.album.name : "",
            source: "ncm-official",
          })));
        } catch { resolve(null); }
      });
  });
}

async function search(keyword, limit = 5) {
  // 官方优先
  const official = await officialSearch(keyword, limit);
  if (official && official.length) return official;

  // 非官方兜底
  try {
    const j = await ncmFetch("/search", { keywords: keyword, limit });
    const songs = (j.result && j.result.songs) || [];
    return songs.map(s => ({
      id: s.id,
      title: s.name,
      artist: (s.artists || []).map(a => a.name).join("/"),
      album: s.album ? s.album.name : "",
      source: "ncm",
    }));
  } catch {
    // mock 降级：按关键词做情绪匹配
    const kw = /钢琴|雨|ambient|piano|坂本/i.test(keyword) ? "calm"
      : /lofi|专注|instrumental|nujabes/i.test(keyword) ? "focus"
      : /city|夜|pop/i.test(keyword) ? "uplift" : "gentle";
    return MOCK_TRACKS.filter(t => t.mood === kw).slice(0, 3).map((t, i) => ({
      id: "mock-" + crypto.randomBytes(3).toString("hex"),
      title: t.title, artist: t.artist, album: "Mock Session", source: "mock",
    }));
  }
}

async function songUrl(id) {
  if (String(id).startsWith("mock-")) return `/mock-audio/${id}.wav`;
  try {
    const j = await ncmFetch("/song/url", { id, br: 320000 });
    const d = j.data && j.data[0];
    return (d && d.url) || null;
  } catch {
    return null;
  }
}

async function lyric(id) {
  if (String(id).startsWith("mock-")) return "[00:00.00]（mock 曲目无歌词）";
  try {
    const j = await ncmFetch("/lyric", { id });
    return (j.lrc && j.lrc.lyric) || "";
  } catch {
    return "";
  }
}

// 推荐：根据歌单关键词搜一轮，凑齐 n 首
async function recommend(keywords, n = 3) {
  const picked = [];
  for (const kw of keywords) {
    if (picked.length >= n) break;
    const hits = await search(kw, n * 2);
    for (const h of hits) {
      if (picked.length < n && !picked.some(p => p.title === h.title)) picked.push(h);
    }
  }
  return picked;
}

module.exports = { search, songUrl, lyric, recommend, getCookie, refreshCookie };
