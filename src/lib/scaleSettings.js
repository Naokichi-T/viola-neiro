// ===== 音階練習の設定をブラウザに保存・読み込みする仕組み =====
// 選んだ調・短音階の種類・オクターブの数を覚えておき、次に開いたときも同じ設定で始められるようにする。
// （ドローンの droneSettings.js と同じ形）

// 調の id が正しいかを確かめる関数を読み込む
import { getKey, DEFAULT_KEY_ID } from "./key.js";

// 短音階の種類が正しいかを確かめる関数と、最初の値を読み込む
import { getMinorType, DEFAULT_MINOR_TYPE_ID } from "./scale.js";

// ブラウザに保存するときの名前（ほかのアプリの保存とぶつからないように、アプリ名を付ける）
const STORAGE_KEY = "viola-neiro-scale-settings";

// 設定の最初の値（保存がないときや、保存が壊れていたときに使う）
//   keyId       ：調の id
//   minorTypeId ：短音階の種類の id（'natural'・'harmonic'・'melodic'。長調のときは使わないが、覚えておく）
//   octaveCount ：オクターブの数（1 か 2）
export const DEFAULT_SCALE_SETTINGS = {
  keyId: DEFAULT_KEY_ID,
  minorTypeId: DEFAULT_MINOR_TYPE_ID,
  octaveCount: 1,
};

/**
 * 保存しておいた設定を読み込む関数
 * 保存がないとき・読めないとき・おかしな値のときは、最初の値を使う。
 * @returns {{keyId: string, minorTypeId: string, octaveCount: number}} 設定
 */
export function loadScaleSettings() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);

    // まだ保存がないときは、最初の値
    if (text === null) {
      return { ...DEFAULT_SCALE_SETTINGS };
    }

    const saved = JSON.parse(text);

    // 1つずつ確かめて、おかしな値は最初の値に置き換える
    return {
      // 知らない id のときは getKey がハ長調を返すので、その id を使う
      keyId: getKey(saved.keyId).id,
      // 知らない id のときは getMinorType が和声的短音階を返すので、その id を使う
      minorTypeId: getMinorType(saved.minorTypeId).id,
      // 2 のときだけ2オクターブ、それ以外は1オクターブ
      octaveCount: saved.octaveCount === 2 ? 2 : 1,
    };
  } catch (error) {
    // 保存が壊れていた・ブラウザが保存を禁止しているなど
    return { ...DEFAULT_SCALE_SETTINGS };
  }
}

/**
 * 設定をブラウザに保存する関数
 * @param {{keyId: string, minorTypeId: string, octaveCount: number}} settings - 設定
 */
export function saveScaleSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    // プライベートモードなどで保存できないときは、諦める（次回は最初の値で始まるだけ）
  }
}
