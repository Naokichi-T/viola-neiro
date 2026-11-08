// ===== 音階の音を作る仕組み =====
// 選んだ調・短音階の種類・オクターブの数から、弾く順番どおりの音の並び（上がって下りる）を作る。
// 画面のこと（表示やボタン）はここには書かず、計算だけにしておく。
//
// 作り方：
//   ① 主音の高さを決める（ビオラで弾ける一番低い主音。ド3〜シ3 のどれか）
//   ② 主音から、音名を1つずつ上げながら「上り」の音を並べる
//      （♯・♭は調号どおり。短調は、種類に合わせて6番目・7番目の音を半音上げる）
//   ③ 「下り」の音を、上りと同じ考え方で作って、逆の順番に並べる
//      （旋律的短音階だけは、下りで6番目・7番目の音を上げない＝自然的短音階に戻る）
//   ④ 上りと下りをつなげる（いちばん上の主音は1回だけにする）

// 調号から、音名ごとの♯・♭を求める関数
import { getSignatureAccidentals } from "./key.js";

// 音番号の計算と、音名の一覧
import { getNoteNumber, STEP_NAMES } from "./score.js";

// ===== 設定値 =====

// 選べる短音階の種類（長調のときは使わない）
//   id   ：区別するための名前（保存するときにも使う）
//   name ：画面に出す名前
//   description：どんな音階かの短い説明
export const MINOR_TYPES = [
  { id: "natural", name: "自然的", description: "調号のとおり" },
  { id: "harmonic", name: "和声的", description: "7番目の音を半音上げる" },
  { id: "melodic", name: "旋律的", description: "上りだけ6・7番目の音を半音上げる" },
];

// 最初に選ばれている短音階の種類（音階練習でよく使う和声的短音階）
export const DEFAULT_MINOR_TYPE_ID = "harmonic";

// 選べるオクターブの数
export const OCTAVE_COUNTS = [1, 2];

// ビオラで弾ける一番低い音の音番号（ド3。C線の開放弦）
const LOWEST_NOTE_NUMBER = 48;

// 1オクターブの中の音の数（ド・レ・ミ・ファ・ソ・ラ・シ の7つ）
const STEPS_PER_OCTAVE = 7;

// ===== 音階の1音のデータの形 =====
//   note   ：音のデータ（step は音名の番号、accidental は変化記号、octave はオクターブ）
//            accidental は 1 が♯、-1 が♭、0 がなし、2 がダブルシャープ（♯♯）
//            （嬰ト短調などの和声的・旋律的短音階では、♯の付いた音をさらに半音上げるため 2 が出てくる）
//   raised ：短音階で、調号から半音上げた音なら true（画面で目立たせるのに使う）

/**
 * id から短音階の種類を探す関数
 * @param {string} id - 短音階の種類の id（例：'harmonic'）
 * @returns {{id: string, name: string, description: string}} 短音階の種類。見つからないときは最初の値（和声的）
 */
export function getMinorType(id) {
  // 一覧の中から、id が一致するものを探す
  const found = MINOR_TYPES.find((type) => type.id === id);

  // 見つからなかったとき（古いデータなど）は、最初の値の和声的短音階を返す
  return found ?? MINOR_TYPES.find((type) => type.id === DEFAULT_MINOR_TYPE_ID);
}

/**
 * 調の主音を、ビオラで弾ける一番低い高さで返す関数
 * まずオクターブ3で作り、ド3 より低くなるとき（変ハ長調の ド♭3 など）は、1オクターブ上げる。
 * @param {import("./key.js").Key} key - 調のデータ
 * @returns {{step: number, accidental: number, octave: number}} 主音の音のデータ（例：ト長調なら ソ3）
 */
export function getLowestTonic(key) {
  // 主音に付く♯・♭は、調号から分かる（例：変ロ長調のシには♭が付く）
  const accidental = getSignatureAccidentals(key.signature)[key.tonicStep];

  // まずはオクターブ3で作る
  const tonic = { step: key.tonicStep, accidental: accidental, octave: 3 };

  // ド3 より低ければ（ド♭3 は シ2 と同じ高さ）、1オクターブ上げる
  if (getNoteNumber(tonic) < LOWEST_NOTE_NUMBER) {
    tonic.octave = 4;
  }

  return tonic;
}

/**
 * 短音階で、主音から数えて何番目の音を半音上げるかを調べる関数
 * @param {number} degree - 主音から数えて何番目か（0 が主音、5 が6番目の音、6 が7番目の音）
 * @param {string} minorTypeId - 短音階の種類の id（'natural'・'harmonic'・'melodic'）
 * @param {boolean} ascending - 上りなら true、下りなら false
 * @returns {boolean} 半音上げるなら true
 */
function shouldRaise(degree, minorTypeId, ascending) {
  if (minorTypeId === "harmonic") {
    // 和声的短音階：上りも下りも、7番目の音だけ上げる
    return degree === 6;
  } else if (minorTypeId === "melodic") {
    // 旋律的短音階：上りだけ、6番目と7番目の音を上げる（下りは自然的短音階と同じ）
    return ascending && (degree === 5 || degree === 6);
  } else {
    // 自然的短音階：どの音も上げない（調号のとおり）
    return false;
  }
}

