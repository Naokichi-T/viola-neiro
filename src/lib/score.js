// ===== 楽譜のデータに関する設定値 =====

// 音名の一覧（ドから順に7つ）。配列の位置（0〜6）を「音名の番号」として使う
// 例：0 がド、4 がソ、5 がラ
export const STEP_NAMES = ["ド", "レ", "ミ", "ファ", "ソ", "ラ", "シ"];

// 各音名が、ドから半音いくつ分上にあるか（STEP_NAMES と同じ順番）
// 例：レはドの半音2つ上、ファはドの半音5つ上
const STEP_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

// 選べるオクターブの一覧
export const OCTAVES = [3, 4, 5, 6];

// 登録できる一番低い音の音番号（ド3。ビオラのC線の開放弦）
// （バイオリン版はソ3＝55だった。ビオラはソより5度低いドまで出るので48にする）
const MIN_NOTE_NUMBER = 48;

// 登録できる一番高い音の音番号（シ6）
const MAX_NOTE_NUMBER = 95;

// ===== 音のデータの形 =====
// 1つの音は、次の3つの値を持つオブジェクトで表す
//   step       ：音名の番号（0〜6。0 がド、6 がシ）
//   accidental ：変化記号（1 が♯、-1 が♭、0 がなし）
//   octave     ：オクターブ（3〜6）
// 例：ファ♯5 は { step: 3, accidental: 1, octave: 5 }

/**
 * 音の音番号を計算する関数
 * 音番号は、半音ごとに1ずつ増える通し番号のこと（ド4が60、ラ4が69）。
 * 音の高さを比べたり、周波数を計算したりするときに使う。
 * @param {{step: number, accidental: number, octave: number}} note - 音のデータ
 * @returns {number} 音番号
 */
export function getNoteNumber(note) {
  // オクターブ4のドが60になるように、(オクターブ + 1) × 12 を土台にする
  // そこに、音名ごとの半音の数と、変化記号（♯は+1、♭は-1）を足す
  return (note.octave + 1) * 12 + STEP_SEMITONES[note.step] + note.accidental;
}

/**
 * 音が登録できる音域（ド3〜シ6）に入っているかを調べる関数
 * @param {{step: number, accidental: number, octave: number}} note - 音のデータ
 * @returns {boolean} 音域内なら true、音域外なら false
 */
export function isInRange(note) {
  // 音番号に直してから、下限と上限の間にあるかを調べる
  const noteNumber = getNoteNumber(note);
  return noteNumber >= MIN_NOTE_NUMBER && noteNumber <= MAX_NOTE_NUMBER;
}

/**
 * 変化記号の番号を、表示用の文字に変換する関数
 * @param {number} accidental - 変化記号（1 が♯、-1 が♭、0 がなし）
 * @returns {string} 表示用の文字（'♯'、'♭'、なしのときは空文字）
 */
export function accidentalToText(accidental) {
  if (accidental === 1) {
    return "♯";
  } else if (accidental === -1) {
    return "♭";
  } else {
    return "";
  }
}

/**
 * 音のデータを、表示用の文字列に変換する関数
 * @param {{step: number, accidental: number, octave: number}} note - 音のデータ
 * @returns {string} 表示用の文字列（例：'ラ4'、'ファ♯5'、'シ♭3'）
 */
export function noteToText(note) {
  // 音名・変化記号・オクターブの順につなげる
  return STEP_NAMES[note.step] + accidentalToText(note.accidental) + note.octave;
}
