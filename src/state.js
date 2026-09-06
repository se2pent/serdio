// state.js — 状态·记忆（SQLite，跨重启持久）
// 表：messages(对话) · plays(播放轨迹) · plan(当日编排) · prefs(偏好键值)
const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "state.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,          -- user | dj
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS plays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT, artist TEXT,
    source TEXT,                 -- ncm | mock
    skipped INTEGER DEFAULT 0,
    liked INTEGER DEFAULT 0,
    played_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS plan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,           -- YYYY-MM-DD
    slot TEXT NOT NULL,          -- morning | focus | ...
    payload TEXT NOT NULL,       -- JSON
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS prefs (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

const state = {
  logMessage(role, content) {
    db.prepare("INSERT INTO messages (role, content) VALUES (?, ?)").run(role, content);
  },
  recentMessages(n = 10) {
    return db.prepare("SELECT role, content, created_at FROM messages ORDER BY id DESC LIMIT ?").all(n).reverse();
  },
  logPlay(track) {
    db.prepare("INSERT INTO plays (title, artist, source) VALUES (?, ?, ?)").run(
      track.title || "", track.artist || "", track.source || "ncm"
    );
  },
  recentPlays(n = 10) {
    return db.prepare("SELECT title, artist, skipped, liked, played_at FROM plays ORDER BY id DESC LIMIT ?").all(n).reverse();
  },
  markPlay(action, title) {
    if (action === "skip") db.prepare("UPDATE plays SET skipped = 1 WHERE id = (SELECT MAX(id) FROM plays WHERE title = ?)").run(title);
    if (action === "like") db.prepare("UPDATE plays SET liked = 1 WHERE id = (SELECT MAX(id) FROM plays WHERE title = ?)").run(title);
  },
  savePlan(day, slot, payload) {
    db.prepare("INSERT INTO plan (day, slot, payload) VALUES (?, ?, ?)").run(day, slot, JSON.stringify(payload));
  },
  todayPlans(day) {
    return db.prepare("SELECT slot, payload, created_at FROM plan WHERE day = ? ORDER BY id").all(day)
      .map(r => ({ slot: r.slot, ...JSON.parse(r.payload), created_at: r.created_at }));
  },
  getPref(key) {
    const r = db.prepare("SELECT value FROM prefs WHERE key = ?").get(key);
    return r ? JSON.parse(r.value) : null;
  },
  setPref(key, value) {
    db.prepare("INSERT INTO prefs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, JSON.stringify(value));
  },
};

module.exports = state;
