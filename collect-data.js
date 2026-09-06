// collect-data.js — 一键采集网易云个人数据 → .data/*.json → 供 distill-taste.js 蒸馏
// 用法：
//   node collect-data.js                  # 采集 红心歌单 + 听歌排行
//   node collect-data.js <歌单数字ID>      # 额外采集一个收藏歌单（网易云分享链接里的数字ID）
// 前置：ncm-cli 已登录（node node_modules/@music163/ncm-cli/dist/index.js login），
//       本地 NCM 服务运行中（node ncm-server.js，采集额外歌单时需要）
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const config = require("./src/config");

const NCM_CLI = path.join(__dirname, "node_modules", "@music163", "ncm-cli", "dist", "index.js");
const DATA = path.join(__dirname, ".data");
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

function cli(args) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [NCM_CLI, ...args], { maxBuffer: 100 * 1024 * 1024, timeout: 120000 }, (err, stdout) => {
      if (err) return reject(new Error("CLI 执行失败（未登录？）：`node node_modules/@music163/ncm-cli/dist/index.js login` 扫码"));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error("CLI 输出不是 JSON：" + String(stdout).slice(0, 120))); }
    });
  });
}
// CLI 输出形状不统一：数组 / {data:[...]} / {data:{records:[...]}} 都兼容
function unwrap(j) {
  return Array.isArray(j) ? j
    : (j.data && (Array.isArray(j.data) ? j.data : j.data.records)) || [];
}

(async () => {
  // 0. 登录检查
  let info = null;
  try { info = await cli(["user", "info", "--output", "json"]); }
  catch { console.error("❌ ncm-cli 未登录。先执行：\n  node node_modules/@music163/ncm-cli/dist/index.js login"); process.exit(1); }
  const profile = info && (info.profile || (info.data && info.data.profile));
  console.log("已登录：", profile ? (profile.nickname || "未知") : "（无法读取昵称，继续尝试）");

  // 1. 红心歌单：先拿歌单元数据（含加密ID），再翻页拉全部歌曲
  console.log("采集中：红心歌单…");
  const favMeta = await cli(["user", "favorite", "--output", "json"]);
  const favPl = favMeta.data || {};
  const encId = favPl.id;
  const trackCount = favPl.trackCount || 500;
  console.log(`  红心歌单《${favPl.name}》共 ${trackCount} 首，翻页拉取中…`);
  const allTracks = [];
  for (let offset = 0; offset < trackCount; offset += 500) {
    const page = await cli(["playlist", "tracks", "--playlistId", encId, "--limit", "500", "--offset", String(offset), "--output", "json"]);
    const batch = unwrap(page);
    allTracks.push(...batch);
    if (batch.length < 500) break;
    console.log(`  已拉取 ${allTracks.length} 首…`);
  }
  fs.writeFileSync(path.join(DATA, "fav-page1.json"), JSON.stringify({ data: allTracks }), "utf8");
  console.log(`  → .data/fav-page1.json（${allTracks.length} 首）`);

  // 2. 听歌排行（总排行 TOP100）
  console.log("采集中：听歌排行…");
  const rank = await cli(["user", "listen-ranking", "--type", "0", "--limit", "100", "--output", "json"]);
  fs.writeFileSync(path.join(DATA, "ranking.json"), JSON.stringify(rank), "utf8");
  console.log("  → .data/ranking.json");

  // 3. 可选：额外收藏歌单（数字 ID，走本地 NCM /playlist/detail）
  const plId = process.argv[2];
  if (plId) {
    if (!/^\d+$/.test(plId)) { console.error("歌单 ID 应为纯数字（网易云分享链接里那串）"); process.exit(1); }
    console.log(`采集中：收藏歌单 ${plId}…`);
    const j = await fetch(config.ncm.base + "/playlist/detail?id=" + plId, { signal: AbortSignal.timeout(15000) }).then(r => r.json());
    if (!j.playlist) { console.error("歌单获取失败：", JSON.stringify(j).slice(0, 120)); process.exit(1); }
    // 字段归一化：本地 NCM 用 ar/al/dt，蒸馏脚本吃 artists/album/duration
    const tracks = (j.playlist.trackIds || []).map(t => t.id).slice(0, 0); // 占位防误用
    const raw = (j.playlist.tracks || []).map(t => ({
      id: t.id,
      name: t.name,
      artists: (t.ar || t.artists || []).map(a => ({ name: a.name })),
      album: t.al || t.album,
      duration: t.dt || t.duration,
    }));
    fs.writeFileSync(path.join(DATA, "pl-raw.json"),
      JSON.stringify({ playlist: { name: j.playlist.name, tracks: raw } }), "utf8");
    console.log(`  → .data/pl-raw.json（${raw.length} 首，《${j.playlist.name}》）`);
  } else {
    console.log("（未提供歌单 ID，跳过额外歌单。用法：node collect-data.js 歌单数字ID）");
  }

  console.log("\n✅ 采集完成。下一步执行蒸馏：\n  node distill-taste.js");
})().catch(e => { console.error("采集失败:", e.message); process.exit(1); });
