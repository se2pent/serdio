// ncm-login.js — 本地 NCM 服务扫码登录：生成二维码 → 轮询 → 保存 cookie 到 .data/ncm-cookie.txt
const fs = require("fs");
const path = require("path");
const config = require("./src/config");

const DATA = path.join(__dirname, ".data");
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

async function ncm(ep, params = {}) {
  const url = new URL(config.ncm.base + ep);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  return res.json();
}

(async () => {
  const keyRes = await ncm("/login/qr/key", { timestamp: Date.now() });
  const key = keyRes.data.unikey;
  console.log("[login] key 获取成功");

  const qr = await ncm("/login/qr/create", { key, qrimg: true, timestamp: Date.now() });
  const b64 = qr.data.qrimg; // data:image/png;base64,...
  fs.writeFileSync(path.join(DATA, "ncm-qr.png"), Buffer.from(b64.split(",")[1], "base64"));
  console.log("QR_READY");

  // 轮询最多 3 分钟
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 2000));
    let c;
    try { c = await ncm("/login/qr/check", { key, timestamp: Date.now() }); }
    catch { continue; }
    if (c.code === 802) console.log("[login] 已扫码，请在手机上确认…");
    if (c.code === 803) {
      fs.writeFileSync(path.join(DATA, "ncm-cookie.txt"), c.cookie);
      console.log("LOGIN_OK cookie 已保存");
      process.exit(0);
    }
    if (c.code === 800) { console.log("QR_EXPIRED 二维码过期"); process.exit(1); }
  }
  console.log("TIMEOUT 等待超时");
  process.exit(1);
})().catch(e => { console.error("login 脚本失败:", e.message); process.exit(1); });
