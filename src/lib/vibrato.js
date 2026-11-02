// ===== ビブラートの計算 =====
// のばした音の音程のグラフから、揺れの「山」と「谷」を見つけ、
// 速さ・幅・そろい具合・目標とのずれ・点数を計算する。
// 画面のこと（表示やボタン）はここには書かず、計算だけにしておく。
//
// 見つけ方（ジグザグ法）：
//   線をなぞりながら「ここまでで一番高いところ」を覚えておき、そこから MIN_SWING セント以上下がったら、
//   その一番高いところを「山」と決める。谷も同じように、一番低いところから上がったら「谷」と決める。
//   こうすると、測定の細かいガタつき（数セントの上下）を、揺れと間違えにくい。
//
// 本当の頂上の推定：
//   音程は1秒に約60回しか測れないので、ちょうど山の頂上で測れるとは限らない（頂上より少し手前・後ろの値になる）。
//   そこで、見つけた山（谷）とその前後の3点を通る放物線を考え、その頂点を本当の山（谷）とする（pitch.js と同じ考え方）。
//   （前の版では、となりの3点をならしてからさがしていたが、山が削れて幅が小さく出てしまったのでやめた）

// ずれ（セント）の計算
import { getCents, clampScore, SKIP_SECONDS, MIN_SECONDS } from "./longtone.js";

// ===== 設定値 =====

// これ以上動いたら、揺れの向きが変わったとみなす大きさ（セント）
const MIN_SWING = 3;

// 前の点からこれ以上あいたら、音が途切れたとみなして、山と谷の探し直しをする秒数
const GAP_SECONDS = 0.1;

// 目標から何セント以上ずれた音は、測り間違いとみなして外すか
const OUTLIER_CENTS = 150;

// 点数を出すのに必要な、山と谷それぞれの最低の数（揺れが2回より少ないときは点数を出さない）
const MIN_EXTREMES = 3;

// 点数の厳しさ（項目ごとに変える）
//   目標とのずれ：100 − ずれ（セント）× 2（±5セントで90点、±25で50点）
//   速さのそろい：100 − ばらつき（%）× 2（5%で90点、25%で50点）
//   幅のそろい  ：100 − ばらつき（%）× 1（10%で90点、50%で50点。幅は速さより自然にばらつきやすいので、ゆるめ）
const OFFSET_PENALTY = 2;
const RATE_PENALTY = 2;
const WIDTH_PENALTY = 1;

// 目標に合わせる位置の選択肢
//   top    ：揺れの上の端（正しい音から下へ揺らす考え方）
//   middle ：揺れの真ん中（上下に均等に揺らす考え方）
export const VIBRATO_REFERENCES = [
  { id: "top", name: "揺れの上の端" },
  { id: "middle", name: "揺れの真ん中" },
];

/**
 * 数の並びの平均を求める関数
 * @param {number[]} values - 数の並び（1つ以上）
 * @returns {number} 平均
 */
function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * ばらつき（標準偏差 ÷ 平均）を求める関数。0 に近いほど、そろっている
 * @param {number[]} values - 数の並び（1つ以上）
 * @returns {number} ばらつき（0.1 なら 10%）
 */
function variation(values) {
  const mean = average(values);
  if (mean === 0) {
    return 0;
  }
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) / Math.abs(mean);
}

/**
 * 測った音を、目標からのずれ（セント）の並びにする関数
 * 出だし（SKIP_SECONDS 秒）と、大きく外れた点（測り間違い）は外す。
 * @param {{time: number, frequency: number}[]} samples - 測った音（time は計測を始めてからの秒）
 * @param {number} targetFrequency - 目標の周波数（Hz）
 * @returns {{time: number, cents: number}[]} ずれの並び
 */
function toCents(samples, targetFrequency) {
  return samples
    .filter((sample) => sample.time >= SKIP_SECONDS)
    .map((sample) => ({ time: sample.time, cents: getCents(sample.frequency, targetFrequency) }))
    .filter((point) => Math.abs(point.cents) < OUTLIER_CENTS);
}

/**
 * 見つけた山（谷）とその前後の点を通る放物線の頂点を求めて、本当の頂上（底）の時刻と高さにする関数
 * 前後の点がない・時間があいているときは、見つけた点のまま返す。
 * @param {{time: number, cents: number}[]} points - ずれの並び
 * @param {number} index - 見つけた山（谷）の位置
 * @returns {{time: number, cents: number}} 本当の頂上（底）
 */
