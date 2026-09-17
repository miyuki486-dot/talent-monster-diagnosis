// あとから変更する場所です。リンクや画像ファイル名を引用符の中へ入れてください。
const SITE_CONFIG = {
  // ブランド名と診断名。ここを書き換えると、トップ・ブラウザ名・結果シートへ反映されます。
  projectTagline: "その子らしさで稼ぐチカラを",
  projectName: "こども起業家研究所",
  projectNickname: "～博士ちゃんラボ～",
  activityName: "博士ちゃんマルシェ",
  diagnosisName: "才能モンスター発見！博士ちゃん診断",

  // 運営者名はプライバシーポリシーにも反映されます。法人化・名称変更時はここを書き換えてください。
  privacyOperatorName: "こども起業家研究所",
  privacyContactLabel: "公式LINE（@536lguxf）",
  privacyContactUrl: "https://line.me/R/ti/p/%40536lguxf",

  // LINE受取機能。apiBaseUrlはCloudflare Worker公開後に、そのURLへ変更します。
  // 空欄の場合は、現在のサイトと同じドメインの /api を利用します。
  apiBaseUrl: "https://talent-monster-line-api.miyuki48-6.workers.dev",
  lineOfficialId: "@536lguxf",
  lineUrl: "https://line.me/R/ti/p/%40536lguxf",
  applicationUrl: "",
  // 添付PDFから抽出した96体（男女×12タイプ×4段階）の保存場所です。
  monsterAssetBaseUrl: "assets/monsters"
};
