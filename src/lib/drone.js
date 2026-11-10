// ===== ドローン（持続音）を鳴らす仕組み =====
// Web Audio API を使って、止めるまで鳴り続ける音を作る。
//
// 音の流れ（1つの音につき）：
//   発振器（のこぎり波） → ローパスフィルター（高い倍音を削ってやわらかくする） → 音ごとの音量
//     → 全体の音量（フェードと音量のつまみ用） → 音割れ防止の部品（リミッター） → スピーカー
//
// 【2026/11/10 音を大きくした】
//   スマホのスピーカーでは、お手本やドローンの音が小さかった。
//   以前は、音が割れないように、つまみを最大にしても上限の3〜5割（波の一番高い所が 0.3〜0.5）に抑えていた。
//   そこで、全体の音量の上限を上げ、上限を超えそうな所だけをリミッターで抑えるようにした（つまみ最大で上限ぎりぎり）。
//   あわせて、低い音（ド3 など）でも聞こえやすいように、残す倍音を増やした（FILTER_RATIO）。
//
// 「主音＋5度」のときは、この「1つの音」を2つ作って、全体の音量にまとめる。

// ===== 設定値 =====

// 音量のつまみを一番大きくしたときの、全体の音量
// 【2026/11/10 0.5 → 1.6 に変更】主音1つ（音ごとの音量 0.6）のとき、波の一番高い所が上限（1）近くになる大きさ。
// 主音＋5度のときや、フィルターで波の形が変わって上限を超えそうなときは、リミッターが抑えるので音は割れない
const MAX_GAIN = 1.6;

// 鳴らし始め・止めるときに、音量を変えていく時間（秒）。急に鳴る・切れるとプツッと音がするのを防ぐ
const FADE_SECONDS = 0.3;

// 鳴らしている途中で高さや音量を変えたとき、新しい値に近づく速さ（秒）。小さいほど素早く変わる
const CHANGE_SECONDS = 0.05;

// 音ごとの音量（1つ目が主音、2つ目が5度の音）
// 5度の音は少し小さくして、主音がはっきり聞こえるようにする
const VOICE_GAINS = [0.6, 0.4];

// ローパスフィルターで、どのくらい上の倍音まで残すか（音の周波数の何倍か）
// 倍音を残すと、スマホのスピーカーでも低い音が聞こえやすくなる
// 【2026/11/10 8 → 16 に変更】スマホのスピーカーは、ド3（約131Hz）のような低い音そのものはほとんど鳴らせない。
// 倍音を多く残すと、耳はその並びから元の高さ（ド3）を感じ取れるので、低い音でも大きく聞こえる（音は少し明るく硬めになる）
const FILTER_RATIO = 16;

// ローパスフィルターの上限（Hz）。高い音のときに、キンキンしないようにする
const MAX_FILTER_FREQUENCY = 4000;

// ----- 音割れ防止の部品（リミッター）の設定 -----
// 音がこの大きさ（dB。0 が上限）を超えたら抑え始める
const LIMITER_THRESHOLD = -3;
// 超えた分をどのくらい抑えるか（20 なら、20dB 超えても 1dB しか大きくならない＝ほぼ頭打ち）
const LIMITER_RATIO = 20;
// 抑え始めるまでの時間（秒）。短いほど、急に大きくなった所もすぐ抑えられる
const LIMITER_ATTACK = 0.003;
// 抑えるのをやめるまでの時間（秒）
const LIMITER_RELEASE = 0.25;

// ===== 鳴らしている状態 =====

// 音を作るための土台（最初に鳴らすときに1回だけ作る）
let audioContext = null;

// 音割れ防止の部品（リミッター）。土台と一緒に1回だけ作り、すべての音をここを通してスピーカーに出す
let limiter = null;

// 今鳴らしている「ひとまとまり」の音
//   gain   ：全体の音量の部品
//   voices ：1つ1つの音（主音・5度）の部品の配列
// 鳴らしていないときは null
let session = null;

