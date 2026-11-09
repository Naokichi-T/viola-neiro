// ===== ほかで録音した音源（ファイル）の音程を調べる仕組み =====
// 録音のページで、スマホのボイスメモや動画などのファイルを読み込み、音程のグラフにするために使う。
// 音源はブラウザの中だけで調べる（どこにも送らない）。
//
// 流れ：
//   ① ファイルを、ブラウザの機能（decodeAudioData）で音のデータ（波形）に戻す
//      このとき 24000Hz に変換し、ステレオのときは左右を混ぜて1本（モノラル）にする
//   ② 波形を少しずつずらしながら区切って（1秒に60回）、pitch.js の detectPitch で高さを調べる
//      （アプリで録音するときに、マイクの音を1秒に約60回調べているのと同じ）
//   ③ 最初に音が出たところから、決まった長さ（5分）までを結果にする
//
// 【24000Hz に変換する理由】
//   マイクのときと同じ 48000Hz のままだと、5分の音源を調べるのにパソコンでも30秒以上かかる。
//   24000Hz なら約4分の1の時間ですみ、ずれの誤差も0.3セント以内（試して確かめた）で、グラフの見た目は変わらない。
//   区切る長さは、マイクのとき（48000Hz で2048個＝約0.043秒）と同じ秒数になるように、1024個にする。

// 波形から周波数を調べる関数
import { detectPitch } from "./pitch.js";

// ===== 設定値 =====

// 調べるときの、1秒あたりのデータの数
const ANALYSIS_SAMPLE_RATE = 24000;

// 1回に調べる波形の長さ（データの数）。1024 は 24000Hz で約0.043秒ぶん
const FRAME_SIZE = 1024;

// 1秒に何回調べるか（アプリで録音するときと同じくらい）
const FRAMES_PER_SECOND = 60;

// 何回調べるごとに、画面の書き換え（進み具合の表示）のために一息つくか
const FRAMES_PER_BREAK = 300;

/**
 * ファイルを、モノラルの波形に戻す関数
 * @param {File} file - 読み込んだファイル
 * @returns {Promise<Float32Array>} 波形（24000Hz、-1〜1 の値）
 * @throws 読めない形式のときは、日本語のメッセージのエラーになる
 */
async function decodeFile(file) {
  // ファイルの中身を、バイトの並びとして読み込む
  const arrayBuffer = await file.arrayBuffer();

  // 音を鳴らさずに処理するための土台（OfflineAudioContext）を、調べる速さ（24000Hz）で作る。
  // この土台で decodeAudioData を使うと、ファイルの音が自動で 24000Hz に変換される
  // （長さ 1 は、土台を作るのに必要な決まりの値。ここでは音を作らないので何でもよい）
  const context = new OfflineAudioContext(1, 1, ANALYSIS_SAMPLE_RATE);

  let buffer;
  try {
    buffer = await context.decodeAudioData(arrayBuffer);
  } catch (error) {
    throw new Error("この音源は読み込めませんでした。ブラウザが対応していない形式かもしれません（m4a・mp3・wav などを試してください）。");
  }

  // チャンネルが1つ（モノラル）なら、そのまま使う
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0);
  }

  // 2つ以上（ステレオなど）なら、全部のチャンネルを足して平均し、1本にする
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      mono[i] += data[i] / buffer.numberOfChannels;
    }
  }
  return mono;
}

/**
 * 少しだけ待つ関数（重い計算の途中で呼んで、画面の書き換えやボタンの操作ができるようにする）
 * @returns {Promise<void>}
 */
function takeBreak() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * ファイルの音程を調べる関数
 * @param {File} file - 読み込んだファイル
 * @param {number} maxSeconds - 最初に音が出てから、何秒までを調べるか
 * @param {(progress: number) => void} onProgress - 進み具合（0〜1）を受け取る関数
 * @param {() => boolean} isCancelled - 途中でやめるかどうかを返す関数（ページを離れたときなどに true を返す）
 * @returns {Promise<{samples: {time: number, frequency: number}[], fileDuration: number, truncated: boolean}|null>}
 *   samples      ：音が聞こえたところの時刻（ファイルの頭からの秒）と周波数
 *   fileDuration ：ファイルの長さ（秒）
 *   truncated    ：長すぎて、最後まで調べなかったとき true
 *   途中でやめたときは null
 * @throws 読めない形式のときは、日本語のメッセージのエラーになる
 */
export async function analyzeAudioFile(file, maxSeconds, onProgress, isCancelled) {
  // ① ファイルを波形に戻す
  const data = await decodeFile(file);
  const fileDuration = data.length / ANALYSIS_SAMPLE_RATE;

  // 何個ずつずらして調べるか（24000 ÷ 60 ＝ 400個 ＝ 約0.017秒ずつ）
  const hop = Math.round(ANALYSIS_SAMPLE_RATE / FRAMES_PER_SECOND);

  // 結果を入れる入れ物
  const samples = [];

  // 最初に音が出た時刻（秒）。まだ出ていないときは null
  let firstSoundTime = null;

  // 長すぎて、途中で調べるのをやめたかどうか
  let truncated = false;

  // ② 波形を少しずつずらしながら、高さを調べる
  let frameCount = 0;
  for (let start = 0; start + FRAME_SIZE <= data.length; start += hop) {
    // 区切った波形の真ん中の時刻を、この区切りの時刻にする
    const time = (start + FRAME_SIZE / 2) / ANALYSIS_SAMPLE_RATE;

    // 最初に音が出てから決まった長さを過ぎたら、そこでやめる
    if (firstSoundTime !== null && time - firstSoundTime > maxSeconds) {
      truncated = true;
      break;
    }

    // subarray は、元の波形をコピーせずに一部分だけを取り出す（速くするため）
    const frequency = detectPitch(data.subarray(start, start + FRAME_SIZE), ANALYSIS_SAMPLE_RATE);

    // 音が聞こえたところだけ、ためておく
    if (frequency !== null) {
      if (firstSoundTime === null) {
        firstSoundTime = time;
      }
      samples.push({ time, frequency });
    }

    // ときどき一息ついて、進み具合を知らせる（ずっと計算し続けると、画面が固まってしまうため）
    frameCount = frameCount + 1;
    if (frameCount % FRAMES_PER_BREAK === 0) {
      // 調べ終わる時刻：音が出る前はファイルの最後、出たあとは「最初の音＋決まった長さ」とファイルの最後の早いほう
      const endTime = firstSoundTime === null ? fileDuration : Math.min(fileDuration, firstSoundTime + maxSeconds);
      onProgress(Math.min(time / endTime, 1));
      await takeBreak();
      if (isCancelled()) {
        return null;
      }
    }
  }

  onProgress(1);
  return { samples, fileDuration, truncated };
}
