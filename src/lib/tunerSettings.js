// ===== チューナーの設定をブラウザに保存・読み込みする仕組み =====
// 選んだ音律・調を覚えておき、次に開いたときも同じ設定で始められるようにする。
// （録音のページの recordSettings.js と同じ形）

// 調の id が正しいかを確かめる関数
import { getKey, DEFAULT_KEY_ID } from "./key.js";

// ブラウザに保存するときの名前（ほかのアプリの保存とぶつからないように、アプリ名を付ける）
const STORAGE_KEY = "viola-neiro-tuner-settings";

// チューナーで選べる音律（録音のページの2つに、ふつうのチューナーと同じ平均律を足した3つ）
//   id   ：tuning.js の音律の id
//   name ：画面に出す名前
export const TUNER_TEMPERAMENTS = [
  { id: "pythagorean", name: "ピタゴラス" },
  { id: "just", name: "純正律" },
  { id: "equal", name: "平均律" },
];

// 設定の最初の値
//   temperamentId ：音律の id（最初はピタゴラス音律）
//   keyId         ：調の id（音の呼び方と、純正律の高さに使う）
export const DEFAULT_TUNER_SETTINGS = {
  temperamentId: "pythagorean",
  keyId: DEFAULT_KEY_ID,
};

/**
 * 保存しておいた設定を読み込む関数
 * 保存がないとき・読めないとき・おかしな値のときは、最初の値を使う。
 * @returns {{temperamentId: string, keyId: string}} 設定
 */
export function loadTunerSettings() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);

    // まだ保存がないときは、最初の値
    if (text === null) {
      return { ...DEFAULT_TUNER_SETTINGS };
    }

    const saved = JSON.parse(text);

    // 1つずつ確かめて、おかしな値は最初の値に置き換える
    return {
      // 一覧にある音律のときだけ使う
      temperamentId: TUNER_TEMPERAMENTS.some((item) => item.id === saved.temperamentId) ? saved.temperamentId : DEFAULT_TUNER_SETTINGS.temperamentId,
      // 知らない id のときは getKey がハ長調を返すので、その id を使う
      keyId: getKey(saved.keyId).id,
    };
  } catch (error) {
    // 保存が壊れていた・ブラウザが保存を禁止しているなど
    return { ...DEFAULT_TUNER_SETTINGS };
  }
}

/**
 * 設定をブラウザに保存する関数
 * @param {{temperamentId: string, keyId: string}} settings - 設定
 */
export function saveTunerSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    // プライベートモードなどで保存できないときは、諦める（次回は最初の値で始まるだけ）
  }
}
