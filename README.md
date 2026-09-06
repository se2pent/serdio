# 📻 Serdio · 个人 AI 电台

> 一个真正"活着"的个人电台：它读懂你的听歌口味，像 DJ 一样编排声音、开口说话，早上七点叫你起床，深夜给你挑合适的歌。

Serdio 不是播放器，是一套 **DJ 系统**：大脑（DeepSeek）根据你的口味档案 + 此刻的时间/天气/心情，规划"说什么 → 放什么"，MiMo TTS 合成 DJ 语音，网易云音乐提供正版曲库，全部串成一段连贯的收听体验。

---

## ✨ 功能一览

- 🎙️ **DJ 编排播报**：每次编排先说话（开场白 + 选歌理由）再放歌，TTS 语音由 MiMo 合成
- 💬 **对话式点播**：直接跟 DJ 说"下雨了，来点钢琴"，返回专属曲目单，点卡片即可切歌
- 🧠 **口味画像驱动**：从你的红心歌单 / 听歌排行 / 自建歌单蒸馏出 `taste.md`，越听越懂你
- ⏰ **节律调度**：晨间唤醒 / 午间 / 专注 / 夜色 / 深夜五档作息，整点情绪检查，App 关了它也在播
- 🌤️ **天气情绪换装**：界面主题色随真实天气变化（晴 / 阴 / 雨 / 雪 / 雾 / 雷 七种情绪色）
- 🎵 **VIP 完整播放**：扫码登录网易云后，VIP 歌曲完整时长（扫码入口在设置页内）
- 🔐 **访问令牌**：公网部署时全接口上锁，输一次密码一年免登
- 📱 **三端形态**：电脑浏览器 / 手机 PWA（添加到主屏幕）/ 安卓 APK（Capacitor 打包）

## 🏗️ 架构

```
手机 App / 浏览器（PWA，单页三视图）
        │  HTTP + WebSocket
        ▼
┌─────────────────────────────┐
│  Serdio 服务端 (server.js)   │
│  ├─ brain.js    DeepSeek 编排│
│  ├─ tts.js      MiMo 语音    │
│  ├─ scheduler   节律调度器    │
│  ├─ state.db    记忆(SQLite) │
│  └─ ncm.js      音乐层       │
│      ├─ 官方CLI搜索(登录态)   │
│      └─ 本地NCM服务取直链 ────┼──► NeteaseCloudMusicApi (:3000)
└─────────────────────────────┘         │
        │                               ▼
        └── 音频播放：手机/浏览器直连网易云 CDN（音乐流量不过服务器）
```

## 📦 环境要求

