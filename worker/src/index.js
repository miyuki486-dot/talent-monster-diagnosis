import {
  RECEIPT_PREFIXES,
  calculateDiagnosis,
  looksLikeReceiptCode,
  normalizeDiagnosisPayload,
  normalizeReceiptCode
} from "./diagnosis.js";

const RECEIPT_VALID_DAYS = 30;
const RESULT_VALID_DAYS = 30;
const RECEIVING_DATA_DAYS = 90;
const MAX_REQUEST_BYTES = 32 * 1024;
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const encoder = new TextEncoder();

function unixNow() {
  return Math.floor(Date.now() / 1000);
}

function addDays(timestamp, days) {
  return timestamp + days * 24 * 60 * 60;
}

function randomText(length, alphabet = CODE_ALPHABET) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function hmacHex(value, secret) {
  if (!secret) throw new Error("missing_secret");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function configuredOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = configuredOrigins(env);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function securityHeaders() {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff"
  };
}

function json(request, env, data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...securityHeaders(), ...corsHeaders(request, env), ...extraHeaders }
  });
}

function isAllowedBrowserOrigin(request, env) {
  const origin = request.headers.get("Origin");
  return !origin || configuredOrigins(env).includes(origin);
}

async function checkRateLimit(request, env, scope, limit, windowSeconds) {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const key = await hmacHex(`${scope}:${ip}`, env.IP_HASH_PEPPER);
  const windowStart = Math.floor(unixNow() / windowSeconds) * windowSeconds;
  await env.DB.prepare(`
    INSERT INTO rate_limits (rate_key, window_start, request_count)
    VALUES (?1, ?2, 1)
    ON CONFLICT(rate_key, window_start) DO UPDATE SET request_count = request_count + 1
  `).bind(key, windowStart).run();
  const row = await env.DB.prepare("SELECT request_count FROM rate_limits WHERE rate_key = ?1 AND window_start = ?2").bind(key, windowStart).first();
  return Number(row?.request_count || 0) <= limit;
}

async function parseJsonBody(request) {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_REQUEST_BYTES) throw new Error("payload_too_large");
  const body = await request.text();
  if (encoder.encode(body).byteLength > MAX_REQUEST_BYTES) throw new Error("payload_too_large");
  return JSON.parse(body);
}

