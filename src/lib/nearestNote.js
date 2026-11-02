// ===== 調に合わせて、一番近い音を探す仕組み =====
// 録音のグラフで「この音は何の音か」「そこから何セントずれているか」を決めるために使う。
//
// 音の呼び方（同じ高さでも、調によって呼び方が変わる）：
//   ① その調の音階の音なら、調号どおりに呼ぶ（例：ニ長調のファ♯、ヘ長調のシ♭）
//   ② 音階にない音で、♯・♭の付かない音（ドレミファソラシ）なら、そのまま呼ぶ（例：ニ長調のド）
//   ③ それ以外は、♭の調では♭、♯の調と調号なしの調では♯で呼ぶ（violin-pitch の指板と同じ決め方）
// 呼び方を調に合わせるのは、ピタゴラス音律や純正律では、シ♭とラ♯のように呼び方が違うと高さも違うため。

// 音番号の計算と、周波数の計算
import { getNoteNumber } from "./score.js";
import { getFrequency } from "./tuning.js";
import { getSignatureAccidentals } from "./key.js";

// 基準音（ラ4）の周波数。一番近い半音を選ぶ目安に使う
import { getReferenceFrequency } from "./reference.js";

/**
 * 0〜11 の範囲に直す関数（マイナスの数にも使える余り）
 * @param {number} value - 数
 * @returns {number} 0〜11
 */
function mod12(value) {
  return ((value % 12) + 12) % 12;
}

/**
 * 音名と♯・♭の組み合わせが、ドから半音いくつ上か（0〜11）を求める関数
 * @param {number} step - 音名の番号（0〜6）
 * @param {number} accidental - 変化記号（1 が♯、-1 が♭、0 がなし）
 * @returns {number} 0〜11
 */
function getPitchClass(step, accidental) {
  // オクターブ0 の音番号を求めて、12で割った余りにする
  return mod12(getNoteNumber({ step, accidental, octave: 0 }));
}

/**
 * ドから半音いくつ上か（0〜11）を、調に合わせた音名と♯・♭にする関数
 * @param {number} pitchClass - ドから半音いくつ上か（0〜11）
 * @param {import("./key.js").Key} key - 調のデータ
 * @returns {{step: number, accidental: number}} 音名の番号と変化記号
 */
function spellPitchClass(pitchClass, key) {
  const accidentals = getSignatureAccidentals(key.signature);

  // ① その調の音階の音か
  for (let step = 0; step < 7; step++) {
    if (getPitchClass(step, accidentals[step]) === pitchClass) {
      return { step, accidental: accidentals[step] };
    }
  }

  // ② ♯・♭の付かない音か
  for (let step = 0; step < 7; step++) {
    if (getPitchClass(step, 0) === pitchClass) {
      return { step, accidental: 0 };
    }
  }

  // ③ ♭の調なら♭（半音上の音に♭）、それ以外は♯（半音下の音に♯）
  const accidental = key.signature < 0 ? -1 : 1;
  for (let step = 0; step < 7; step++) {
    if (getPitchClass(step, accidental) === pitchClass) {
      return { step, accidental };
    }
  }

  // ここには来ないはずだが、念のため ド を返す
  return { step: 0, accidental: 0 };
}

/**
 * 周波数に一番近い音を、調と音律に合わせて探す関数
 * まず平均律で一番近い半音を選び、その音を調に合わせて呼び、選んだ音律での高さを求める。
 * （ピタゴラス音律・純正律と平均律の差は大きくても20セントくらいなので、近い音の選び方はほぼ同じになる）
 * @param {number} frequency - 弾いた音の周波数（Hz）
 * @param {import("./key.js").Key} key - 調のデータ
 * @param {string} temperamentId - 音律の id（'pythagorean' か 'just'）
 * @returns {{note: {step: number, accidental: number, octave: number}, frequency: number}}
 *   note：一番近い音の音のデータ、frequency：その音の、選んだ音律での周波数（Hz）
 */
export function findNearestNoteInKey(frequency, key, temperamentId) {
  // 音番号（ラ4 が 69、半音ごとに1ずつ）に直して、四捨五入する
  const noteNumber = Math.round(69 + 12 * Math.log2(frequency / getReferenceFrequency()));

  // 調に合わせた音名と♯・♭
  const spelled = spellPitchClass(mod12(noteNumber), key);

  // オクターブを決める（ド♭やシ♯のように、呼び方によってオクターブがずれる音にも合うように計算する）
  // getNoteNumber は「(オクターブ + 1) × 12 + …」なので、オクターブ0 のときとの差を12で割ればよい
  const baseNumber = getNoteNumber({ ...spelled, octave: 0 });
  const octave = (noteNumber - baseNumber) / 12;

  const note = { ...spelled, octave };
  return { note, frequency: getFrequency(note, key, temperamentId) };
}
