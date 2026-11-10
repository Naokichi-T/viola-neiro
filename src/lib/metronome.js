// ===== 録音のページで使うメトロノーム =====
// 「コッ」という短いクリックを、決めたテンポで鳴らし続ける。
// クリックの音は violin-pitch と同じ（1000Hz、1拍目は 1500Hz、0.05秒の正弦波）。
//
// 正確な間隔で鳴らすため、「少し先（0.1秒先まで）のクリックを、音の時計で時刻を決めて予約する」ことを、
// 25ミリ秒ごとにくり返す（setInterval だけで鳴らすと、間隔がガタつくため）。
//
// マイクはクリックの音も拾ってしまうので、鳴らした時刻を覚えておき、
// isClickNoise で「クリックの直後に、クリックの高さを拾ったか」を見分けられるようにする（violin-pitch の rhythm.js と同じ考え方）。
//
// ほかに：クリックが鳴るたびに何拍目かを知らせる（画面の丸を光らせるため）／タップテンポのボタンの「ポッ」という音。

// ===== 設定値 =====

// クリックの高さ（Hz）。ふつうの拍と、1拍目（アクセント）
const CLICK_FREQUENCY = 1000;
const ACCENT_CLICK_FREQUENCY = 1500;

// クリックの長さ（秒）。とても短くして「コッ」という音にする
const CLICK_DURATION = 0.05;

// 音量のつまみを一番大きくしたときの、クリックの音量（0〜1）
// 【2026/11/10 0.4 → 1.0 に変更】スマホのスピーカーでは小さかったので、上限（1）まで上げた。
// クリックは正弦波（波の一番高い所が音量と同じ）で、同時に鳴る音もないので、1.0 でも音は割れない
const MAX_CLICK_VOLUME = 1.0;

// 何ミリ秒ごとに、次のクリックを予約するか
const CHECK_INTERVAL_MILLISECONDS = 25;

// 何秒先までのクリックを予約しておくか
const SCHEDULE_AHEAD_SECONDS = 0.1;

// 鳴らし始めてから、1つ目のクリックまでの間（秒）
const START_DELAY_SECONDS = 0.1;

// クリックの直後、クリックの高さを拾っていないか調べる時間（秒）
// （クリックは0.05秒鳴るが、マイクで高さを調べるときは少し前の波も使うので、鳴り終わっても少しの間はクリックの高さが出る。
//   violin-pitch で調べて決めた値と同じ）
const CLICK_PITCH_WINDOW = 0.3;

// クリックの高さとみなす範囲（セント）
const CLICK_MATCH_CENTS = 50;

// ===== 動いている状態 =====

// クリックを鳴らすための音の土台（一度作ったら閉じずに使い回す）
let audioContext = null;

// 次のクリックを予約する処理の番号（止めるときに使う）
let timerId = null;

// 次のクリックを鳴らす時刻（音の時計での秒）
let nextClickTime = 0;

// 何拍目か（0 から数える）
let beatIndex = 0;

// 今の設定（テンポ・拍子・音量）
let settings = { tempo: 80, beats: 4, volume: 70 };

// クリックを鳴らした（予約した）時刻の一覧（ページを開いてからの秒。マイクの時刻と同じ物差し）
let clickTimes = [];

// 鳴らし始めてからのクリックの記録（グラフに拍の線を引くため）。鳴らし始めるたびに空にする
//   time     ：鳴らした時刻（ページを開いてからの秒。マイクの時刻と同じ物差し）
//   downbeat ：小節の頭（1拍目）なら true（拍子が「なし」のときは、いつも false）
let clickLog = [];

// クリックが鳴るたびに呼ぶ関数（拍に合わせて丸を光らせるため）。使わないときは null
let beatListener = null;

// 「クリックが鳴ったら知らせる」の予約の一覧（止めるときに取り消す）
let beatTimeouts = [];

