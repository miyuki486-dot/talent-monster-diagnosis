import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const manifestUrl = new URL("../../dist/assets/monsters/manifest.json", import.meta.url);
const assetBaseUrl = new URL("../../dist/assets/monsters/", import.meta.url);
const frontendUrl = new URL("../../dist/index.html", import.meta.url);
const japaneseFontUrl = new URL("../../dist/assets/fonts/NotoSansJP-Variable.ttf", import.meta.url);
const hatchEggUrl = new URL("../../dist/assets/hatch-egg.png", import.meta.url);
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
  const hatchEgg = readFileSync(hatchEggUrl);
  assert.equal(sha256(hatchEggUrl), "63364458ad9867fc935bddd486127c8681e42fd611b180ae4a29f630722f962d");
  assert.deepEqual([...hatchEgg.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(hatchEgg[25], 6, "透過を持てるRGBA形式のPNGを使用する");
  assert.match(frontend, /id="hatchEggImage" src="assets\/hatch-egg\.png"/);
  assert.match(finishDiagnosis, /getElementById\("hatchEggImage"\)\.src = "assets\/hatch-egg\.png"/);
  assert.match(frontend, /\.hatch-egg \{[^}]*place-items: center;[^}]*margin-inline: auto;[^}]*animation: wobble/);
  assert.match(frontend, /\.hatch-egg img \{[^}]*object-fit: contain;[^}]*transform: translate\(1\.2%, -\.6%\)/);
  assert.doesNotMatch(finishDiagnosis, /monsterAssetUrl|spriteMarkup/);
});

test("変更した3設問の文言と回答解釈が決定稿どおり", () => {
  const frontend = readFileSync(frontendUrl, "utf8");
  for (const text of [
    "もしお店をするなら、どんなことが一番ワクワクする？",
    "いちばんワクワクするものを選んでね！",
    "お子さんがいちばんワクワクしそうなものを選んでください。",
    "自分で考えたものを作る",
    "ふしぎを調べて、「わかった！」をみんなに伝える",
    "お客さんと一緒に遊んで、盛り上がる",
    "絵や音、物語などで、自分の世界を表現する",
    "できるまで、もう一度やってみる",
    "別のやり方を考えて、試してみる",
    "誰かに話して、一緒に考えてもらう",
    "まずよく見て、どうするか考える",
    "もし冒険に出るなら、どの役で行きたい？",
    "💡 ひらめき発明家", "🤝 なかまつなぎ屋", "🧭 道ひらき探検家", "🔥 やる気まほう使い",
    "✨ ？？？", "じぶんだけの役がある！",
    "行き詰まったとき、別のやり方を考えて試せる",
    "困ったことを誰かに話して、一緒に考えられる",
    "まずよく見て、自分に合う進み方を考えられる"
  ]) assert.equal(frontend.includes(text), true, text);

  const expectedPairs = {
    personality_2: [["grower", "maker"], ["spark", "challenger"], ["messenger", "connector"], ["empath", "planner"]],
    likes_1: [["maker", "spark"], ["explorer", "messenger"], ["challenger", "host"], ["artist", "leader"]],
    likes_3: [["spark", "artist"], ["connector", "empath"], ["planner", "explorer"], ["leader", "challenger"]]
  };
  for (const [questionId, pairs] of Object.entries(expectedPairs)) {
    const block = frontend.match(new RegExp(`id: "${questionId}"[\\s\\S]*?options: \\[([\\s\\S]*?)\\n        \\]`))?.[1] || "";
    pairs.forEach(([primary, secondary]) => assert.match(block, new RegExp(`primary: "${primary}", secondary: "${secondary}"`)));
  }
});

