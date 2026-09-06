// distill-taste.js — 把 红心歌单 + 收藏歌单(去重合并) + 听歌排行 蒸馏成 user/taste.md
// 数据：.data/fav-page1.json（红心）+ .data/pl-raw.json（《士卿_喜欢的音乐》）+ .data/ranking.json（听歌排行）
const fs = require("fs");
const path = require("path");
const config = require("./src/config");

const fav = require("./.data/fav-page1.json");
const pl = require("./.data/pl-raw.json");
const ranking = require("./.data/ranking.json");

// 压缩数据：只保留蒸馏需要的字段
function squeeze(list) {
  const recs = Array.isArray(list) ? list : (list && list.records) || [];
  return recs.map(r => {
    const song = r.song || r; // 听歌排行里包了一层 song
    return {
      id: song.originalId || song.id,
      t: song.name,
      a: (song.artists || []).map(x => x.name).join("/"),
      al: song.album ? song.album.name : undefined,
      d: song.duration ? Math.round(song.duration / 1000) : undefined,
      pc: r.playCount, // 排行榜的播放次数
    };
  });
}

const favTracks = squeeze(fav.data);
const rankTracks = squeeze(ranking.data);
const plRaw = squeeze(pl.playlist ? pl.playlist.tracks : pl.tracks);

// 去重合并：红心 ∪ 收藏歌单，重叠曲目标记 fav:true（双重喜欢的强信号）
const favIds = new Set(favTracks.map(t => t.id).filter(Boolean));
const favNames = new Set(favTracks.map(t => (t.t + "|" + t.a).toLowerCase()));
const merged = [];
const seen = new Set();
for (const t of [...favTracks.map(t => ({ ...t, fav: true })), ...plRaw]) {
  const key = t.id || (t.t + "|" + t.a).toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  if (!t.fav && (favIds.has(t.id) || favNames.has((t.t + "|" + t.a).toLowerCase()))) t.fav = true;
  merged.push(t);
}
const overlap = favTracks.filter(t => plRaw.some(p => p.id === t.id || (p.t + "|" + p.a).toLowerCase() === (t.t + "|" + t.a).toLowerCase())).length;
console.log(`红心 ${favTracks.length} + 歌单 ${plRaw.length} → 去重合并 ${merged.length} 首（重叠 ${overlap}）`);

const prompt = `你是音乐口味分析师。下面是一位听众的网易云音乐真实数据：
- 红心歌单 ∪ 收藏歌单《${(pl.playlist ? pl.playlist.name : "收藏歌单")}》去重合并（${merged.length} 首）。其中 "fav":true 表示同时出现在红心歌单里（双重喜欢的强信号）
- 听歌排行 TOP${rankTracks.length}（代表"实际重听率"）

合并曲目（${merged.length} 首）：
${JSON.stringify(merged)}

听歌排行：
${JSON.stringify(rankTracks)}

请蒸馏成一份给 AI 电台 DJ 用的《用户口味档案》，严格按以下 markdown 结构输出（中文）：

# taste.md — 听众口味档案（数据蒸馏）

## 核心画像
（3-4 句：这个人整体是什么类型的听众）

## 歌手权重 TOP10
（按红心+重听率综合排序，标注: 风格 | 为什么喜欢）

## 风格分布
（主要曲风及大致占比估计，如：民谣 30% / 摇滚 25% ...）

## 能量与情绪偏好
（偏安静还是燥？接受的人声语言？BPM 大致区间？）

## 场景推断
（哪些歌手适合早晨/工作/深夜，基于曲目气质判断）

## 宝藏与雷区
（冷门宝藏：小众但红心的；雷区：虽然有红心但气质冲突、电台应避开的组合）

## 给 DJ 的编播建议
（5 条以内，具体可执行，比如"每 3 首穿插 1 首XX"）

要求：判断要有数据支撑（引用具体歌手/曲目名），不要空泛。`;

async function main() {
  const res = await fetch(config.deepseek.baseUrl + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + config.deepseek.key },
    body: JSON.stringify({
      model: config.deepseek.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 3000,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error("DeepSeek HTTP " + res.status + ": " + (await res.text()).slice(0, 200));
  const j = await res.json();
  const md = j.choices[0].message.content.replace(/^```markdown\n?/, "").replace(/\n```$/, "");
  const out = path.join(__dirname, "user", "taste.md");
  fs.writeFileSync(out, md, "utf8");
  console.log("✅ taste.md 蒸馏完成 →", out, `(${md.length} 字符)`);
  console.log("--- 预览 ---");
  console.log(md.slice(0, 800));
}

main().catch(e => { console.error("蒸馏失败:", e.message); process.exit(1); });
