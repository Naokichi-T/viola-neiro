<script>
  // ===== ホーム（トップページ） =====
  // アプリの名前と、3つの練習（ドローン・ロングトーン・録音）のカードを並べる
  // いちばん下に、姉妹アプリ（バイオリン版）へのリンクを出す

  // ページのタイトル・説明文・OGP をまとめて出す部品
  import PageMeta from "#lib/PageMeta.svelte";

  // 姉妹アプリ（バイオリン版）の場所。ページの下にリンクを出す
  // （ビオラ音程チェックと同じく、リンクはビオラ版 → バイオリン版の向きだけにする）
  const VIOLIN_APP_URL = "https://violin-neiro.vercel.app";

  // 3つの練習の一覧
  //   path        ：押したときに開くページの場所
  //   title       ：カードの見出し
  //   description ：カードの説明文
  //   ready       ：もう使えるかどうか（false のあいだは「準備中」で押せない）
  //                 ページができたら、ここを true に変えるだけでカードが押せるようになる
  const practices = [
    {
      path: "/drone",
      title: "ドローン",
      description: "主音を鳴らし続けて、響きで音程を合わせる",
      ready: true,
    },
    {
      path: "/longtone",
      title: "ロングトーン・ビブラート",
      description: "長く伸ばした音のぶれや、ビブラートの揺れを測る",
      ready: true,
    },
    {
      path: "/record",
      title: "録音して聴き返す",
      description: "録音と音程のグラフで振り返る",
      ready: true,
    },
  ];
</script>

<!-- ページのタイトル・説明文・OGP（リンクを送ったときに出る画像など） -->
<PageMeta
  title="ビオラ音色練習"
  description="ドローン・ロングトーン・ビブラート・録音で、自分のビオラの音をじっくり聴いて練習する無料のWebアプリ。C線の低い音まで、音程のずれをグラフと点数で確かめられます。"
  path="/"
/>

<!-- ===== アプリの名前 ===== -->
<header class="header">
  <h1 class="title">ビオラ音色練習</h1>
  <p class="subtitle">自分の音をじっくり聴く練習</p>
</header>

<!-- ===== 練習のカードの一覧 ===== -->
<ul class="cards">
  {#each practices as practice (practice.path)}
    <li>
      {#if practice.ready}
        <!-- 使える練習：押すとそのページへ移る -->
        <a class="card" href={practice.path}>
          <span class="card-title">{practice.title}</span>
          <span class="card-description">{practice.description}</span>
        </a>
      {:else}
        <!-- 準備中の練習：グレーにして、押しても何も起きない -->
        <!-- aria-disabled は、読み上げ機能などに「使えない」ことを伝えるための印 -->
        <div class="card card-disabled" aria-disabled="true">
          <span class="card-title">
            {practice.title}
            <span class="badge">準備中</span>
          </span>
          <span class="card-description">{practice.description}</span>
        </div>
      {/if}
    </li>
  {/each}
</ul>

<!-- ===== 姉妹アプリへのリンク（バイオリン版） ===== -->
<!-- 別のサイトなので、新しいタブで開く（rel="noopener" は、開いた先から元のページを操作されないようにするための決まり文句） -->
<p class="sister">
  <a href={VIOLIN_APP_URL} target="_blank" rel="noopener">バイオリン版（バイオリン音色練習）はこちら</a>
</p>

<style>
  /* ----- アプリの名前の部分 ----- */
  .header {
    margin-bottom: 24px;
  }

  .title {
    margin: 0;
    font-size: 1.6rem;
    /* アクセントの紫で、アプリの名前を目立たせる */
    color: var(--accent);
  }

  .subtitle {
    margin: 4px 0 0;
    color: var(--text-sub);
    font-size: 0.95rem;
  }

  /* ----- カードの一覧 ----- */
  .cards {
    /* 箇条書きの点と余白を消す */
    list-style: none;
    margin: 0;
    padding: 0;
    /* カードを縦に並べ、間を空ける */
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* ----- 1枚のカード ----- */
  .card {
    /* 見出しと説明文を縦に並べる */
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    /* 左側にアクセントの紫の太い線を引いて、練習のカードらしくする */
    border-left: 6px solid var(--accent);
    border-radius: 10px;
    /* リンクの下線と青い文字を消す */
    text-decoration: none;
    color: var(--text);
  }

  /* 使えるカードを押したときに、少し色を変えて押した感じを出す */
  a.card:active {
    background: var(--accent-light);
  }

  .card-title {
    font-size: 1.15rem;
    font-weight: bold;
    /* 見出しと「準備中」の札を横に並べる */
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .card-description {
    font-size: 0.9rem;
    color: var(--text-sub);
  }

  /* ----- 準備中のカード ----- */
  .card-disabled {
    /* 左の線と文字をグレーにして、使えないことが分かるようにする */
    border-left-color: var(--disabled);
    color: var(--disabled);
    /* 指を乗せても「押せる」形のカーソルにしない */
    cursor: default;
  }

  .card-disabled .card-description {
    color: var(--disabled);
  }

  /* ----- 姉妹アプリへのリンク ----- */
  .sister {
    margin: 28px 0 0;
    text-align: center;
    font-size: 0.9rem;
  }

  .sister a {
    color: var(--text-sub);
  }

  /* 「準備中」の小さな札 */
  .badge {
    font-size: 0.75rem;
    font-weight: normal;
    padding: 1px 8px;
    border: 1px solid var(--disabled);
    border-radius: 999px;
  }
</style>