async function createDiagnosis(request, env) {
  if (!isAllowedBrowserOrigin(request, env)) return json(request, env, { error: "origin_not_allowed" }, 403);
  if (!(await checkRateLimit(request, env, "create", 20, 60 * 60))) return json(request, env, { error: "rate_limited" }, 429, { "Retry-After": "3600" });

  let diagnosis;
  try {
    diagnosis = normalizeDiagnosisPayload(await parseJsonBody(request));
  } catch (error) {
    const status = error?.message === "payload_too_large" ? 413 : 400;
    return json(request, env, { error: error?.message || "invalid_payload" }, status);
  }

  const result = calculateDiagnosis(diagnosis);
  const createdAt = unixNow();
  const receiptExpiresAt = addDays(createdAt, RECEIPT_VALID_DAYS);
  const resultExpiresAt = addDays(createdAt, RESULT_VALID_DAYS);
  const purgeAt = addDays(createdAt, RECEIVING_DATA_DAYS);
  const diagnosisId = crypto.randomUUID();
  const analyticsId = crypto.randomUUID();
  const choiceAnswers = diagnosis.answers.map(answer => answer.answerType === "choice" ? answer.choiceIndex : null);

  for (let attempt = 0; attempt < 6; attempt++) {
    const receiptCode = `${RECEIPT_PREFIXES[result.typeKey]}-${randomText(4)}`;
    const receiptCodeHash = await hmacHex(receiptCode, env.RECEIPT_CODE_PEPPER);
    try {
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO diagnoses (
            id, receipt_code_hash, respondent_type, guardian_confirmed, gender_choice, monster_variant, zodiac,
            answers_json, result_type, ranking_json, scores_json,
            created_at, receipt_expires_at, result_expires_at, purge_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
        `).bind(
          diagnosisId, receiptCodeHash, diagnosis.respondentType, diagnosis.guardianConfirmed ? 1 : 0,
          diagnosis.genderChoice, diagnosis.monsterVariant, diagnosis.zodiac, JSON.stringify(diagnosis.answers), result.typeKey, JSON.stringify(result.ranking),
          JSON.stringify(result.scores), createdAt, receiptExpiresAt, resultExpiresAt, purgeAt
        ),
        env.DB.prepare(`
          INSERT INTO analytics_diagnoses (
            id, created_at, respondent_type, zodiac, choice_answers_json, result_type, top_types_json
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        `).bind(
          analyticsId, createdAt, diagnosis.respondentType, diagnosis.zodiac, JSON.stringify(choiceAnswers),
          result.typeKey, JSON.stringify(result.ranking.slice(0, 3))
        )
      ]);
      return json(request, env, {
        receiptCode,
        receiptExpiresAt: new Date(receiptExpiresAt * 1000).toISOString(),
        resultType: result.typeKey
      }, 201);
    } catch (error) {
      if (!String(error?.message || error).toLowerCase().includes("unique")) throw error;
    }
  }
  return json(request, env, { error: "code_generation_failed" }, 503);
}

async function getDetailedResult(request, env, token) {
  if (!isAllowedBrowserOrigin(request, env)) return json(request, env, { error: "origin_not_allowed" }, 403);
  if (!(await checkRateLimit(request, env, "result", 120, 60 * 60))) return json(request, env, { error: "rate_limited" }, 429, { "Retry-After": "3600" });
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return json(request, env, { error: "not_found" }, 404);
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT d.respondent_type, d.guardian_confirmed, d.gender_choice, d.monster_variant, d.zodiac, d.answers_json,
           d.result_type, d.ranking_json, d.scores_json, d.created_at, d.result_expires_at
    FROM result_tokens t
    JOIN diagnoses d ON d.id = t.diagnosis_id
    WHERE t.token_hash = ?1
  `).bind(tokenHash).first();
  const now = unixNow();
  if (!row || Number(row.result_expires_at) < now) return json(request, env, { error: "expired_or_not_found" }, 404);

  return json(request, env, {
    diagnosis: {
      version: 2,
      respondentType: row.respondent_type,
      guardianConfirmed: Boolean(row.guardian_confirmed),
      genderChoice: row.gender_choice || "legacy",
      monsterVariant: row.monster_variant || "female",
      zodiac: row.zodiac,
      answers: JSON.parse(row.answers_json)
    },
    result: {
      typeKey: row.result_type,
      ranking: JSON.parse(row.ranking_json),
      scores: JSON.parse(row.scores_json)
    },
    createdAt: new Date(Number(row.created_at) * 1000).toISOString(),
    expiresAt: new Date(Number(row.result_expires_at) * 1000).toISOString()
  });
}

async function verifyLineSignature(rawBody, signature, channelSecret) {
  if (!signature || !channelSecret) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(channelSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody)));
  let binary = "";
  signed.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary) === signature;
}

async function replyToLine(replyToken, messages, env) {
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ replyToken, messages })
  });
  if (!response.ok) throw new Error(`line_reply_${response.status}`);
}

function resultButtonMessage(resultUrl) {
  return {
    type: "template",
    altText: "詳しい診断結果ができました✨",
    template: {
      type: "buttons",
      text: "詳しい診断結果ができました✨\nボタンから、あなた専用のA4・1ページ診断シートを開けます。",
      actions: [{ type: "uri", label: "詳しい診断結果を見る", uri: resultUrl }]
    }
  };
}

function textMessage(text) {
  return { type: "text", text };
}

function buildResultUrl(publicSiteUrl, token) {
  const url = new URL(publicSiteUrl);
  url.searchParams.set("result", token);
  return url.toString();
}

