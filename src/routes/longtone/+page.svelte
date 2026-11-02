<script>
  // ===== ロングトーン・ビブラートのページ =====
  // 1つの音を長くのばし、その間の音程を測って、グラフと点数で見せる。
  //   ロングトーン：ずれとぶれ（まっすぐのばせているか）
  //   ビブラート　：揺れの速さ・幅・そろい具合・目標とのずれ
  // 計測の流れ（音が出たら始まり、途切れたら終わる）とグラフは、どちらも同じ。
  // 計測したあとに練習の種類や合わせる位置を変えても、同じ計測から計算し直す。

  // ページのタイトル・説明文・OGP をまとめて出す部品
  import PageMeta from "#lib/PageMeta.svelte";

  import { onMount } from "svelte";

  // 音のデータを「ラ4」のような文字にする関数
  import { noteToText } from "#lib/score.js";

  // 調の一覧と、調に関する関数（「自由」のときの音の呼び方に使う）
  import { KEYS, getKey, getKeyMenuLabel } from "#lib/key.js";

  // マイクのオン・オフ
  import { startMicrophone, stopMicrophone } from "#lib/microphone.js";

  // 調に合わせて一番近い音を探す関数（録音のページと同じ）
  import { findNearestNoteInKey } from "#lib/nearestNote.js";

  // ロングトーンの計算
  import {
    OPEN_STRING_TARGETS,
    FREE_TARGET_ID,
    LONGTONE_TEMPERAMENT_ID,
    SKIP_SECONDS,
    SILENCE_SECONDS,
    MAX_SECONDS,
    getTargetFrequency,
    getCents,
    getMedian,
    summarizeLongTone,
  } from "#lib/longtone.js";

  // ビブラートの計算
  import { VIBRATO_REFERENCES, summarizeVibrato } from "#lib/vibrato.js";

  // 設定の保存と読み込み
  import { PRACTICE_MODES, DEFAULT_LONGTONE_SETTINGS, loadLongtoneSettings, saveLongtoneSettings } from "#lib/longtoneSettings.js";

  // ===== 設定値 =====

  // これ以内のずれなら「合っている」とみなす（緑で表示する）幅（セント）
  const OK_CENTS = 5;

  // グラフの縦の目盛りの上限・下限（セント）。はみ出したら端に貼り付ける
  const GRAPH_CENTS = 50;

  // 計測中のグラフの横幅の最小値（秒）。はじめから横に引き伸ばされすぎないように
  const GRAPH_MIN_SECONDS = 4;

  // 前の音からこれ以上あいたら、グラフの線をいったん切る（秒）
  const GRAPH_GAP_SECONDS = 0.15;

  // グラフの大きさと、線を描く範囲（SVG の座標）
  const GRAPH_WIDTH = 320;
  const GRAPH_HEIGHT = 180;
  const PLOT_LEFT = 36;
  const PLOT_RIGHT = 312;
  const PLOT_TOP = 10;
  const PLOT_BOTTOM = 150;

  // ===== 画面の状態 =====

  // 練習の種類（'longtone' か 'vibrato'）
  let mode = $state(DEFAULT_LONGTONE_SETTINGS.mode);

  // 選んでいる目標の id（'C3'・'G3'・'D4'・'A4'・'free'）
  let targetId = $state(DEFAULT_LONGTONE_SETTINGS.targetId);

  // 「自由」のときの、音の呼び方に使う調の id
  let keyId = $state(DEFAULT_LONGTONE_SETTINGS.keyId);

  // ビブラートで目標に合わせる位置（'top'＝上の端、'middle'＝真ん中）
  let reference = $state(DEFAULT_LONGTONE_SETTINGS.reference);

  // 保存しておいた設定を読み込み終わったかどうか（最初の値で保存を上書きしないため）
  let loaded = $state(false);

  // 今の段階
  //   'idle'      ：まだ始めていない
  //   'waiting'   ：「始める」を押して、音が出るのを待っている
  //   'measuring' ：計測中
  //   'done'      ：計測が終わって、結果を表示している
  let status = $state("idle");

  // 計測した音の一覧（time は計測を始めてからの秒、frequency は周波数）
  let samples = $state([]);

  // 今回の目標の音のデータ（「自由」で、まだ決まっていないときは null）
  let targetNote = $state(null);

  // 今聞こえている音の周波数（聞こえていないときは null）
  let currentFrequency = $state(null);

  // 計測を始めてからの秒数
  let elapsed = $state(0);

  // 音を出していた長さ（秒）。計測が終わったら入る
  let measuredDuration = $state(0);

  // マイクが使えなかったときなどのメッセージ
  let errorMessage = $state("");

  // ===== 画面に出さない計測用の値 =====

  // 計測を始めた時刻（秒）
  let startTime = 0;

  // 最後に音が聞こえた時刻（秒）
  let lastHeardTime = 0;

  // 「自由」のときに、目標を決めるために集める出だしの音の周波数
  let freeCandidates = [];

  // ===== 計算する値 =====

  // 「自由」のときの調
  const key = $derived(getKey(keyId));

  // 今回の目標の周波数（まだ決まっていないときは null）
  const targetFrequency = $derived(targetNote ? getTargetFrequency(targetNote) : null);

  // 今聞こえている音の、目標からのずれ（セント）。分からないときは null
  const currentCents = $derived(currentFrequency !== null && targetFrequency !== null ? getCents(currentFrequency, targetFrequency) : null);

  // 計測中かどうか（「始める」を押してから終わるまで）
  const running = $derived(status === "waiting" || status === "measuring");

  // ロングトーンの結果（計測が終わって、目標が決まっているときだけ）
  const longtoneResult = $derived(status === "done" && targetFrequency !== null ? summarizeLongTone(samples, targetFrequency, measuredDuration) : null);

  // ビブラートの結果（ビブラートを選んでいて、計測が終わって、目標が決まっているときだけ）
  const vibratoResult = $derived(mode === "vibrato" && status === "done" && targetFrequency !== null ? summarizeVibrato(samples, targetFrequency, measuredDuration, reference) : null);

  // グラフの横幅（秒）：計測中はのびていき、終わったら音の長さぴったりにする
  const graphSeconds = $derived(status === "done" ? Math.max(measuredDuration, 1) : Math.max(elapsed, GRAPH_MIN_SECONDS));

  // グラフの横の目盛りの間隔（秒）：横幅に合わせて、目盛りが混みすぎないようにする
  const tickStep = $derived(graphSeconds <= 10 ? 2 : graphSeconds <= 30 ? 5 : 10);

  // グラフの横の目盛り（秒）の一覧
  const ticks = $derived.by(() => {
    const list = [];
    for (let t = 0; t <= graphSeconds; t += tickStep) {
      list.push(t);
    }
    return list;
  });

  // グラフの線（SVG の path の d 属性）
  const graphPath = $derived(makeGraphPath(samples, targetFrequency, graphSeconds));

  // ===== 起動と後片付け =====

  onMount(() => {
    // 保存しておいた設定を読み込んで、画面に反映する
    const saved = loadLongtoneSettings();
    mode = saved.mode;
    targetId = saved.targetId;
    keyId = saved.keyId;
    reference = saved.reference;
    loaded = true;

    // ページを離れるときは、マイクを切る
    return () => {
      stopMicrophone();
    };
  });

  // 設定が変わったら、ブラウザに保存する
  $effect(() => {
    // 中で使う値を先に読んで、どれが変わってもこの処理が呼ばれるようにする
    const settings = { mode, targetId, keyId, reference };
    if (loaded) {
      saveLongtoneSettings(settings);
    }
  });

  // ===== グラフの計算 =====

  /**
   * 秒を、グラフの横の位置（SVG の x 座標）に直す関数
   * @param {number} time - 秒
   * @param {number} seconds - グラフの横幅（秒）
   * @returns {number} x 座標
   */
  function timeToX(time, seconds) {
    return PLOT_LEFT + (time / seconds) * (PLOT_RIGHT - PLOT_LEFT);
  }

  /**
   * ずれ（セント）を、グラフの縦の位置（SVG の y 座標）に直す関数
   * 上がプラス（高い）、下がマイナス（低い）。はみ出す値は上下の端に貼り付ける。
   * @param {number} cents - ずれ（セント）
   * @returns {number} y 座標
   */
  function centsToY(cents) {
    const clamped = Math.min(Math.max(cents, -GRAPH_CENTS), GRAPH_CENTS);
    const middle = (PLOT_TOP + PLOT_BOTTOM) / 2;
    return middle - (clamped / GRAPH_CENTS) * ((PLOT_BOTTOM - PLOT_TOP) / 2);
  }

  /**
   * 計測した音から、グラフの線（SVG の path）を作る関数
   * 音が途切れたところでは、線をいったん切る。
   * @param {{time: number, frequency: number}[]} list - 計測した音の一覧
   * @param {number|null} target - 目標の周波数（まだ決まっていないときは null）
   * @param {number} seconds - グラフの横幅（秒）
   * @returns {string} path の d 属性の文字（線がないときは空文字）
   */
  function makeGraphPath(list, target, seconds) {
    // 目標が決まるまでは、ずれが分からないので線を引かない
    if (target === null) {
      return "";
    }

    let path = "";
    let previousTime = null;

    for (const sample of list) {
      const x = timeToX(sample.time, seconds).toFixed(1);
      const y = centsToY(getCents(sample.frequency, target)).toFixed(1);

      // 最初の点、または前の点から時間があいたときは「ここから描き始める」（M）
      // それ以外は「前の点から線を引く」（L）
      if (previousTime === null || sample.time - previousTime > GRAPH_GAP_SECONDS) {
        path += `M${x},${y} `;
      } else {
        path += `L${x},${y} `;
      }
      previousTime = sample.time;
    }

    return path;
  }

  // ===== 計測の処理 =====

  /**
   * 「自由」のときに、集めた出だしの音から目標の音を決める関数
   * 測り間違いに引っぱられないように中央値を使い、調に合わせて呼び分ける（シ♭とラ♯など）。
   * @returns {{step: number, accidental: number, octave: number}} 目標の音のデータ
   */
  function decideFreeTarget() {
    return findNearestNoteInKey(getMedian(freeCandidates), key, LONGTONE_TEMPERAMENT_ID).note;
  }

  /**
   * 「始める」を押したときの関数
   * 前回の結果を消して、マイクをオンにし、音が出るのを待つ。
   */
  async function start() {
    // 前回の結果を消す
    errorMessage = "";
    samples = [];
    measuredDuration = 0;
    freeCandidates = [];
    currentFrequency = null;
    elapsed = 0;

    // 目標の音を決める（「自由」のときは、弾き始めてから決める）
    const openString = OPEN_STRING_TARGETS.find((target) => target.id === targetId);
    targetNote = openString ? openString.note : null;

    status = "waiting";

    try {
      await startMicrophone(handlePitch);
    } catch (error) {
      // マイクの使用を断られた・マイクがないなど
      // microphone.js が理由を日本語で書いたメッセージを投げるので、それをそのまま出す
      status = "idle";
      errorMessage = error instanceof Error ? error.message : "マイクを使えませんでした。";
    }
  }

  /**
   * マイクで音程を調べるたびに呼ばれる関数（1秒に約60回）
   * 音が出るのを待つ → 計測する → 音が途切れたら終わる、を進める。
   * @param {number|null} frequency - 周波数（音が小さい・はっきりしないときは null）
   * @param {number} now - 今の時刻（秒）
   */
  function handlePitch(frequency, now) {
    // ----- 音が出るのを待っているとき -----
    if (status === "waiting") {
      // まだ音が出ていなければ、待ち続ける
      if (frequency === null) {
        return;
      }
      // 音が出たので、ここから計測を始める
      status = "measuring";
      startTime = now;
      lastHeardTime = now;
    }

    // 計測中でなければ何もしない
    if (status !== "measuring") {
      return;
    }

    // 計測を始めてからの秒数
    const time = now - startTime;
    elapsed = time;

    if (frequency !== null) {
      // ----- 音が聞こえたとき：記録する -----
      lastHeardTime = now;
      currentFrequency = frequency;
      samples.push({ time, frequency });

      // 「自由」で目標がまだ決まっていないとき：出だしの音を集め、少したったら目標を決める
      if (targetNote === null) {
        freeCandidates.push(frequency);
        if (time >= SKIP_SECONDS) {
          targetNote = decideFreeTarget();
        }
      }
    } else {
      // ----- 音が聞こえないとき -----
      currentFrequency = null;
    }

    // しばらく音が聞こえない、または最長の時間になったら、終わりにする
    if (now - lastHeardTime >= SILENCE_SECONDS || time >= MAX_SECONDS) {
      finish();
    }
  }

  /**
   * 計測を終える関数（音が途切れたとき・「止める」を押したとき・最長の時間になったとき）
   * マイクを切って、結果を出せるようにする（結果そのものは、上の「計算する値」で計算される）。
   */
  function finish() {
    stopMicrophone();
    currentFrequency = null;

    // まだ音が出ていなかったとき（待っている途中で「止める」を押した）は、最初の状態に戻る
    if (status === "waiting") {
      status = "idle";
      return;
    }

    // 音を出していた長さ：始めてから、最後に音が聞こえたときまで
    measuredDuration = lastHeardTime - startTime;

    // 「自由」で、目標が決まる前に終わったときは、集めた音から目標を決める
    if (targetNote === null && freeCandidates.length > 0) {
      targetNote = decideFreeTarget();
    }

    status = "done";
  }

  /**
   * 「始める」「止める」ボタンを押したときの関数
   */
  function handleToggle() {
    if (running) {
      finish();
    } else {
      start();
    }
  }

  // ===== 表示用の関数 =====

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
   * ばらつき（0.08 など）を、「±8%」のような文字にする関数
   * @param {number} value - ばらつき（0.08 なら 8%）
   * @returns {string} 例：'±8%'
   */
  function formatVariation(value) {
    return "±" + Math.round(value * 100) + "%";
  }
