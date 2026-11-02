// 音番号を計算する関数を読み込む
import { getNoteNumber } from "./score.js";

// 調号から、各音名に付く変化記号を求める関数を読み込む
import { getSignatureAccidentals } from "./key.js";

// 今の基準音（ラ4）の周波数を返す関数を読み込む
// （violin-pitch では設定で変えられたが、このアプリでは 442Hz 固定の reference.js を使う）
import { getReferenceFrequency } from "./reference.js";

// ===== 音律に関する設定値 =====
// 音律は、「それぞれの音をどの高さにするか」の決め方のこと

// 選べる音律の一覧
//   id          ：音律を区別するための名前（保存するときにも使う）
//   name        ：画面に表示する名前
//   description ：どんな場面に向いているかの説明

/**
 * 音律のデータの形を、VSCode にも分かるように名前を付けて定義しておく（中身は上のコメントと同じ）
 * @typedef {object} Temperament
 * @property {string} id - 音律を区別するための名前（例：'just'）
 * @property {string} name - 画面に表示する名前
 * @property {string} description - どんな場面に向いているかの説明
 */

/** @type {Temperament[]} */
export const TEMPERAMENTS = [
  { id: "just", name: "純正律", description: "和音がきれいに響く高さ。調によって音の高さが変わる" },
  {
    id: "pythagorean",
    name: "ピタゴラス音律",
    description: "5度の積み重ねで決める高さ。メロディ向きで、開放弦と同じ考え方",
  },
  { id: "equal", name: "平均律", description: "ピアノや普通のチューナーと同じ高さ" },
];

// 最初に選ばれている音律の id（ピタゴラス音律）
export const DEFAULT_TEMPERAMENT_ID = "pythagorean";

// 基準音（ラ4）の音番号
const REFERENCE_NOTE_NUMBER = 69;

// 【純正律】主音から半音いくつ分離れているか（0〜11）ごとの、主音との周波数の比率
// 例：半音7つ分（完全5度）なら、主音の周波数の 3/2 倍
const JUST_RATIOS = [
  1 / 1, // 0：主音
  16 / 15, // 1：短2度
  9 / 8, // 2：長2度
  6 / 5, // 3：短3度
  5 / 4, // 4：長3度
  4 / 3, // 5：完全4度
  45 / 32, // 6：増4度
  3 / 2, // 7：完全5度
  8 / 5, // 8：短6度
  5 / 3, // 9：長6度
  9 / 5, // 10：短7度
  15 / 8, // 11：長7度
];

// 各音名が、ラから完全5度をいくつ分進んだ位置にあるか（音名の番号 0〜6 の順）
// プラスは5度上の方向、マイナスは5度下の方向
// 5度の並び：ファ ← ド ← ソ ← レ ← ラ → ミ → シ
//           -4    -3   -2   -1   0    1    2
const FIFTHS_FROM_A = [-3, -1, 1, -4, -2, 0, 2];

// ♯や♭が1つ付くと、5度の並びの上でいくつ分ずれるか（♯は7つ上、♭は7つ下）
const FIFTHS_PER_ACCIDENTAL = 7;

/**
 * id から音律のデータを探す関数
 * @param {string} id - 音律の id（例：'just'）
 * @returns {Temperament} 音律のデータ。見つからないときは一覧の先頭（純正律）を返す
 */
export function getTemperament(id) {
  // 一覧の中から、id が一致するものを探す
  const found = TEMPERAMENTS.find((temperament) => temperament.id === id);

  // 見つからなかったとき（古いデータなど）は、一覧の先頭の純正律を返す
  return found ?? TEMPERAMENTS[0];
}

/**
 * 【平均律】音番号から周波数を計算する関数
 * 平均律は、1オクターブを12等分した音律（普通のチューナーやピアノで使われる）。
 * @param {number} noteNumber - 音番号（ラ4 が 69）
 * @returns {number} 平均律での周波数（Hz）
 */