// タップの音（短い「ポッ」）の高さ（Hz）・長さ（秒）・音量
// クリック（1000Hz・1500Hz）と聞き分けられるように、低めの音にする
const TAP_FREQUENCY = 660;
const TAP_DURATION = 0.04;
const TAP_VOLUME = 0.3;

/**
 * クリックを鳴らすための音の土台を用意する関数
 * iPhone・iPad では、ボタンを押した瞬間の処理の中で作らないと音が出ないので、
 * 「録音」ボタンを押したら、マイクの許可を待つ前に、まずこれを呼ぶ。
 */
export function prepareMetronome() {
  if (audioContext === null) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
}

/**
 * 音量のつまみの値（0〜100）を、実際のクリックの音量に変換する関数
 * 2乗して、つまみの下のほう（小さい音）を細かく調整できるようにする。
 * @param {number} volume - 音量のつまみの値（0〜100）
 * @returns {number} クリックの音量（0〜MAX_CLICK_VOLUME）
 */
function volumeToGain(volume) {
  const ratio = Math.min(Math.max(volume, 0), 100) / 100;
  return MAX_CLICK_VOLUME * ratio * ratio;
}

/**
 * クリックを1つ、決めた時刻に鳴らす予約をする関数
 * @param {number} time - 鳴らす時刻（音の時計での秒）
 * @param {boolean} isAccent - 1拍目なら true（高い音にする）
 */
function scheduleClick(time, isAccent) {
  const gainValue = volumeToGain(settings.volume);

  // 音量0なら鳴らさない（exponentialRamp は 0 から始められないため）
  if (gainValue <= 0) {
    return;
  }

  // 発振器（まるい音の正弦波）→ 音量 → スピーカー
  const oscillator = audioContext.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.value = isAccent ? ACCENT_CLICK_FREQUENCY : CLICK_FREQUENCY;

  const gain = audioContext.createGain();
  // 鳴らす時刻に決めた音量で始めて、すぐに小さくする（「コッ」と短く切れる音になる）
  gain.gain.setValueAtTime(gainValue, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + CLICK_DURATION);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);

  oscillator.start(time);
  oscillator.stop(time + CLICK_DURATION);
}

/**
 * 少し先までのクリックを予約する関数（25ミリ秒ごとに呼ばれる）
 */
function scheduleAhead() {
  if (audioContext === null) {
    return;
  }

  while (nextClickTime < audioContext.currentTime + SCHEDULE_AHEAD_SECONDS) {
    // 拍子が「なし」（0）のときは、どの拍もふつうの音。それ以外は、小節の頭（1拍目）だけ高い音
    const isAccent = settings.beats > 0 && beatIndex % settings.beats === 0;
    scheduleClick(nextClickTime, isAccent);

    // 鳴らす時刻を、マイクと同じ物差し（ページを開いてからの秒）に直して覚えておく
    const secondsFromNow = nextClickTime - audioContext.currentTime;
    const clickTime = performance.now() / 1000 + secondsFromNow;
    clickTimes.push(clickTime);

    // グラフに拍の線を引くための記録（こちらは古いものも捨てない）
    clickLog.push({ time: clickTime, downbeat: isAccent });

    // クリックが実際に鳴るころに、何拍目かを知らせる（画面の丸を光らせるため）
    if (beatListener !== null) {
      const listener = beatListener;
      const beatInBar = settings.beats > 0 ? beatIndex % settings.beats : 0;
      const timeoutId = setTimeout(
        () => {
          beatTimeouts = beatTimeouts.filter((id) => id !== timeoutId);
          listener(beatInBar);
        },
        Math.max(secondsFromNow * 1000, 0),
      );
      beatTimeouts.push(timeoutId);
    }

    // 次の拍へ（1拍の長さ ＝ 60秒 ÷ テンポ）
    nextClickTime += 60 / settings.tempo;
    beatIndex += 1;
  }

  // 古いクリックの時刻は、もう見分けに使わないので捨てる（1秒より前のもの）
  const cutoff = performance.now() / 1000 - 1;
  clickTimes = clickTimes.filter((time) => time > cutoff);
}

