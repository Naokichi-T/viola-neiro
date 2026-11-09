<script>
  // ===== チューナーのページ =====
  // 弾いた音に一番近い音（ドレミ）を大きく出し、その音から何セントずれているかを針と数字で見せる。
  //
  // 流れ：
  //   「始める」を押す → マイクで聴き続ける（1秒に約60回）
  //     ↓ 音が聞こえたら
  //   ① 直近0.2秒の高さの真ん中の値（中央値）を取って、針のふらつきをならす
  //   ② 選んだ調と音律で、一番近い音を探す（録音のページと同じ nearestNote.js）
  //   ③ その音からのずれ（セント）を、針と数字で出す（合っている＝緑、高い＝赤、低い＝青）
  //     ↓ 音が止まったら
  //   少しのあいだ最後の音を薄く残して、そのあと「−−」に戻す

  // ページのタイトル・説明文・OGP をまとめて出す部品
  import PageMeta from "#lib/PageMeta.svelte";

  import { onMount } from "svelte";

  // 調の一覧と、調に関する関数
  import { KEYS, getKey, getKeyMenuLabel, getScaleNames } from "#lib/key.js";

  // マイクのオン・オフ
  import { startMicrophone, stopMicrophone } from "#lib/microphone.js";

  // 調と音律に合わせて、一番近い音を探す関数（録音のページと同じ）
  import { findNearestNoteInKey } from "#lib/nearestNote.js";

  // 音のデータを「ラ4」のような文字にする関数
  import { noteToText } from "#lib/score.js";

  // 中央値を求める関数（ロングトーンの計算のものを使い回す）
  import { getMedian } from "#lib/longtone.js";

  // 画面が暗くならないようにする関数
  import { keepScreenOn, allowScreenOff } from "#lib/wakeLock.js";

  // 設定（音律・調）の保存と読み込み
  import { TUNER_TEMPERAMENTS, DEFAULT_TUNER_SETTINGS, loadTunerSettings, saveTunerSettings } from "#lib/tunerSettings.js";

  // ===== 設定値 =====

  // これ以内のずれなら「合っている」とみなす（緑で表示する）幅（セント）。録音・ロングトーンと同じ
  const OK_CENTS = 5;

  // 針のふらつきをならすために使う、直近の高さの長さ（秒）
  const SMOOTH_SECONDS = 0.2;

  // 音が止まってから、最後の音を残しておく長さ（秒）
  const HOLD_SECONDS = 1.5;

  // ずれの針の目盛りの端（セント）。はみ出したら端に貼り付ける
  const METER_CENTS = 50;

  // ===== 画面で選ぶ値 =====

  // 選んでいる音律の id（'pythagorean'・'just'・'equal'）
  let temperamentId = $state(DEFAULT_TUNER_SETTINGS.temperamentId);

  // 選んでいる調の id
  let keyId = $state(DEFAULT_TUNER_SETTINGS.keyId);

  // 保存しておいた設定を読み込み終わったかどうか（最初の値で保存を上書きしないため）
  let loaded = $state(false);

  // ===== チューナーの状態 =====

  // 今の段階
  //   'idle'     ：止まっている
  //   'starting' ：「始める」を押して、マイクの準備を待っている
  //   'running'  ：聴いている
  let status = $state("idle");

  // 表示している音の高さ（ならしたあとの周波数）。何も表示していないときは null
  let shownFrequency = $state(null);

  // 今、音が聞こえているかどうか（聞こえていないときは、最後の音を薄く表示する）
  let hearing = $state(false);

  // マイクが使えなかったときなどのメッセージ
  let errorMessage = $state("");

  // ===== 画面に出さない値 =====

  // 直近の高さ（time は秒、frequency は周波数）。ならすのに使う
  let recent = [];

  // 最後に音が聞こえた時刻（秒）
  let lastHeardTime = 0;

  // ===== 選んだ値から計算する値 =====

  // 選んでいる調のデータ
  const key = $derived(getKey(keyId));

  // 調の音階（例：['ド', 'レ', 'ミ', …]）。どの音に♯・♭が付くかの確認用
  const scaleNames = $derived(getScaleNames(key));

  // 一番近い音（音のデータと、その音の、選んだ音律での周波数）。表示していないときは null
  // 調や音律を変えると、同じ高さでも呼び方やずれが変わるので、ここで計算し直す
  const nearest = $derived(shownFrequency !== null ? findNearestNoteInKey(shownFrequency, key, temperamentId) : null);

  // 一番近い音からのずれ（セント）。表示していないときは null
  const cents = $derived(nearest !== null ? 1200 * Math.log2(shownFrequency / nearest.frequency) : null);

  // 動いているかどうか（「始める」を押してから止めるまで）
  const running = $derived(status === "starting" || status === "running");

  // ===== 起動と後片付け =====

  onMount(() => {
    // 保存しておいた設定を読み込んで、画面に反映する
    const saved = loadTunerSettings();
    temperamentId = saved.temperamentId;
    keyId = saved.keyId;
    loaded = true;

    // ページを離れるときは、マイクを切って、画面が暗くなってもよい状態に戻す
    return () => {
      stopMicrophone();
      allowScreenOff();
    };
  });

  // 設定が変わったら、ブラウザに保存する
  $effect(() => {
    // 中で使う値を先に読んで、どれが変わってもこの処理が呼ばれるようにする
    const settings = { temperamentId, keyId };
    if (loaded) {
      saveTunerSettings(settings);
    }
  });

  // ===== チューナーの動き =====

  /**
   * 「始める」を押したときの関数
   * マイクをオンにして、聴き始める。
   */
  async function start() {
    errorMessage = "";
    recent = [];
    shownFrequency = null;
    hearing = false;
    status = "starting";

    try {
      await startMicrophone(handlePitch);
    } catch (error) {
      // マイクの使用を断られた・マイクがないなど
      // microphone.js が理由を日本語で書いたメッセージを投げるので、それをそのまま出す
      status = "idle";
      errorMessage = error instanceof Error ? error.message : "マイクを使えませんでした。";
      return;
    }

    // マイクの許可を待っている間に「止める」を押されていたら、ここで終わる
    if (status !== "starting") {
      return;
    }

    status = "running";
    // 動いている間は、画面が暗くならないようにする
    keepScreenOn();
  }

  /**
   * 「止める」を押したときの関数
   */
  function stop() {
    stopMicrophone();
    allowScreenOff();
    status = "idle";
    shownFrequency = null;
    hearing = false;
    recent = [];
  }

  /**
   * マイクで音程を調べるたびに呼ばれる関数（1秒に約60回）
   * 直近の高さをためて、その中央値を表示する高さにする。
   * @param {number|null} frequency - 周波数（音が小さい・はっきりしないときは null）
   * @param {number} now - 今の時刻（秒）
   */
  function handlePitch(frequency, now) {
    if (status !== "running") {
      return;
    }

    if (frequency !== null) {
      // ----- 音が聞こえたとき -----
      // 少し途切れたあとに弾き直したときは、前の音が混ざらないように、ためた高さを捨てる
      if (!hearing) {
        recent = [];
      }
      hearing = true;
      lastHeardTime = now;

      // 直近の高さに加え、古くなったもの（SMOOTH_SECONDS より前）を捨てる
      recent.push({ time: now, frequency });
      recent = recent.filter((item) => now - item.time <= SMOOTH_SECONDS);

      // 中央値を表示する高さにする（ときどき混ざる測り間違いに引っぱられないように、平均ではなく中央値を使う）
      shownFrequency = getMedian(recent.map((item) => item.frequency));
    } else {
      // ----- 音が聞こえないとき -----
      hearing = false;
      // しばらく聞こえなければ、表示を消す（それまでは最後の音を薄く残す）
      if (shownFrequency !== null && now - lastHeardTime >= HOLD_SECONDS) {
        shownFrequency = null;
      }
    }
  }

  /**
   * 「始める」「止める」ボタンを押したときの関数
   */
  function handleToggle() {
    if (running) {
      stop();
    } else {
      start();
    }
  }

  // ===== 表示用の関数 =====

  /**
   * ずれ（セント）を、符号付きの文字にする関数
   * @param {number} value - ずれ（セント）
   * @returns {string} 例：'+3'、'−5'、'±0'
   */
  function formatCents(value) {
    const rounded = Math.round(value);
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
   * @param {number|null} value - ずれ（セント）
   * @returns {string} CSS のクラス名
   */
  function centsClass(value) {
    if (value === null) {
      return "none";
    } else if (Math.abs(value) <= OK_CENTS) {
      return "ok";
    } else if (value > 0) {
      return "high";
    } else {
      return "low";
    }
  }

  /**
   * ずれ（セント）を、針の横の位置（左端 0% 〜 右端 100%）に直す関数
   * 真ん中（50%）が一番近い音の高さ。はみ出す値は端に貼り付ける。
   * @param {number} value - ずれ（セント）
   * @returns {number} 横の位置（%）
   */
  function centsToPercent(value) {
    const clamped = Math.min(Math.max(value, -METER_CENTS), METER_CENTS);
    return 50 + (clamped / METER_CENTS) * 50;
  }
</script>

<!-- ページのタイトル・説明文・OGP（リンクを送ったときに出る画像など） -->
<PageMeta
  title="チューナー｜ビオラ音色練習"
  description="弾いた音に一番近い音（ドレミ）と、そこからのずれを針とセントで見るビオラ用のチューナー。ピタゴラス音律・純正律・平均律、ラ＝442Hz。"
  path="/tuner"
/>

<!-- ===== ホームへ戻るリンクと見出し ===== -->
<a class="back" href="/">← ホーム</a>
<h1 class="title">チューナー</h1>
<p class="lead">弾いた音に一番近い音と、そこからのずれを出します。針が真ん中で緑になれば合っています。</p>

<!-- ===== 音律を選ぶ（動いている間も変えられる） ===== -->
<section class="row">
  <span class="label">音律</span>
  <div class="toggle-group" role="group" aria-label="音律">
    {#each TUNER_TEMPERAMENTS as temperament (temperament.id)}
      <button type="button" class="toggle" aria-pressed={temperamentId === temperament.id} onclick={() => (temperamentId = temperament.id)}>
        {temperament.name}
      </button>
    {/each}
  </div>
</section>

<!-- ===== 調を選ぶ ===== -->
<!-- シ♭とラ♯のように、調によって音の呼び方が変わり、ピタゴラス音律・純正律では高さも変わるため -->
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

<!-- ===== 一番近い音とずれ ===== -->
<!-- 音が止まって最後の音を残しているときは、全体を薄くする -->
<div class="now" class:held={nearest !== null && !hearing}>
  {#if status === "idle"}
    <p class="now-message">「始める」を押して、音を出してください</p>
  {:else if status === "starting"}
    <p class="now-message">マイクを準備しています…</p>
  {:else}
    <!-- 一番近い音（聞こえていないときは「−−」） -->
    <p class="now-note {centsClass(cents)}">{nearest !== null ? noteToText(nearest.note) : "−−"}</p>

    <!-- ずれの針（真ん中が一番近い音、緑の帯が合っている範囲、左が低い・右が高い） -->
    <div class="meter" aria-hidden="true">
      <!-- 合っている範囲（±5セント）の緑の帯 -->
      <div class="meter-ok" style="left: {centsToPercent(-OK_CENTS)}%; width: {centsToPercent(OK_CENTS) - centsToPercent(-OK_CENTS)}%"></div>
      <!-- 目盛り（−25・+25 の細い線） -->
      <div class="meter-tick" style="left: {centsToPercent(-25)}%"></div>
      <div class="meter-tick" style="left: {centsToPercent(25)}%"></div>
      <!-- 真ん中（一番近い音）の線 -->
      <div class="meter-center"></div>
      <!-- 針（表示しているときだけ） -->
      {#if cents !== null}
        <div class="meter-needle {centsClass(cents)}" style="left: {centsToPercent(cents)}%"></div>
      {/if}
    </div>
    <div class="meter-labels">
      <span>低い</span>
      <span class="now-cents {centsClass(cents)}">{cents !== null ? formatCents(cents) : "−−"}</span>
      <span>高い</span>
    </div>

    <!-- 周波数（弾いた音と、一番近い音） -->
    <p class="now-hz">
      {#if nearest !== null}
        弾いた音 {shownFrequency.toFixed(1)} Hz ／ {noteToText(nearest.note)} {nearest.frequency.toFixed(1)} Hz
      {:else}
        &nbsp;
      {/if}
    </p>
  {/if}
</div>

<!-- ===== 始める・止めるボタン ===== -->
<button type="button" class="play" class:playing={running} onclick={handleToggle}>
  {running ? "■ 止める" : "▶ 始める"}
</button>

<!-- マイクが使えなかったときのメッセージ -->
{#if errorMessage}
  <p class="error">{errorMessage}</p>
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
    /* 名前の幅をそろえて、右側の選ぶ部分の左端をそろえる */
    flex: 0 0 4.5em;
    padding-top: 8px;
    font-size: 0.95rem;
    color: var(--text-sub);
  }

  .field {
    /* 残りの幅をすべて使う */
    flex: 1;
    /* 中身が長くても、はみ出さずに縮められるようにする */
    min-width: 0;
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

  /* 音階の小さな表示 */
  .scale {
    margin: 4px 0 0;
    font-size: 0.85rem;
    color: var(--text-sub);
  }

  /* ----- いくつかから選ぶボタン ----- */
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

  /* 選ばれているボタンは紫（アクセントの色）にする */
  .toggle[aria-pressed="true"] {
    background: var(--accent);
    border-color: var(--accent);
    color: #ffffff;
    font-weight: bold;
  }

  /* ----- 一番近い音とずれ ----- */
  .now {
    /* 中身が変わっても高さが変わらないように、最低の高さを決めておく */
    min-height: 200px;
    margin: 8px 0 12px;
    padding: 16px;
    background: var(--accent-light);
    border-radius: 10px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    /* 薄くするときに、ふわっと変わるようにする */
    transition: opacity 0.2s;
  }

  /* 音が止まって、最後の音を残しているとき */
  .now.held {
    opacity: 0.45;
  }

  .now-message {
    margin: 0;
    text-align: center;
    color: var(--text-sub);
  }

  /* 一番近い音（大きく。色はずれに合わせて、下の .ok・.high・.low で変わる） */
  .now-note {
    margin: 0 0 12px;
    font-size: 3.2rem;
    font-weight: bold;
    line-height: 1.1;
    text-align: center;
  }

  /* ----- ずれの針 ----- */
  .meter {
    position: relative;
    height: 32px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  /* 合っている範囲の緑の帯 */
  .meter-ok {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--ok-light);
  }

  /* −25・+25 の目盛りの細い線 */
  .meter-tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--border);
  }

  /* 真ん中（一番近い音）の線 */
  .meter-center {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 1px;
    background: var(--ok);
  }

  /* 針（色はずれに合わせて変わる） */
  .meter-needle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 4px;
    /* 針の幅の半分だけ左にずらして、針の真ん中がその位置に来るようにする */
    margin-left: -2px;
    border-radius: 2px;
    background: currentColor;
  }

  .meter-labels {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-top: 2px;
    font-size: 0.75rem;
    color: var(--text-sub);
  }

  /* 針の下のずれの数字 */
  .now-cents {
    font-size: 1.6rem;
    font-weight: bold;
    /* 数字の幅をそろえて、数字が変わってもガタガタしないようにする */
    font-variant-numeric: tabular-nums;
  }

  /* 周波数 */
  .now-hz {
    margin: 8px 0 0;
    font-size: 0.8rem;
    color: var(--text-sub);
    text-align: center;
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
    color: #3a72c9;
  }

  .none {
    color: var(--disabled);
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

  /* 動いている間は、白地に紫の文字にして「止める」ボタンだと分かるようにする */
  .play.playing {
    background: var(--card-bg);
    color: var(--accent);
    border: 2px solid var(--accent);
  }

  /* マイクが使えなかったときのメッセージ */
  .error {
    margin: 8px 0 0;
    font-size: 0.9rem;
    color: #d64545;
  }
</style>
