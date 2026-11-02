// ===== 録音のグラフの計算 =====
// 録音中に測った「時刻と周波数」から、グラフに描くもの（一番近い音からのずれ、音名の札）を計算する。
// 画面のこと（表示やボタン）はここには書かず、計算だけにしておく。
// 音律や調を変えたら、この計算をやり直すだけで、同じ録音を別の音律で見られる。

// 調に合わせて一番近い音を探す関数
import { findNearestNoteInKey } from "./nearestNote.js";

// 音のデータを「ファ♯4」のような文字にする関数
import { noteToText } from "./score.js";

// ===== 設定値 =====

// 同じ音がこの秒数以上続いたら、音名の札を付ける
export const LABEL_MIN_SECONDS = 0.15;

// 前の点からこれ以上あいたら、別の音（または音が途切れた）とみなす秒数
export const GAP_SECONDS = 0.1;

// グラフの横の、1秒あたりの幅（px）。今の録音と前の録音で同じにして、同じ秒数が縦にそろうようにする
export const PX_PER_SECOND = 60;

// グラフの右端の余白（px）。最後の音名の札がはみ出さないように
export const GRAPH_RIGHT_PADDING = 40;

/**
 * 測った音を、一番近い音とそのずれに直す関数
 * @param {{time: number, frequency: number}[]} samples - 測った音（time はグラフの左端からの秒）
 * @param {import("./key.js").Key} key - 調のデータ
 * @param {string} temperamentId - 音律の id（'pythagorean' か 'just'）
 * @returns {{time: number, cents: number, name: string}[]} 時刻・ずれ（セント）・一番近い音の名前
 */
export function analyzeSamples(samples, key, temperamentId) {
  return samples.map((sample) => {
    const nearest = findNearestNoteInKey(sample.frequency, key, temperamentId);
    return {
      time: sample.time,
      cents: 1200 * Math.log2(sample.frequency / nearest.frequency),
      name: noteToText(nearest.note),
    };
  });
}

/**
 * メトロノームのクリックの記録から、グラフに引く拍の線の一覧を作る関数
 * 小節の番号は、グラフの中で最初に来た小節の頭（1拍目）を 1 として数える。
 * @param {{time: number, downbeat: boolean}[]} beatMarks - クリックの記録（time はグラフの左端からの秒）
 * @returns {{time: number, downbeat: boolean, bar: number|null}[]} 拍の線（bar は小節の頭のときの小節番号、それ以外は null）
 */
export function makeBeatLines(beatMarks) {
  let bar = 0;
  return beatMarks.map((mark) => {
    if (mark.downbeat) {
      bar += 1;
      return { time: mark.time, downbeat: true, bar };
    }
    return { time: mark.time, downbeat: false, bar: null };
  });
}

/**
 * 同じ音が続いているところをまとめて、音名の札の一覧を作る関数
 * 同じ音が LABEL_MIN_SECONDS 秒以上続いたところだけ札にする（ほんの一瞬の音や、音と音の間の移り目は札にしない）。
 * @param {{time: number, cents: number, name: string}[]} points - analyzeSamples の結果（時刻の順）
 * @returns {{start: number, end: number, name: string}[]} 札の一覧（start・end は秒、name は音名）
 */
export function makeNoteLabels(points) {
  const labels = [];

  // 今まとめている音のかたまり
  let current = null;

  for (let index = 0; index < points.length; index++) {
    const point = points[index];

    // 前の点と同じ音で、時間もあいていなければ、同じかたまりにつなげる
    if (current !== null && point.name === current.name && point.time - current.end <= GAP_SECONDS) {
      current.end = point.time;
      continue;
    }

    // 1回だけ違う音が混ざって、次の点でまた元の音に戻るときは、測り間違いとみなして読み飛ばす
    // （そうしないと、1つの音の札が2つに割れてしまう）
    const next = points[index + 1];
    if (current !== null && next !== undefined && next.name === current.name && next.time - current.end <= GAP_SECONDS * 2) {
      continue;
    }

    // そうでなければ、今までのかたまりを締めくくり、新しいかたまりを始める
    if (current !== null && current.end - current.start >= LABEL_MIN_SECONDS) {
      labels.push(current);
    }
    current = { start: point.time, end: point.time, name: point.name };
  }

  // 最後のかたまりも締めくくる
  if (current !== null && current.end - current.start >= LABEL_MIN_SECONDS) {
    labels.push(current);
  }

  return labels;
}
