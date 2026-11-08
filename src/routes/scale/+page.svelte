<script>
  // ===== 音階練習のページ =====
  // 調とオクターブの数を選んで、音階を1音ずつ弾いて合わせる練習。
  //
  // 【ステップ1】このステップでは、選んだ音階の音（上り・下り）を一覧で見せるところまで。
  //   お手本の音を鳴らす・マイクで聴いて合っているかを判定する、はステップ2で足す。

  // ページのタイトル・説明文・OGP をまとめて出す部品
  import PageMeta from "#lib/PageMeta.svelte";

  import { onMount } from "svelte";

  // 調の一覧と、調に関する関数
  import { KEYS, getKey, getKeyMenuLabel } from "#lib/key.js";

  // 音階の音を作る関数と、短音階の種類・オクターブの数の一覧
  import { MINOR_TYPES, OCTAVE_COUNTS, getMinorType, buildScale, scaleNoteToText } from "#lib/scale.js";

  // 設定の保存・読み込み
  import { DEFAULT_SCALE_SETTINGS, loadScaleSettings, saveScaleSettings } from "#lib/scaleSettings.js";

  // ===== 画面で選ぶ値 =====

  // 選んでいる調の id
  let keyId = $state(DEFAULT_SCALE_SETTINGS.keyId);

  // 短音階の種類の id（短調を選んでいるときだけ使う）
  let minorTypeId = $state(DEFAULT_SCALE_SETTINGS.minorTypeId);

  // オクターブの数（1 か 2）
  let octaveCount = $state(DEFAULT_SCALE_SETTINGS.octaveCount);

  // 保存しておいた設定を読み込み終わったかどうか
  // （読み込む前の最初の値で、保存を上書きしてしまわないようにするため）
  let loaded = $state(false);

  // ===== 選んだ値から計算する値 =====

  // 選んでいる調のデータ
  const key = $derived(getKey(keyId));

  // 短調を選んでいるかどうか（短音階の種類を選ぶボタンを出すかどうかに使う）
  const isMinor = $derived(key.mode === "minor");

  // 選んでいる短音階の種類のデータ（説明文の表示に使う）
  const minorType = $derived(getMinorType(minorTypeId));

  // 音階の音（上り・下り・全部）
  const scale = $derived(buildScale(key, minorTypeId, octaveCount));

  // ===== 起動 =====

  onMount(() => {
    // 保存しておいた設定を読み込んで、画面に反映する
    const saved = loadScaleSettings();
    keyId = saved.keyId;
    minorTypeId = saved.minorTypeId;
    octaveCount = saved.octaveCount;
    loaded = true;
  });

  // ===== 値が変わったときの処理 =====

  // 設定が変わったら、ブラウザに保存する
  $effect(() => {
    // 中で使う値を先に読んで、どれが変わってもこの処理が呼ばれるようにする
    const settings = { keyId, minorTypeId, octaveCount };

    // 読み込みが終わるまでは保存しない（最初の値で上書きしないため）
    if (loaded) {
      saveScaleSettings(settings);
    }
  });
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
<p class="lead">お手本の音を聴いて、音階を1音ずつ合わせて弾きます。合うと次の音へ進みます。</p>

<!-- ===== 調を選ぶ ===== -->
<section class="row">
  <label class="label" for="key-select">調</label>
  <div class="field">
    <select id="key-select" class="select" bind:value={keyId}>
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
          <button type="button" class="toggle" aria-pressed={minorTypeId === type.id} onclick={() => (minorTypeId = type.id)}>
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
      <button type="button" class="toggle" aria-pressed={octaveCount === count} onclick={() => (octaveCount = count)}>
        {count}オクターブ
      </button>
    {/each}
  </div>
</section>

<!-- ===== 音階の音の一覧（上り・下り） ===== -->
<!-- 短音階で、調号から半音上げた音は、紫の太字にして目立たせる -->
<section class="scale-box">
  <div class="scale-line">
    <span class="scale-label">上り</span>
    <ol class="notes">
      {#each scale.ascending as item, index (index)}
        <li class="chip" class:raised={item.raised}>{scaleNoteToText(item.note)}</li>
      {/each}
    </ol>
  </div>
  <div class="scale-line">
    <span class="scale-label">下り</span>
    <ol class="notes">
      {#each scale.descending as item, index (index)}
        <li class="chip" class:raised={item.raised}>{scaleNoteToText(item.note)}</li>
      {/each}
    </ol>
  </div>
  <!-- 全部でいくつの音を弾くか -->
  <p class="count">全部で {scale.all.length} 音</p>
</section>

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

  /* 短音階の種類の説明 */
  .hint {
    margin: 4px 0 0;
    font-size: 0.8rem;
    color: var(--text-sub);
  }

  /* ----- 音階の音の一覧 ----- */
  .scale-box {
    margin: 8px 0 20px;
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

  /* 全部で何音か */
  .count {
    margin: 4px 0 0;
    font-size: 0.8rem;
    color: var(--text-sub);
    text-align: right;
  }
</style>
