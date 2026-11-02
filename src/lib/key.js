// 音名の一覧を読み込む（音階を文字で表示するときに使う）
import { STEP_NAMES } from "./score.js";

// ===== 調のデータに関する設定値 =====

// 調号の♯が付いていく順番（音名の番号）：ファ・ド・ソ・レ・ラ・ミ・シ
// 例：♯が3つの調は、この順の最初の3つ（ファ・ド・ソ）に♯が付く
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];

// 調号の♭が付いていく順番（音名の番号）：シ・ミ・ラ・レ・ソ・ド・ファ
// 例：♭が2つの調は、この順の最初の2つ（シ・ミ）に♭が付く
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];

// ===== 調のデータの形 =====
// 1つの調は、次の値を持つオブジェクトで表す
//   id        ：調を区別するための名前（保存するときにも使う）
//   name      ：日本語の名前（例：'イ長調'）
//   german    ：ドイツ語の名前（例：'A dur'）。短調は小文字で書くのが習慣
//   mode      ：'major' が長調、'minor' が短調
//   tonicStep ：主音（音階の最初の音）の音名の番号（0〜6。0 がド、5 がラ）
//   signature ：調号の数。プラスは♯の数、マイナスは♭の数、0 は調号なし
//               例：3 は♯が3つ、-2 は♭が2つ

/**
 * 調のデータの形を、VSCode にも分かるように名前を付けて定義しておく（中身は上のコメントと同じ）。
 * ほかのファイルやこのファイルのコメントで {Key} と書くと、この形のデータだと伝わる。
 * （{object} と書くと「中身の分からないオブジェクト」とみなされ、key.name などが赤くなるため）
 * @typedef {object} Key
 * @property {string} id - 調を区別するための名前（例：'A-dur'）
 * @property {string} name - 日本語の名前（例：'イ長調'）
 * @property {string} german - ドイツ語の名前（例：'A dur'）
 * @property {string} mode - 'major' が長調、'minor' が短調
 * @property {number} tonicStep - 主音の音名の番号（0〜6）
 * @property {number} signature - 調号の数（プラスは♯、マイナスは♭の数）
 */

// 選べる調の一覧（長調15個、短調15個）
// 並び順は、調号なし → ♯が1〜7個 → ♭が1〜7個
export const KEYS = [
  // ----- 長調 -----
  { id: "C-dur", name: "ハ長調", german: "C dur", mode: "major", tonicStep: 0, signature: 0 },
  { id: "G-dur", name: "ト長調", german: "G dur", mode: "major", tonicStep: 4, signature: 1 },
  { id: "D-dur", name: "ニ長調", german: "D dur", mode: "major", tonicStep: 1, signature: 2 },
  { id: "A-dur", name: "イ長調", german: "A dur", mode: "major", tonicStep: 5, signature: 3 },
  { id: "E-dur", name: "ホ長調", german: "E dur", mode: "major", tonicStep: 2, signature: 4 },
  { id: "H-dur", name: "ロ長調", german: "H dur", mode: "major", tonicStep: 6, signature: 5 },
  { id: "Fis-dur", name: "嬰ヘ長調", german: "Fis dur", mode: "major", tonicStep: 3, signature: 6 },
  { id: "Cis-dur", name: "嬰ハ長調", german: "Cis dur", mode: "major", tonicStep: 0, signature: 7 },
  { id: "F-dur", name: "ヘ長調", german: "F dur", mode: "major", tonicStep: 3, signature: -1 },
  { id: "B-dur", name: "変ロ長調", german: "B dur", mode: "major", tonicStep: 6, signature: -2 },
  { id: "Es-dur", name: "変ホ長調", german: "Es dur", mode: "major", tonicStep: 2, signature: -3 },
  { id: "As-dur", name: "変イ長調", german: "As dur", mode: "major", tonicStep: 5, signature: -4 },
  { id: "Des-dur", name: "変ニ長調", german: "Des dur", mode: "major", tonicStep: 1, signature: -5 },
  { id: "Ges-dur", name: "変ト長調", german: "Ges dur", mode: "major", tonicStep: 4, signature: -6 },
  { id: "Ces-dur", name: "変ハ長調", german: "Ces dur", mode: "major", tonicStep: 0, signature: -7 },

  // ----- 短調 -----
  { id: "a-moll", name: "イ短調", german: "a moll", mode: "minor", tonicStep: 5, signature: 0 },
  { id: "e-moll", name: "ホ短調", german: "e moll", mode: "minor", tonicStep: 2, signature: 1 },
  { id: "h-moll", name: "ロ短調", german: "h moll", mode: "minor", tonicStep: 6, signature: 2 },
  { id: "fis-moll", name: "嬰ヘ短調", german: "fis moll", mode: "minor", tonicStep: 3, signature: 3 },
  { id: "cis-moll", name: "嬰ハ短調", german: "cis moll", mode: "minor", tonicStep: 0, signature: 4 },
  { id: "gis-moll", name: "嬰ト短調", german: "gis moll", mode: "minor", tonicStep: 4, signature: 5 },
  { id: "dis-moll", name: "嬰ニ短調", german: "dis moll", mode: "minor", tonicStep: 1, signature: 6 },
  { id: "ais-moll", name: "嬰イ短調", german: "ais moll", mode: "minor", tonicStep: 5, signature: 7 },
  { id: "d-moll", name: "ニ短調", german: "d moll", mode: "minor", tonicStep: 1, signature: -1 },
  { id: "g-moll", name: "ト短調", german: "g moll", mode: "minor", tonicStep: 4, signature: -2 },
  { id: "c-moll", name: "ハ短調", german: "c moll", mode: "minor", tonicStep: 0, signature: -3 },
  { id: "f-moll", name: "ヘ短調", german: "f moll", mode: "minor", tonicStep: 3, signature: -4 },
  { id: "b-moll", name: "変ロ短調", german: "b moll", mode: "minor", tonicStep: 6, signature: -5 },
  { id: "es-moll", name: "変ホ短調", german: "es moll", mode: "minor", tonicStep: 2, signature: -6 },
  { id: "as-moll", name: "変イ短調", german: "as moll", mode: "minor", tonicStep: 5, signature: -7 },
];

