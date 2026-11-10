// ===== 録音を WAV ファイルにする仕組み =====
// 録音のページの「ダウンロード」で使う。
//
// 【WAV にする理由】
//   Android の Chrome・Brave で録音すると、拡張子は .m4a でも、中の音は Opus という形式になる。
//   ブラウザ（アプリの「▶ 再生」）では聴けるが、Audipo などほかのアプリの多くは、
//   「.m4a の中の Opus」を再生できず、ダウンロードしたファイルが聞こえなかった。
//   WAV は、ほぼどのアプリ・端末でも再生できるので、Opus などのときは WAV にしてからダウンロードする。
//   （iPhone・iPad の録音は、中の音が AAC（どこでも再生できる形式）なので、そのまま使う）
//
// 流れ：
//   ① 録音のデータの先頭を見て、中の音が AAC かどうかを調べる（needsWavConversion）
//   ② AAC でなければ、ブラウザの機能（decodeAudioData）で波形に戻し、
//      1本（モノラル）にして、16ビットの WAV ファイルの形に書き出す（convertToWav）

// ===== 設定値 =====

// WAV にするときの、1秒あたりのデータの数（CD と同じ 44100）
// 48000 のままより少し容量が小さく、聴いた感じは変わらない
const WAV_SAMPLE_RATE = 44100;

// 中の音の形式を調べるために読む、録音のデータの先頭の長さ（バイト）
// 形式の名前（'mp4a' や 'Opus'）は、ファイルの最初のほう（送ってもらった録音では530バイト目）に書かれている
const HEADER_BYTES = 4096;

// .m4a の中で、音の形式の名前が書かれている欄の印（この印のすぐ後ろに 'mp4a' や 'Opus' が書かれる）
const CODEC_BOX_NAME = "stsd";

// 欄の印から、形式の名前を探す範囲（バイト）。送ってもらった録音では、印の16バイト後ろに 'Opus' があった
const CODEC_SEARCH_BYTES = 64;

/**
 * 録音のデータを、WAV にしてからダウンロードしたほうがよいかを調べる関数
 * .m4a の「形式の名前の欄（stsd）」に「mp4a」（AAC の印）があれば、どこでも再生できるので、そのままでよい。
 * それ以外（Opus の .m4a や .webm）は WAV にする。
 * @param {Blob} blob - 録音のデータ
 * @returns {Promise<boolean>} WAV にしたほうがよいなら true
 */
export async function needsWavConversion(blob) {
  // まず先頭だけを読んで調べる（ふつうは、形式の名前の欄はファイルの最初のほうにある）
  let text = await readAsText(blob.slice(0, HEADER_BYTES));
  let boxIndex = text.indexOf(CODEC_BOX_NAME);

  // 先頭に見つからなければ、ファイル全体を読んで探す（形式の名前の欄が、ファイルの最後に置かれる作り方もあるため）
  if (boxIndex === -1) {
    text = await readAsText(blob);
    boxIndex = text.indexOf(CODEC_BOX_NAME);
  }

  // 形式の名前の欄がない（.webm など）ときは、WAV にする
  if (boxIndex === -1) {
    return true;
  }

  // 欄のすぐ後ろに AAC の印があれば変換しない、なければ（Opus など）変換する
  return !text.slice(boxIndex, boxIndex + CODEC_SEARCH_BYTES).includes("mp4a");
}

/**
 * データを、1バイトを1文字として読む関数（形式の名前などの印を探すために使う）
 * 文字として読めない部分は記号になるが、アルファベットの印を探すだけなので問題ない。
 * @param {Blob} blob - 読むデータ
 * @returns {Promise<string>} 1バイトを1文字にした文字列
 */
async function readAsText(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return new TextDecoder("latin1").decode(bytes);
}

/**
 * 録音のデータを、WAV ファイルのデータに変換する関数
 * @param {Blob} blob - 録音のデータ（.m4a や .webm）
 * @returns {Promise<Blob>} WAV ファイルのデータ（モノラル・16ビット・44100Hz）
 * @throws 波形に戻せなかったときは、日本語のメッセージのエラーになる
 */
