// ncm-server.js — 拉起 NeteaseCloudMusicApi 本地服务（端口 3000）
const { serveNcmApi } = require("@neteaseapireborn/api");

const port = 3000;
serveNcmApi({ port, checkVersion: false })
  .then(() => console.log(`[ncm] NeteaseCloudMusicApi 已启动: http://localhost:${port}`))
  .catch((e) => {
    console.error("[ncm] 启动失败:", e.message);
    process.exit(1);
  });
