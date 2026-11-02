// ===== ロングトーンのページの設定をブラウザに保存・読み込みする仕組み =====
// 選んだ練習（ロングトーン・ビブラート）・目標の音・調・ビブラートの合わせる位置を覚えておき、
// 次に開いたときも同じ設定で始められるようにする。

// 調の id が正しいかを確かめる関数
import { getKey, DEFAULT_KEY_ID } from "./key.js";

// 目標の音の候補と「自由」の id
import { OPEN_STRING_TARGETS, FREE_TARGET_ID } from "./longtone.js";

// ビブラートの合わせる位置の選択肢
import { VIBRATO_REFERENCES } from "./vibrato.js";

// ブラウザに保存するときの名前（ほかのアプリの保存とぶつからないように、アプリ名を付ける）
const STORAGE_KEY = "viola-neiro-longtone-settings";

// 練習の種類
//   id   ：区別するための名前
//   name ：画面に出す名前
export const PRACTICE_MODES = [
  { id: "longtone", name: "ロングトーン" },
  { id: "vibrato", name: "ビブラート" },
];

// 設定の最初の値
//   mode      ：練習の種類（'longtone' か 'vibrato'）
//   targetId  ：目標の音の id（'C3'・'G3'・'D4'・'A4'・'free'）
//   keyId     ：調の id（「自由」のときの音の呼び方に使う）
//   reference ：ビブラートで目標に合わせる位置（'top'＝上の端、'middle'＝真ん中）
export const DEFAULT_LONGTONE_SETTINGS = {
  mode: "longtone",
  targetId: "A4",
  keyId: DEFAULT_KEY_ID,
  reference: "top",
};

/**
 * 保存しておいた設定を読み込む関数
 * 保存がないとき・読めないとき・おかしな値のときは、最初の値を使う。
 * @returns {{mode: string, targetId: string, keyId: string, reference: string}} 設定
 */
export function loadLongtoneSettings() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text === null) {
      return { ...DEFAULT_LONGTONE_SETTINGS };
    }

    const saved = JSON.parse(text);
    const targetIds = [...OPEN_STRING_TARGETS.map((t) => t.id), FREE_TARGET_ID];
    return {
      mode: PRACTICE_MODES.some((m) => m.id === saved.mode) ? saved.mode : DEFAULT_LONGTONE_SETTINGS.mode,
      targetId: targetIds.includes(saved.targetId) ? saved.targetId : DEFAULT_LONGTONE_SETTINGS.targetId,
      // 知らない id のときは getKey がハ長調を返すので、その id を使う
      keyId: getKey(saved.keyId).id,
      reference: VIBRATO_REFERENCES.some((r) => r.id === saved.reference) ? saved.reference : DEFAULT_LONGTONE_SETTINGS.reference,
    };
  } catch (error) {
    return { ...DEFAULT_LONGTONE_SETTINGS };
  }
}

/**
 * 設定をブラウザに保存する関数
 * @param {{mode: string, targetId: string, keyId: string, reference: string}} settings - 設定
 */
export function saveLongtoneSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    // プライベートモードなどで保存できないときは、諦める
  }
}