/**
 * 音の土台（AudioContext）を用意する関数
 * ブラウザは、ボタンを押すなどの操作のあとでないと音を出させてくれないので、
 * 「鳴らす」ボタンを押したときに呼ぶ。
 * @returns {Promise<AudioContext>} 音の土台
 */
async function ensureAudioContext() {
  // まだ作っていなければ作る
  if (audioContext === null) {
    audioContext = new AudioContext();

    // 音割れ防止の部品（リミッター）を作り、スピーカーにつないでおく
    // DynamicsCompressor は、大きすぎる音だけを小さくする部品。設定を強めにして、上限を超えないようにする
    limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.value = LIMITER_THRESHOLD;
    limiter.knee.value = 0; // 境目をなめらかにしない（決めた大きさから、すぐ抑える）
    limiter.ratio.value = LIMITER_RATIO;
    limiter.attack.value = LIMITER_ATTACK;
    limiter.release.value = LIMITER_RELEASE;
    limiter.connect(audioContext.destination);
  }

  // 一時停止状態になっていることがあるので、動かしておく
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  return audioContext;
}

/**
 * 音を鳴らす準備（音の土台を作って動かす）だけをする関数
 * 音階のページで使う。「始める」ボタンを押した瞬間の処理の中で呼んでおくと、
 * マイクの許可を待ったあとに鳴らすお手本の音も、iPad・iPhone で鳴るようになる
 * （ボタンを押した瞬間の処理の外で作った土台は、一時停止のまま音が出ないことがあるため）。
 * @returns {Promise<void>}
 */
export async function prepareDrone() {
  await ensureAudioContext();
}

/**
 * 音量のつまみの値（0〜100）を、実際の音量（0〜MAX_GAIN）に変換する関数
 * 人の耳は小さい音の変化に敏感なので、2乗して、つまみの下のほうを細かく調整できるようにする。
 * @param {number} volume - 音量のつまみの値（0〜100）
 * @returns {number} 実際の音量（0〜MAX_GAIN）
 */
function volumeToGain(volume) {
  const ratio = Math.min(Math.max(volume, 0), 100) / 100;
  return MAX_GAIN * ratio * ratio;
}

/**
 * 周波数に合わせた、ローパスフィルターの周波数を求める関数
 * @param {number} frequency - 鳴らす音の周波数（Hz）
 * @returns {number} フィルターの周波数（Hz）
 */
function getFilterFrequency(frequency) {
  return Math.min(frequency * FILTER_RATIO, MAX_FILTER_FREQUENCY);
}

/**
 * 1つの音（発振器 → フィルター → 音量）を作って、鳴らし始める関数
 * 音ごとの音量は 0 から始めて、ふわっと大きくする。
 * @param {number} frequency - 鳴らす音の周波数（Hz）
 * @param {number} index - 何番目の音か（0 が主音、1 が5度）
 * @param {GainNode} output - つなぐ先（全体の音量の部品）
 * @returns {{oscillator: OscillatorNode, filter: BiquadFilterNode, gain: GainNode}} 作った音の部品
 */
function createVoice(frequency, index, output) {
  const now = audioContext.currentTime;

  // 発振器：のこぎり波（倍音が多く、弦楽器に近い音のもと）
  const oscillator = audioContext.createOscillator();
  oscillator.type = "sawtooth";
  oscillator.frequency.value = frequency;

  // ローパスフィルター：高い倍音を削って、やわらかい音にする
  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = getFilterFrequency(frequency);
  // 0.7 くらいにすると、フィルターの境目に変な強調が出ない
  filter.Q.value = 0.7;

  // 音ごとの音量：0 から目標の音量まで、ふわっと上げる
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(VOICE_GAINS[index] ?? 0.4, now + FADE_SECONDS);

  // 部品をつなぐ：発振器 → フィルター → 音ごとの音量 → 全体の音量
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(output);

  // 鳴らし始める
  oscillator.start(now);

  return { oscillator, filter, gain };
}

/**
 * 1つの音を、ふわっと小さくしてから止める関数
 * @param {{oscillator: OscillatorNode, gain: GainNode}} voice - 止める音の部品
 */
