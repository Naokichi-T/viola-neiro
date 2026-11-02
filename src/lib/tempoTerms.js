// ===== テンポ（♩＝）の、速さの言葉の目安 =====
// 楽譜に出てくる速さの言葉（速度記号）と、だいたいのテンポの範囲。
// 範囲は本や辞書によって少しずつ違うので、あくまで目安（よく使われる範囲にしている）。

// 速さの言葉の一覧（遅い順）
//   max     ：この言葉になるテンポの上限（この値まで）
//   name    ：楽譜に出てくる言葉
//   reading ：読み方
//   meaning ：だいたいの意味
const TEMPO_TERMS = [
  { max: 59, name: "Largo", reading: "ラルゴ", meaning: "幅広く、とてもゆっくり" },
  { max: 65, name: "Larghetto", reading: "ラルゲット", meaning: "ややゆっくり" },
  { max: 75, name: "Adagio", reading: "アダージョ", meaning: "ゆるやかに" },
  { max: 107, name: "Andante", reading: "アンダンテ", meaning: "歩くくらいの速さ" },
  { max: 119, name: "Moderato", reading: "モデラート", meaning: "中くらいの速さ" },
  { max: 155, name: "Allegro", reading: "アレグロ", meaning: "速く、生き生きと" },
  { max: 175, name: "Vivace", reading: "ヴィヴァーチェ", meaning: "活発に、速く" },
  { max: Infinity, name: "Presto", reading: "プレスト", meaning: "とても速く" },
];

/**
 * テンポに合う、速さの言葉の目安を返す関数
 * @param {number} tempo - テンポ（♩＝）
 * @returns {{name: string, reading: string, meaning: string}} 速さの言葉
 *   例：80 のとき { name: 'Andante', reading: 'アンダンテ', meaning: '歩くくらいの速さ' }
 */
export function getTempoTerm(tempo) {
  // 遅い順に見ていき、上限に収まる最初の言葉を返す（一番最後は上限なしなので、必ずどれかが見つかる）
  return TEMPO_TERMS.find((term) => tempo <= term.max) ?? TEMPO_TERMS[TEMPO_TERMS.length - 1];
}