test("子ども向けふりがなは漢字だけをruby要素に入れる", () => {
  const frontend = readFileSync(frontendUrl, "utf8");
  const rubyBases = Array.from(frontend.matchAll(/rubyText\("([^"]+)",\s*"[^"]+"\)/g), match => match[1]);
  assert.ok(rubyBases.length >= 100, "質問・選択肢・案内文の漢字を広く網羅する");
  rubyBases.forEach(base => assert.doesNotMatch(base, /[ぁ-んァ-ヶー]/, `${base} の送り仮名をruby外へ出す`));
  assert.equal(frontend.includes('"選ぶ": `${rubyText("選", "えら")}ぶ`'), true);
  assert.equal(frontend.includes('"思いどおり": `${rubyText("思", "おも")}いどおり`'), true);
  for (const text of ["当てはまらない", "見つけて", "遊んで", "準備", "書かなく", "やる気", "屋", "戻る"]) {
    assert.match(frontend, new RegExp(`"${text}"\\s*:`), `${text} にふりがな定義がある`);
  }
  assert.match(frontend, /progressLabel\.innerHTML = questionText\("相棒の種類"\)/);
  assert.match(frontend, /progressLabel\.innerHTML = questionText\("星座"\)/);
  assert.match(frontend, /backBtn\.innerHTML = questionText\("← ひとつ戻る"\)/);
  assert.match(frontend, /<h2 class="question-title">\$\{questionText\(q\.title\)\}<\/h2>/);
  assert.doesNotMatch(frontend, /<ruby>\$\{word\}<rt>/);
});

test("詳細結果は画像保存に一本化し、PDF生成コードとエンドポイントを保持する", () => {
  const frontend = readFileSync(frontendUrl, "utf8");
  assert.match(frontend, /id="downloadPdfBtn"[^>]*hidden[^>]*>PDFで保存<\/a>/);
  assert.match(frontend, /id="downloadImageBtn"[^>]*disabled[^>]*>画像を保存<\/button>/);
  assert.match(frontend, /診断シートを保存/);
  assert.match(frontend, /保存した画像はA4サイズでもきれいに印刷できます✨/);
  assert.match(frontend, /id="printBtn"[^>]*hidden/);
  assert.match(frontend, /apiUrl\(`\/api\/results\/\$\{encodeURIComponent\(token\)\}\/pdf`\)/);
  assert.match(frontend, /apiUrl\(`\/api\/results\/\$\{encodeURIComponent\(token\)\}\/image`\)/);
  assert.match(frontend, /serverPdfMode/);
  assert.match(frontend, /dataset\.pdfReady = "true"/);
  assert.match(frontend, /document\.fonts\?\.ready/);
  assert.match(frontend, /async function downloadDetailPdf\(\)/);
});

test("画像保存は機能検出・ファイル共有・安全なフォールバックを使う", () => {
  const frontend = readFileSync(frontendUrl, "utf8");
  const supportFunction = frontend.match(/function supportsImageFileSharing\(\) \{[\s\S]*?\n    \}/)?.[0] || "";
  const saveFunction = frontend.match(/function saveDetailedResultImage\(event\) \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.match(supportFunction, /typeof navigator\.share !== "function"/);
  assert.match(supportFunction, /typeof navigator\.canShare !== "function"/);
  assert.match(supportFunction, /navigator\.canShare\(\{ files: \[probe\] \}\)/);
  assert.doesNotMatch(supportFunction, /userAgent|iPhone|Android|Safari|Chrome|LINE/i);
  assert.match(saveFunction, /navigator\.share\(\{/);
  assert.match(saveFunction, /files: \[preparedImageFile\]/);
  assert.match(saveFunction, /imageSaveBusy/);
  assert.doesNotMatch(saveFunction, /userAgent|navigator\.platform|iPhone|Android|Safari|Chrome/i);
  assert.match(frontend, /error\?\.name === "AbortError"/);
  assert.match(frontend, /id="imageSaveFallback"/);
  assert.match(frontend, /showImageFallback\(preparedImageBlob\)/);
  assert.match(frontend, /診断シートを作成しています…/);
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
