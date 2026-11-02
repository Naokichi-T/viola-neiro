// ===== タップテンポ（ボタンを拍に合わせて押して、テンポを求める仕組み） =====
// 押した時刻を覚えておき、直近の間隔の平均から「1分間に何拍か」（♩＝）を計算する。
//
//   ・直近8回までの間隔の平均を使う（たまたま早く・遅く押した1回に引っぱられにくくするため）
//   ・2回目のタップから結果が出る（間隔が1つできるため）
//   ・前のタップから2秒以上あいたら、最初から数え直す（別の曲のテンポを測り直すとき）

// ===== 設定値 =====

// 平均に使う間隔の数（直近何回分か）
const MAX_INTERVALS = 8;

// これ以上あいたら最初から数え直す時間（ミリ秒）
const RESET_MILLISECONDS = 2000;

// ===== 状態 =====

// 押した時刻（ミリ秒）の一覧。古い順
let tapTimes = [];

/**
 * タップを1回記録して、今のテンポを返す関数
 * @param {number} now - 押した時刻（ミリ秒。performance.now() の値）
 * @returns {{tempo: number|null, count: number}} tempo：求めたテンポ（♩＝、整数。1回目のタップでは null）、count：今のタップの回数
 */
export function tap(now) {
  // 前のタップから時間があきすぎていたら、最初から数え直す
  const last = tapTimes[tapTimes.length - 1];
  if (last !== undefined && now - last > RESET_MILLISECONDS) {
    tapTimes = [];
  }

  tapTimes.push(now);

  // 間隔が MAX_INTERVALS 個になるように、古いタップを捨てる（タップの数は間隔の数より1つ多い）
  if (tapTimes.length > MAX_INTERVALS + 1) {
    tapTimes = tapTimes.slice(tapTimes.length - (MAX_INTERVALS + 1));
  }

  // 1回目のタップでは、まだ間隔がないのでテンポは出せない
  if (tapTimes.length < 2) {
    return { tempo: null, count: tapTimes.length };
  }

  // 間隔の平均（最初と最後の時刻の差 ÷ 間隔の数）
  const averageInterval = (tapTimes[tapTimes.length - 1] - tapTimes[0]) / (tapTimes.length - 1);

  // 1分（60000ミリ秒）に、その間隔が何回入るか ＝ テンポ
  return { tempo: Math.round(60000 / averageInterval), count: tapTimes.length };
}

/**
 * タップの記録を消して、最初から数え直せるようにする関数
 */
export function resetTap() {
  tapTimes = [];
}