function getEqualFrequency(noteNumber) {
  // 基準音から半音いくつ分離れているかを求め、その分だけ周波数を変える
  // 半音12個（1オクターブ）で、周波数がちょうど2倍になる
  return getReferenceFrequency() * Math.pow(2, (noteNumber - REFERENCE_NOTE_NUMBER) / 12);
}

/**
 * 【ピタゴラス音律】音の周波数を計算する関数
 * ビオラの開放弦と同じように、ラ＝442Hz から完全5度（3/2倍）を積み重ねて求める。
 * 調には関係なく、音名と変化記号とオクターブだけで高さが決まる。
 * @param {{step: number, accidental: number, octave: number}} note - 音のデータ
 * @returns {number} ピタゴラス音律での周波数（Hz）
 *   例：ラ4 は 442、レ4 は 約294.7（D線の開放弦と同じ）
 */
function getPythagoreanFrequency(note) {
  // この音が、ラから完全5度をいくつ分進んだ位置にあるかを求める
  const fifths = FIFTHS_FROM_A[note.step] + note.accidental * FIFTHS_PER_ACCIDENTAL;

  // ラ＝442Hz に、3/2 を fifths 回掛ける（マイナスのときは、その回数だけ割ることになる）
  let frequency = getReferenceFrequency() * Math.pow(3 / 2, fifths);

  // 5度を積み重ねると、オクターブがずれていく。
  // そこで、この音のオクターブの高さになるまで、2倍または半分にして合わせる。
  // 目安として平均律での周波数を使い、その近く（半オクターブ以内）に来るまで繰り返す
  const target = getEqualFrequency(getNoteNumber(note));
  while (frequency > target * Math.SQRT2) {
    frequency = frequency / 2;
  }
  while (frequency < target / Math.SQRT2) {
    frequency = frequency * 2;
  }

  return frequency;
}

/**
 * 調の主音を、音のデータにして返す関数
 * オクターブは4に決めておく（ほかの音の高さを計算するときの基準にするため）。
 * @param {import("./key.js").Key} key - 調のデータ
 * @returns {{step: number, accidental: number, octave: number}} 主音の音のデータ
 *   例：イ長調なら ラ4、変ロ長調なら シ♭4
 */
function getTonicNote(key) {
  return {
    step: key.tonicStep,
    // 主音に付く変化記号は、調号から分かる（例：変ロ長調のシには♭が付く）
    accidental: getSignatureAccidentals(key.signature)[key.tonicStep],
    octave: 4,
  };
}

/**
 * 【純正律】音の周波数を計算する関数
 * 主音から半音いくつ分離れているかを調べ、その音程の比率を主音の周波数に掛ける。
 * 主音の高さは、開放弦ときれいに響くように、ピタゴラス音律（5度の積み重ね）で決める。
 * @param {{step: number, accidental: number, octave: number}} note - 音のデータ
 * @param {import("./key.js").Key} key - 調のデータ
 * @returns {number} 純正律での周波数（Hz）
 */
function getJustFrequency(note, key) {
  // 主音（オクターブ4）の音のデータと、その周波数
  const tonic = getTonicNote(key);
  const tonicFrequency = getPythagoreanFrequency(tonic);

  // 主音から、半音いくつ分離れているか（下にあるときはマイナス）
  const semitones = getNoteNumber(note) - getNoteNumber(tonic);

  // 何オクターブ離れているか（例：半音14個なら1オクターブ上、半音-3個なら1オクターブ下）
  const octaves = Math.floor(semitones / 12);

  // オクターブの分を取り除いた、主音からの半音の数（0〜11）
  const semitonesInOctave = semitones - octaves * 12;

  // 主音の周波数 × 音程の比率 × オクターブの分（1オクターブ上がるごとに2倍）
  return tonicFrequency * JUST_RATIOS[semitonesInOctave] * Math.pow(2, octaves);
}

