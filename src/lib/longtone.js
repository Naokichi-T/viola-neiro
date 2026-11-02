// ===== ロングトーンの計算 =====
// 目標の音、目標からのずれ（セント）、結果（平均のずれ・ぶれの大きさ・点数）の計算をまとめる。
// 画面のこと（表示やボタン）はここには書かず、計算だけにしておく。
// （「自由」のときに一番近い音を探すのは、録音のページと同じ nearestNote.js を使う。調に合わせて呼び分けるため）

// 周波数の計算（ピタゴラス音律）に使う
import { getFrequency } from "./tuning.js";
import { getKey, DEFAULT_KEY_ID } from "./key.js";

// ===== 設定値 =====

// このアプリで使う音律（ピタゴラス音律で固定）
export const LONGTONE_TEMPERAMENT_ID = "pythagorean";

// 出だしの何秒を点数に入れないか（グラフには出す）。弾き始めは音が安定しにくいため
export const SKIP_SECONDS = 0.3;

// 何秒より短いと点数を出さないか
export const MIN_SECONDS = 1;

// 何秒続けて音が取れなくなったら終わりにするか（弓の返しなどの一瞬の途切れでは終わらない）
export const SILENCE_SECONDS = 0.5;

// 最長で何秒まで測るか（止め忘れたときのため）
export const MAX_SECONDS = 60;

// 目標から何セント以上ずれた音は、測り間違い（1オクターブ違いなど）とみなして結果の計算から外すか
const OUTLIER_CENTS = 100;

// 点数の厳しさ
//   目標とのずれ：100 − ずれ（セント）× 2（±5セントで90点、±25で50点、±50で0点）
//   ぶれの少なさ：100 − ぶれ（セント）× 4（±2.5セントで90点、±12.5で50点）
//   （2つの平均が、前の版の1つの点数「100 − ずれ − ぶれ × 2」と同じになるようにしてある）
const OFFSET_PENALTY = 2;
const SPREAD_PENALTY = 4;

// 目標の候補（ビオラの開放弦の4本）。ピタゴラス音律では、開放弦の高さそのものになる
// （バイオリン版の ソ3・レ4・ラ4・ミ5 から、ミ5 をなくして ド3 を足した）
//   id   ：区別するための名前
//   note ：音のデータ（step は音名の番号、accidental は♯♭、octave はオクターブ）
export const OPEN_STRING_TARGETS = [
  { id: "C3", note: { step: 0, accidental: 0, octave: 3 } }, // ド3（C線）
  { id: "G3", note: { step: 4, accidental: 0, octave: 3 } }, // ソ3（G線）
  { id: "D4", note: { step: 1, accidental: 0, octave: 4 } }, // レ4（D線）
  { id: "A4", note: { step: 5, accidental: 0, octave: 4 } }, // ラ4（A線）
];

// 「自由」を表す id
export const FREE_TARGET_ID = "free";

/**
 * 音のデータの周波数を求める関数（ピタゴラス音律・ラ＝442Hz）
 * ピタゴラス音律は、音名と♯・♭とオクターブだけで高さが決まる（シ♭とラ♯は違う高さになる）。
 * @param {{step: number, accidental: number, octave: number}} note - 音のデータ
 * @returns {number} 周波数（Hz）
 */
export function getTargetFrequency(note) {
  // ピタゴラス音律では調は使わないが、関数の形に合わせて調（ハ長調）を渡しておく
  return getFrequency(note, getKey(DEFAULT_KEY_ID), LONGTONE_TEMPERAMENT_ID);
}

/**
 * 弾いた音が、目標から何セントずれているかを計算する関数
 * セントは、半音を100に分けた音程の単位（1オクターブが1200セント）。
 * @param {number} frequency - 弾いた音の周波数（Hz）
 * @param {number} targetFrequency - 目標の周波数（Hz）
 * @returns {number} ずれ（セント）。プラスは高い、マイナスは低い
 */
export function getCents(frequency, targetFrequency) {
  return 1200 * Math.log2(frequency / targetFrequency);
}

/**
 * いくつかの数の、真ん中の値（中央値）を求める関数
 * 「自由」で出だしの音から目標を決めるときに、ときどき混ざる測り間違いに引っぱられないように使う。
 * @param {number[]} values - 数の配列（1つ以上）
 * @returns {number} 中央値
 */
export function getMedian(values) {
  // 元の配列を変えないように、コピーしてから小さい順に並べる
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  // 個数が奇数なら真ん中の1つ、偶数なら真ん中の2つの平均
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * 点数を 0〜100 の整数に収める関数
 * @param {number} value - 計算した点数
 * @returns {number} 0〜100 の整数
 */
export function clampScore(value) {
  return Math.round(Math.min(Math.max(value, 0), 100));
}

/**
 * ロングトーンの結果を計算する関数
 * @param {{time: number, frequency: number}[]} samples - 計測した音（time は計測を始めてからの秒）
 * @param {number} targetFrequency - 目標の周波数（Hz）
 * @param {number} duration - 音を出していた長さ（秒）
 * @returns {{duration: number, tooShort: boolean, average: number, spread: number, offsetScore: number, spreadScore: number, score: number}|null}
 *   duration    ：長さ（秒）
 *   tooShort    ：短すぎて点数を出さないとき true
 *   average     ：平均のずれ（セント、整数）
 *   spread      ：ぶれの大きさ（セント、整数。標準偏差）
 *   offsetScore ：目標とのずれの点数（0〜100）
 *   spreadScore ：ぶれの少なさの点数（0〜100）
 *   score       ：総合の点数（2つの平均、0〜100）
 *   点数に使える音が1つもないときは null
 */
export function summarizeLongTone(samples, targetFrequency, duration) {
  // 短すぎるときは、点数を出さない
  if (duration < MIN_SECONDS) {
    return {
      duration,
      tooShort: true,
      average: 0,
      spread: 0,
      offsetScore: 0,
      spreadScore: 0,
      score: 0,
    };
  }

  // 出だしを除き、ずれ（セント）に直す。大きく外れたもの（測り間違い）は外す
  const cents = samples
    .filter((sample) => sample.time >= SKIP_SECONDS)
    .map((sample) => getCents(sample.frequency, targetFrequency))
    .filter((value) => Math.abs(value) < OUTLIER_CENTS);

  if (cents.length === 0) {
    return null;
  }

  // 平均のずれ：全部のずれを足して、個数で割る（全体として高いか低いか）
  const average = cents.reduce((sum, value) => sum + value, 0) / cents.length;

  // ぶれの大きさ（標準偏差）：平均からの離れ具合を2乗して平均し、平方根をとる（どれだけ揺れたか）
  const variance = cents.reduce((sum, value) => sum + (value - average) ** 2, 0) / cents.length;
  const spread = Math.sqrt(variance);

  // それぞれの点数と、総合（2つの平均）
  const offsetScore = clampScore(100 - Math.abs(average) * OFFSET_PENALTY);
  const spreadScore = clampScore(100 - spread * SPREAD_PENALTY);
  const score = Math.round((offsetScore + spreadScore) / 2);

  return {
    duration,
    tooShort: false,
    average: Math.round(average),
    spread: Math.round(spread),
    offsetScore,
    spreadScore,
    score,
  };
}
