export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = buildCorsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (url.pathname === "/" && request.method === "GET") {
      return json(
        {
          ok: true,
          service: "yiming-wish",
          status: "running"
        },
        200,
        corsHeaders
      );
    }

    if (url.pathname !== "/send") {
      return json({ ok: false, error: "not_found" }, 404, corsHeaders);
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "method_not_allowed" }, 405, corsHeaders);
    }

    const originCheck = isOriginAllowed(request, env);
    if (!originCheck.allowed) {
      return json({ ok: false, error: "origin_not_allowed" }, 403, corsHeaders);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "invalid_json" }, 400, corsHeaders);
    }

    const wish = typeof body?.wish === "string" ? body.wish.trim() : "";
    const timestamp = body?.timestamp || new Date().toISOString();
    const gameData = body?.gameData || {};

    if (!wish) {
      return json({ ok: false, error: "empty_wish" }, 400, corsHeaders);
    }

    if (wish.length > 500) {
      return json({ ok: false, error: "wish_too_long" }, 400, corsHeaders);
    }

    const ip =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("x-forwarded-for") ||
      "unknown";

    const userAgent = request.headers.get("User-Agent") || "unknown";

    const totalTimeText = formatTime(gameData.totalTime);
    const wrongCountText =
      typeof gameData.wrongCount === "number" ? `${gameData.wrongCount} 次` : "未知";
    const gameScoreText =
      typeof gameData.gameScore === "number" ? `${gameData.gameScore} 分` : "未知";
    const hiddenText =
      gameData.hiddenCompleted === true ? "✅ 已完成" : "❌ 未完成/跳过";
    const eggsText = Array.isArray(gameData.eggsFound) && gameData.eggsFound.length
      ? gameData.eggsFound.join(", ")
      : "无";

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,'PingFang SC','Microsoft YaHei',sans-serif;line-height:1.7;color:#111;">
        <h2 style="margin:0 0 16px;">🎁 乙鸣的生日愿望</h2>

        <div style="padding:16px;border-left:4px solid #fbbf24;background:#fff8e6;margin-bottom:20px;">
          <div style="font-size:14px;color:#666;margin-bottom:8px;">愿望内容</div>
          <div style="font-size:18px;font-weight:600;white-space:pre-wrap;">${escapeHtml(wish)}</div>
        </div>

        <h3 style="margin:20px 0 8px;">闯关数据</h3>
        <ul style="padding-left:20px;">
          <li>总用时：${escapeHtml(totalTimeText)}</li>
          <li>答错次数：${escapeHtml(wrongCountText)}</li>
          <li>小游戏分数：${escapeHtml(gameScoreText)}</li>
          <li>隐藏关：${escapeHtml(hiddenText)}</li>
          <li>发现彩蛋：${escapeHtml(eggsText)}</li>
        </ul>

        <h3 style="margin:20px 0 8px;">请求信息</h3>
        <ul style="padding-left:20px;">
          <li>发送时间：${escapeHtml(timestamp)}</li>
          <li>来源 IP：${escapeHtml(ip)}</li>
          <li>User-Agent：${escapeHtml(userAgent)}</li>
        </ul>

        <p style="margin-top:24px;color:#888;font-size:12px;">
          此邮件由 Cloudflare Worker 自动发送。
        </p>
      </div>
    `;

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Star Mission <onboarding@resend.dev>",
        to: [env.QQ_EMAIL],
        subject: "🎁 乙鸣的生日愿望",
        html
      })
    });

    if (!resendResp.ok) {
      const errText = await resendResp.text();
      console.error("Resend error:", errText);
      return json({ ok: false, error: "send_failed" }, 502, corsHeaders);
    }

    return json({ ok: true, message: "sent" }, 200, corsHeaders);
  }
};

function json(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders
    }
  });
}

function buildCorsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);

  let allowOrigin = allowedOrigins[0] || "*";
  if (origin && allowedOrigins.includes(origin)) {
    allowOrigin = origin;
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function parseAllowedOrigins(value) {
  if (!value) return [];
  return value.split(",").map(s => s.trim()).filter(Boolean);
}

function isOriginAllowed(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return { allowed: true };
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  return { allowed: allowedOrigins.includes(origin) };
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) {
    return "未知";
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}分${seconds}秒`;
}