// 最初に選ばれている調の id（ハ長調）
export const DEFAULT_KEY_ID = "C-dur";

/**
 * id から調のデータを探す関数
 * @param {string} id - 調の id（例：'A-dur'）
 * @returns {Key} 調のデータ。見つからないときはハ長調を返す
 */
export function getKey(id) {
  // 一覧の中から、id が一致するものを探す
  const found = KEYS.find((key) => key.id === id);

  // 見つからなかったとき（古いデータなど）は、一覧の先頭のハ長調を返す
  return found ?? KEYS[0];
}

/**
 * 調の、メニューに表示する名前を作る関数
 * @param {Key} key - 調のデータ
 * @returns {string} 表示用の名前（例：'イ長調（A dur）'）
 */
export function getKeyLabel(key) {
  return key.name + "（" + key.german + "）";
}

/**
 * 調号から、7つの音名それぞれに付く変化記号を求める関数
 * @param {number} signature - 調号の数（プラスは♯の数、マイナスは♭の数）
 * @returns {number[]} 音名の番号（0〜6）ごとの変化記号（1 が♯、-1 が♭、0 がなし）
 *   例：signature が 2（ニ長調）のとき [1, 0, 0, 1, 0, 0, 0]（ドとファに♯）
 */
export function getSignatureAccidentals(signature) {
  // 最初は、7つの音すべてを「変化記号なし」にしておく
  const accidentals = [0, 0, 0, 0, 0, 0, 0];

  if (signature > 0) {
    // ♯の調：♯が付いていく順番の先頭から、signature 個ぶんに♯を付ける
    for (let i = 0; i < signature; i++) {
      accidentals[SHARP_ORDER[i]] = 1;
    }
  } else if (signature < 0) {
    // ♭の調：♭が付いていく順番の先頭から、♭の数ぶんに♭を付ける
    // signature はマイナスの数なので、マイナスを付けてプラスの個数に直す
    for (let i = 0; i < -signature; i++) {
      accidentals[FLAT_ORDER[i]] = -1;
    }
  }

  return accidentals;
}

/**
 * 調号の数を、表示用の文字にする関数
 * @param {number} signature - 調号の数（プラスは♯の数、マイナスは♭の数、0 は調号なし）
 * @returns {string} 表示用の文字（例：'♯1つ'、'♭3つ'、'調号なし'）
 */
export function getSignatureLabel(signature) {
  if (signature > 0) {
    // ♯ の付く調
    return "♯" + signature + "つ";
  } else if (signature < 0) {
    // ♭ の付く調（Math.abs でマイナスを外した数にする）
    return "♭" + Math.abs(signature) + "つ";
  } else {
    // ♯ も ♭ も付かない調（ハ長調・イ短調）
    return "調号なし";
  }
}

/**
 * 調の、調を選ぶメニューに表示する名前を作る関数
 * ふつうの名前（getKeyLabel）の後ろに、調号の数を付ける。
 * 調号の数を一番後ろにしてあるのは、メニューの幅に入りきらないとき、後ろから切れるため
 * （切れても、メニューを開いた一覧では、全部見える）。
 * @param {Key} key - 調のデータ
 * @returns {string} 表示用の名前（例：'ト長調（G dur） ♯1つ'）
 */
export function getKeyMenuLabel(key) {
  return getKeyLabel(key) + " " + getSignatureLabel(key.signature);
}

/**
 * 調の音階を、文字の配列にして返す関数
 * 主音から1オクターブ上の主音まで、8つの音を順に並べる。
 * 短調は、調号どおりの音だけを使う自然短音階で表す。
 * @param {Key} key - 調のデータ
 * @returns {string[]} 音階の音名の配列
 *   例：イ長調のとき ['ラ', 'シ', 'ド♯', 'レ', 'ミ', 'ファ♯', 'ソ♯', 'ラ']
 */
export function getScaleNames(key) {
  // この調で、各音名に付く変化記号を求める
  const accidentals = getSignatureAccidentals(key.signature);

  // 音名を順に入れていく入れ物
  const names = [];

  // 主音から数えて 0〜7 番目の音を順に作る（7番目は1オクターブ上の主音）
  for (let i = 0; i <= 7; i++) {
    // 音名の番号を求める（シの次はドに戻るので、7で割った余りを使う）
    const step = (key.tonicStep + i) % 7;

    // 変化記号を文字にする（♯・♭・なし）
    let accidentalText = "";
    if (accidentals[step] === 1) {
      accidentalText = "♯";
    } else if (accidentals[step] === -1) {
      accidentalText = "♭";
    }

    names.push(STEP_NAMES[step] + accidentalText);
  }

  return names;
}
