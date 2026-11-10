<script>
  // ===== 音階練習のページ =====
  // 調とオクターブの数を選んで、音階を1音ずつ弾いて合わせる練習。
  //
  // 練習の流れ：
  //   「始める」を押す
  //     ↓
  //   ① 今の音を大きく表示して、お手本の音を1秒鳴らす（status = 'playing'）
  //      鳴っている間と、鳴り終わってから少しの間は、マイクの判定をしない
  //      （スピーカーから出たお手本の音を、自分が弾いた音と間違えないため）
  //     ↓
  //   ② マイクで聴く（status = 'listening'）
  //      直近0.2秒の高さの中央値（真ん中の値）でならしてから判定する（チューナーと同じならし方）
  //      （C線を弓で弾くと、ときどき1オクターブ上と測り間違えるので、1回だけの間違いで判定が崩れないようにするため）
  //      ・±10セント以内が0.5秒続いた → 合格。次の音へ進んで ① に戻る
  //      ・±10セントの外が0.7秒続いた → 外れ。その音の「外した回数」を1増やして ① に戻る（同じ音をもう一度鳴らす）
  //     ↓ 最後の音で合格したら
  //   ③ 「できました」と、かかった時間・鳴らし直した回数・外した音を表示する（status = 'done'）

  // ページのタイトル・説明文・OGP をまとめて出す部品
  import PageMeta from "#lib/PageMeta.svelte";

  // onMount：ページを開いたとき・離れるときの処理
  // untrack：$effect の中で、変わっても処理を呼び直さなくてよい値を読むときに使う
  import { onMount, untrack } from "svelte";

  // 調の一覧と、調に関する関数
  import { KEYS, getKey, getKeyMenuLabel } from "#lib/key.js";

  // 音階の音を作る関数、周波数とずれの計算、短音階の種類・オクターブの数の一覧
  import { MINOR_TYPES, OCTAVE_COUNTS, getMinorType, buildScale, scaleNoteToText, getScaleFrequency, getScaleCents } from "#lib/scale.js";

  // お手本の音を鳴らす・止める関数（ドローンと同じ音色を使う）
  import { prepareDrone, startDrone, updateDrone, stopDrone } from "#lib/drone.js";

  // マイクのオン・オフ
  import { startMicrophone, stopMicrophone } from "#lib/microphone.js";

  // いくつかの数の中央値（真ん中の値）を求める関数（チューナーと同じものを使う）
  import { getMedian } from "#lib/longtone.js";

  // 画面が暗くならないようにする関数
  import { keepScreenOn, allowScreenOff } from "#lib/wakeLock.js";

  // 設定の保存・読み込み
  import { DEFAULT_SCALE_SETTINGS, loadScaleSettings, saveScaleSettings } from "#lib/scaleSettings.js";

  // ===== 設定値 =====

  // お手本の音を鳴らす長さ（秒）。ここを変えると、お手本の長さが変わる
  const TONE_SECONDS = 1;

  // お手本の音を止めてから、小さくなりきるまでの時間（秒）。drone.js の FADE_SECONDS と同じ値
  const TONE_FADE_SECONDS = 0.3;

  // お手本の音が消えてから、さらに何秒待ってから判定を始めるか（部屋に残る響きを拾わないため）
  const AFTER_TONE_SECONDS = 0.3;

  // これ以内のずれなら「合っている」とみなす幅（セント）
  const OK_CENTS = 10;

  // 合っている音を何秒続けたら合格にするか
  const PASS_SECONDS = 0.5;

  // 外れた音を何秒続けたら、お手本を鳴らし直すか
  // （弾き始めに高さがすべっただけで鳴り直さないように、合格の0.5秒よりは少し長くしておく）
  const MISS_SECONDS = 0.7;

  // ずれの針の目盛りの端（セント）。はみ出したら端に貼り付ける
  const METER_CENTS = 50;

  // 判定の前に高さをならすために使う、直近の高さの長さ（秒）。チューナーと同じ値
  // （C線を弓で弾いたとき、ときどき混ざる「1オクターブ上」の測り間違いを、中央値で消すため）
  const SMOOTH_SECONDS = 0.2;

  // ===== 画面で選ぶ値 =====

  // 選んでいる調の id
  let keyId = $state(DEFAULT_SCALE_SETTINGS.keyId);

  // 短音階の種類の id（短調を選んでいるときだけ使う）
  let minorTypeId = $state(DEFAULT_SCALE_SETTINGS.minorTypeId);

  // オクターブの数（1 か 2）
  let octaveCount = $state(DEFAULT_SCALE_SETTINGS.octaveCount);

  // お手本の音の音量（0〜100）
  let volume = $state(DEFAULT_SCALE_SETTINGS.volume);

  // 保存しておいた設定を読み込み終わったかどうか
  // （読み込む前の最初の値で、保存を上書きしてしまわないようにするため）
  let loaded = $state(false);

  // ===== 練習の状態 =====

  // 今の段階
  //   'idle'      ：まだ始めていない
  //   'starting'  ：「始める」を押して、マイクの準備を待っている
  //   'playing'   ：お手本の音を鳴らしている（判定はしない）
  //   'listening' ：マイクで聴いて判定している
  //   'done'      ：最後まで弾けて、結果を表示している
  let status = $state("idle");

  // 今弾く音が、音階の何番目か（0 から数える。scale.all の位置）
  let currentIndex = $state(0);

  // 音ごとの、外した回数（scale.all と同じ順番・同じ数）
  let missCounts = $state([]);

  // 今聞こえている音の、目標からのずれ（セント）。聞こえていない・判定していないときは null
  let currentCents = $state(null);

  // かかった時間（秒）。最後まで弾けたら入る
  let finishedSeconds = $state(0);

  // マイクが使えなかったときなどのメッセージ
  let errorMessage = $state("");

  // ===== 画面に出さない練習用の値 =====

  // 「始める」を押した時刻（秒）
  let startTime = 0;

  // 合っている音が続き始めた時刻（秒）。合っていないときは null
  let okSince = null;

  // 外れた音が続き始めた時刻（秒）。外れていないときは null
  let missSince = null;

  // お手本の音を止める・判定を始めるための予約（止めるときに取り消すために持っておく）
  let toneTimer = null;

  // 直近の高さ（time は秒、frequency は周波数）。中央値でならすのに使う
  let recent = [];

  // ===== 選んだ値から計算する値 =====

  // 選んでいる調のデータ
  const key = $derived(getKey(keyId));

  // 短調を選んでいるかどうか（短音階の種類を選ぶボタンを出すかどうかに使う）
  const isMinor = $derived(key.mode === "minor");

  // 選んでいる短音階の種類のデータ（説明文の表示に使う）
  const minorType = $derived(getMinorType(minorTypeId));

  // 音階の音（上り・下り・全部）
  const scale = $derived(buildScale(key, minorTypeId, octaveCount));

  // 練習中かどうか（「始める」を押してから、終わる・止めるまで）
  const running = $derived(status === "starting" || status === "playing" || status === "listening");

  // 今弾く音のデータ
  const currentItem = $derived(scale.all[currentIndex]);

  // 今弾く音の周波数（お手本の高さ・判定の目標）
  const targetFrequency = $derived(getScaleFrequency(currentItem.note, key));

  // 鳴らし直した回数の合計（外した回数の合計と同じ）
  const totalMisses = $derived(missCounts.reduce((sum, count) => sum + count, 0));

  // 外した音の一覧（結果の表示用）。外した回数が1回以上の音だけ、弾いた順に並べる
  const missedItems = $derived(scale.all.map((item, index) => ({ item, index, count: missCounts[index] ?? 0 })).filter((entry) => entry.count > 0));

  // ===== 起動と後片付け =====

  onMount(() => {
    // 保存しておいた設定を読み込んで、画面に反映する
    const saved = loadScaleSettings();
    keyId = saved.keyId;
    minorTypeId = saved.minorTypeId;
    octaveCount = saved.octaveCount;
    volume = saved.volume;
    loaded = true;

    // ページを離れるときは、音とマイクを止めて、画面が暗くなってもよい状態に戻す
    return () => {
      stopEverything();
    };
  });

  // ===== 値が変わったときの処理 =====

  // 設定が変わったら、ブラウザに保存する
  $effect(() => {
    // 中で使う値を先に読んで、どれが変わってもこの処理が呼ばれるようにする
    const settings = { keyId, minorTypeId, octaveCount, volume };

    // 読み込みが終わるまでは保存しない（最初の値で上書きしないため）
    if (loaded) {
      saveScaleSettings(settings);
    }
  });

  // お手本を鳴らしている途中で音量を変えたら、止めずに音量だけ変える
  $effect(() => {
    const currentVolume = volume;
    // status が変わっても呼び直さないように、untrack の中で読む
    untrack(() => {
      if (status === "playing") {
        updateDrone([targetFrequency], currentVolume);
      }
    });
  });

  // 結果を表示しているときに調・種類・長さを変えたら、結果を消して最初の状態に戻す
  // （前の音階の結果が、新しい音階の一覧に重なって表示されないようにするため）
  $effect(() => {
    // scale が変わったときだけ呼ばれるように、ここで読む
    scale;
    untrack(() => {
      if (status === "done") {
        status = "idle";
        currentIndex = 0;
        missCounts = [];
      }
    });
  });

  // ===== 練習の進め方 =====

  /**
   * 「始める」を押したときの関数
   * 音を鳴らす準備とマイクの準備をしてから、最初の音のお手本を鳴らす。
   */
  async function start() {
    errorMessage = "";
    currentIndex = 0;
    // 音ごとの外した回数を、全部 0 にしておく
    missCounts = scale.all.map(() => 0);
    currentCents = null;
    finishedSeconds = 0;
    status = "starting";

    // お手本の音を鳴らす準備（ボタンを押した瞬間の処理の中で呼ぶ必要があるので、マイクの許可を待つ前に呼ぶ）
    prepareDrone();

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

    // 練習中は、画面が暗くならないようにする
    keepScreenOn();

    // かかった時間は、マイクの準備ができてから数える（許可の画面で迷った時間は入れない）
    startTime = performance.now() / 1000;

    playCurrentNote();
  }

  /**
   * 今の音のお手本を鳴らす関数
   * 決まった長さだけ鳴らしたら止め、音が消えて少したってから判定を始める。
   */
  function playCurrentNote() {
    status = "playing";
    currentCents = null;
    okSince = null;
    missSince = null;
    // 前の音の高さが、次の判定に混ざらないように捨てる
    recent = [];

    // お手本の音を鳴らす（ドローンと同じ音色で、1つの音だけ）
    startDrone([targetFrequency], volume);

    // 決まった長さがたったら、お手本の音を止める
    toneTimer = setTimeout(() => {
      stopDrone();

      // 音が小さくなりきって、さらに少したったら、判定を始める
      toneTimer = setTimeout(
        () => {
          toneTimer = null;
          status = "listening";
        },
        (TONE_FADE_SECONDS + AFTER_TONE_SECONDS) * 1000,
      );
    }, TONE_SECONDS * 1000);
  }

  /**
   * マイクで音程を調べるたびに呼ばれる関数（1秒に約60回）
   * 判定しているときだけ、直近0.2秒の中央値でならした高さで、合っているか・外れているかを調べる。
   * @param {number|null} frequency - 周波数（音が小さい・はっきりしないときは null）
   * @param {number} now - 今の時刻（秒）
   */
  function handlePitch(frequency, now) {
    // お手本を鳴らしている間などは、判定しない
    if (status !== "listening") {
      return;
    }

    // 音が聞こえないとき：続いていた「合っている」「外れている」を、どちらも数え直しにする
    // ためた高さも捨てる（弾き直したときに、前の音が混ざらないように）
    if (frequency === null) {
      currentCents = null;
      okSince = null;
      missSince = null;
      recent = [];
      return;
    }

    // 直近の高さに加え、古くなったもの（SMOOTH_SECONDS より前）を捨てる
    recent.push({ time: now, frequency: frequency });
    recent = recent.filter((item) => now - item.time <= SMOOTH_SECONDS);

    // ためた高さの中央値を、判定に使う高さにする
    // （ときどき混ざる1オクターブ上の値は、少数派なので中央値には出てこない）
    const smoothedFrequency = getMedian(recent.map((item) => item.frequency));

    // 目標からのずれ（セント）
    const cents = getScaleCents(smoothedFrequency, targetFrequency);
    currentCents = cents;

    if (Math.abs(cents) <= OK_CENTS) {
      // ----- 合っているとき -----
      missSince = null;
      // 合っている音が続き始めた時刻を覚える（もう覚えていれば、そのまま）
      if (okSince === null) {
        okSince = now;
      }
      // 決まった秒数続いたら、合格
      if (now - okSince >= PASS_SECONDS) {
        passNote();
      }
    } else {
      // ----- 外れているとき -----
      okSince = null;
      // 外れた音が続き始めた時刻を覚える（もう覚えていれば、そのまま）
      if (missSince === null) {
        missSince = now;
      }
      // 決まった秒数続いたら、外れ。お手本を鳴らし直す
      if (now - missSince >= MISS_SECONDS) {
        missNote();
      }
    }
  }

  /**
   * 今の音に合格したときの関数
   * 最後の音なら終わりにし、そうでなければ次の音のお手本を鳴らす。
   */
  function passNote() {
    if (currentIndex >= scale.all.length - 1) {
      finish();
    } else {
      currentIndex = currentIndex + 1;
      playCurrentNote();
    }
  }

  /**
   * 今の音を外したときの関数
   * 外した回数を1増やして、同じ音のお手本をもう一度鳴らす。
   */
  function missNote() {
    // 配列の中身を書き換える（$state の配列は、中身を書き換えても画面に反映される）
    missCounts[currentIndex] = missCounts[currentIndex] + 1;
    playCurrentNote();
  }

  /**
   * 最後の音まで弾けたときの関数
   * かかった時間を記録して、音とマイクを止める。
   */
  function finish() {
    finishedSeconds = performance.now() / 1000 - startTime;
    stopEverything();
    status = "done";
  }

  /**
   * 「止める」を押したときの関数
   * 途中でやめて、最初の状態に戻る。
   */
  function cancel() {
    stopEverything();
    status = "idle";
    currentIndex = 0;
    missCounts = [];
  }

  /**
   * お手本の音・予約・マイクをすべて止める関数
   * 終わったとき・止めたとき・ページを離れるときに呼ぶ。
   */
  function stopEverything() {
    // お手本を止める・判定を始める、の予約を取り消す
    if (toneTimer !== null) {
      clearTimeout(toneTimer);
      toneTimer = null;
    }
    stopDrone();
    stopMicrophone();
    allowScreenOff();
    currentCents = null;
    okSince = null;
    missSince = null;
    recent = [];
  }

  /**
   * 「始める」「止める」ボタンを押したときの関数
   */
  function handleToggle() {
    if (running) {
      cancel();
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
   * ずれ（セント）を、針の横の位置（左端 0% 〜 右端 100%）に直す関数
   * 真ん中（50%）が目標の高さ。はみ出す値は端に貼り付ける。
   * @param {number} cents - ずれ（セント）
   * @returns {number} 横の位置（%）
   */
  function centsToPercent(cents) {
    const clamped = Math.min(Math.max(cents, -METER_CENTS), METER_CENTS);
    return 50 + (clamped / METER_CENTS) * 50;
  }

  /**
   * 秒を、「1分23秒」「45秒」のような文字にする関数
   * @param {number} seconds - 秒
   * @returns {string} 表示用の文字
   */
  function formatDuration(seconds) {
    const total = Math.round(seconds);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return minutes > 0 ? minutes + "分" + rest + "秒" : rest + "秒";
  }

  /**
   * 音の札に付ける CSS のクラス名を返す関数
   * 練習中・結果の表示中に、どの音まで進んだか・どの音を外したかを色で見せる。
   * @param {number} index - 音階の何番目の音か（scale.all の位置）
   * @returns {string} CSS のクラス名（いくつかをスペースでつなげたもの）
   */
  function chipClass(index) {
    const classes = [];
    // 外した音（1回以上）は赤
    if ((missCounts[index] ?? 0) > 0) {
      classes.push("missed");
    }
    if (running) {
      if (index < currentIndex) {
        // もう合格した音
        classes.push("passed");
      } else if (index === currentIndex) {
        // 今弾いている音
        classes.push("current");
      }
    } else if (status === "done") {
      // 結果の表示中は、全部の音が合格済み
      classes.push("passed");
    }
    return classes.join(" ");
  }
</script>

<!-- ページのタイトル・説明文・OGP（リンクを送ったときに出る画像など） -->
<PageMeta
  title="音階｜ビオラ音色練習"
  description="お手本の音を聴きながら、ビオラの音階を1音ずつ合わせて弾く練習ページ。1オクターブ・2オクターブ、長調と短調（自然的・和声的・旋律的）。ピタゴラス音律・ラ＝442Hz。"
  path="/scale"
/>

<!-- ===== ホームへ戻るリンクと見出し ===== -->
<a class="back" href="/">← ホーム</a>
<h1 class="title">音階</h1>
<p class="lead">お手本の音を聴いて、音階を1音ずつ合わせて弾きます。合うと次の音へ進み、外れるとお手本がもう一度鳴ります。</p>

<!-- ===== 調を選ぶ（練習中は変えられない） ===== -->
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

<!-- ===== 短音階の種類を選ぶ（短調を選んでいるときだけ出す） ===== -->
{#if isMinor}
  <section class="row">
    <span class="label">種類</span>
    <div class="field">
      <div class="toggle-group" role="group" aria-label="短音階の種類">
        {#each MINOR_TYPES as type (type.id)}
          <button type="button" class="toggle" aria-pressed={minorTypeId === type.id} disabled={running} onclick={() => (minorTypeId = type.id)}>
            {type.name}
          </button>
        {/each}
      </div>
      <!-- 選んでいる種類の説明（どの音が変わるか） -->
      <p class="hint">{minorType.description}</p>
    </div>
  </section>
{/if}

<!-- ===== オクターブの数を選ぶ ===== -->
<section class="row">
  <span class="label">長さ</span>
  <div class="toggle-group" role="group" aria-label="オクターブの数">
    {#each OCTAVE_COUNTS as count (count)}
      <button type="button" class="toggle" aria-pressed={octaveCount === count} disabled={running} onclick={() => (octaveCount = count)}>
        {count}オクターブ
      </button>
    {/each}
  </div>
</section>

<!-- ===== 音量（お手本の音） ===== -->
<section class="row">
  <label class="label" for="volume">音量</label>
  <div class="field volume-field">
    <input id="volume" class="slider" type="range" min="0" max="100" step="1" bind:value={volume} />
    <span class="volume-value">{volume}</span>
  </div>
</section>

<!-- ===== 今の様子（今弾く音・お手本を鳴らしているか・ずれの針） ===== -->
<div class="now">
  {#if status === "idle"}
    <p class="now-message">調と長さを選んで「始める」を押してください</p>
  {:else if status === "starting"}
    <p class="now-message">マイクを準備しています…</p>
  {:else if status === "done"}
    <!-- ===== 結果 ===== -->
    <p class="done-title">できました！</p>
    <p class="done-line">かかった時間：{formatDuration(finishedSeconds)}</p>
    <p class="done-line">鳴らし直した回数：{totalMisses}回</p>
    {#if missedItems.length > 0}
      <p class="done-line">
        外した音：
        {#each missedItems as entry (entry.index)}
          <span class="missed-note">{scaleNoteToText(entry.item.note)} ×{entry.count}</span>
        {/each}
      </p>
    {:else}
      <p class="done-line">外した音：なし</p>
    {/if}
  {:else}
    <!-- ===== 練習中（お手本を鳴らしている・聴いている） ===== -->
    <div class="now-row">
      <!-- 今弾く音と、何音目か -->
      <span class="now-target">{scaleNoteToText(currentItem.note)}</span>
      <span class="now-progress">{currentIndex + 1} / {scale.all.length}</span>
    </div>

    <!-- 今の段階の案内 -->
    <p class="now-state">
      {#if status === "playing"}
        ♪ お手本を鳴らしています
      {:else}
        弾いてください
      {/if}
    </p>

    <!-- ずれの針（真ん中が目標、緑の帯が合っている範囲、左が低い・右が高い） -->
    <div class="meter" aria-hidden="true">
      <!-- 合っている範囲（±10セント）の緑の帯 -->
      <div class="meter-ok" style="left: {centsToPercent(-OK_CENTS)}%; width: {centsToPercent(OK_CENTS) - centsToPercent(-OK_CENTS)}%"></div>
      <!-- 真ん中（目標）の線 -->
      <div class="meter-center"></div>
      <!-- 針（聞こえているときだけ） -->
      {#if currentCents !== null}
        <div class="meter-needle {centsClass(currentCents)}" style="left: {centsToPercent(currentCents)}%"></div>
      {/if}
    </div>
    <div class="meter-labels">
      <span>低い</span>
      <span class="now-cents {centsClass(currentCents)}">{currentCents !== null ? formatCents(currentCents) : "−−"}</span>
      <span>高い</span>
    </div>
  {/if}
</div>

<!-- ===== 始める・止めるボタン ===== -->
<button type="button" class="play" class:playing={running} onclick={handleToggle}>
  {running ? "■ 止める" : status === "done" ? "▶ もう一度" : "▶ 始める"}
</button>

<!-- マイクが使えなかったときのメッセージ -->
{#if errorMessage}
  <p class="error">{errorMessage}</p>
{/if}

<!-- ===== 音階の音の一覧（上り・下り） ===== -->
<!-- 短音階で半音上げた音は紫の太字。練習中は、合格した音を緑、今の音を紫の背景、外した音を赤にする -->
<section class="scale-box">
  <div class="scale-line">
    <span class="scale-label">上り</span>
    <ol class="notes">
      {#each scale.ascending as item, index (index)}
        <li class="chip {chipClass(index)}" class:raised={item.raised}>
          {scaleNoteToText(item.note)}
          <!-- 外した回数（1回以上のときだけ） -->
          {#if (missCounts[index] ?? 0) > 0}
            <span class="miss-count">×{missCounts[index]}</span>
          {/if}
        </li>
      {/each}
    </ol>
  </div>
  <div class="scale-line">
    <span class="scale-label">下り</span>
    <ol class="notes">
      <!-- 下りの音は、scale.all の中では上りの音のあとに並んでいるので、位置は「上りの数＋index」になる -->
      {#each scale.descending as item, index (index)}
        {@const allIndex = scale.ascending.length + index}
        <li class="chip {chipClass(allIndex)}" class:raised={item.raised}>
          {scaleNoteToText(item.note)}
          {#if (missCounts[allIndex] ?? 0) > 0}
            <span class="miss-count">×{missCounts[allIndex]}</span>
          {/if}
        </li>
      {/each}
    </ol>
  </div>
  <!-- 全部でいくつの音を弾くか -->
  <p class="count">全部で {scale.all.length} 音</p>
</section>

<!-- iPhone の消音モード（横のスイッチ）がオンだと、ブラウザの音が出ないことがあるので、その案内（ドローンと同じ） -->
<p class="note">iPhone でお手本の音が出ないときは、消音モードを解除してから、ページを開き直してください。</p>

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

  /* 練習中で押せないボタンは、少し薄くする */
  .toggle:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* 短音階の種類の説明 */
  .hint {
    margin: 4px 0 0;
    font-size: 0.8rem;
    color: var(--text-sub);
  }

  /* ----- 音量のつまみ ----- */
  .volume-field {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 6px;
  }

  .slider {
    flex: 1;
    /* つまみの色をアクセントの紫にする */
    accent-color: var(--accent);
  }

  .volume-value {
    /* 数字の幅をそろえて、数字が変わってもつまみの長さが変わらないようにする */
    width: 2.5em;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--text-sub);
  }

  /* ----- 今の様子 ----- */
  .now {
    /* 中身が変わっても高さがあまり変わらないように、最低の高さを決めておく */
    min-height: 120px;
    margin: 8px 0 12px;
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

  /* 今弾く音（大きく） */
  .now-target {
    font-size: 2rem;
    font-weight: bold;
    color: var(--accent);
  }

  /* 何音目か */
  .now-progress {
    font-size: 0.95rem;
    color: var(--text-sub);
    font-variant-numeric: tabular-nums;
  }

  /* 「お手本を鳴らしています」「弾いてください」 */
  .now-state {
    margin: 0 0 8px;
    font-size: 0.9rem;
    color: var(--text-sub);
  }

  /* ----- ずれの針 ----- */
  .meter {
    position: relative;
    height: 24px;
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

  /* 真ん中（目標）の線 */
  .meter-center {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 1px;
    background: var(--ok);
  }

  /* 針（色はずれに合わせて、下の .ok・.high・.low で変わる） */
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
    font-size: 1.3rem;
    font-weight: bold;
    /* 数字の幅をそろえて、数字が変わってもガタガタしないようにする */
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

  /* ----- 結果 ----- */
  .done-title {
    margin: 0 0 4px;
    font-size: 1.4rem;
    font-weight: bold;
    color: var(--ok);
    text-align: center;
  }

  .done-line {
    margin: 2px 0 0;
    font-size: 0.95rem;
  }

  /* 外した音（赤） */
  .missed-note {
    display: inline-block;
    margin-right: 8px;
    color: #d64545;
    font-weight: bold;
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

  /* 練習中は、白地に紫の文字にして「止める」ボタンだと分かるようにする */
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

  /* ----- 音階の音の一覧 ----- */
  .scale-box {
    margin: 16px 0 12px;
    padding: 12px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
  }

  /* 「上り」「下り」の1行 */
  .scale-line {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 8px;
  }

  .scale-label {
    /* 「上り」「下り」の幅をそろえる */
    flex: 0 0 2.5em;
    padding-top: 2px;
    font-size: 0.85rem;
    color: var(--text-sub);
  }

  /* 音の札を並べる（入りきらないときは折り返す） */
  .notes {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    /* 番号付きの箇条書きの番号と余白を消す */
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* 1つの音の札 */
  .chip {
    padding: 1px 6px;
    font-size: 0.9rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
  }

  /* 短音階で半音上げた音（紫の太字） */
  .chip.raised {
    color: var(--accent);
    border-color: var(--accent);
    font-weight: bold;
  }

  /* もう合格した音（緑の枠と薄い緑の背景） */
  .chip.passed {
    border-color: var(--ok);
    background: var(--ok-light);
  }

  /* 今弾いている音（紫の背景に白い文字） */
  .chip.current {
    background: var(--accent);
    border-color: var(--accent);
    color: #ffffff;
  }

  /* 外した音（赤い文字。合格したあとも赤のまま残す） */
  .chip.missed {
    color: #d64545;
    font-weight: bold;
  }

  /* 今弾いている音を外したときは、紫の背景の上なので白い文字のままにする */
  .chip.current.missed {
    color: #ffffff;
  }

  /* 外した回数の小さな数字 */
  .miss-count {
    font-size: 0.75rem;
  }

  /* 全部で何音か */
  .count {
    margin: 4px 0 0;
    font-size: 0.8rem;
    color: var(--text-sub);
    text-align: right;
  }

  /* ----- iPhone の消音モードの案内 ----- */
  .note {
    margin: 12px 0 0;
    font-size: 0.8rem;
    color: var(--text-sub);
  }
</style>
