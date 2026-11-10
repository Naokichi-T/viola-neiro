// ===== マイクで音を聴いて、音程を調べ続ける仕組み =====
// マイクの音を少しずつ取り出し、そのたびに pitch.js で周波数を調べて、結果を知らせる。
//
// 流れ：
//   マイク → 音の入口（MediaStreamSource） → 音を大きくする部品（iPad・iPhone では30倍）
//   → 波形を取り出す部品（Analyser） → 音量0の部品 → スピーカー（音は出ない）
//   画面の書き換えのたび（1秒に約60回）に波形を取り出す → detectPitch で周波数を求める
//   → 呼び出し元の関数（onPitch）に「周波数」と「時刻」を渡す
//   （録音のページでは、音を大きくする部品のあとから、録音に渡す出口にもつなぐ。createRecordingStream）
//
// 【iPad・iPhone でマイクの音を拾わないのを直した手直し】（violin-pitch と同じ直し方）
//   ① 音程を正しく測るため、エコー除去・雑音除去・音量の自動調整をオフにして頼むと、
//      iPad・iPhone ではマイクの音がとても小さく届く（弾いているときの RMS が 0.001〜0.002。ほかの端末は 0.06 くらい）。
//      高さを調べ始める大きさ（pitch.js の MIN_RMS ＝ 0.004）に届かないので、iPad・iPhone のときだけ30倍にする
//   ② iPad の Safari では、ボタンを押した瞬間の処理の中で作らなかった AudioContext は「一時停止」で始まるので、
//      マイクの許可を待つ「前」に作って、再開を頼む
//   ③ Safari では、スピーカーまでつながっていない流れが処理されないことがあるので、
//      波形を取り出す部品のあとに音量0の部品をはさんでスピーカーまでつなぐ（音量0なので音は出ない）
//   パソコン・Android の動きは変わらない（1倍）
//
// 【violin-pitch と、あえて変えていること】
//   violin-pitch は、チューナーの針を落ち着かせるため、検出した高さを直近12回（約0.2秒）の中央値でならし、
//   波形も4096個（約0.085秒）取っている。このアプリは、ロングトーンのぶれやビブラート（1秒に5〜7回の揺れ）を
//   測りたいので、ならさずにその回の値をそのまま渡し、波形も2048個（約0.04秒）にして、細かい揺れが消えないようにする

// 波形から周波数を調べる関数を読み込む
import { detectPitch } from "./pitch.js";

// ===== 設定値 =====

// 1回に取り出す波形の長さ（データの数）。2048 は 48000Hz で約0.04秒ぶん
// 長いほど低い音を正確に測れるが、細かい揺れ（ビブラートなど）がならされて見えにくくなる
const FFT_SIZE = 2048;

// iPad・iPhone で、届いた音を何倍にするか（violin-pitch で iPad で試して決めた値）
const APPLE_MOBILE_GAIN = 30;

// ===== 動いている状態 =====

// 音を扱うための土台
let audioContext = null;

// マイクの音の流れ（止めるときに、マイクを切るために使う）
let stream = null;

// 音の入口の部品
let source = null;

// 届いた音を大きくする部品（iPad・iPhone では30倍、ほかの端末は1倍）
let inputGainNode = null;

// 波形を取り出す部品
let analyser = null;

// 音量0の部品（波形を取り出す部品からスピーカーまでつなぐのに使う。音は出ない）
let silentNode = null;

// 録音に渡すための音の出口（録音するときだけ作る）
// iPad・iPhone でも録音の音が小さくならないように、30倍にしたあとの音を渡す
let recordingNode = null;

// 取り出した波形を入れておく入れ物
let buffer = null;

// 次の「調べる」の予約番号（止めるときに予約を取り消すために使う）
let frameId = null;

// マイクを始めた回数。許可を待っている途中で止められたことに気づくために使う
let requestCount = 0;

/**
 * iPad・iPhone かを調べる関数
 * iPad の Safari は、パソコンの Mac と同じ名前（Macintosh）を名のるので、指で触れる点の数（maxTouchPoints）でも見分ける
 * @returns {boolean} iPad・iPhone なら true
 */
function isAppleMobile() {
  const userAgent = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(userAgent)) {
    return true;
  }
  return /Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1;
}

/**
 * マイクをオンにして、音程を調べ続ける関数
 * 音程を調べるたびに onPitch(周波数, 時刻) を呼ぶ。
 * 周波数は、音が小さい・はっきりしないときは null になる。
 * 時刻は秒（ページを開いてからの経過時間）。
 * ブラウザの決まりで、ボタンを押したときの処理の中から呼ぶこと。
 * @param {(frequency: number|null, time: number) => void} onPitch - 調べた結果を受け取る関数
 * @returns {Promise<void>}
 * @throws マイクが使えないときは、理由を日本語で書いたエラーになる（呼び出し元で受け止めて、画面に出す）
 */