async function processReceiptCore(event, env) {
  const receiptCode = normalizeReceiptCode(event.message.text);
  const receiptHash = await hmacHex(receiptCode, env.RECEIPT_CODE_PEPPER);
  const diagnosis = await env.DB.prepare(`
    SELECT id, line_user_hash, receipt_expires_at, result_expires_at
    FROM diagnoses WHERE receipt_code_hash = ?1
  `).bind(receiptHash).first();
  const now = unixNow();

  if (!diagnosis) {
    await replyToLine(event.replyToken, [textMessage("受取コードが見つかりませんでした。診断結果画面のコードをもう一度コピーして送ってください。")], env);
    return;
  }
  if (Number(diagnosis.receipt_expires_at) < now || Number(diagnosis.result_expires_at) < now) {
    await replyToLine(event.replyToken, [textMessage("この受取コードの有効期限が切れています。もう一度診断して、新しいコードを受け取ってください。")], env);
    return;
  }

  const lineUserId = String(event.source?.userId || "");
  if (!lineUserId) {
    await replyToLine(event.replyToken, [textMessage("個別結果を安全にお渡しできませんでした。公式LINEとの1対1のトークでコードを送ってください。")], env);
    return;
  }
  const lineUserHash = await hmacHex(lineUserId, env.LINE_USER_HASH_PEPPER);
  if (diagnosis.line_user_hash && diagnosis.line_user_hash !== lineUserHash) {
    await replyToLine(event.replyToken, [textMessage("この受取コードは、すでに別のLINEアカウントで使用されています。最初にコードを送ったLINEからお試しください。")], env);
    return;
  }

  if (!diagnosis.line_user_hash) {
    const claimed = await env.DB.prepare(`
      UPDATE diagnoses SET line_user_hash = ?1, claimed_at = ?2
      WHERE id = ?3 AND line_user_hash IS NULL
    `).bind(lineUserHash, now, diagnosis.id).run();
    if (Number(claimed.meta?.changes || 0) === 0) {
      const current = await env.DB.prepare("SELECT line_user_hash FROM diagnoses WHERE id = ?1").bind(diagnosis.id).first();
      if (current?.line_user_hash !== lineUserHash) {
        await replyToLine(event.replyToken, [textMessage("この受取コードは、すでに別のLINEアカウントで使用されています。")], env);
        return;
      }
    }
  }

  const resultToken = randomToken();
  const tokenHash = await sha256(resultToken);
  await env.DB.prepare(`
    INSERT INTO result_tokens (token_hash, diagnosis_id, created_at, expires_at)
    VALUES (?1, ?2, ?3, ?4)
  `).bind(tokenHash, diagnosis.id, now, diagnosis.result_expires_at).run();
  const resultUrl = buildResultUrl(env.PUBLIC_SITE_URL, resultToken);
  await replyToLine(event.replyToken, [resultButtonMessage(resultUrl)], env);
}

async function processReceiptEvent(event, env) {
  if (event?.type !== "message" || event.message?.type !== "text" || !event.replyToken) return;
  if (!looksLikeReceiptCode(event.message.text)) return;

  const eventId = String(event.webhookEventId || "");
  if (eventId) {
    const inserted = await env.DB.prepare("INSERT OR IGNORE INTO webhook_events (event_id, received_at, processed_at) VALUES (?1, ?2, NULL)").bind(eventId, unixNow()).run();
    if (Number(inserted.meta?.changes || 0) === 0) {
      const existing = await env.DB.prepare("SELECT processed_at FROM webhook_events WHERE event_id = ?1").bind(eventId).first();
      if (existing?.processed_at) return;
    }
  }

  await processReceiptCore(event, env);
  if (eventId) await env.DB.prepare("UPDATE webhook_events SET processed_at = ?1 WHERE event_id = ?2").bind(unixNow(), eventId).run();
}

async function handleLineWebhook(request, env) {
  const rawBody = await request.text();
  const valid = await verifyLineSignature(rawBody, request.headers.get("x-line-signature"), env.LINE_CHANNEL_SECRET);
  if (!valid) return new Response("Invalid signature", { status: 401 });

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  await Promise.all((body.events || []).map(event => processReceiptEvent(event, env)));
  return new Response("OK", { status: 200 });
}

async function scheduledCleanup(env) {
  const now = unixNow();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM result_tokens WHERE expires_at < ?1").bind(now),
    env.DB.prepare("DELETE FROM diagnoses WHERE purge_at < ?1").bind(now),
    env.DB.prepare("DELETE FROM webhook_events WHERE received_at < ?1").bind(now - 7 * 24 * 60 * 60),
    env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?1").bind(now - 2 * 24 * 60 * 60)
  ]);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      if (!isAllowedBrowserOrigin(request, env)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    if (request.method === "GET" && url.pathname === "/health") return json(request, env, { ok: true });
    if (request.method === "POST" && url.pathname === "/api/diagnoses") return createDiagnosis(request, env);
    if (request.method === "GET" && url.pathname.startsWith("/api/results/")) return getDetailedResult(request, env, decodeURIComponent(url.pathname.slice("/api/results/".length)));
    if (request.method === "POST" && url.pathname === "/webhooks/line") return handleLineWebhook(request, env);
    return json(request, env, { error: "not_found" }, 404);
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(scheduledCleanup(env));
  }
};

export { buildResultUrl, resultButtonMessage, verifyLineSignature };