/**
 * 主音から順に上がっていく音を、決まった数だけ並べる関数
 * 上りにも下りにも使う（下りのときは、作ったあとに逆の順番に並べ替える）。
 * @param {import("./key.js").Key} key - 調のデータ
 * @param {string} minorTypeId - 短音階の種類の id（長調のときは使わない）
 * @param {number} octaveCount - オクターブの数（1 か 2）
 * @param {boolean} ascending - 上りの音なら true、下りの音なら false（旋律的短音階で音が変わる）
 * @returns {{note: {step: number, accidental: number, octave: number}, raised: boolean}[]} 音の並び（低い順）
 */
function buildRun(key, minorTypeId, octaveCount, ascending) {
  // 調号から、音名ごとの♯・♭を求める
  const accidentals = getSignatureAccidentals(key.signature);

  // ビオラで弾ける一番低い主音
  const tonic = getLowestTonic(key);

  // 音を入れていく入れ物
  const run = [];

  // 主音から数えて 0 番目〜（7 × オクターブの数）番目までの音を作る（最後はいちばん上の主音）
  const total = STEPS_PER_OCTAVE * octaveCount;
  for (let i = 0; i <= total; i++) {
    // 主音から音名をいくつ進めたか（ドからの通し番号）。7 を越えるたびにオクターブが1つ上がる
    const stepFromC = tonic.step + i;
    const step = stepFromC % STEPS_PER_OCTAVE;
    const octave = tonic.octave + Math.floor(stepFromC / STEPS_PER_OCTAVE);

    // 主音から数えて何番目の音か（0〜6。8番目の音はまた 0 の主音になる）
    const degree = i % STEPS_PER_OCTAVE;

    // 短調のときだけ、種類に合わせて半音上げるかを決める
    const raised = key.mode === "minor" && shouldRaise(degree, minorTypeId, ascending);

    // 調号どおりの♯・♭に、上げる分（+1）を足す
    // 例：イ短調のソ（なし）→ ソ♯、ニ短調のシ♭ → シ（なし）、嬰ト短調のファ♯ → ファ♯♯
    const accidental = accidentals[step] + (raised ? 1 : 0);

    run.push({ note: { step: step, accidental: accidental, octave: octave }, raised: raised });
  }

  return run;
}

/**
 * 音階の音を、弾く順番（上がって下りる）に並べて返す関数
 * @param {import("./key.js").Key} key - 調のデータ
 * @param {string} minorTypeId - 短音階の種類の id（'natural'・'harmonic'・'melodic'。長調のときは使わない）
 * @param {number} octaveCount - オクターブの数（1 か 2）
 * @returns {{ascending: {note: object, raised: boolean}[], descending: {note: object, raised: boolean}[], all: {note: object, raised: boolean}[]}}
 *   ascending  ：上りの音（主音 → いちばん上の主音）
 *   descending ：下りの音（いちばん上の主音の次 → 主音。いちばん上の主音は上りに入っているので含めない）
 *   all        ：上りと下りをつなげた、弾く順番どおりの全部の音
 *   例：ト長調・1オクターブ
 *     ascending  ソ3 ラ3 シ3 ド4 レ4 ミ4 ファ♯4 ソ4
 *     descending ファ♯4 ミ4 レ4 ド4 シ3 ラ3 ソ3
 */
export function buildScale(key, minorTypeId, octaveCount) {
  // 上りの音（低い順）
  const ascending = buildRun(key, minorTypeId, octaveCount, true);

  // 下りの音：下り用の音を低い順に作ってから逆に並べ、いちばん上の主音（先頭）を取り除く
  // （slice() でコピーしてから reverse() するのは、元の配列を変えないため）
  const descending = buildRun(key, minorTypeId, octaveCount, false).slice().reverse().slice(1);

  return {
    ascending: ascending,
    descending: descending,
    all: [...ascending, ...descending],
  };
}

/**
 * 変化記号を、表示用の文字にする関数
 * score.js の accidentalToText は ♯・♭ しか扱わないので、ダブルシャープ（2）も扱えるように、ここで別に用意する。
 * ダブルシャープの記号「𝄪」は表示できない端末があるので、「♯♯」と書く。
 * @param {number} accidental - 変化記号（2 が♯♯、1 が♯、-1 が♭、0 がなし）
 * @returns {string} 表示用の文字
 */
function scaleAccidentalToText(accidental) {
  if (accidental === 2) {
    return "♯♯";
  } else if (accidental === 1) {
    return "♯";
  } else if (accidental === -1) {
    return "♭";
  } else {
    return "";
  }
}

/**
 * 音階の音を、表示用の文字にする関数
 * @param {{step: number, accidental: number, octave: number}} note - 音のデータ
 * @returns {string} 表示用の文字（例：'ファ♯4'、'ファ♯♯4'）
 */
export function scaleNoteToText(note) {
  // 音名・変化記号・オクターブの順につなげる
  return STEP_NAMES[note.step] + scaleAccidentalToText(note.accidental) + note.octave;
}
