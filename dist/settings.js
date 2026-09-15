// あとから変更する場所です。リンクや画像ファイル名を引用符の中へ入れてください。
const SITE_CONFIG = {
  // ブランド名と診断名。ここを書き換えると、トップ・ブラウザ名・結果シートへ反映されます。
  projectTagline: "その子らしさで稼ぐチカラを",
  projectName: "こども起業家研究所",
  projectNickname: "～博士ちゃんラボ～",
  activityName: "博士ちゃんマルシェ",
  diagnosisName: "才能モンスター発見！博士ちゃん診断",

  // マルシェ案内・保存・申込み機能を準備中表示にします。完成したら false に変更します。
  resultActionsComingSoon: true,

  lineUrl: "",
  applicationUrl: "",
  // 診断結果には「孵化したて」を表示します。
  monsterSpriteUrl: "monster-hatchlings-roster.png",
  monsterEggSpriteUrl: "monster-eggs-roster.png",
  monsterEvolvedSpriteUrl: "monster-evolved-roster.png",

  // 診断結果メールを受け取るAPIのURLです。未設定の間は外部送信されません。
  // 本番では、利用するメール送信サービスの受信用URLを入れてください。
  resultEmailEndpoint: "",
  autoSendResultEmail: false,

  // 1体ずつ本番イラストへ差し替える場合は、対応する欄へ画像ファイル名を入れます。
  // 例: spark: "hiramekira.png"
  monsterImageUrls: {
    spark: "",
    maker: "",
    explorer: "",
    challenger: "",
    grower: "",
    messenger: "",
    empath: "",
    connector: "",
    artist: "",
    planner: "",
    host: "",
    leader: ""
  }
};
