<script>
  // ===== 録音して聴き返すページ =====
  // 弾いた音を録音しながら音程も測り、止めたら「一番近い音からのずれ」のグラフを出す。
  // 再生すると、グラフの上を縦線が動く。グラフを押すと、その場所から再生する。
  // 止めた録音の音程のデータはブラウザに保存し（★なしは5つまで）、前の録音のグラフと並べて見比べられる。
  // ほかで録音した音源（ボイスメモ・動画など）のファイルを読み込んで、同じグラフにすることもできる（audioFile.js）。

  // ページのタイトル・説明文・OGP をまとめて出す部品
  import PageMeta from "#lib/PageMeta.svelte";

  import { onMount } from "svelte";

  // 調の一覧と、調に関する関数
  import { KEYS, getKey, getKeyMenuLabel, getScaleNames } from "#lib/key.js";

  // マイクのオン・オフと、録音に使う音の流れ
  import { startMicrophone, stopMicrophone, createRecordingStream } from "#lib/microphone.js";

  // 録音
  import { startRecorder, stopRecorder, cancelRecorder } from "#lib/recorder.js";

  // ほかで録音した音源（ファイル）の音程を調べる関数
  import { analyzeAudioFile } from "#lib/audioFile.js";

  // 一番近い音を探す関数と、グラフの計算
  import { findNearestNoteInKey } from "#lib/nearestNote.js";
  import { analyzeSamples, makeNoteLabels, makeBeatLines, PX_PER_SECOND, GRAPH_RIGHT_PADDING } from "#lib/recordGraph.js";

  // ずれのグラフの部品
  import RecordGraph from "#lib/RecordGraph.svelte";

  // 前の録音の保存・読み込み
  import { listRecordings, saveRecording, updateRecording, deleteRecording, MAX_UNSTARRED } from "#lib/recordHistory.js";

  // 音のデータを「ラ4」のような文字にする関数
  import { noteToText } from "#lib/score.js";

  // 画面が暗くならないようにする関数
  import { keepScreenOn, allowScreenOff } from "#lib/wakeLock.js";

  // メトロノーム（クリックを鳴らす・クリックの音を見分ける）
  import { prepareMetronome, startMetronome, updateMetronome, stopMetronome, isClickNoise, playTapSound, getClickLog } from "#lib/metronome.js";

  // テンポの速さの言葉の目安と、タップテンポ
  import { getTempoTerm } from "#lib/tempoTerms.js";
  import { tap } from "#lib/tapTempo.js";

  // 設定（音律・調・メトロノーム）の保存と読み込み
  import { RECORD_TEMPERAMENTS, DEFAULT_RECORD_SETTINGS, TEMPO_MIN, TEMPO_MAX, BEATS_OPTIONS, loadRecordSettings, saveRecordSettings } from "#lib/recordSettings.js";

  // ===== 設定値 =====

  // 録音できる長さの上限（秒）。弾き始めてから5分
  const MAX_SECONDS = 300;

  // 弾き始めの何秒前からをグラフと再生の始まりにするか（出だしが切れないように）
  const LEAD_SECONDS = 0.3;

  // これ以内のずれなら「合っている」とみなす（緑で表示する）幅（セント）
  const OK_CENTS = 5;

  // ===== 画面の状態 =====

  // 選んでいる音律の id（'pythagorean' か 'just'）
  let temperamentId = $state(DEFAULT_RECORD_SETTINGS.temperamentId);

  // 選んでいる調の id
  let keyId = $state(DEFAULT_RECORD_SETTINGS.keyId);

  // メトロノームを使うか・テンポ（♩＝）・拍子（0 は「なし」）・クリックの音量（0〜100）
  let metronomeOn = $state(DEFAULT_RECORD_SETTINGS.metronomeOn);
  let tempo = $state(DEFAULT_RECORD_SETTINGS.tempo);
  let beats = $state(DEFAULT_RECORD_SETTINGS.beats);
  let clickVolume = $state(DEFAULT_RECORD_SETTINGS.clickVolume);

  // グラフに拍の線を出すかどうか
  let showBeatLines = $state(DEFAULT_RECORD_SETTINGS.showBeatLines);

  // 「試しに鳴らす」で、録音せずにクリックだけ鳴らしているかどうか
  let previewing = $state(false);

  // 今光らせている拍の丸（小節の中で何拍目か。0 が1拍目）。光っていないときは null
  let litBeat = $state(null);

  // タップテンポのボタンを押した回数（数え直すと 1 に戻る）
  let tapCount = $state(0);

  // 保存しておいた設定を読み込み終わったかどうか（最初の値で保存を上書きしないため）
  let loaded = $state(false);

  // 今の段階
  //   'idle'      ：まだ録音していない
  //   'waiting'   ：「録音」を押して、弾き始めるのを待っている（裏ではもう録音している）
  //   'recording' ：弾き始めたあと（録音と計測をしている）
  //   'stopping'  ：止めて、録音のデータができるのを待っている
  //   'analyzing' ：読み込んだ音源の音程を調べている
  //   'done'      ：録音が終わって（または音源を調べ終わって）、グラフと再生のボタンを出している
  let status = $state("idle");

  // 弾き始めてからの秒数（録音中に表示する）
  let elapsed = $state(0);

  // 今聞こえている音の周波数（聞こえていないときは null）
  let currentFrequency = $state(null);

  // 今の録音の、グラフの左端からの時刻と周波数（止めたあとに入れる）
  // 数が多い（5分で約18000個）ので、中身を細かく見張らない $state.raw にする
  let samples = $state.raw([]);

  // 今の録音のグラフの長さ（秒）
  let duration = $state(0);

  // 今の録音で、メトロノームのクリックが鳴った位置（グラフの左端からの秒と、小節の頭か）
  let beatMarks = $state.raw([]);

  // 録音した音のデータの URL と、ダウンロードするときのファイル名
  let audioUrl = $state("");
  let fileName = $state("");

  // 読み込んだ音源のファイル名（アプリで録音したときは空）
  // 空でないときは「読み込んだ音源」として表示し、ダウンロードのボタンは出さない（もともと手元にあるファイルなので）
  let importedName = $state("");

  // 読み込んだ音源を調べている進み具合（0〜1）
  let analyzeProgress = $state(0);

  // 読み込んだ音源が長すぎて、最初の5分だけを調べたかどうか
  let importTruncated = $state(false);

  // 再生しているかどうか
  let playing = $state(false);

  // 再生している位置（グラフの左端からの秒）
  let playbackTime = $state(0);

  // マイクが使えなかったときなどのメッセージ
  let errorMessage = $state("");

  // 保存した録音の一覧（新しい順）
  let history = $state.raw([]);

  // 今の録音の、保存したときの id（一覧で「今の録音」と表示するため）
  let currentId = $state(null);

  // 見比べるために選んだ、前の録音の id（選んでいないときは null）
  let compareId = $state(null);

  // グラフの横スクロールの枠と、その幅（上が今の録音、下が前の録音）
  let currentScroller = $state(null);
  let currentScrollerWidth = $state(0);
  let compareScroller = $state(null);
  let compareScrollerWidth = $state(0);

  // ===== 画面に出さない値 =====

  // 録音が本当に始まった時刻（秒）。まだ始まっていないときは null
  let recordStartTime = null;

  // 弾き始めた時刻（秒）。まだ弾いていないときは null
  let soundStartTime = null;

  // 録音中に測った音（時刻は、ページを開いてからの秒）
  let rawSamples = [];

  // 録音のファイルの中で、グラフの左端が何秒のところか（再生の位置を合わせるのに使う）
  let audioOffset = 0;

  // 再生に使う audio の部品
  let audio = null;

  // 再生中に縦線を動かす処理の予約番号
  let playbackFrameId = null;

  // メトロノームを今鳴らしているかどうか
  let metronomeActive = false;

  // 光らせた丸を消す予約の番号
  let lightTimer = null;

  // ページを離れたかどうか（読み込んだ音源を調べている途中でやめるために使う）
  let leftPage = false;

  // ファイルを選ぶ入力欄（見えないようにしておき、ボタンを押したときに開く）
  let fileInput = $state(null);

  // 丸を光らせておく時間（ミリ秒）
  const LIGHT_MILLISECONDS = 120;

  // ===== 計算する値 =====

  // 選んでいる調のデータと、その音階
  const key = $derived(getKey(keyId));
  const scaleNames = $derived(getScaleNames(key));

  // 録音中・待っている間かどうか
  const running = $derived(status === "waiting" || status === "recording");

  // 今のテンポの、速さの言葉の目安（例：Andante）
  const tempoTerm = $derived(getTempoTerm(tempo));

  // 拍の丸の数（拍子が「なし」のときは1つ）
  const dotCount = $derived(beats === 0 ? 1 : beats);

  // 今聞こえている音に一番近い音と、そこからのずれ（録音中に表示する）
  const currentNearest = $derived(currentFrequency !== null ? findNearestNoteInKey(currentFrequency, key, temperamentId) : null);
  const currentCents = $derived(currentNearest !== null ? 1200 * Math.log2(currentFrequency / currentNearest.frequency) : null);

  // 今の録音のグラフの点と札。音律や調を変えると、計算し直される
  const points = $derived(analyzeSamples(samples, key, temperamentId));
  const labels = $derived(makeNoteLabels(points));

  // 今の録音の拍の線（「拍の線を出す」がオフのときは空）
  const beatLines = $derived(showBeatLines ? makeBeatLines(beatMarks) : []);

  // 見比べる前の録音のデータ（一覧から消えたら、自動で見えなくなる）
  const compareRecording = $derived(history.find((item) => item.id === compareId) ?? null);

  // 前の録音のグラフの点と札。前の録音も、今選んでいる調・音律で計算し直す（同じ基準で比べるため）
  const comparePoints = $derived(compareRecording ? analyzeSamples(compareRecording.samples, key, temperamentId) : []);
  const compareLabels = $derived(makeNoteLabels(comparePoints));

  // 前の録音の拍の線（前の版で保存した録音には、クリックの位置がないので空）
  const compareBeatLines = $derived(showBeatLines && compareRecording ? makeBeatLines(compareRecording.beatMarks ?? []) : []);

  // 拍の線を出せる録音があるかどうか（ないときは「拍の線を出す」のチェックを出さない）
  const hasBeatMarks = $derived((status === "done" && beatMarks.length > 0) || (compareRecording !== null && (compareRecording.beatMarks ?? []).length > 0));

  // 今の録音のグラフを出すかどうか
  const showCurrent = $derived(status === "done");

  // グラフの横幅（px）：上下で同じ幅にして、同じ秒数が縦にそろうようにする
  // 長いほうの録音に合わせ、短いときは枠の幅いっぱいにする
  const graphWidth = $derived.by(() => {
    const longest = Math.max(showCurrent ? duration : 0, compareRecording ? compareRecording.duration : 0);
    const frameWidth = Math.max(currentScrollerWidth, compareScrollerWidth);
    return Math.max(frameWidth, Math.ceil(longest * PX_PER_SECOND) + GRAPH_RIGHT_PADDING);
  });

  // ===== 起動と後片付け =====

  onMount(() => {
    // 保存しておいた設定を読み込んで、画面に反映する
    const saved = loadRecordSettings();
    temperamentId = saved.temperamentId;
    keyId = saved.keyId;
    metronomeOn = saved.metronomeOn;
    tempo = saved.tempo;
    beats = saved.beats;
    clickVolume = saved.clickVolume;
    showBeatLines = saved.showBeatLines;
    loaded = true;

    // 保存した録音の一覧を読み込む
    refreshHistory();

    // ページを離れるときは、録音・マイク・メトロノーム・再生を全部止めて片付ける
    return () => {
      // 音源を調べている途中なら、やめる
      leftPage = true;
      stopMetronome();
      cancelRecorder();
      stopMicrophone();
      allowScreenOff();
      releaseAudio();
    };
  });

  // 設定が変わったら、ブラウザに保存する
  $effect(() => {
    // 中で使う値を先に読んで、どれが変わってもこの処理が呼ばれるようにする
    const settings = { temperamentId, keyId, metronomeOn, tempo, beats, clickVolume, showBeatLines };
    if (loaded) {
      saveRecordSettings(settings);
    }
  });

  // メトロノームを鳴らす・止める・設定を変える
  // 録音中（待っている間も）でメトロノームがオンのとき、または「試しに鳴らす」のときは鳴らし、それ以外は止める。
  // 鳴らしている途中にテンポ・拍子・音量を変えたら、次のクリックから変わる。
  $effect(() => {
    // 中で使う値を先に読んで、どれが変わってもこの処理が呼ばれるようにする
    const metronomeSettings = { tempo, beats, volume: clickVolume };
    const shouldPlay = (running && metronomeOn) || previewing;

    if (shouldPlay && !metronomeActive) {
      startMetronome(metronomeSettings, handleBeat);
      metronomeActive = true;
    } else if (shouldPlay && metronomeActive) {
      updateMetronome(metronomeSettings);
    } else if (!shouldPlay && metronomeActive) {
      stopMetronome();
      metronomeActive = false;
    }
  });

  /**
   * テンポを変える関数（−10・−1・＋1・＋10 のボタン）
   * @param {number} amount - 増やす量（減らすときはマイナス）
   */
  function changeTempo(amount) {
    tempo = Math.min(Math.max(tempo + amount, TEMPO_MIN), TEMPO_MAX);
  }

  /**
   * クリックが鳴るたびに呼ばれる関数：その拍の丸を少しの間だけ光らせる
   * @param {number} beatInBar - 小節の中で何拍目か（0 が1拍目）
   */
  function handleBeat(beatInBar) {
    litBeat = beatInBar;
    clearTimeout(lightTimer);
    lightTimer = setTimeout(() => {
      litBeat = null;
    }, LIGHT_MILLISECONDS);
  }

  /**
   * 「メトロノームを鳴らす」のチェックを変えたときの関数
   * オフにしたら、「試しに鳴らす」も止める（オンに戻したときに勝手に鳴り出さないように）。
   */
  function handleMetronomeToggle() {
    if (!metronomeOn) {
      previewing = false;
    }
  }

  /**
   * 「試しに鳴らす」「止める」ボタンを押したときの関数（録音はしない）
   */
  function togglePreview() {
    // iPhone・iPad では、ボタンを押した瞬間に音の土台を用意しないと鳴らない
    prepareMetronome();
    previewing = !previewing;
  }

  /**
   * タップテンポのボタンを押したときの関数
   * 試しに鳴らしていたら止めて、「ポッ」と鳴らし、押した間隔からテンポを求めて、そのままテンポを変える。
   */
  function handleTap() {
    // クリックとタップの音が混ざらないように、試しに鳴らすのは止める
    previewing = false;
    playTapSound();

    const result = tap(performance.now());
    tapCount = result.count;
    if (result.tempo !== null) {
      tempo = Math.min(Math.max(result.tempo, TEMPO_MIN), TEMPO_MAX);
    }
  }

  /**
   * タップテンポのボタンでキーを押したときの関数（キーボードでも使えるように、Enter とスペースで押したことにする）
   * @param {KeyboardEvent} event - キーを押したときの情報
   */
  function handleTapKey(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleTap();
    }
  }

  // ===== 前の録音の一覧 =====

  /**
   * 保存した録音の一覧を読み込み直す関数
   * 保存できないブラウザのときは、一覧を空にする。
   */
  async function refreshHistory() {
    try {
      history = await listRecordings();
    } catch (error) {
      history = [];
    }
  }

  /**
   * ★を付ける・外す関数
   * @param {{id: number, starred: boolean}} item - 録音
   */
  async function toggleStar(item) {
    await updateRecording(item.id, { starred: !item.starred });
    await refreshHistory();
  }

  /**
   * メモを保存する関数（入力欄から離れたときに呼ぶ）
   * @param {{id: number}} item - 録音
   * @param {string} memo - 入力したメモ
   */
  async function saveMemo(item, memo) {
    await updateRecording(item.id, { memo: memo.trim() });
    await refreshHistory();
  }

  /**
   * 録音を消す関数（確認を出してから消す）
   * @param {{id: number, createdAt: number}} item - 録音
   */
  async function removeRecording(item) {
    if (!confirm(formatDate(item.createdAt) + " の録音を消しますか？")) {
      return;
    }
    await deleteRecording(item.id);
    if (compareId === item.id) {
      compareId = null;
    }
    if (currentId === item.id) {
      currentId = null;
    }
    await refreshHistory();
  }

  /**
   * 上下のグラフの横スクロールをそろえる関数
   * どちらかをスクロールしたら、もう片方も同じ位置にする。
   * @param {'current'|'compare'} source - スクロールしたほう
   */
  function syncScroll(source) {
    const from = source === "current" ? currentScroller : compareScroller;
    const to = source === "current" ? compareScroller : currentScroller;
    if (from !== null && to !== null && to.scrollLeft !== from.scrollLeft) {
      to.scrollLeft = from.scrollLeft;
    }
  }

  // ===== 録音の処理 =====

  /**
   * 「録音」を押したときの関数
   * 今の録音を手放して、マイクと録音を始め、弾き始めるのを待つ。
   * （止めた録音は保存してあるので、一覧から見比べられる）
   */
  async function start() {
    // クリックを鳴らす準備（iPhone・iPad では、ボタンを押した瞬間に音の土台を作らないと鳴らないので、
    // マイクの許可を待つ前に用意しておく。メトロノームがオフでも、録音中にオンにできるように用意する）
    prepareMetronome();

    // 「試しに鳴らす」は終わりにする（メトロノームがオンなら、そのまま録音用のクリックとして鳴り続ける）
    previewing = false;

    // 前の録音と結果を手放す
    releaseAudio();
    errorMessage = "";
    samples = [];
    duration = 0;
    beatMarks = [];
    elapsed = 0;
    currentFrequency = null;
    currentId = null;
    importedName = "";
    importTruncated = false;
    rawSamples = [];
    recordStartTime = null;
    soundStartTime = null;

    status = "waiting";

    try {
      // マイクをオンにする（音程を測る）
      await startMicrophone(handlePitch);

      // 待っている間に止められていたら、ここで終わる
      if (status !== "waiting") {
        return;
      }

      // マイクの音（iPad・iPhone では30倍にしたもの）を録音に渡して、録音を始める
      const stream = createRecordingStream();
      if (stream === null) {
        throw new Error("マイクの音を取り出せませんでした。");
      }
      startRecorder(stream, (time) => {
        recordStartTime = time;
      });

      // 録音している間は、画面が暗くならないようにする
      keepScreenOn();
    } catch (error) {
      // マイクの使用を断られた・録音できないブラウザなど
      cancelRecorder();
      stopMicrophone();
      status = "idle";
      errorMessage = error instanceof Error ? error.message : "録音を始められませんでした。";
    }
  }

  /**
   * マイクで音程を調べるたびに呼ばれる関数（1秒に約60回）
   * 弾き始めるのを待つ → 測った音をためる → 5分になったら止める、を進める。
   * @param {number|null} frequency - 周波数（音が小さい・はっきりしないときは null）
   * @param {number} now - 今の時刻（秒）
   */
  function handlePitch(frequency, now) {
    // メトロノームのクリックの音を拾ったときは、音がなかったことにする
    // （弾く前のクリックで録音が始まったり、グラフに変な点が出たりしないように）
    if (isClickNoise(now, frequency)) {
      frequency = null;
    }

    // ----- 弾き始めるのを待っているとき -----
    if (status === "waiting") {
      // 録音がまだ始まっていない・音が出ていないときは、待ち続ける
      if (recordStartTime === null || frequency === null) {
        return;
      }
      // 弾き始めたので、ここからを録音として扱う
      status = "recording";
      soundStartTime = now;
    }

    if (status !== "recording") {
      return;
    }

    // 弾き始めてからの秒数
    elapsed = now - soundStartTime;
    currentFrequency = frequency;

    // 音が聞こえたときだけ、ためておく
    if (frequency !== null) {
      rawSamples.push({ time: now, frequency });
    }

    // 5分になったら、止める
    if (elapsed >= MAX_SECONDS) {
      finish();
    }
  }

  /**
   * 録音を止める関数（「止める」を押したとき・5分になったとき）
   * 録音のデータを受け取り、グラフを作って、音程のデータを保存する。
   */
  async function finish() {
    // 弾き始める前に止めたときは、録音を捨てて最初の状態に戻る
    if (status === "waiting") {
      cancelRecorder();
      stopMicrophone();
      allowScreenOff();
      status = "idle";
      return;
    }
    if (status !== "recording") {
      return;
    }

    status = "stopping";
    const stopTime = performance.now() / 1000;
    currentFrequency = null;

    // 先に録音を止めて（最後のかけらまで受け取る）、そのあとマイクを切る
    const recorded = await stopRecorder();
    stopMicrophone();
    allowScreenOff();

    if (recorded === null) {
      status = "idle";
      errorMessage = "録音のデータを受け取れませんでした。";
      return;
    }

    // グラフの左端：弾き始めの少し前（ただし、録音が始まる前にはしない）
    const graphStart = Math.max(recordStartTime, soundStartTime - LEAD_SECONDS);
    audioOffset = graphStart - recordStartTime;
    duration = stopTime - graphStart;

    // 測った音の時刻を、グラフの左端からの秒に直す
    samples = rawSamples.map((sample) => ({
      time: sample.time - graphStart,
      frequency: sample.frequency,
    }));
    rawSamples = [];

    // メトロノームのクリックが鳴った位置のうち、グラフの範囲（左端〜止めたとき）に入るものを、グラフの左端からの秒に直す
    // （メトロノームを使わなかったときは、録音の間に鳴ったクリックがないので空になる）
    beatMarks = getClickLog()
      .filter((click) => click.time >= graphStart && click.time <= stopTime)
      .map((click) => ({ time: click.time - graphStart, downbeat: click.downbeat }));

    // 再生とダウンロードの準備
    const now = new Date();
    audioUrl = URL.createObjectURL(recorded.blob);
    fileName = makeFileName(now, recorded.extension);
    prepareAudio();
    playbackTime = 0;

    status = "done";

    // 音程のデータをブラウザに保存し、一覧を読み込み直す（保存できなくても、今の録音は見られる）
    try {
      currentId = await saveRecording({
        createdAt: now.getTime(),
        duration,
        keyId,
        temperamentId,
        // メトロノームを使ったときだけ、テンポも保存する（一覧に「♩=80」と出す）
        tempo: metronomeOn ? tempo : null,
        beatMarks,
        samples,
      });
      await refreshHistory();
    } catch (error) {
      errorMessage = "この録音を一覧に保存できませんでした（グラフと再生はできます）。";
    }
  }

  /**
   * 「録音」「止める」ボタンを押したときの関数
   */
  function handleToggle() {
    if (running) {
      finish();
    } else {
      start();
    }
  }

  // ===== ほかで録音した音源の読み込み =====

  /**
   * 「音源を読み込む」ボタンを押したときの関数
   * 見えないようにしてある、ファイルを選ぶ入力欄を開く。
   */
  function openFilePicker() {
    if (fileInput !== null) {
      fileInput.click();
    }
  }

  /**
   * ファイルが選ばれたときの関数
   * 音源の音程を調べて、アプリで録音したときと同じグラフ・再生の画面にする。
   * @param {Event} event - 入力欄の change のできごと
   */
  async function handleFileChange(event) {
    const input = /** @type {HTMLInputElement} */ (event.currentTarget);
    const file = input.files && input.files[0];

    // 同じファイルをもう一度選んでも change が起きるように、入力欄を空に戻しておく
    input.value = "";

    // ファイルが選ばれなかった・録音中などのときは何もしない
    if (!file || running || status === "stopping" || status === "analyzing") {
      return;
    }

    // 「試しに鳴らす」のクリックは止める
    previewing = false;

    // 前の録音と結果を手放す
    releaseAudio();
    errorMessage = "";
    samples = [];
    duration = 0;
    beatMarks = [];
    currentId = null;
    importTruncated = false;
    analyzeProgress = 0;
    importedName = file.name;
    status = "analyzing";

    // 音源の音程を調べる（最初に音が出てから、録音と同じ5分まで）
    let result;
    try {
      result = await analyzeAudioFile(
        file,
        MAX_SECONDS,
        (progress) => {
          analyzeProgress = progress;
        },
        () => leftPage,
      );
    } catch (error) {
      status = "idle";
      importedName = "";
      errorMessage = error instanceof Error ? error.message : "この音源は読み込めませんでした。";
      return;
    }

    // 途中でページを離れたときは、ここで終わる
    if (result === null) {
      return;
    }

    // 音が1つも見つからなかったとき
    if (result.samples.length === 0) {
      status = "idle";
      importedName = "";
      errorMessage = "この音源からは、楽器の音が見つかりませんでした。";
      return;
    }

    // グラフの左端：最初に音が出た少し前（ただし、ファイルの頭より前にはしない）。アプリで録音するときと同じ
    const firstSoundTime = result.samples[0].time;
    const graphStart = Math.max(0, firstSoundTime - LEAD_SECONDS);

    // グラフの右端：ファイルの最後。ただし長すぎるときは、最初の音から5分のところまで
    const graphEnd = Math.min(result.fileDuration, firstSoundTime + MAX_SECONDS);

    audioOffset = graphStart;
    duration = graphEnd - graphStart;
    importTruncated = result.truncated;

    // 調べた音の時刻を、グラフの左端からの秒に直す
    samples = result.samples.map((sample) => ({
      time: sample.time - graphStart,
      frequency: sample.frequency,
    }));

    // 読み込んだ音源には、メトロノームのクリックの記録がないので、拍の線はなし
    beatMarks = [];

    // 再生の準備（選んだファイルを、そのまま再生に使う。動画のファイルでも、音だけが再生される）
    audioUrl = URL.createObjectURL(file);
    fileName = file.name;
    prepareAudio();
    playbackTime = 0;

    status = "done";

    // 音程のデータをブラウザに保存し、一覧を読み込み直す（保存できなくても、今の音源は見られる）
    // メモの欄には、最初からファイル名を入れておく（あとで書き換えられる）
    try {
      currentId = await saveRecording({
        createdAt: Date.now(),
        duration,
        keyId,
        temperamentId,
        tempo: null,
        beatMarks,
        samples,
        memo: file.name,
      });
      await refreshHistory();
    } catch (error) {
      errorMessage = "この音源を一覧に保存できませんでした（グラフと再生はできます）。";
    }
  }

  // ===== 再生の処理 =====

  /**
   * 再生に使う audio の部品を用意する関数
   */
  function prepareAudio() {
    audio = new Audio(audioUrl);
    audio.preload = "auto";

    // .webm の録音は、長さ（duration）が「分からない」になっていて、途中から再生できないことがある。
    // いったん最後まで飛ばすと長さが分かるので、そのあと頭に戻す（よく知られた直し方）
    audio.addEventListener("loadedmetadata", () => {
      if (audio && audio.duration === Infinity) {
        const fixDuration = () => {
          if (audio) {
            audio.removeEventListener("timeupdate", fixDuration);
            audio.currentTime = audioOffset;
          }
        };
        audio.addEventListener("timeupdate", fixDuration);
        audio.currentTime = 1e101;
      }
    });

    // 最後まで再生したら、止まった状態にする
    audio.addEventListener("ended", () => {
      playing = false;
      stopPlaybackLoop();
    });
  }

  /**
   * 再生をやめて、audio の部品と録音のデータの URL を片付ける関数
   */
  function releaseAudio() {
    stopPlaybackLoop();
    if (audio !== null) {
      audio.pause();
      audio = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      audioUrl = "";
    }
    playing = false;
  }

  /**
   * 「再生」「一時停止」ボタンを押したときの関数
   */
  function togglePlayback() {
    if (audio === null) {
      return;
    }

    if (playing) {
      audio.pause();
      playing = false;
      stopPlaybackLoop();
    } else {
      // 最後まで再生し終わっていたら、頭から
      if (playbackTime >= duration - 0.05) {
        playbackTime = 0;
      }
      playFrom(playbackTime);
    }
  }

  /**
   * グラフの指定した位置から再生する関数
   * @param {number} time - グラフの左端からの秒
   */
  function playFrom(time) {
    if (audio === null) {
      return;
    }
    playbackTime = Math.min(Math.max(time, 0), duration);
    audio.currentTime = audioOffset + playbackTime;
    audio.play();
    playing = true;
    startPlaybackLoop();
  }

  /**
   * 再生中に、縦線の位置を音に合わせて動かし続ける処理を始める関数
   */
  function startPlaybackLoop() {
    stopPlaybackLoop();
    const loop = () => {
      if (audio === null || !playing) {
        return;
      }
      playbackTime = Math.max(audio.currentTime - audioOffset, 0);
      followCursor();
      playbackFrameId = requestAnimationFrame(loop);
    };
    loop();
  }

  /**
   * 縦線を動かす処理を止める関数
   */
  function stopPlaybackLoop() {
    if (playbackFrameId !== null) {
      cancelAnimationFrame(playbackFrameId);
      playbackFrameId = null;
    }
  }

  /**
   * 縦線が枠の外に出そうになったら、グラフを横にスクロールして追いかける関数
   * 縦線が枠の右から2割のところまで来たら、縦線が左から3割の位置に来るようにずらす。
   * （下の前の録音のグラフも、スクロールの連動で一緒に動く）
   */
  function followCursor() {
    if (currentScroller === null) {
      return;
    }
    const x = playbackTime * PX_PER_SECOND;
    const left = currentScroller.scrollLeft;
    const width = currentScroller.clientWidth;
    if (x < left || x > left + width * 0.8) {
      currentScroller.scrollLeft = Math.max(x - width * 0.3, 0);
    }
  }

  // ===== 表示用の関数 =====

  /**
   * 秒を「分:秒」の文字にする関数
   * @param {number} seconds - 秒
   * @returns {string} 例：'1:05'
   */
  function formatTime(seconds) {
    const total = Math.floor(seconds);
    return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
  }

  /**
   * 日時（ミリ秒）を「月/日 時:分」の文字にする関数
   * @param {number} time - 日時（ミリ秒）
   * @returns {string} 例：'10/26 9:15'
   */
  function formatDate(time) {
    const date = new Date(time);
    return date.getMonth() + 1 + "/" + date.getDate() + " " + date.getHours() + ":" + String(date.getMinutes()).padStart(2, "0");
  }

  /**
   * ずれ（セント）を、符号付きの文字にする関数
   * @param {number} cents - ずれ（セント）
   * @returns {string} 例：'+3'、'−5'、'±0'
   */
  function formatCents(cents) {
    const rounded = Math.round(cents);
    if (rounded > 0) {
      return "+" + rounded;
    } else if (rounded < 0) {
      return "−" + Math.abs(rounded);
    } else {
      return "±0";
    }
  }

  /**
   * ずれ（セント）に合わせた色の名前を返す関数（合っている＝緑、高い＝赤、低い＝青）
   * @param {number|null} cents - ずれ（セント）
   * @returns {string} CSS のクラス名
   */
  function centsClass(cents) {
    if (cents === null) {
      return "none";
    } else if (Math.abs(cents) <= OK_CENTS) {
      return "ok";
    } else if (cents > 0) {
      return "high";
    } else {
      return "low";
    }
  }

  /**
   * ダウンロードするときのファイル名を作る関数
   * @param {Date} date - 録音した日時
   * @param {string} extension - 拡張子（'m4a' や 'webm'）
   * @returns {string} 例：'viola-neiro-20261026-0915.m4a'
   */
  function makeFileName(date, extension) {
    const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
    const day = date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate());
    const time = pad(date.getHours()) + pad(date.getMinutes());
    return "viola-neiro-" + day + "-" + time + "." + extension;
  }
