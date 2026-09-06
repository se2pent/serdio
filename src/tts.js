// tts.js — 声音管线：小米 MiMo TTS（OpenAI 兼容 chat/completions + audio）
// 输出缓存：tts-cache/<sha1>.mp3 —— 同文本零成本复播
const config = require("./config");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const cacheDir = path.join(__dirname, "..", "tts-cache");
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

async function synthesize(text) {
  const hash = crypto.createHash("sha1").update(config.mimo.voice + "::" + text).digest("hex");
  const file = path.join(cacheDir, hash + ".mp3");
  if (fs.existsSync(file)) return { file, url: `/tts/${hash}.mp3`, cached: true };

  if (!config.mimo.key || config.mimo.key === "PENDING") {
    throw new Error("MIMO_API_KEY 未配置");
  }

  // MiMo TTS 契约：assistant 消息 = 要合成的文本；audio 指定格式与音色
  const body = {
    model: config.mimo.model,
    messages: [
      { role: "user", content: "用温暖克制的深夜电台 DJ 语气朗读。" },
      { role: "assistant", content: text },
    ],
    audio: { format: "mp3", voice: config.mimo.voice },
  };

  const res = await fetch(config.mimo.baseUrl + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + config.mimo.key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`MiMo TTS HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }
  const j = await res.json();
  const b64 = j.choices && j.choices[0] && j.choices[0].message &&
    j.choices[0].message.audio && j.choices[0].message.audio.data;
  if (!b64) throw new Error("MiMo TTS 响应中无 audio.data");
  fs.writeFileSync(file, Buffer.from(b64, "base64"));
  return { file, url: `/tts/${hash}.mp3`, cached: false };
}

module.exports = { synthesize };