function refineExtreme(points, index) {
  const before = points[index - 1];
  const center = points[index];
  const after = points[index + 1];

  // 前後の点がそろっていて、時間があいていないときだけ推定する
  if (!before || !after || center.time - before.time > GAP_SECONDS || after.time - center.time > GAP_SECONDS) {
    return { time: center.time, cents: center.cents };
  }

  // 3点を通る放物線の頂点が、真ん中の点から何個分ずれているか（-0.5〜0.5 くらい）
  const denominator = before.cents - 2 * center.cents + after.cents;
  if (denominator === 0) {
    return { time: center.time, cents: center.cents };
  }
  const shift = (0.5 * (before.cents - after.cents)) / denominator;

  // 念のため、となりの点を越えるような大きなずれは使わない
  if (Math.abs(shift) > 1) {
    return { time: center.time, cents: center.cents };
  }

  return {
    // 点の間隔（前の点から後ろの点までの半分）× ずれ
    time: center.time + (shift * (after.time - before.time)) / 2,
    // 頂点の高さ
    cents: center.cents - 0.25 * (before.cents - after.cents) * shift,
  };
}

/**
 * ずれの並びから、揺れの山と谷を見つける関数（ジグザグ法）
 * @param {{time: number, cents: number}[]} points - ずれの並び
 * @returns {{time: number, cents: number, type: 'peak'|'trough'}[]} 山と谷（時刻の順。山と谷が交互に並ぶ）
 */
export function findExtremes(points) {
  // 見つけた山と谷（points の中の位置と種類）。最後に、本当の頂上（底）に直す
  /** @type {{index: number, type: 'peak'|'trough'}[]} */
  const found = [];

  // 今たどっている向き（'up'＝上り、'down'＝下り、null＝まだ分からない）
  let direction = null;

  // 今の向きでの、一番高い（上り）・一番低い（下り）点の位置
  let candidate = -1;

  // 向きが分からないうちの、一番高い点と一番低い点の位置
  let highest = -1;
  let lowest = -1;

  let previousTime = null;

  for (let i = 0; i < points.length; i++) {
    const point = points[i];

    // 音が途切れたら、探し直す（途切れをまたいで山と谷を数えないように）
    if (previousTime !== null && point.time - previousTime > GAP_SECONDS) {
      direction = null;
      candidate = -1;
      highest = -1;
      lowest = -1;
    }
    previousTime = point.time;

    if (direction === null) {
      // まだ向きが分からない：一番高い点・低い点を覚え、どちらかから MIN_SWING 動いたら向きを決める
      if (highest === -1 || point.cents > points[highest].cents) highest = i;
      if (lowest === -1 || point.cents < points[lowest].cents) lowest = i;
      if (point.cents <= points[highest].cents - MIN_SWING) {
        // 一番高い点から下がった → そこは山。ここからは下り
        found.push({ index: highest, type: "peak" });
        direction = "down";
        candidate = i;
      } else if (point.cents >= points[lowest].cents + MIN_SWING) {
        // 一番低い点から上がった → そこは谷。ここからは上り
        found.push({ index: lowest, type: "trough" });
        direction = "up";
        candidate = i;
      }
    } else if (direction === "up") {
      // 上り：もっと高い点があれば覚え直し、そこから MIN_SWING 下がったら山と決める
      if (point.cents > points[candidate].cents) {
        candidate = i;
      } else if (point.cents <= points[candidate].cents - MIN_SWING) {
        found.push({ index: candidate, type: "peak" });
        direction = "down";
        candidate = i;
      }
    } else {
      // 下り：もっと低い点があれば覚え直し、そこから MIN_SWING 上がったら谷と決める
      if (point.cents < points[candidate].cents) {
        candidate = i;
      } else if (point.cents >= points[candidate].cents + MIN_SWING) {
        found.push({ index: candidate, type: "trough" });
        direction = "up";
        candidate = i;
      }
    }
  }

  // 見つけた山と谷を、本当の頂上（底）に直して返す
  return found.map((item) => ({ ...refineExtreme(points, item.index), type: item.type }));
}

