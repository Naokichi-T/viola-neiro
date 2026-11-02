<script>
  // ===== ページの説明（タイトル・説明文・OGP）をまとめて出す部品 =====
  // 各ページの <head> に、次のものを入れる。
  //   ・title         ：ブラウザのタブや検索結果に出るページの名前
  //   ・description   ：検索結果などに出る、ページの説明文
  //   ・canonical     ：このページの正しい URL（検索エンジンに伝える）
  //   ・OGP（og:〜）  ：LINE や SNS でリンクを送ったときに出る、タイトル・説明・画像
  //   ・twitter:card  ：X（Twitter）で、画像を大きく出す指定
  // どのページも同じ形なので、部品にして使い回す。

  // アプリの公開している場所（OGP の画像や URL は、https から始まる完全な形で書く決まりがあるため）
  const SITE_URL = "https://viola-neiro.vercel.app";

  // アプリの名前（OGP の site_name に使う）
  const SITE_NAME = "ビオラ音色練習";

  // ===== 受け取る値 =====
  //   title       ：ページの名前（例：'ドローン｜ビオラ音色練習'）
  //   description ：ページの説明文
  //   path        ：ページの場所（例：'/drone'。ホームは '/'）
  let { title, description, path } = $props();

  // このページの完全な URL
  const url = $derived(SITE_URL + path);
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={url} />

  <!-- OGP（リンクを送ったときに出る、タイトル・説明・画像） -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content={SITE_NAME} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={url} />
  <meta property="og:image" content={SITE_URL + "/og-image.png"} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="ja_JP" />

  <!-- X（Twitter）で、画像を大きく出す -->
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>