/**
 * 選んだ音律での、音の周波数を計算する関数
 * 画面の表示・再生・判定は、すべてこの関数で求めた周波数を使う。
 * @param {{step: number, accidental: number, octave: number}} note - 音のデータ
 * @param {import("./key.js").Key} key - 調のデータ（純正律のときだけ使う）
 * @param {string} temperamentId - 音律の id（'just'・'pythagorean'・'equal'）
 * @returns {number} 周波数（Hz）
 */
export function getFrequency(note, key, temperamentId) {
  if (temperamentId === "equal") {
    // 平均律
    return getEqualFrequency(getNoteNumber(note));
  } else if (temperamentId === "pythagorean") {
    // ピタゴラス音律
    return getPythagoreanFrequency(note);
  } else {
    // 純正律（知らない id が来たときも、純正律で計算する）
    return getJustFrequency(note, key);
  }
}

/**
 * 選んだ音律での音の高さが、平均律と比べて何セントずれているかを計算する関数
 * 普通のチューナー（平均律）で測ったときに、針がどれだけずれて見えるかの目安になる。
 * @param {{step: number, accidental: number, octave: number}} note - 音のデータ
 * @param {import("./key.js").Key} key - 調のデータ
 * @param {string} temperamentId - 音律の id（'just'・'pythagorean'・'equal'）
 * @returns {number} 平均律からのズレ（セント）。プラスは平均律より高い、マイナスは低い
 */
export function getCentsFromEqual(note, key, temperamentId) {
  // 選んだ音律での周波数と、平均律での周波数
  const frequency = getFrequency(note, key, temperamentId);
  const equalFrequency = getEqualFrequency(getNoteNumber(note));

  // 周波数の比を、セントに変換する（周波数が2倍で1200セント）
  return 1200 * Math.log2(frequency / equalFrequency);
}

// ===== 開放弦の高さ =====

// ビオラの4本の開放弦（指を押さえない弦）の音と、基準音（ラ4）の何倍の周波数か
// （バイオリン版の G・D・A・E から、E線をなくして、いちばん低い C線を足した形）
// ラ4（A線）を基準音に合わせ、そこから5度ずつきれいに合わせた、ふつうの調弦の高さ
// 5度上は周波数が 3/2 倍、5度下は 2/3 倍になる
// （周波数そのものではなく「何倍か」を持っておき、使うときに、今の基準音に掛ける）
const OPEN_STRINGS = [
  // C線：ド3（ラ4 から5度を3回下がる。2/3 × 2/3 × 2/3 ＝ 8/27）
  { step: 0, octave: 3, ratio: 8 / 27 },
  // G線：ソ3（ラ4 から5度を2回下がる。2/3 × 2/3 ＝ 4/9）
  { step: 4, octave: 3, ratio: 4 / 9 },
  // D線：レ4（ラ4 から5度を1回下がる）
  { step: 1, octave: 4, ratio: 2 / 3 },
  // A線：ラ4（基準音）
  { step: 5, octave: 4, ratio: 1 },
];

/**
 * 音が開放弦と同じ音のときに、開放弦の周波数を返す関数
 * 開放弦と同じ音は、ド3・ソ3・レ4・ラ4 の4つ（♯や♭が付いた音や、オクターブ違いの音は当てはまらない）。
 * @param {{step: number, accidental: number, octave: number}} note - 音のデータ
 * @returns {number|null} 開放弦の周波数（Hz）。開放弦と同じ音でないときは null
 */
export function getOpenStringFrequency(note) {
  // ♯や♭が付いた音は、開放弦では弾けない
  if (note.accidental !== 0) {
    return null;
  }

  // 4本の開放弦を順に見て、音名とオクターブが同じものを探す
  for (const openString of OPEN_STRINGS) {
    if (openString.step === note.step && openString.octave === note.octave) {
      // 今の基準音に、その弦の「何倍か」を掛けて、周波数にする
      return getReferenceFrequency() * openString.ratio;
    }
  }

  // 見つからなかったときは、開放弦と同じ音ではない
  return null;
}