/**
 * ビブラートの結果を計算する関数
 * @param {{time: number, frequency: number}[]} samples - 測った音（time は計測を始めてからの秒）
 * @param {number} targetFrequency - 目標の周波数（Hz）
 * @param {number} duration - 音を出していた長さ（秒）
 * @param {string} reference - 目標に合わせる位置（'top'＝上の端、'middle'＝真ん中）
 * @returns {{duration: number, tooShort: boolean, found: boolean, extremes: {time: number, cents: number, type: string}[],
 *   rate: number, width: number, rateVariation: number, widthVariation: number, offset: number,
 *   offsetScore: number, rateScore: number, widthScore: number, score: number}}
 *   duration       ：長さ（秒）
 *   tooShort       ：短すぎて点数を出さないとき true
 *   found          ：揺れが見つかったか（山と谷がそれぞれ3つ以上）
 *   extremes       ：山と谷（グラフに印を付けるため）
 *   rate           ：速さ（1秒に何回揺れたか）
 *   width          ：幅（山と谷の差の半分＝ ±何セントか）
 *   rateVariation  ：速さのばらつき（0.08 なら ±8%）
 *   widthVariation ：幅のばらつき（0.2 なら ±20%）
 *   offset         ：目標とのずれ（上の端または真ん中の、平均のずれ。セント）
 *   offsetScore    ：目標とのずれの点数（0〜100）
 *   rateScore      ：速さのそろいの点数（0〜100）
 *   widthScore     ：幅のそろいの点数（0〜100）
 *   score          ：総合の点数（3つの平均、0〜100）
 */
export function summarizeVibrato(samples, targetFrequency, duration, reference) {
  const empty = {
    duration,
    tooShort: false,
    found: false,
    extremes: [],
    rate: 0,
    width: 0,
    rateVariation: 0,
    widthVariation: 0,
    offset: 0,
    offsetScore: 0,
    rateScore: 0,
    widthScore: 0,
    score: 0,
  };

  // 短すぎるときは、点数を出さない
  if (duration < MIN_SECONDS) {
    return { ...empty, tooShort: true };
  }

  const extremes = findExtremes(toCents(samples, targetFrequency));
  const peaks = extremes.filter((e) => e.type === "peak");
  const troughs = extremes.filter((e) => e.type === "trough");

  // 揺れが少なすぎるときは、点数を出さない（印だけは返す）
  if (peaks.length < MIN_EXTREMES || troughs.length < MIN_EXTREMES) {
    return { ...empty, extremes };
  }

  // ----- 速さ：山から次の山まで・谷から次の谷までの時間（1回の揺れの長さ）の平均から求める -----
  const periods = [];
  for (const list of [peaks, troughs]) {
    for (let i = 1; i < list.length; i++) {
      periods.push(list[i].time - list[i - 1].time);
    }
  }
  const rate = 1 / average(periods);

  // ----- 幅：となり合う山と谷の差の半分（±何セントか） -----
  const widths = [];
  for (let i = 1; i < extremes.length; i++) {
    widths.push(Math.abs(extremes[i].cents - extremes[i - 1].cents) / 2);
  }
  const width = average(widths);

  // ----- そろい具合：揺れの長さと幅のばらつき -----
  const rateVariation = variation(periods);
  const widthVariation = variation(widths);

  // ----- 目標とのずれ：上の端（山の平均）か、真ん中（山の平均と谷の平均のまん中） -----
  const peakAverage = average(peaks.map((p) => p.cents));
  const troughAverage = average(troughs.map((t) => t.cents));
  const offset = reference === "top" ? peakAverage : (peakAverage + troughAverage) / 2;

  // ----- 点数：項目ごとに 100 から引き、総合は3つの平均 -----
  const offsetScore = clampScore(100 - Math.abs(offset) * OFFSET_PENALTY);
  const rateScore = clampScore(100 - rateVariation * 100 * RATE_PENALTY);
  const widthScore = clampScore(100 - widthVariation * 100 * WIDTH_PENALTY);
  const score = Math.round((offsetScore + rateScore + widthScore) / 3);

  return {
    duration,
    tooShort: false,
    found: true,
    extremes,
    rate,
    width,
    rateVariation,
    widthVariation,
    offset,
    offsetScore,
    rateScore,
    widthScore,
    score,
  };
}
