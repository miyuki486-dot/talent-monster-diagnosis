import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/index.js";

class BoundStatement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new BoundStatement(this.database, this.sql, values);
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { meta: { changes: Number(result.changes || 0) } };
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values) || null;
  }
}

class D1TestDatabase {
  constructor() {
    this.database = new DatabaseSync(":memory:");
    this.database.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  }

  prepare(sql) {
    return new BoundStatement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function environment() {
  return {
    DB: new D1TestDatabase(),
    ALLOWED_ORIGINS: "https://site.example",
    PUBLIC_SITE_URL: "https://site.example/diagnosis/",
    RECEIPT_CODE_PEPPER: "receipt-test-secret",
    LINE_USER_HASH_PEPPER: "line-user-test-secret",
    IP_HASH_PEPPER: "ip-test-secret",
    LINE_CHANNEL_SECRET: "line-channel-test-secret",
    LINE_CHANNEL_ACCESS_TOKEN: "line-access-test-secret"
  };
}

function diagnosisPayload() {
  return {
    version: 2,
    respondentType: "child",
    guardianConfirmed: true,
    genderChoice: "other",
    monsterVariant: "male",
    zodiac: "aquarius",
    answers: Array.from({ length: 7 }, () => ({ answerType: "choice", choiceIndex: 0, freeText: "" }))
  };
}

function browserRequest(path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Origin", "https://site.example");
  headers.set("CF-Connecting-IP", "203.0.113.10");
  return new Request(`https://api.example${path}`, { ...init, headers });
}

async function signLineBody(body, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  return Buffer.from(signature).toString("base64");
}

test("診断保存、LINE照合、個別結果取得まで一連で動く", async () => {
  const env = environment();
  const createResponse = await worker.fetch(browserRequest("/api/diagnoses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(diagnosisPayload())
  }), env);
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.match(created.receiptCode, /^[A-Z]{4,5}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
  assert.equal(created.resultType, "spark");

  const originalFetch = globalThis.fetch;
  const replies = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.line.me/v2/bot/message/reply");
    replies.push(JSON.parse(init.body));
    return new Response(null, { status: 200 });
  };

  try {
    const webhookBody = JSON.stringify({
      events: [{
        webhookEventId: "event-1",
        type: "message",
        replyToken: "reply-token-1",
        source: { type: "user", userId: "line-user-1" },
        message: { type: "text", text: created.receiptCode }
      }]
    });
    const signature = await signLineBody(webhookBody, env.LINE_CHANNEL_SECRET);
    const webhookResponse = await worker.fetch(new Request("https://api.example/webhooks/line", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-line-signature": signature },
      body: webhookBody
    }), env);
    assert.equal(webhookResponse.status, 200);
    assert.equal(replies.length, 1);
    const duplicateResponse = await worker.fetch(new Request("https://api.example/webhooks/line", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-line-signature": signature },
      body: webhookBody
    }), env);
    assert.equal(duplicateResponse.status, 200);
    assert.equal(replies.length, 1);
    const resultUrl = replies[0].messages[0].template.actions[0].uri;
    const resultToken = new URL(resultUrl).searchParams.get("result");
    assert.equal(resultToken.length, 43);

    const resultResponse = await worker.fetch(browserRequest(`/api/results/${resultToken}`), env);
    assert.equal(resultResponse.status, 200);
    const detailed = await resultResponse.json();
    assert.equal(detailed.result.typeKey, "spark");
    assert.equal(detailed.diagnosis.respondentType, "child");
    assert.equal(detailed.diagnosis.answers.length, 7);
    assert.equal(detailed.diagnosis.genderChoice, "other");
    assert.equal(detailed.diagnosis.monsterVariant, "male");

    const otherUserBody = JSON.stringify({
      events: [{
        webhookEventId: "event-2",
        type: "message",
        replyToken: "reply-token-2",
        source: { type: "user", userId: "line-user-2" },
        message: { type: "text", text: created.receiptCode }
      }]
    });
    const otherSignature = await signLineBody(otherUserBody, env.LINE_CHANNEL_SECRET);
    await worker.fetch(new Request("https://api.example/webhooks/line", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-line-signature": otherSignature },
      body: otherUserBody
    }), env);
    assert.match(replies[1].messages[0].text, /別のLINEアカウント/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("許可していないサイトからの保存を拒否する", async () => {
  const env = environment();
  const response = await worker.fetch(new Request("https://api.example/api/diagnoses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://evil.example", "CF-Connecting-IP": "203.0.113.11" },
    body: JSON.stringify(diagnosisPayload())
  }), env);
  assert.equal(response.status, 403);
});

test("LINE署名が不正なWebhookを拒否する", async () => {
  const env = environment();
  const response = await worker.fetch(new Request("https://api.example/webhooks/line", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-line-signature": "invalid" },
    body: JSON.stringify({ events: [] })
  }), env);
  assert.equal(response.status, 401);
});
