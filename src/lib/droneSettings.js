// ===== ドローンの設定をブラウザに保存・読み込みする仕組み =====
// 選んだ調・鳴らす音・高さ・音量を覚えておき、次に開いたときも同じ設定で始められるようにする。

// 調の id が正しいかを確かめる関数を読み込む
import { getKey, DEFAULT_KEY_ID } from "./key.js";

// ブラウザに保存するときの名前（ほかのアプリの保存とぶつからないように、アプリ名を付ける）
const STORAGE_KEY = "viola-neiro-drone-settings";

// 設定の最初の値（保存がないときや、保存が壊れていたときに使う）
//   keyId     ：調の id
//   withFifth ：5度の音も鳴らすか（false は主音だけ）
//   octave    ：主音のオクターブ（3 が「低い」、4 が「高い」）
//   volume    ：音量のつまみの値（0〜100）
//   guideOpen ：「この調の音の合わせ方」の表を開いているか
export const DEFAULT_DRONE_SETTINGS = {
  keyId: DEFAULT_KEY_ID,
  withFifth: false,
  octave: 3,
  volume: 60,
  guideOpen: false,
};

/**
 * 保存しておいた設定を読み込む関数
 * 保存がないとき・読めないとき・おかしな値のときは、最初の値を使う。
 * @returns {{keyId: string, withFifth: boolean, octave: number, volume: number, guideOpen: boolean}} 設定
 */
export function loadDroneSettings() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);

    // まだ保存がないときは、最初の値
    if (text === null) {
      return { ...DEFAULT_DRONE_SETTINGS };
    }

    const saved = JSON.parse(text);

    // 1つずつ確かめて、おかしな値は最初の値に置き換える
    return {
      // 知らない id のときは getKey がハ長調を返すので、その id を使う
      keyId: getKey(saved.keyId).id,
      // true のときだけ 5度も鳴らす
      withFifth: saved.withFifth === true,
      // 4 のときだけ「高い」、それ以外は「低い」
      octave: saved.octave === 4 ? 4 : 3,
      // 数でないときは最初の値、数なら 0〜100 の範囲に収める
      volume: typeof saved.volume === "number" ? Math.min(Math.max(Math.round(saved.volume), 0), 100) : DEFAULT_DRONE_SETTINGS.volume,
      // true のときだけ表を開いておく（前の版の保存で、この設定がないときは閉じておく）
      guideOpen: saved.guideOpen === true,
    };
  } catch (error) {
    // 保存が壊れていた・ブラウザが保存を禁止しているなど
    return { ...DEFAULT_DRONE_SETTINGS };
  }
}

/**
 * 設定をブラウザに保存する関数
 * @param {{keyId: string, withFifth: boolean, octave: number, volume: number, guideOpen: boolean}} settings - 設定
 */
export function saveDroneSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    // プライベートモードなどで保存できないときは、諦める（次回は最初の値で始まるだけ）
  }
}