</script>

<!-- ページのタイトル・説明文・OGP（リンクを送ったときに出る画像など） -->
<PageMeta
  title="ロングトーン・ビブラート｜ビオラ音色練習"
  description="1つの音を長くのばして、音程のずれとぶれ、ビブラートの速さ・幅・そろい具合をグラフと点数で確かめるビオラの練習ページ。"
  path="/longtone"
/>

<!-- ===== ホームへ戻るリンクと見出し ===== -->
<a class="back" href="/">← ホーム</a>
<h1 class="title">ロングトーン・ビブラート</h1>
<p class="lead">「始める」を押してから弾き始めると、音が出た瞬間から測ります。音が途切れると終わります。</p>

<!-- ===== 練習の種類を選ぶ ===== -->
<section class="row">
  <span class="label">練習</span>
  <div class="toggle-group" role="group" aria-label="練習の種類">
    {#each PRACTICE_MODES as practice (practice.id)}
      <button type="button" class="toggle" aria-pressed={mode === practice.id} disabled={running} onclick={() => (mode = practice.id)}>
        {practice.name}
      </button>
    {/each}
  </div>
</section>

<!-- ===== 目標の音を選ぶ ===== -->
<section class="row">
  <span class="label">目標</span>
  <div class="toggle-group" role="group" aria-label="目標の音">
    {#each OPEN_STRING_TARGETS as target (target.id)}
      <button type="button" class="toggle" aria-pressed={targetId === target.id} disabled={running} onclick={() => (targetId = target.id)}>
        {noteToText(target.note)}
      </button>
    {/each}
    <button type="button" class="toggle" aria-pressed={targetId === FREE_TARGET_ID} disabled={running} onclick={() => (targetId = FREE_TARGET_ID)}> 自由 </button>
  </div>
</section>

<!-- ===== 「自由」のときだけ：調を選ぶ（シ♭とラ♯のように、調によって音の呼び方と高さが変わるため） ===== -->
{#if targetId === FREE_TARGET_ID}
  <section class="row">
    <label class="label" for="key-select">調</label>
    <div class="field">
      <select id="key-select" class="select" bind:value={keyId} disabled={running}>
        {#each KEYS as k (k.id)}
          <option value={k.id}>{getKeyMenuLabel(k)}</option>
        {/each}
      </select>
    </div>
  </section>
{/if}

<!-- ===== ビブラートのときだけ：目標に合わせる位置を選ぶ ===== -->
{#if mode === "vibrato"}
  <section class="row">
    <span class="label">合わせる</span>
    <div class="toggle-group" role="group" aria-label="目標に合わせる位置">
      {#each VIBRATO_REFERENCES as item (item.id)}
        <button type="button" class="toggle" aria-pressed={reference === item.id} onclick={() => (reference = item.id)}>
          {item.name}
        </button>
      {/each}
    </div>
  </section>
{/if}

<!-- ===== 今の様子（目標の音・今のずれ・経過時間） ===== -->
<div class="now">
  {#if status === "idle"}
    <p class="now-message">目標を選んで「始める」を押してください</p>
  {:else if status === "waiting"}
    <p class="now-message">音を出してください</p>
  {:else}
    <div class="now-row">
      <!-- 目標の音（「自由」で決まる前は「判定中…」） -->
      <span class="now-target">
        {targetNote ? noteToText(targetNote) : "判定中…"}
        {#if targetFrequency !== null}
          <span class="now-hz">{targetFrequency.toFixed(1)} Hz</span>
        {/if}
      </span>
      <!-- 計測中は、今のずれを大きく出す -->
      {#if status === "measuring"}
        <span class="now-cents {centsClass(currentCents)}">
          {currentCents !== null ? formatCents(currentCents) : "−−"}
        </span>
      {/if}
    </div>
    {#if status === "measuring"}
      <p class="now-time">{elapsed.toFixed(1)} 秒</p>
    {/if}
  {/if}
</div>

<!-- ===== 音程のグラフ ===== -->
<svg class="graph" viewBox="0 0 {GRAPH_WIDTH} {GRAPH_HEIGHT}" role="img" aria-label="時間ごとの、目標からの音程のずれのグラフ">
  <!-- 点数に入れない出だしの部分を、うすいグレーで塗る -->
  <rect class="graph-skip" x={PLOT_LEFT} y={PLOT_TOP} width={timeToX(SKIP_SECONDS, graphSeconds) - PLOT_LEFT} height={PLOT_BOTTOM - PLOT_TOP} />

  <!-- 「合っている」範囲（±5セント）を、うすい緑で塗る -->
  <rect class="graph-ok" x={PLOT_LEFT} y={centsToY(OK_CENTS)} width={PLOT_RIGHT - PLOT_LEFT} height={centsToY(-OK_CENTS) - centsToY(OK_CENTS)} />

  <!-- 横の線と、縦の目盛りの数字（+50・+25・0・−25・−50） -->
  {#each [50, 25, 0, -25, -50] as value (value)}
    <line class={value === 0 ? "graph-zero" : "graph-grid"} x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={centsToY(value)} y2={centsToY(value)} />
    <text class="graph-label" x={PLOT_LEFT - 4} y={centsToY(value) + 4} text-anchor="end">
      {value > 0 ? "+" + value : value === 0 ? "0" : "−" + Math.abs(value)}
    </text>
  {/each}

  <!-- 横の目盛りの数字（秒） -->
  {#each ticks as t (t)}
    <text class="graph-label" x={timeToX(t, graphSeconds)} y={PLOT_BOTTOM + 16} text-anchor="middle">
      {t}
    </text>
  {/each}
  <text class="graph-label" x={PLOT_RIGHT} y={GRAPH_HEIGHT - 2} text-anchor="end">秒</text>

  <!-- ビブラートのとき：揺れの上の端（または真ん中）の平均の高さに、オレンジの点線を引く -->
  {#if vibratoResult && vibratoResult.found}
    <line class="graph-reference" x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={centsToY(vibratoResult.offset)} y2={centsToY(vibratoResult.offset)} />
  {/if}

  <!-- 音程の線 -->
  <path class="graph-line" d={graphPath} />

  <!-- ビブラートのとき：見つけた山（赤）と谷（青）に印を付ける -->
  {#if vibratoResult}
    {#each vibratoResult.extremes as extreme, index (index)}
      <circle class={extreme.type === "peak" ? "mark-peak" : "mark-trough"} cx={timeToX(extreme.time, graphSeconds)} cy={centsToY(extreme.cents)} r="2.5" />
    {/each}
  {/if}
</svg>

<!-- ===== 結果 ===== -->
{#if status === "done"}
  <div class="result">
    {#if targetFrequency === null}
      <p class="result-message">音程を測れませんでした。もう一度弾いてみてください。</p>
    {:else if mode === "longtone"}
      <!-- ----- ロングトーンの結果 ----- -->
      {#if longtoneResult === null}
        <p class="result-message">音程を測れませんでした。もう一度弾いてみてください。</p>
      {:else if longtoneResult.tooShort}
        <p class="result-message">
          短すぎます（{longtoneResult.duration.toFixed(1)}秒）。1秒以上のばしてください。
        </p>
      {:else}
        <p class="result-score">
          総合 <span class="score-number">{longtoneResult.score}</span> 点
        </p>
        <dl class="result-list">
          <dt>目標とのずれ</dt>
          <dd>
            <span class={centsClass(longtoneResult.average)}>{formatCents(longtoneResult.average)} セント</span>
            <span class="sub-score">{longtoneResult.offsetScore}点</span>
          </dd>
          <dt>ぶれの少なさ</dt>
          <dd>
            ±{longtoneResult.spread} セント
            <span class="sub-score">{longtoneResult.spreadScore}点</span>
          </dd>
          <dt>長さ</dt>
          <dd>{longtoneResult.duration.toFixed(1)} 秒</dd>
        </dl>
      {/if}
    {:else if vibratoResult}
      <!-- ----- ビブラートの結果 ----- -->
      {#if vibratoResult.tooShort}
        <p class="result-message">
          短すぎます（{vibratoResult.duration.toFixed(1)}秒）。1秒以上のばしてください。
        </p>
      {:else if !vibratoResult.found}
        <p class="result-message">揺れが見つかりませんでした（山と谷がそれぞれ3つ以上必要です）。もう少し長く、はっきり揺らしてみてください。</p>
      {:else}
        <p class="result-score">
          総合 <span class="score-number">{vibratoResult.score}</span> 点
        </p>
        <dl class="result-list">
          <dt>目標とのずれ（{reference === "top" ? "上の端" : "真ん中"}）</dt>
          <dd>
            <span class={centsClass(vibratoResult.offset)}>{formatCents(vibratoResult.offset)} セント</span>
            <span class="sub-score">{vibratoResult.offsetScore}点</span>
          </dd>
          <dt>速さのそろい</dt>
          <dd>
            {formatVariation(vibratoResult.rateVariation)}
            <span class="sub-score">{vibratoResult.rateScore}点</span>
          </dd>
          <dt>幅のそろい</dt>
          <dd>
            {formatVariation(vibratoResult.widthVariation)}
            <span class="sub-score">{vibratoResult.widthScore}点</span>
          </dd>
          <dt>速さ</dt>
          <dd>1秒に {vibratoResult.rate.toFixed(1)} 回</dd>
          <dt>幅</dt>
          <dd>±{Math.round(vibratoResult.width)} セント</dd>
          <dt>長さ</dt>
          <dd>{vibratoResult.duration.toFixed(1)} 秒</dd>
        </dl>
        <p class="result-note">
          グラフの赤い点が揺れの山、青い点が谷、オレンジの点線が{reference === "top" ? "上の端" : "真ん中"}の平均の高さです。
        </p>
      {/if}
    {/if}
  </div>
{/if}

<!-- マイクが使えなかったときのメッセージ -->
{#if errorMessage}
  <p class="error">{errorMessage}</p>
{/if}

<!-- ===== 始める・止めるボタン ===== -->
<button type="button" class="play" class:running onclick={handleToggle}>
  {running ? "■ 止める" : "▶ 始める"}
</button>

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
    flex: 0 0 4em;
    padding-top: 8px;
    font-size: 0.95rem;
    color: var(--text-sub);
  }

  .field {
    flex: 1;
    min-width: 0;
  }

  .toggle-group {
    flex: 1;
    display: flex;
    gap: 6px;
    /* 狭い画面でも、はみ出さないようにする */
    min-width: 0;
  }

  .toggle {
    flex: 1;
    /* 5つ並べても入るように、縮められるようにする */
    min-width: 0;
    padding: 8px 2px;
    font-size: 0.9rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card-bg);
    color: var(--text);
    cursor: pointer;
  }

  /* 選ばれているボタンは紫（アクセントの色）にする */
  .toggle[aria-pressed="true"] {
    background: var(--accent);
    border-color: var(--accent);
    color: #ffffff;
    font-weight: bold;
  }

  /* 計測中は押せないので、少し薄くする */
  .toggle:disabled {
    opacity: 0.5;
    cursor: default;
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

  /* ----- 今の様子 ----- */
  .now {
    /* 中身が変わっても高さが変わらないように、最低の高さを決めておく */
    min-height: 88px;
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
  }

  .now-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }

  .now-target {
    font-size: 1.6rem;
    font-weight: bold;
    color: var(--accent);
  }

  .now-hz {
    font-size: 0.9rem;
    font-weight: normal;
    color: var(--text-sub);
  }

  .now-cents {
    font-size: 2rem;
    font-weight: bold;
    /* 数字の幅をそろえて、数字が変わってもガタガタしないようにする */
    font-variant-numeric: tabular-nums;
  }

  .now-time {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text-sub);
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

  /* ----- グラフ ----- */
  .graph {
    display: block;
    width: 100%;
    height: auto;
    margin-bottom: 12px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
  }

  .graph-skip {
    fill: #f0f0f0;
  }

  .graph-ok {
    fill: var(--ok-light);
  }

  .graph-grid {
    stroke: #e4e4e4;
    stroke-width: 1;
  }

  .graph-zero {
    stroke: var(--accent);
    stroke-width: 1;
  }

  .graph-label {
    font-size: 10px;
    fill: var(--text-sub);
  }

  .graph-line {
    fill: none;
    stroke: #333333;
    stroke-width: 1.5;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  /* ビブラートの、上の端（または真ん中）の平均の高さの線 */
  .graph-reference {
    stroke: #e07a2f;
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }

  /* ビブラートの山と谷の印 */
  .mark-peak {
    fill: #d64545;
  }

  .mark-trough {
    fill: #3a6fd8;
  }

  /* ----- 結果 ----- */
  .result {
    margin-bottom: 12px;
    padding: 12px 16px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
  }

  .result-message {
    margin: 0;
    color: var(--text-sub);
  }

  .result-score {
    margin: 0 0 8px;
    text-align: center;
    font-size: 1.1rem;
  }

  .score-number {
    font-size: 2.4rem;
    font-weight: bold;
    color: var(--accent);
  }

  /* 項目を、左に名前・右に値と点数で並べる */
  .result-list {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 16px;
    margin: 0;
  }

  .result-list dt {
    color: var(--text-sub);
  }

  .result-list dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* 項目ごとの点数 */
  .sub-score {
    display: inline-block;
    min-width: 3.5em;
    margin-left: 8px;
    font-weight: bold;
    color: var(--accent);
  }

  .result-note {
    margin: 8px 0 0;
    font-size: 0.8rem;
    color: var(--text-sub);
  }

  /* ----- マイクが使えなかったときのメッセージ ----- */
  .error {
    margin: 0 0 12px;
    color: #d64545;
    font-size: 0.9rem;
  }

  /* ----- 始める・止めるボタン ----- */
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

  /* 計測中は、白地に紫の文字にして「止める」ボタンだと分かるようにする */
  .play.running {
    background: var(--card-bg);
    color: var(--accent);
    border: 2px solid var(--accent);
  }
</style>
