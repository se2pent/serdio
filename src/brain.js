// brain.js — 大脑适配器（原图 claude.js 的替代实现）
// Claude Code 子进程 → DeepSeek API（国内模型，response_format=json_object 保证契约输出）
const config = require("./config");

async function think(systemPrompt, userTurn) {
  if (!config.deepseek.key || config.deepseek.key === "PENDING") {
    // 无 Key 兜底：本地规则编排，保证链路可演示
    return {
      say: "（演示模式）大脑还没接入 DeepSeek——先把 DEEPSEEK_API_KEY 填进 .env，我就能真正读懂你的口味了。",
      play: [],
      reason: "no-key fallback",
      segue: null,
      _mock: true,
    };
  }

  const body = {
    model: config.deepseek.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userTurn },
    ],
    response_format: { type: "json_object" },
    temperature: 0.8,
    max_tokens: 800,
  };

  const res = await fetch(config.deepseek.baseUrl + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + config.deepseek.key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`DeepSeek HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }
  const j = await res.json();
  const raw = j.choices[0].message.content;
  let plan;
  try {
    plan = JSON.parse(raw);
  } catch {
    // 模型偶尔输出围栏代码块，兜底解析
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("DeepSeek 输出无法解析为 JSON");
    plan = JSON.parse(m[0]);
  }
  // 契约补全
  plan.say = String(plan.say || "");
  plan.play = Array.isArray(plan.play) ? plan.play : [];
  plan.reason = plan.reason || "";
  plan.segue = plan.segue || null;
  return plan;
}

module.exports = { think };
