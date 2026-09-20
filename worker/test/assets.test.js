import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const manifestUrl = new URL("../../dist/assets/monsters/manifest.json", import.meta.url);
const assetBaseUrl = new URL("../../dist/assets/monsters/", import.meta.url);
const frontendUrl = new URL("../../dist/index.html", import.meta.url);
const japaneseFontUrl = new URL("../../dist/assets/fonts/NotoSansJP-Variable.ttf", import.meta.url);
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

test("詳細結果はサーバー生成PDFとPNGへの導線を持ち、旧ブラウザ生成コードも保持する", () => {
  const frontend = readFileSync(frontendUrl, "utf8");
  assert.match(frontend, /id="downloadPdfBtn"[\s\S]*PDFで保存<\/a>/);
  assert.match(frontend, /id="downloadImageBtn"[\s\S]*画像で保存<\/a>/);
  assert.match(frontend, /id="printBtn"[^>]*hidden/);
  assert.match(frontend, /apiUrl\(`\/api\/results\/\$\{encodeURIComponent\(token\)\}\/pdf`\)/);
  assert.match(frontend, /apiUrl\(`\/api\/results\/\$\{encodeURIComponent\(token\)\}\/image`\)/);
  assert.match(frontend, /serverPdfMode/);
  assert.match(frontend, /dataset\.pdfReady = "true"/);
  assert.match(frontend, /document\.fonts\?\.ready/);
  assert.match(frontend, /async function downloadDetailPdf\(\)/);
});

test("PDFとPNGの出力専用表示は正解デザインの淡い配色と日本語フォントを使う", () => {
  const frontend = readFileSync(frontendUrl, "utf8");
  assert.ok(readFileSync(japaneseFontUrl).length > 1_000_000, "Noto Sans JP本体を公開物に含める");
  assert.match(frontend, /\.detail-sheet \{[^}]*linear-gradient\(145deg, #fffef7, #f2fbff 44%, #fff2fa\)/);
  assert.match(frontend, /@font-face \{[\s\S]*font-family: "Talent Monster JP";[\s\S]*NotoSansJP-Variable\.ttf/);
  assert.match(frontend, /body\.pdf-exporting, body\.pdf-exporting \* \{ font-family: "Talent Monster JP", "Noto Sans CJK JP", IPAGothic, sans-serif !important; \}/);
  assert.match(frontend, /body\.pdf-exporting \.detail-sheet \{[^}]*linear-gradient\(180deg, #f8fdff 0%, #f1faff 100%\)/);
  assert.match(frontend, /body\.pdf-exporting \.detail-guide\.grow \{ background: #fff6ca/);
  assert.match(frontend, /body\.pdf-exporting \.detail-guide\.first \{ background: #e5faf4/);
  assert.match(frontend, /body\.pdf-exporting \.detail-shop \{[^}]*background: #f7e8fb/);
  assert.match(frontend, /body\.pdf-exporting \.detail-talk \{[^}]*background: #e3f9f3/);
  assert.match(frontend, /body\.pdf-exporting \.detail-evolution-stage \{[^}]*box-shadow: none/);
  for (const legacyHeading of ["☀ 才能を育てるヒント", "🚀 今日からできる最初の一歩", "🌱 モンスターの進化ストーリー", "💎 回答から見えた", "🌈 この才能が育った未来", "🧭 つまずいた時のヒント", "🎈 親子で話してみよう", "🔮 お店タイプ予報"]) {
    assert.equal(frontend.includes(legacyHeading), false, `出力用見出しに絵文字 ${legacyHeading} を残さない`);
  }

  const pdfCss = frontend.match(/body\.pdf-exporting \{[\s\S]*?@page/)?.[0] || "";
  for (const selector of ["detail-monster-card", "detail-guide", "detail-evolution-stage", "detail-shop", "detail-talk", "detail-insight", "detail-conversation"]) {
    const rules = Array.from(pdfCss.matchAll(new RegExp(`body\\.pdf-exporting \\.${selector}[^\\{]*\\{([^}]*)\\}`, "g")), match => match[1]);
    assert.ok(rules.length > 0, `${selector} の出力専用CSSがある`);
    rules.forEach(rule => {
      if (rule.includes("box-shadow:")) assert.match(rule, /box-shadow:\s*none/);
    });
  }
});