function fadeOutVoice(voice) {
  const now = audioContext.currentTime;

  // 今の音量から 0 まで下げる（途中で予定されていた変化は取り消す）
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
  voice.gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);

  // 音が小さくなりきったころに発振器を止める（止めた部品は自動で片付けられる）
  voice.oscillator.stop(now + FADE_SECONDS + 0.05);
}

/**
 * ドローンを鳴らし始める関数
 * すでに鳴っているときは、いったん止めてから鳴らし直す。
 * @param {number[]} frequencies - 鳴らす音の周波数の配列（主音だけなら1つ、主音＋5度なら2つ）
 * @param {number} volume - 音量のつまみの値（0〜100）
 * @returns {Promise<void>}
 */
export async function startDrone(frequencies, volume) {
  await ensureAudioContext();

  // 前の音が残っていたら、止めてから始める
  if (session !== null) {
    stopDrone();
  }

  const now = audioContext.currentTime;

  // 全体の音量の部品を作り、0 から目標の音量まで、ふわっと上げる
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volumeToGain(volume), now + FADE_SECONDS);
  // スピーカーに直接ではなく、音割れ防止の部品（リミッター）を通して出す
  gain.connect(limiter);

  // 1つ1つの音を作る
  const voices = frequencies.map((frequency, index) => createVoice(frequency, index, gain));

  session = { gain, voices };
}

/**
 * 鳴らしている途中で、高さ・音の数・音量を変える関数
 * 音を止めずに、新しい値へなめらかに変える。
 * 鳴らしていないときは何もしない。
 * @param {number[]} frequencies - 鳴らす音の周波数の配列（主音だけなら1つ、主音＋5度なら2つ）
 * @param {number} volume - 音量のつまみの値（0〜100）
 */
export function updateDrone(frequencies, volume) {
  if (session === null) {
    return;
  }

  const now = audioContext.currentTime;

  // ----- 全体の音量を変える -----
  session.gain.gain.cancelScheduledValues(now);
  session.gain.gain.setValueAtTime(session.gain.gain.value, now);
  session.gain.gain.setTargetAtTime(volumeToGain(volume), now, CHANGE_SECONDS);

  // ----- 1つ1つの音の高さを変える・足りない音を足す -----
  frequencies.forEach((frequency, index) => {
    const voice = session.voices[index];

    if (voice) {
      // すでにある音：高さとフィルターを新しい値に近づける
      voice.oscillator.frequency.setTargetAtTime(frequency, now, CHANGE_SECONDS);
      voice.filter.frequency.setTargetAtTime(getFilterFrequency(frequency), now, CHANGE_SECONDS);
    } else {
      // まだない音（「主音だけ」→「主音＋5度」に変えたとき）：新しく作って鳴らす
      session.voices[index] = createVoice(frequency, index, session.gain);
    }
  });

  // ----- 余った音を止める（「主音＋5度」→「主音だけ」に変えたとき） -----
  const extraVoices = session.voices.slice(frequencies.length);
  extraVoices.forEach((voice) => fadeOutVoice(voice));
  session.voices = session.voices.slice(0, frequencies.length);
}

/**
 * ドローンを止める関数
 * ふわっと小さくしてから止める。鳴らしていないときは何もしない。
 */
export function stopDrone() {
  if (session === null) {
    return;
  }

  const now = audioContext.currentTime;

  // 止める音のまとまりを取り出し、「鳴らしていない」状態にする
  // （すぐ次に鳴らし始めても、止めている途中の音とまざらないように、まとまりごと分けておく）
  const stopping = session;
  session = null;

  // 全体の音量を 0 まで下げる
  stopping.gain.gain.cancelScheduledValues(now);
  stopping.gain.gain.setValueAtTime(stopping.gain.gain.value, now);
  stopping.gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);

  // 音が小さくなりきったころに、発振器を止める
  stopping.voices.forEach((voice) => {
    voice.oscillator.stop(now + FADE_SECONDS + 0.05);
  });

  // 少し待ってから、全体の音量の部品をリミッターから外して片付ける
  setTimeout(
    () => {
      stopping.gain.disconnect();
    },
    (FADE_SECONDS + 0.1) * 1000,
  );
}