export async function startMicrophone(onPitch) {
  // 前のが動いていたら、止めてから始める
  stopMicrophone();

  // 今回の開始に番号を付けておく（許可を待っている途中で止められたら、番号が変わる）
  requestCount = requestCount + 1;
  const myRequest = requestCount;

  // マイクが使えない環境（https ではないページなど）かどうかを確かめる
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("このブラウザ（またはこのページ）ではマイクが使えません。");
  }

  // 音を扱う土台を、許可を待つ「前」に作り、一時停止なら再開を頼む（手直し②）
  // （ここはボタンを押した瞬間の処理の中なので、iPad でも再開できる）
  const context = new AudioContext();
  if (context.state === "suspended") {
    context.resume().catch(() => {}); // 再開できなくても、あとでもう一度頼む
  }

  // マイクを使わせてもらう（ここでブラウザの許可の画面が出る）
  // 音程を正しく測るため、ブラウザが自動でかける加工（エコー除去・雑音除去・音量の自動調整）は切る
  let newStream;
  try {
    newStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (error) {
    // 許可されなかった・マイクが見つからないなど
    context.close(); // 先に作った土台は使わないので閉じる
    // 画面にそのまま出せるように、日本語のメッセージにして投げ直す
    if (error.name === "NotAllowedError") {
      throw new Error("マイクの使用が許可されませんでした。ブラウザの設定で、このページのマイクを許可してください。");
    } else if (error.name === "NotFoundError") {
      throw new Error("マイクが見つかりませんでした。");
    } else {
      throw new Error("マイクを始められませんでした：" + error.message);
    }
  }

  // 許可を待っている間に止められていたら、取れたマイクを切って終わる
  if (myRequest !== requestCount) {
    newStream.getTracks().forEach((track) => track.stop());
    context.close();
    return;
  }

  stream = newStream;
  audioContext = context;

  // まだ一時停止のままなら、もう一度再開を頼む（再開できなくても先へ進む。そのときは音が流れてこない）
  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch (error) {
      // 再開できなかった。何もしない
    }
    // 再開を待っている間に止められていたら、ここで終わる（止めるほうで片付け済み）
    if (myRequest !== requestCount) {
      return;
    }
  }

  // マイク → 音を大きくする部品 → 波形を取り出す部品、とつなぐ（手直し①）
  source = audioContext.createMediaStreamSource(stream);
  inputGainNode = audioContext.createGain();
  inputGainNode.gain.value = isAppleMobile() ? APPLE_MOBILE_GAIN : 1;
  analyser = audioContext.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  source.connect(inputGainNode);
  inputGainNode.connect(analyser);

  // 波形を取り出す部品 → 音量0の部品 → スピーカー、とつなぐ（音は出ない）（手直し③）
  silentNode = audioContext.createGain();
  silentNode.gain.value = 0;
  analyser.connect(silentNode);
  silentNode.connect(audioContext.destination);

  // 波形を入れる入れ物を用意する
  buffer = new Float32Array(analyser.fftSize);

  // 画面の書き換えのたびに呼ばれる関数：波形を取り出して周波数を調べ、結果を知らせる
  const loop = () => {
    // 止められたあとは何もしない
    if (analyser === null) {
      return;
    }

    analyser.getFloatTimeDomainData(buffer);
    const frequency = detectPitch(buffer, audioContext.sampleRate);

    // 時刻は、ミリ秒を秒に直して渡す
    onPitch(frequency, performance.now() / 1000);

    // 次の書き換えのときにも、また調べる
    frameId = requestAnimationFrame(loop);
  };

  loop();
}

/**
 * 録音に使う音の流れを作って返す関数（録音のページで使う）
 * マイクの音を大きくする部品（iPad・iPhone では30倍）のあとから取り出すので、
 * iPad・iPhone でも、録音した音が小さくなりすぎない。
 * startMicrophone が終わったあとに呼ぶこと。
 * @returns {MediaStream|null} 録音に使う音の流れ。マイクが動いていないときは null
 */
export function createRecordingStream() {
  if (audioContext === null || inputGainNode === null) {
    return null;
  }

  // 前に作ったものがあれば外してから作り直す
  if (recordingNode !== null) {
    recordingNode.disconnect();
  }

  // 音を大きくする部品 → 録音に渡す出口、とつなぐ
  recordingNode = audioContext.createMediaStreamDestination();
  inputGainNode.connect(recordingNode);
  return recordingNode.stream;
}

/**
 * マイクをオフにして、音程を調べるのをやめる関数
 * 動いていないときに呼んでも、何もしない。
 */
export function stopMicrophone() {
  // 許可を待っている途中だった場合に、それを打ち切れるように番号を変える
  requestCount = requestCount + 1;

  // 次の「調べる」の予約を取り消す
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }

  // 部品のつながりを外す
  if (source !== null) {
    source.disconnect();
    source = null;
  }
  if (inputGainNode !== null) {
    inputGainNode.disconnect();
    inputGainNode = null;
  }
  if (silentNode !== null) {
    silentNode.disconnect();
    silentNode = null;
  }
  if (recordingNode !== null) {
    recordingNode.disconnect();
    recordingNode = null;
  }
  analyser = null;
  buffer = null;

  // マイクを切る（スマホの「マイク使用中」の表示も消える）
  if (stream !== null) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  // 音の土台を閉じる
  if (audioContext !== null) {
    audioContext.close();
    audioContext = null;
  }
}
