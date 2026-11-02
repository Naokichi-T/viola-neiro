// ===== 画面が暗くならないようにする仕組み =====
// ブラウザの「Wake Lock API」を使う。
// 鳴らしている間だけ画面をつけたままにして、止めたら元に戻す。
//
// 注意：
//   ・別のアプリに切り替えたり画面を消したりすると、ブラウザが自動で解除してしまう。
//     そこで、このページに戻ってきたときに、まだ必要ならもう一度お願いし直す。
//   ・使えないブラウザでは何もしない（エラーにはしない）。

// 今お願いしている「画面をつけたままにする」の札。お願いしていないときは null
let sentinel = null;

// 画面をつけたままにしたい状態かどうか（鳴らしている間は true）
let wanted = false;

// ページの表示・非表示の切り替えを見張る仕組みを、もう用意したかどうか
let listening = false;

/**
 * ブラウザに「画面をつけたままにして」とお願いする関数
 * @returns {Promise<boolean>} お願いできたら true、できなかったら false
 */
async function requestWakeLock() {
  // このブラウザで使えないときは何もしない
  if (!("wakeLock" in navigator)) {
    return false;
  }

  try {
    sentinel = await navigator.wakeLock.request("screen");

    // ブラウザが自動で解除したときに、札を空にしておく（戻ってきたときにお願いし直すため）
    sentinel.addEventListener("release", () => {
      sentinel = null;
    });

    return true;
  } catch (error) {
    // 電池が少ないときなど、断られることがある。そのときは諦める
    sentinel = null;
    return false;
  }
}

/**
 * ページが表示されたり隠れたりしたときに呼ばれる関数
 * このページに戻ってきて、まだ画面をつけたままにしたいなら、もう一度お願いする。
 */
function handleVisibilityChange() {
  if (wanted && document.visibilityState === "visible" && sentinel === null) {
    requestWakeLock();
  }
}

/**
 * 画面をつけたままにする関数（鳴らし始めたときに呼ぶ）
 * @returns {Promise<void>}
 */
export async function keepScreenOn() {
  wanted = true;

  // ページの表示・非表示の切り替えを見張る（1回だけ用意する）
  if (!listening) {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    listening = true;
  }

  // まだお願いしていなければ、お願いする
  if (sentinel === null) {
    await requestWakeLock();
  }
}

/**
 * 画面が暗くなってもよい状態に戻す関数（止めたとき・ページを離れたときに呼ぶ）
 * @returns {Promise<void>}
 */
export async function allowScreenOff() {
  wanted = false;

  // お願いしていたら、解除する
  if (sentinel !== null) {
    try {
      await sentinel.release();
    } catch (error) {
      // すでに解除されていた場合などは、気にしない
    }
    sentinel = null;
  }
}
