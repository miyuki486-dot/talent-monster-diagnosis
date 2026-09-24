import test from "node:test";
import assert from "node:assert/strict";
import {
  DIAGNOSIS_QUESTIONS,
  calculateDiagnosis,
  looksLikeReceiptCode,
  normalizeDiagnosisPayload,
  normalizeReceiptCode
} from "../src/diagnosis.js";
import { buildResultUrl, resultButtonMessage } from "../src/index.js";

function samplePayload(overrides = {}) {
  return {
    version: 2,
    respondentType: "adult",
    guardianConfirmed: false,
    genderChoice: "boy",
    monsterVariant: "male",
    zodiac: "aquarius",
    answers: Array.from({ length: 7 }, () => ({ answerType: "choice", choiceIndex: 0, freeText: "" })),
    ...overrides
  };
}

test("診断データを正規化して既存配点で判定する", () => {
  const diagnosis = normalizeDiagnosisPayload(samplePayload());
  const result = calculateDiagnosis(diagnosis);
  assert.equal(result.ranking.length, 12);
  assert.equal(result.typeKey, "spark");
  assert.equal(result.scores.spark > result.scores.artist, true);
});

test("判定質問は性格4問と好き3問の7問構成", () => {
  assert.equal(DIAGNOSIS_QUESTIONS.length, 7);
  assert.deepEqual(DIAGNOSIS_QUESTIONS.map(question => question.category), [
    "personality", "personality", "personality", "personality", "likes", "likes", "likes"
  ]);
});

test("文言変更後も対象3設問の採点先と順番は変わらない", () => {
  assert.deepEqual(DIAGNOSIS_QUESTIONS[1].options, [
    ["grower", "maker"], ["spark", "challenger"], ["messenger", "connector"], ["empath", "planner"]
  ]);
  assert.deepEqual(DIAGNOSIS_QUESTIONS[4].options, [
    ["maker", "spark"], ["explorer", "messenger"], ["challenger", "host"], ["artist", "leader"]
  ]);
  assert.deepEqual(DIAGNOSIS_QUESTIONS[6].options, [
    ["spark", "artist"], ["connector", "empath"], ["planner", "explorer"], ["leader", "challenger"]
  ]);
});

test("自由回答時も既存の性格50点・好き30点の再配分を維持する", () => {
  const personalityOnly = samplePayload({
    answers: Array.from({ length: 7 }, (_value, index) => index === 1
      ? { answerType: "choice", choiceIndex: 0, freeText: "" }
      : { answerType: "free", choiceIndex: null, freeText: "" })
  });
  const personalityResult = calculateDiagnosis(normalizeDiagnosisPayload(personalityOnly));
  assert.equal(personalityResult.scores.grower, 50);
  assert.equal(personalityResult.scores.maker, 21);

  const likesOnly = samplePayload({
    answers: Array.from({ length: 7 }, (_value, index) => index === 4
      ? { answerType: "choice", choiceIndex: 0, freeText: "" }
      : { answerType: "free", choiceIndex: null, freeText: "" })
  });
  const likesResult = calculateDiagnosis(normalizeDiagnosisPayload(likesOnly));
  assert.equal(likesResult.scores.maker, 30);
  assert.equal(likesResult.scores.spark, 32.6);
});

test("性別表示と選んだ相棒の組み合わせを検証する", () => {
  assert.throws(
    () => normalizeDiagnosisPayload(samplePayload({ genderChoice: "boy", monsterVariant: "female" })),
    /gender_variant_mismatch/
  );
  assert.equal(normalizeDiagnosisPayload(samplePayload({ genderChoice: "other", monsterVariant: "female" })).monsterVariant, "female");
  assert.equal(normalizeDiagnosisPayload(samplePayload({ genderChoice: "other", monsterVariant: "male" })).monsterVariant, "male");
});

test("旧8問データも公開切替中に受け付け、削除対象の3問目を除外する", () => {
  const diagnosis = normalizeDiagnosisPayload({
    ...samplePayload(), version: 1, genderChoice: undefined, monsterVariant: undefined,
    answers: Array.from({ length: 8 }, (_value, index) => ({ answerType: "choice", choiceIndex: index % 4, freeText: "" }))
  });
  assert.equal(diagnosis.answers.length, 7);
  assert.equal(diagnosis.genderChoice, "legacy");
  assert.equal(diagnosis.monsterVariant, "female");
});

test("子ども回答では保護者確認が必要", () => {
  assert.throws(
    () => normalizeDiagnosisPayload(samplePayload({ respondentType: "child", guardianConfirmed: false })),
    /guardian_confirmation_required/
  );
  assert.equal(normalizeDiagnosisPayload(samplePayload({ respondentType: "child", guardianConfirmed: true })).guardianConfirmed, true);
});

test("自由回答は300文字に制限し、判定点には加えない", () => {
  const payload = samplePayload();
  payload.answers[0] = { answerType: "free", freeText: `\u0000${"あ".repeat(350)}` };
  const diagnosis = normalizeDiagnosisPayload(payload);
  assert.equal(diagnosis.answers[0].freeText.length, 300);
  assert.equal(diagnosis.answers[0].freeText.includes("\u0000"), false);
  assert.equal(calculateDiagnosis(diagnosis).ranking.length, 12);
});

test("受取コードを表記ゆれから正規化する", () => {
  assert.equal(normalizeReceiptCode(" hiraー7k3m "), "HIRA-7K3M");
  assert.equal(looksLikeReceiptCode("HIRA-7K3M"), true);
  assert.equal(looksLikeReceiptCode("こんにちは"), false);
});

test("個別結果URLとLINEボタンを作る", () => {
  const token = "a".repeat(43);
  const url = buildResultUrl("https://example.com/diagnosis/", token);
  assert.equal(url, `https://example.com/diagnosis/?result=${token}`);
  const message = resultButtonMessage(url);
  assert.equal(message.template.actions[0].uri, url);
});
