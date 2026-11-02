// ===== 録音のページの設定をブラウザに保存・読み込みする仕組み =====
// 選んだ音律・調と、メトロノームの設定を覚えておき、次に開いたときも同じ設定で始められるようにする。

// 調の id が正しいかを確かめる関数
import { getKey, DEFAULT_KEY_ID } from "./key.js";

// ブラウザに保存するときの名前（ほかのアプリの保存とぶつからないように、アプリ名を付ける）
const STORAGE_KEY = "viola-neiro-record-settings";

// 録音のページで選べる音律
//   id   ：tuning.js の音律の id
//   name ：画面に出す名前
export const RECORD_TEMPERAMENTS = [
  { id: "pythagorean", name: "ピタゴラス音律" },
  { id: "just", name: "純正律" },
];

// メトロノームのテンポの範囲
export const TEMPO_MIN = 40;
export const TEMPO_MAX = 208;

// メトロノームの拍子の選択肢（0 は「なし」＝1拍目の高い音を鳴らさない）
export const BEATS_OPTIONS = [0, 2, 3, 4, 6];

// 設定の最初の値
//   temperamentId ：音律の id
//   keyId         ：調の id
//   metronomeOn   ：メトロノームを使うか
//   tempo         ：テンポ（♩＝）
//   beats         ：拍子（0 は「なし」）
//   clickVolume   ：クリックの音量（0〜100）
//   showBeatLines ：グラフに拍の線を出すか
export const DEFAULT_RECORD_SETTINGS = {
  temperamentId: "pythagorean",
  keyId: DEFAULT_KEY_ID,
  metronomeOn: false,
  tempo: 80,
  beats: 4,
  clickVolume: 70,
  showBeatLines: true,
};

/**
 * 数を、決めた範囲の整数に収める関数（数でないときは、代わりの値を返す）
 * @param {any} value - 調べる値
 * @param {number} min - 下限
 * @param {number} max - 上限
 * @param {number} fallback - 数でないときに使う値
 * @returns {number} 範囲に収めた整数
 */
function clampNumber(value, min, max, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.round(value), min), max);
}

/**
 * 保存しておいた設定を読み込む関数
 * 保存がないとき・読めないとき・おかしな値のときは、最初の値を使う。
 * （前の版で保存した、メトロノームの設定がない保存でも、メトロノームの分は最初の値になる）
 * @returns {{temperamentId: string, keyId: string, metronomeOn: boolean, tempo: number, beats: number, clickVolume: number, showBeatLines: boolean}} 設定
 */
export function loadRecordSettings() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text === null) {
      return { ...DEFAULT_RECORD_SETTINGS };
    }

    const saved = JSON.parse(text);
    return {
      // 選べる音律のどれかでなければ、最初の値
      temperamentId: RECORD_TEMPERAMENTS.some((t) => t.id === saved.temperamentId) ? saved.temperamentId : DEFAULT_RECORD_SETTINGS.temperamentId,
      // 知らない id のときは getKey がハ長調を返すので、その id を使う
      keyId: getKey(saved.keyId).id,
      // true のときだけメトロノームを使う
      metronomeOn: saved.metronomeOn === true,
      tempo: clampNumber(saved.tempo, TEMPO_MIN, TEMPO_MAX, DEFAULT_RECORD_SETTINGS.tempo),
      // 選択肢のどれかでなければ、最初の値
      beats: BEATS_OPTIONS.includes(saved.beats) ? saved.beats : DEFAULT_RECORD_SETTINGS.beats,
      clickVolume: clampNumber(saved.clickVolume, 0, 100, DEFAULT_RECORD_SETTINGS.clickVolume),
      // false のときだけ出さない（前の版の保存で、この設定がないときは出す）
      showBeatLines: saved.showBeatLines !== false,
    };
  } catch (error) {
    return { ...DEFAULT_RECORD_SETTINGS };
  }
}

/**
 * 設定をブラウザに保存する関数
 * @param {{temperamentId: string, keyId: string, metronomeOn: boolean, tempo: number, beats: number, clickVolume: number, showBeatLines: boolean}} settings - 設定
 */
export function saveRecordSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    // プライベートモードなどで保存できないときは、諦める
  }
}