export async function convertToWav(blob) {
  // 録音のデータを、バイトの並びとして読み込む
  const arrayBuffer = await blob.arrayBuffer();

  // 音を鳴らさずに処理するための土台を、WAV の速さ（44100Hz）で作る。
  // この土台で decodeAudioData を使うと、音が自動で 44100Hz に変換される
  // （長さ 1 は、土台を作るのに必要な決まりの値。ここでは音を作らないので何でもよい。audioFile.js と同じ使い方）
  const context = new OfflineAudioContext(1, 1, WAV_SAMPLE_RATE);

  let buffer;
  try {
    buffer = await context.decodeAudioData(arrayBuffer);
  } catch (error) {
    throw new Error("録音を WAV に変換できませんでした。");
  }

  // 波形を1本（モノラル）にして、WAV の形に書き出す
  return encodeWav(mixToMono(buffer), buffer.sampleRate);
}

/**
 * 音のデータ（AudioBuffer）を、1本（モノラル）の波形にする関数
 * @param {AudioBuffer} buffer - 音のデータ
 * @returns {Float32Array} モノラルの波形（-1〜1 の値）
 */
function mixToMono(buffer) {
  // チャンネルが1つなら、そのまま使う
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0);
  }

  // 2つ以上（ステレオなど）なら、全部のチャンネルを足して平均し、1本にする（audioFile.js と同じ）
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
 * モノラルの波形を、16ビットの WAV ファイルのデータにする関数
 * WAV ファイルは「44バイトの見出し（形式・長さなど）」＋「波形の数字の並び」でできている。
 * @param {Float32Array} samples - モノラルの波形（-1〜1 の値）
 * @param {number} sampleRate - 1秒あたりのデータの数
 * @returns {Blob} WAV ファイルのデータ
 */
function encodeWav(samples, sampleRate) {
  // 1つの値の大きさ（16ビット＝2バイト）と、チャンネルの数（モノラル＝1）
  const bytesPerSample = 2;
  const channels = 1;

  // 波形の部分の大きさ（バイト）
  const dataSize = samples.length * bytesPerSample;

  // 見出し（44バイト）＋波形の部分を入れる入れ物
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  // ----- 見出しを書く -----
  // 数字は「小さい桁が先」の順（リトルエンディアン）で書く決まりなので、true を渡す
  writeText(view, 0, "RIFF"); // ファイルの種類の印
  view.setUint32(4, 36 + dataSize, true); // この後ろの大きさ
  writeText(view, 8, "WAVE"); // WAV の印
  writeText(view, 12, "fmt "); // 形式の欄の始まり
  view.setUint32(16, 16, true); // 形式の欄の大きさ
  view.setUint16(20, 1, true); // 形式の種類（1 は、そのままの数字の並び＝PCM）
  view.setUint16(22, channels, true); // チャンネルの数
  view.setUint32(24, sampleRate, true); // 1秒あたりのデータの数
  view.setUint32(28, sampleRate * channels * bytesPerSample, true); // 1秒あたりのバイト数
  view.setUint16(32, channels * bytesPerSample, true); // 1回ぶん（全チャンネル）のバイト数
  view.setUint16(34, bytesPerSample * 8, true); // 1つの値のビット数（16）
  writeText(view, 36, "data"); // 波形の欄の始まり
  view.setUint32(40, dataSize, true); // 波形の部分の大きさ

  // ----- 波形を書く -----
  // -1〜1 の値を、-32768〜32767 の整数にする。
  // 録音が大きすぎて -1〜1 をはみ出した値は、端に切りそろえる（そのままだと、数字があふれて大きな雑音になるため）
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * bytesPerSample, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

/**
 * 見出しの中に、アルファベットの文字を1文字ずつ書く関数
 * @param {DataView} view - 書き込む先
 * @param {number} offset - 書き始める位置（バイト）
 * @param {string} text - 書く文字（'RIFF' など）
 */
function writeText(view, offset, text) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
