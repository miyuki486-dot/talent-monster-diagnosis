import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const manifestUrl = new URL("../../dist/assets/monsters/manifest.json", import.meta.url);
const assetBaseUrl = new URL("../../dist/assets/monsters/", import.meta.url);
const frontendUrl = new URL("../../dist/index.html", import.meta.url);
const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
const typeNames = [
  "ヒラメキラ", "ツクリオン", "ミッケル", "トビコン",
  "コツミン", "コトハネ", "ヨリソ", "ムスビット",
  "イロドラ", "ミチシル", "ヨロコビィ", "センディア"
];
const stages = ["egg", "hatch", "junior", "adult"];

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("manifestは男女12タイプ4段階の96素材を一意に対応づける", () => {
  assert.equal(manifest.types.length, 12);
  const files = new Set();
  manifest.types.forEach((type, index) => {
    const number = index + 1;
    assert.equal(type.number, number);
    assert.equal(type.name, typeNames[index]);
    for (const gender of ["female", "male"]) {
      for (const stage of stages) {
        const entry = type.variants[gender].stages[stage];
        const expected = `${gender}-${String(number).padStart(2, "0")}-${stage}.png`;
        assert.equal(entry.file, expected);
        assert.equal(entry.sha256, sha256(new URL(expected, assetBaseUrl)));
        assert.equal(files.has(expected), false);
        files.add(expected);
      }
    }
  });
  assert.equal(files.size, 96);
});

test("相棒選択は全12タイプで同じ番号の男女の卵をペアにできる", () => {
  manifest.types.forEach(type => {
    const number = String(type.number).padStart(2, "0");
    assert.equal(type.variants.female.stages.egg.file, `female-${number}-egg.png`);
    assert.equal(type.variants.male.stages.egg.file, `male-${number}-egg.png`);
  });

  const frontend = readFileSync(frontendUrl, "utf8");
  assert.match(frontend, /function renderCompanionSelection\(typeKey\)/);
  assert.match(frontend, /\{ variant: "male", label: "男の子版の相棒" \}/);
  assert.match(frontend, /\{ variant: "female", label: "女の子版の相棒" \}/);
  assert.match(frontend, /spriteMarkup\(typeKey, "egg"/);
});

test("判定待ち演出はタイプ別画像を見せず未孵化の卵を表示する", () => {
  const frontend = readFileSync(frontendUrl, "utf8");
  const finishDiagnosis = frontend.match(/function finishDiagnosis\(\) \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.match(frontend, /id="hatchEgg"[^>]*>🥚<\/div>/);
  assert.match(finishDiagnosis, /getElementById\("hatchEgg"\)\.textContent = "🥚"/);
  assert.doesNotMatch(finishDiagnosis, /monsterAssetUrl|spriteMarkup|<img/);
});
