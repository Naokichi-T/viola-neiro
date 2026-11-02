<script>
  // ===== すべてのページで共通のレイアウト =====
  // ここに書いた見た目（色・文字の大きさなど）は、どのページにも効く

  // ファビコン（ブラウザのタブに出る小さな絵）。紫の丸に、音符とビブラートのような音の波（バイオリン版は緑）
  // SvelteKit 3 からは、src/lib の中のファイルを $lib ではなく #lib で読み込む
  // （#lib は package.json の "imports" で src/lib を指すように決めてある）
  import favicon from "#lib/assets/favicon.svg";

  // このレイアウトの中に表示する、各ページの中身
  let { children } = $props();
</script>

<svelte:head>
  <!-- ファビコンの指定 -->
  <link rel="icon" href={favicon} type="image/svg+xml" />
  <!-- iPhone などで「ホーム画面に追加」したときのアイコン（static フォルダの apple-touch-icon.png、180×180） -->
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
</svelte:head>

<!-- 各ページの中身を、共通の枠（main）の中に表示する -->
<main class="app">
  {@render children()}
</main>

<style>
  /* ===== アプリ全体で使う色などの値 =====
	   :root に置いておくと、どのページからでも var(--accent) のように使える */
  :global(:root) {
    /* アクセントの色（紫）。ボタンやカードの左の線などに使う
       （バイオリン版は緑。ビオラ音程チェックと同じく、ビオラ版は紫にして見分けられるようにする） */
    --accent: #7b4fb5;
    /* アクセントの色を薄くしたもの（背景用） */
    --accent-light: #f1ebf8;
    /* 「合っている」ことを表す色（緑）。
       ずれの色は「高い＝赤・低い＝青」なので、合っている色まで紫にすると赤と青の間の色で紛らわしい。
       そこで、アクセントが紫になっても「合っている」はバイオリン版と同じ緑のままにする */
    --ok: #2e9e6a;
    /* 「合っている」色を薄くしたもの（グラフの ±5セントの帯など） */
    --ok-light: #e6f5ee;
    /* ふつうの文字の色 */
    --text: #222222;
    /* 説明文など、少し薄い文字の色 */
    --text-sub: #666666;
    /* ページの背景の色 */
    --bg: #f7f8f7;
    /* カードの背景の色 */
    --card-bg: #ffffff;
    /* 枠線の色 */
    --border: #dddddd;
    /* 「準備中」など、使えないものの色 */
    --disabled: #b5b5b5;
  }

  /* ページ全体の基本の見た目 */
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    /* 日本語が読みやすいフォントを、端末にあるものから順に使う */
    font-family:
      system-ui,
      -apple-system,
      "Hiragino Sans",
      "Noto Sans JP",
      sans-serif;
    /* 行の間を少し広げて読みやすくする */
    line-height: 1.6;
  }

  /* 各ページを入れる共通の枠 */
  .app {
    /* PC で横に広がりすぎないように、幅の上限を決めて真ん中に寄せる */
    max-width: 480px;
    margin: 0 auto;
    /* スマホで左右がくっつかないように、まわりに余白を取る */
    padding: 24px 16px 40px;
    /* 余白を含めて幅を計算する（はみ出し防止） */
    box-sizing: border-box;
  }
</style>