</script>

<!-- ページのタイトル・説明文・OGP（リンクを送ったときに出る画像など） -->
<PageMeta
  title="録音して聴き返す｜ビオラ音色練習"
  description="ビオラの演奏を録音して聴き返し、音程のずれをグラフで振り返る練習ページ。ほかで録音した音源の読み込み・メトロノーム・前の録音との見比べつき。"
  path="/record"
/>

<!-- ===== ホームへ戻るリンクと見出し ===== -->
<a class="back" href="/">← ホーム</a>
<h1 class="title">録音して聴き返す</h1>
<p class="lead">「録音」を押してから弾き始めると、音が出たところから録音します。止めると音程のグラフが出ます。ほかで録音した音源（ボイスメモや動画など）を読み込んで、グラフにすることもできます。</p>

<!-- ===== 音律を選ぶ ===== -->
<section class="row">
  <span class="label">音律</span>
  <div class="toggle-group" role="group" aria-label="音律">
    {#each RECORD_TEMPERAMENTS as temperament (temperament.id)}
      <button type="button" class="toggle" aria-pressed={temperamentId === temperament.id} onclick={() => (temperamentId = temperament.id)}>
        {temperament.name}
      </button>
    {/each}
  </div>
</section>

<!-- ===== 調を選ぶ ===== -->
<!-- ピタゴラス音律でも、シ♭とラ♯のように呼び方で高さが変わるので、どちらの音律でも調を選ぶ -->
<section class="row">
  <label class="label" for="key-select">調</label>
  <div class="field">
    <select id="key-select" class="select" bind:value={keyId}>
      {#each KEYS as k (k.id)}
        <option value={k.id}>{getKeyMenuLabel(k)}</option>
      {/each}
    </select>
    <p class="scale">{scaleNames.join(" ")}</p>
  </div>
</section>

<!-- ===== メトロノーム ===== -->
<section class="metronome">
  <label class="check">
    <input type="checkbox" bind:checked={metronomeOn} onchange={handleMetronomeToggle} />
    メトロノームを鳴らす（「● 録音」を押すと鳴り始めます）
  </label>

  {#if metronomeOn}
    <!-- テンポ -->
    <div class="row">
      <span class="label">テンポ</span>
      <div class="tempo-group">
        <button type="button" class="tempo-button" onclick={() => changeTempo(-10)}>−10</button>
        <button type="button" class="tempo-button" onclick={() => changeTempo(-1)}>−1</button>
        <span class="tempo-value">♩={tempo}</span>
        <button type="button" class="tempo-button" onclick={() => changeTempo(1)}>＋1</button>
        <button type="button" class="tempo-button" onclick={() => changeTempo(10)}>＋10</button>
      </div>
    </div>

    <!-- 速さの言葉の目安（例：Andante（アンダンテ）歩くくらいの速さ） -->
    <p class="tempo-term">
      目安：{tempoTerm.name}（{tempoTerm.reading}）{tempoTerm.meaning}
    </p>

    <!-- 試しに鳴らす・タップテンポ（録音中は使えない） -->
    <div class="tempo-tools">
      <button type="button" class="sub-button" class:active={previewing} disabled={running} onclick={togglePreview}>
        {previewing ? "■ 止める" : "▶ 試しに鳴らす"}
      </button>
      <!-- 押した瞬間に反応するように、指やマウスが触れたとき（pointerdown）に数える -->
      <button type="button" class="sub-button tap-button" disabled={running} onpointerdown={handleTap} onkeydown={handleTapKey}>
        タップ{tapCount > 0 ? "（" + tapCount + "回）" : ""}
      </button>
    </div>
    <p class="metronome-note">タップ：曲の拍に合わせて何回か押すと、その速さがテンポになります（2秒あけると数え直し）。</p>

    <!-- 拍に合わせて光る丸（1拍目は大きい） -->
    <div class="beat-dots" aria-hidden="true">
      {#each Array.from({ length: dotCount }, (_, i) => i) as index (index)}
        <span class="beat-dot" class:accent={beats > 0 && index === 0} class:lit={litBeat === index}></span>
      {/each}
    </div>

    <!-- 拍子（1拍目は高い音。「なし」はすべて同じ音） -->
    <div class="row">
      <span class="label">拍子</span>
      <div class="toggle-group" role="group" aria-label="拍子">
        {#each BEATS_OPTIONS as option (option)}
          <button type="button" class="toggle" aria-pressed={beats === option} onclick={() => (beats = option)}>
            {option === 0 ? "なし" : option}
          </button>
        {/each}
      </div>
    </div>

    <!-- クリックの音量 -->
    <div class="row">
      <label class="label" for="click-volume">音量</label>
      <div class="field volume-field">
        <input id="click-volume" class="slider" type="range" min="0" max="100" step="1" bind:value={clickVolume} />
        <span class="volume-value">{clickVolume}</span>
      </div>
    </div>

    <p class="metronome-note">
      クリックの音は録音のファイルにも入りますが、録音を始めるきっかけと音程のグラフには使いません。iPhone でクリックが鳴らないときは、消音モードを解除してから、ページを開き直してください。
    </p>
  {/if}
</section>

<!-- ===== 今の様子 ===== -->
<div class="now">
  {#if status === "idle"}
    <p class="now-message">「● 録音」を押してから弾き始めてください</p>
  {:else if status === "waiting"}
    <p class="now-message">音を出すと録音が始まります</p>
  {:else if status === "recording"}
    <div class="now-row">
      <span class="now-time"><span class="rec-dot">●</span> {formatTime(elapsed)} / 5:00</span>
      <span class="now-note">
        {currentNearest ? noteToText(currentNearest.note) : ""}
        <span class="now-cents {centsClass(currentCents)}">
          {currentCents !== null ? formatCents(currentCents) : "−−"}
        </span>
      </span>
    </div>
  {:else if status === "stopping"}
    <p class="now-message">録音をまとめています…</p>
  {:else if status === "analyzing"}
    <!-- 読み込んだ音源を調べている途中：進み具合を出す -->
    <p class="now-message">音源を調べています… {Math.round(analyzeProgress * 100)}%</p>
    <div class="progress" aria-hidden="true">
      <div class="progress-bar" style="width: {analyzeProgress * 100}%"></div>
    </div>
  {:else if importedName}
    <!-- 読み込んだ音源のグラフを出しているとき -->
    <p class="now-message">
      読み込んだ音源「{importedName}」 {formatTime(duration)}（グラフを押すと、そこから再生します）
      {#if importTruncated}
        <br />長いので、最初に音が出てから5分までを調べました。
      {/if}
    </p>
  {:else}
    <p class="now-message">録音 {formatTime(duration)}（グラフを押すと、そこから再生します）</p>
  {/if}
</div>

<!-- ===== 拍の線を出すかどうか（メトロノームを使った録音があるときだけ出す） ===== -->
{#if hasBeatMarks}
  <label class="check">
    <input type="checkbox" bind:checked={showBeatLines} />
    拍の線を出す（メトロノームのクリックの位置）
  </label>
{/if}

<!-- ===== 今の録音のグラフと再生（録音が終わったら出す） ===== -->
{#if showCurrent}
  <p class="graph-title">{importedName ? "読み込んだ音源" : "今の録音"}</p>
  <RecordGraph
    {points}
    {labels}
    {beatLines}
    {duration}
    width={graphWidth}
    cursorTime={playbackTime}
    onseek={playFrom}
    onscroll={() => syncScroll("current")}
    bind:scroller={currentScroller}
    bind:scrollerWidth={currentScrollerWidth}
  />

  <!-- 再生とダウンロード -->
  <div class="playback">
    <button type="button" class="sub-button" onclick={togglePlayback}>
      {playing ? "❚❚ 一時停止" : "▶ 再生"}
    </button>
    <!-- ダウンロードは、アプリで録音したときだけ（読み込んだ音源は、もともと手元にあるファイルなので出さない） -->
    {#if !importedName}
      <a class="sub-button" href={audioUrl} download={fileName}>ダウンロード</a>
    {/if}
  </div>
{/if}

<!-- ===== 見比べる前の録音のグラフ ===== -->
{#if compareRecording}
  <div class="graph-title-row">
    <p class="graph-title">
      前の録音：{formatDate(compareRecording.createdAt)}
      {#if compareRecording.memo}「{compareRecording.memo}」{/if}
    </p>
    <button type="button" class="close-button" onclick={() => (compareId = null)}>閉じる</button>
  </div>
  <RecordGraph
    points={comparePoints}
    labels={compareLabels}
    beatLines={compareBeatLines}
    duration={compareRecording.duration}
    width={graphWidth}
    onscroll={() => syncScroll("compare")}
    bind:scroller={compareScroller}
    bind:scrollerWidth={compareScrollerWidth}
  />
{/if}

<!-- マイクが使えなかったときなどのメッセージ -->
{#if errorMessage}
  <p class="error">{errorMessage}</p>
{/if}

<!-- ===== 録音・止めるボタン ===== -->
<button type="button" class="play" class:running disabled={status === "stopping" || status === "analyzing"} onclick={handleToggle}>
  {running ? "■ 止める" : status === "done" ? "● もう一度録音" : "● 録音"}
</button>

<!-- ===== ほかで録音した音源を読み込むボタン ===== -->
<!-- ファイルを選ぶ入力欄そのものは見た目を変えにくいので隠しておき、このボタンを押したときに開く -->
<!-- accept：音声と動画のファイルだけを選べるようにする（動画は、音だけを取り出して調べる） -->
<input bind:this={fileInput} class="file-input" type="file" accept="audio/*,video/*" onchange={handleFileChange} />
<button type="button" class="file-button" disabled={running || status === "stopping" || status === "analyzing"} onclick={openFilePicker}> ほかで録音した音源を読み込む </button>
<p class="file-note">m4a・mp3・wav などの音声と、スマホで撮った動画が使えます。最初に音が出てから5分までを調べます。音源はこの端末の中だけで調べ、どこにも送りません。</p>

<!-- ===== 前の録音の一覧 ===== -->
{#if history.length > 0}
  <section class="history">
    <h2 class="history-title">前の録音</h2>
    <p class="history-note">
      音程のグラフだけを保存しています（音は保存しないので聴き返せません）。★のない録音は新しい{MAX_UNSTARRED}つまで残り、★を付けた録音は消えません。
    </p>
    <ul class="history-list">
      {#each history as item (item.id)}
        <li class="history-item">
          <div class="history-main">
            <!-- ★を付ける・外すボタン -->
            <button type="button" class="star" class:starred={item.starred} aria-pressed={item.starred} aria-label={item.starred ? "★を外す" : "★を付ける"} onclick={() => toggleStar(item)}>
              {item.starred ? "★" : "☆"}
            </button>
            <span class="history-date">{formatDate(item.createdAt)}</span>
            <span class="history-duration">
              {formatTime(item.duration)}
              <!-- メトロノームを使った録音は、テンポも出す -->
              {#if item.tempo}<span class="history-tempo">♩={item.tempo}</span>{/if}
            </span>
            <!-- 見比べるボタン（今の録音と、もう表示している録音には出さない） -->
            {#if item.id === currentId}
              <span class="history-tag">今の録音</span>
            {:else if item.id === compareId}
              <span class="history-tag">表示中</span>
            {:else}
              <button type="button" class="small-button" onclick={() => (compareId = item.id)}> 比べる </button>
            {/if}
            <button type="button" class="small-button danger" aria-label="この録音を消す" onclick={() => removeRecording(item)}> 削除 </button>
          </div>
          <!-- メモ（入力欄から離れたときに保存する） -->
          <input class="memo" type="text" placeholder="メモ（曲名など）" value={item.memo} onchange={(event) => saveMemo(item, event.currentTarget.value)} />
        </li>
      {/each}
    </ul>
    <p class="history-note">iPhone・iPad では、このサイトをしばらく（7日ほど）開かないと、保存した録音が消えることがあります。大事な録音はダウンロードしておくと安心です。</p>
  </section>
{/if}

<style>
  /* ----- ホームへ戻るリンク ----- */
  .back {
    display: inline-block;
    margin-bottom: 8px;
    color: var(--accent);
    text-decoration: none;
    font-size: 0.95rem;
  }

  /* ----- 見出しと説明 ----- */
  .title {
    margin: 0;
    font-size: 1.5rem;
  }

  .lead {
    margin: 4px 0 20px;
    color: var(--text-sub);
    font-size: 0.9rem;
  }

  /* ----- 1行の設定（左に名前、右に選ぶ部分） ----- */
  .row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 16px;
  }

  .label {
    flex: 0 0 3em;
    padding-top: 8px;
    font-size: 0.95rem;
    color: var(--text-sub);
  }

  .field {
    flex: 1;
    min-width: 0;
  }

  /* ----- 2つから選ぶボタン ----- */
  .toggle-group {
    flex: 1;
    display: flex;
    gap: 8px;
  }

  .toggle {
    flex: 1;
    padding: 8px 4px;
    font-size: 0.95rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card-bg);
    color: var(--text);
    cursor: pointer;
  }

  .toggle[aria-pressed="true"] {
    background: var(--accent);
    border-color: var(--accent);
    color: #ffffff;
    font-weight: bold;
  }

  /* ----- 調のメニュー ----- */
  .select {
    width: 100%;
    padding: 8px;
    font-size: 1rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card-bg);
    color: var(--text);
  }

  .scale {
    margin: 4px 0 0;
    font-size: 0.85rem;
    color: var(--text-sub);
  }

  /* ----- メトロノーム ----- */
  .metronome {
    margin-bottom: 16px;
  }

  /* 「メトロノームを鳴らす」のチェック */
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .check input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }

  /* テンポのボタンと数字を1行に並べる */
  .tempo-group {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tempo-button {
    flex: 1;
    padding: 8px 0;
    font-size: 0.9rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card-bg);
    color: var(--text);
    cursor: pointer;
  }

  .tempo-value {
    /* 数字が変わってもボタンの位置が動かないように、幅をそろえる */
    flex: 0 0 4.5em;
    text-align: center;
    font-weight: bold;
    font-variant-numeric: tabular-nums;
  }

  /* 音量のつまみ */
  .volume-field {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 6px;
  }

  .slider {
    flex: 1;
    accent-color: var(--accent);
  }

  .volume-value {
    width: 2.5em;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--text-sub);
  }

  .metronome-note {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-sub);
  }

  /* 速さの言葉の目安 */
  .tempo-term {
    margin: -8px 0 12px calc(3em + 12px);
    font-size: 0.85rem;
    color: var(--text-sub);
  }

  /* 試しに鳴らす・タップのボタン */
  .tempo-tools {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
  }

  /* 試しに鳴らしている間は、紫（アクセントの色）で塗って分かるようにする */
  .sub-button.active {
    background: var(--accent);
    color: #ffffff;
  }

  .sub-button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* タップのボタンは、連打しやすいように少し高くし、長押しのメニューや拡大が出ないようにする */
  .tap-button {
    padding: 14px 10px;
    touch-action: manipulation;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }

  /* 拍に合わせて光る丸 */
  .beat-dots {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    margin: 12px 0;
  }

  .beat-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--border);
  }

  /* 1拍目の丸は大きくする */
  .beat-dot.accent {
    width: 20px;
    height: 20px;
  }

  /* 鳴ったときに光る */
  .beat-dot.lit {
    background: var(--accent);
  }

  /* ----- 今の様子 ----- */
  .now {
    min-height: 56px;
    margin-bottom: 12px;
    padding: 12px 16px;
    background: var(--accent-light);
    border-radius: 10px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .now-message {
    margin: 0;
    text-align: center;
    color: var(--text-sub);
    font-size: 0.95rem;
  }

  .now-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }

  .now-time {
    font-size: 1.1rem;
    font-variant-numeric: tabular-nums;
  }

  /* 録音中の赤い丸 */
  .rec-dot {
    color: #d64545;
  }

  .now-note {
    font-size: 1.3rem;
    font-weight: bold;
    color: var(--accent);
  }

  .now-cents {
    margin-left: 8px;
    font-variant-numeric: tabular-nums;
  }

  /* ----- ずれの色（合っている＝緑、高い＝赤、低い＝青、分からない＝グレー） ----- */
  .ok {
    color: var(--ok);
  }

  .high {
    color: #d64545;
  }

  .low {
    color: #3a6fd8;
  }

  .none {
    color: var(--disabled);
  }

  /* ----- グラフの見出し ----- */
  .graph-title {
    margin: 0 0 4px;
    font-size: 0.9rem;
    color: var(--text-sub);
  }

  .graph-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .close-button {
    padding: 2px 10px;
    font-size: 0.85rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card-bg);
    color: var(--text-sub);
    cursor: pointer;
    margin-bottom: 4px;
  }

  /* ----- 再生とダウンロード ----- */
  .playback {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  .sub-button {
    flex: 1;
    padding: 10px;
    font-size: 1rem;
    text-align: center;
    text-decoration: none;
    border: 1px solid var(--accent);
    border-radius: 10px;
    background: var(--card-bg);
    color: var(--accent);
    cursor: pointer;
    box-sizing: border-box;
  }

  /* ----- エラーのメッセージ ----- */
  .error {
    margin: 0 0 12px;
    color: #d64545;
    font-size: 0.9rem;
  }

  /* ----- 録音・止めるボタン ----- */
  .play {
    display: block;
    width: 100%;
    padding: 16px;
    font-size: 1.2rem;
    font-weight: bold;
    border: none;
    border-radius: 12px;
    background: var(--accent);
    color: #ffffff;
    cursor: pointer;
  }

  .play.running {
    background: var(--card-bg);
    color: var(--accent);
    border: 2px solid var(--accent);
  }

  .play:disabled {
    opacity: 0.6;
    cursor: default;
  }

  /* ----- ほかで録音した音源を読み込む ----- */
  /* ファイルを選ぶ入力欄は、見えないようにする（ボタンから開く） */
  .file-input {
    display: none;
  }

  .file-button {
    display: block;
    width: 100%;
    margin-top: 10px;
    padding: 12px;
    font-size: 1rem;
    border: 1px solid var(--accent);
    border-radius: 12px;
    background: var(--card-bg);
    color: var(--accent);
    cursor: pointer;
  }

  .file-button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .file-note {
    margin: 6px 0 0;
    font-size: 0.8rem;
    color: var(--text-sub);
  }

  /* 音源を調べている進み具合の棒 */
  .progress {
    height: 6px;
    margin-top: 8px;
    background: var(--card-bg);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: var(--accent);
  }

  /* ----- 前の録音の一覧 ----- */
  .history {
    margin-top: 28px;
  }

  .history-title {
    margin: 0 0 4px;
    font-size: 1.1rem;
  }

  .history-note {
    margin: 0 0 8px;
    font-size: 0.8rem;
    color: var(--text-sub);
  }

  .history-list {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .history-item {
    padding: 8px 12px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
  }

  .history-main {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .star {
    padding: 0 4px;
    font-size: 1.2rem;
    border: none;
    background: none;
    color: var(--disabled);
    cursor: pointer;
  }

  .star.starred {
    color: #e0a12f;
  }

  .history-date {
    font-variant-numeric: tabular-nums;
  }

  .history-duration {
    color: var(--text-sub);
    font-variant-numeric: tabular-nums;
    /* 右側のボタンを右端に寄せる */
    margin-right: auto;
  }

  .history-tempo {
    margin-left: 6px;
  }

  .history-tag {
    font-size: 0.8rem;
    color: var(--accent);
  }

  .small-button {
    padding: 4px 10px;
    font-size: 0.85rem;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: var(--card-bg);
    color: var(--accent);
    cursor: pointer;
  }

  .small-button.danger {
    border-color: var(--border);
    color: var(--text-sub);
  }

  .memo {
    width: 100%;
    margin-top: 6px;
    padding: 6px 8px;
    /* 16px 以上にすると、iPhone で入力欄を押したときに画面が勝手に拡大されない */
    font-size: 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
    box-sizing: border-box;
  }
</style>