- **Node.js ≥ 22.5**（依赖内置 `node:sqlite`）
- 一个 [DeepSeek](https://platform.deepseek.com) API Key
- 一个 [小米 MiMo TTS](https://api.xiaomimimo.com) API Key（TTS 系列限时免费）
- 网易云音乐账号（扫码登录后 VIP 歌曲完整播放）

## 🚀 快速开始

### 1. 安装

```bash
git clone https://github.com/se2pent/serdio.git
cd serdio
npm install express ws @neteaseapireborn/api @music163/ncm-cli @fontsource/fusion-pixel-12px-proportional-sc
```

### 2. 配置

```bash
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY 和 MIMO_API_KEY
# 公网部署时再加一行 API_TOKEN=你的访问密码
```

各变量说明见 `.env.example` 注释。

### 3. 启动（两个进程）

```bash
node ncm-server.js   # 网易云 API 服务，端口 3000
node server.js       # Serdio 主服务，端口 8080
```

推荐用 pm2 守护（崩溃自动拉起 + 开机自启）：

```bash
npm install -g pm2
pm2 start server.js --name serdio
pm2 start ncm-server.js --name ncm
pm2 startup && pm2 save
```

### 4. 初始化口味档案（DJ 的"灵魂"）

编辑 `user/taste.md` 写下你的听歌偏好（题材/语种/情绪偏好/雷区），
或在 `user/routines.md` 里定义你的一天作息（几 点起床/专注/睡觉）。

进阶：`distill-taste.js` 可以从你的真实网易云数据自动蒸馏画像（需要官方 CLI 登录态），玩法见脚本内注释。

### 5. 打开

浏览器访问 `http://localhost:8080`，然后：

1. **设置页 → 网易云音乐账号 → 扫码登录**（解锁 VIP 完整播放）
2. 回到电台页，对 DJ 说句话试试，比如："**下雨了，来点钢琴**"

## 🎛️ 使用指南

| 操作 | 说明 |
|---|---|
| 聊天输入框 | 直接用自然语言点歌 / 聊心情 / 说需求 |
| 聊天气泡里的曲目单 | ▶ 点卡片切歌，♡ 喜欢，⏭ 跳过（DJ 会记住你的反馈） |
| 大播放器 / 迷你条 | 翻阅聊天时大控件自动收起为吸顶迷你条 |
| ♡ 档案页 | 查看口味画像 / 日常作息 / 反馈记录 |
| ⚙ 设置页 | API Key 管理（脱敏显示）/ DJ 音色 / 天气城市 / 网易云扫码登录 / 服务状态 |

**打断规则**：聊天与切歌会正常打断当前播放；调度器推送则在当前歌放完后无缝接入新队列，不打扰正在听的歌。

## 🌐 部署到云服务器

以 Ubuntu + 腾讯云/阿里云轻量服务器（2核2G 足够）为例：

```bash
# 本机上传（记忆库 data/ 与登录态 .data/ 一起带过去，无缝迁移）
scp -r src public prompts user data .data server.js ncm-server.js package.json .env root@服务器IP:/opt/serdio/

# 服务器上
ssh root@服务器IP
cd /opt/serdio
npm install express ws @neteaseapireborn/api @music163/ncm-cli @fontsource/fusion-pixel-12px-proportional-sc
pm2 start server.js --name serdio
pm2 start ncm-server.js --name ncm
pm2 startup && pm2 save
```

安全组放行 `22` 和 `8080`，然后 `.env` 里加一行 `API_TOKEN=你的密码` 并 `pm2 restart serdio` 上锁。

> 音乐播放流量直连网易云 CDN，不经过服务器——2Mbps 小水管毫无压力。

## 📱 打包安卓 App（Capacitor）

前置：JDK 17+（Android Studio 自带的 jbr 即可）、Android SDK（platforms android-34）。

```bash
npm install @capacitor/core@^6 @capacitor/cli@^6 @capacitor/android@^6
npx cap add android
npx cap sync android
```

`capacitor.config.json` 关键配置：

```json
{
  "appId": "com.serdio.radio",
  "appName": "Serdio",
  "webDir": "public",
  "server": {
    "url": "http://服务器IP:8080",
    "cleartext": true,
    "androidScheme": "http"
  }
}
```

Manifest 需手动确认两项：`android:usesCleartextTraffic="true"`（明文 HTTP）与
`android:windowSoftInputMode="adjustResize"`（软键盘视口）。

构建：

```bash
cd android
# Windows 下需设置 JAVA_HOME 指向 JDK 17+；国内网络建议把
# gradle/wrapper/gradle-wrapper.properties 的 distributionUrl 换成腾讯镜像
./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

## 🔐 安全说明

- 所有密钥只存服务端 `.env`（或设置页写入的数据库），**永不进入客户端代码**
- 公网部署务必设置 `API_TOKEN`：所有数据接口与 WebSocket 均需验证，首次访问输入一次密码，Cookie 一年有效
- 忘记密码：改服务器 `.env` 后 `pm2 restart serdio`，旧通行证全部失效
- 网易云登录态（`.data/ncm-cookie.txt`）与记忆库（`data/`）已在 `.gitignore` 中隔离，不会进入版本库

## 📁 目录结构

```
├── server.js            # 入口：HTTP + WS + 令牌守卫 + 静态托管
├── ncm-server.js        # NeteaseCloudMusicApi 启动器（:3000）
├── src/
│   ├── brain.js         # DeepSeek 大脑调用
│   ├── dj.js            # DJ 编排逻辑（说→唱）
│   ├── scheduler.js     # 节律调度器（晨间/午间/夜色…）
│   ├── context.js       # 上下文组装（时间/天气/口味/历史）
│   ├── ncm.js           # 音乐层：官方CLI搜索 + 本地服务直链
│   ├── tts.js           # MiMo TTS 合成与缓存
│   ├── state.js         # SQLite 记忆（消息/播放/反馈/配置）
│   ├── weather.js       # Open-Meteo 天气 + 情绪色
│   ├── config.js        # .env 加载 + 设置页覆盖
│   └── router.js        # 全部 API 路由
├── prompts/dj-persona.md  # DJ 人格提示词（不入库）
├── user/                # 口味档案 / 作息 / 反馈规则（不入库）
├── public/              # PWA 前端（单页三视图 + SW）
└── data/state.db        # 记忆数据库（不入库）
```

## ❓ 常见问题

**Q: 提示"演示模式 / 大脑未接入"？**
服务器没拿到 Key。检查 `.env` 是否存在且已填，改完 `pm2 restart serdio`。

**Q: 歌只有 30 秒？**
网易云未登录，VIP 歌只有试听。设置页扫码登录即可。

**Q: 扫码二维码刷不出来？**
本地 NCM 服务（3000 端口）没在跑，`pm2 status` 看一眼。

**Q: 手机 App 白屏？**
App 内嵌地址（`capacitor.config.json` 的 `server.url`）连不上服务器。核对 IP、安全组、服务存活。

**Q: Node 报 `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`？**
Node 版本低于 22.5，升级到 22.x。

---

*Serdio — 你的电台，懂你，且永远在线。*
