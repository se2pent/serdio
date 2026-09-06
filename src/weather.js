// weather.js — 环境注入：Open-Meteo 免费天气（无需 Key）+ 城市可选（prefs 持久）+ 情绪分类
const config = require("./config");
const state = require("./state");

// 天气描述 → 情绪色彩分类（前端据此换装）
function moodOf(desc) {
  if (/雷/.test(desc)) return "thunder";
  if (/雨/.test(desc)) return "rain";
  if (/雪/.test(desc)) return "snow";
  if (/雾|霾|沙/.test(desc)) return "fog";
  if (/阴/.test(desc)) return "overcast";
  if (/云/.test(desc)) return "cloudy";
  if (/晴/.test(desc)) return "sunny";
  return "cloudy";
}

// 当前生效城市：用户设置（prefs）> .env 默认
function activeCity() {
  const saved = state.getPref("city");
  if (saved && saved.name) return saved;
  return { name: config.station.city, lat: config.station.lat, lon: config.station.lon };
}

// 城市名 → 坐标（Open-Meteo Geocoding，免费无 Key）
async function geocode(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=zh&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  const j = await res.json();
  const hit = j.results && j.results[0];
  if (!hit) return null;
  return { name: hit.name, lat: hit.latitude, lon: hit.longitude };
}

async function getWeather() {
  const city = activeCity();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
  const codeMap = { 0: "晴", 1: "多云", 2: "多云", 3: "阴", 45: "雾", 48: "雾", 51: "毛毛雨", 53: "小雨", 55: "小雨", 61: "雨", 63: "中雨", 65: "大雨", 71: "雪", 73: "雪", 75: "雪", 80: "阵雨", 81: "阵雨", 82: "强阵雨", 95: "雷雨", 96: "雷雨", 99: "雷雨" };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const j = await res.json();
    const c = j.current || {};
    const desc = codeMap[c.weather_code] || "多云";
    return {
      ok: true,
      city: city.name,
      temp: Math.round(c.temperature_2m ?? 0),
      desc,
      wind: Math.round(c.wind_speed_10m ?? 0),
      mood: moodOf(desc),
    };
  } catch {
    return { ok: false, city: city.name, temp: null, desc: "未知", wind: null, mood: "cloudy" };
  }
}

module.exports = { getWeather, geocode, moodOf, activeCity };
