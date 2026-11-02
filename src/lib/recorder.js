// ===== 録音する仕組み =====
// ブラウザの MediaRecorder を使って、マイクの音を録音し、音声のデータ（Blob）にする。
//
// ファイルの形式は、ブラウザが対応しているものから選ぶ。
// .m4a（audio/mp4）を一番に選ぶのは、iPhone・iPad を含めて、どの端末でも再生しやすいため。
// 対応していないブラウザでは .webm にする。

// 試す形式の順番（前にあるものほど優先）
//   mimeType ：ブラウザに伝える形式の名前
//   extension：ダウンロードするときのファイルの拡張子
const FORMATS = [
  { mimeType: "audio/mp4", extension: "m4a" },
  { mimeType: "audio/webm;codecs=opus", extension: "webm" },
  { mimeType: "audio/webm", extension: "webm" },
];

// 今録音している MediaRecorder（録音していないときは null）
let mediaRecorder = null;

// 録音した音のかけらをためておく配列
let chunks = [];

// 今回の録音の形式
let currentFormat = FORMATS[FORMATS.length - 1];

/**
 * このブラウザで使える形式を選ぶ関数
 * @returns {{mimeType: string, extension: string}} 使える形式（どれも分からないときは最後の .webm）
 */
function chooseFormat() {
  for (const format of FORMATS) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(format.mimeType)) {
      return format;
    }
  }
  return FORMATS[FORMATS.length - 1];
}

/**
 * 録音を始める関数
 * 録音が本当に始まったら（少し時間がかかる）、onStart(時刻) を呼ぶ。時刻は秒（ページを開いてからの経過時間）。
 * @param {MediaStream} stream - 録音する音の流れ
 * @param {(time: number) => void} onStart - 録音が始まったときに呼ぶ関数
 * @throws 録音できないブラウザのときは、日本語のメッセージのエラーになる
 */
export function startRecorder(stream, onStart) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("このブラウザでは録音できません。");
  }

  currentFormat = chooseFormat();
  chunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: currentFormat.mimeType });

  // 録音した音のかけらが届いたら、ためておく
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  });

  // 録音が本当に始まった時刻を知らせる（グラフと音を合わせるのに使う）
  mediaRecorder.addEventListener("start", () => {
    onStart(performance.now() / 1000);
  });

  // 1秒ごとに音のかけらを受け取る（長い録音でも、途中のデータがたまっていくように）
  mediaRecorder.start(1000);
}

/**
 * 録音を止めて、録音した音のデータを受け取る関数
 * @returns {Promise<{blob: Blob, extension: string}|null>} 音のデータと拡張子。録音していなかったときは null
 */
export function stopRecorder() {
  return new Promise((resolve) => {
    if (mediaRecorder === null || mediaRecorder.state === "inactive") {
      mediaRecorder = null;
      resolve(null);
      return;
    }

    const recorder = mediaRecorder;
    mediaRecorder = null;

    // 止まったら（最後のかけらが届いたあとに呼ばれる）、かけらをつなげて1つのデータにする
    recorder.addEventListener("stop", () => {
      const blob = new Blob(chunks, { type: currentFormat.mimeType });
      chunks = [];
      resolve({ blob, extension: currentFormat.extension });
    });

    recorder.stop();
  });
}

/**
 * 録音を捨てて止める関数（ページを離れるときなど）
 */
export function cancelRecorder() {
  if (mediaRecorder !== null && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  mediaRecorder = null;
  chunks = [];
}