/**
 * メトロノームを鳴らし始める関数
 * prepareMetronome を先に（ボタンを押した瞬間に）呼んでおくこと。
 * @param {{tempo: number, beats: number, volume: number}} newSettings - テンポ・拍子（0 は「なし」）・音量（0〜100）
 * @param {((beatInBar: number) => void)|null} [onBeat] - クリックが鳴るたびに呼ぶ関数（小節の中で何拍目か。0 が1拍目）
 */
export function startMetronome(newSettings, onBeat = null) {
  prepareMetronome();
  stopMetronome();

  settings = { ...newSettings };
  beatListener = onBeat;
  nextClickTime = audioContext.currentTime + START_DELAY_SECONDS;
  beatIndex = 0;
  clickTimes = [];
  clickLog = [];

  scheduleAhead();
  timerId = setInterval(scheduleAhead, CHECK_INTERVAL_MILLISECONDS);
}

/**
 * 鳴らしている途中で、テンポ・拍子・音量を変える関数（次のクリックから変わる）
 * @param {{tempo: number, beats: number, volume: number}} newSettings - テンポ・拍子・音量
 */
export function updateMetronome(newSettings) {
  // 拍子を変えたときは、次のクリックを1拍目として数え直す
  if (newSettings.beats !== settings.beats) {
    beatIndex = 0;
  }
  settings = { ...newSettings };
}

/**
 * メトロノームを止める関数
 * （もう予約してあるクリック（0.1秒先まで）は鳴ることがある）
 */
export function stopMetronome() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
  clickTimes = [];

  // 「クリックが鳴ったら知らせる」の予約も取り消す
  beatTimeouts.forEach((id) => clearTimeout(id));
  beatTimeouts = [];
  beatListener = null;
}

/**
 * 鳴らし始めてからのクリックの記録を返す関数（録音を止めたときに、グラフに拍の線を引くために使う）
 * 止めたあとでも、次に鳴らし始めるまでは残っている。
 * @returns {{time: number, downbeat: boolean}[]} クリックの記録（time はページを開いてからの秒、downbeat は小節の頭か）
 */
export function getClickLog() {
  return clickLog.map((click) => ({ ...click }));
}

/**
 * タップの音（短い「ポッ」）をすぐに鳴らす関数（タップテンポのボタンを押したとき）
 * prepareMetronome を先に（ボタンを押した瞬間に）呼んでおくこと。
 */
export function playTapSound() {
  prepareMetronome();
  const now = audioContext.currentTime;

  const oscillator = audioContext.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.value = TAP_FREQUENCY;

  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(TAP_VOLUME, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + TAP_DURATION);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);

  oscillator.start(now);
  oscillator.stop(now + TAP_DURATION);
}

/**
 * マイクで拾った高さが、メトロノームのクリックの音かどうかを調べる関数
 * 「クリックを鳴らした直後（CLICK_PITCH_WINDOW 秒以内）」で、「高さがクリックの高さ（1000Hz・1500Hz）に近い」ときに true。
 * クリックの直後でも、ビオラの音を拾えているときは false（使ってよい）。
 * @param {number} time - 拾った時刻（ページを開いてからの秒）
 * @param {number|null} frequency - 拾った高さ（Hz）
 * @returns {boolean} クリックの音なら true
 */
export function isClickNoise(time, frequency) {
  if (frequency === null) {
    return false;
  }

  const afterClick = clickTimes.some((click) => time >= click && time < click + CLICK_PITCH_WINDOW);
  if (!afterClick) {
    return false;
  }

  return [CLICK_FREQUENCY, ACCENT_CLICK_FREQUENCY].some((click) => Math.abs(1200 * Math.log2(frequency / click)) <= CLICK_MATCH_CENTS);
}
