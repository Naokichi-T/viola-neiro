// ===== 基準音（ラ4）の高さ =====
// このアプリは自分用なので、基準音はラ＝442Hz に固定する。
// violin-pitch の reference.svelte.js（設定で 436〜446Hz に変えられる版）の代わりに使う。
// 関数の名前と使い方は violin-pitch と同じにしてあるので、tuning.js はほぼそのまま使える。

// 基準音（ラ4）の周波数（Hz）
const REFERENCE_FREQUENCY = 442;

/**
 * 今の基準音（ラ4）の周波数を返す関数
 * このアプリでは、いつも 442 を返す。
 * @returns {number} 基準音の周波数（Hz）
 */
export function getReferenceFrequency() {
  return REFERENCE_FREQUENCY;
}
