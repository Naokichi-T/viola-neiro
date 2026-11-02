<script>
  // ===== ドローンの使い方のページ =====
  // うなりとは何か・設定のしかた・練習の順番・「この調の音の合わせ方」の表の見方などを説明する。
  // うなりのイメージ図は、計算で波の線を作って SVG で描く。

  // ページのタイトル・説明文・OGP をまとめて出す部品
  import PageMeta from "#lib/PageMeta.svelte";

  // ===== うなりの図の設定値 =====

  // 図の大きさ（SVG の座標）
  const WAVE_WIDTH = 300;
  const WAVE_HEIGHT = 50;

  // 図の横幅が何秒ぶんか
  const WAVE_SECONDS = 2;

  // 図の中の波（音そのもの）の細かさ（2秒で何回振動するように描くか。実際の音よりずっと少なくして見やすくする）
  const WAVE_CYCLES = 60;

  // 図の3つの段（うなりの速さ）
  //   label   ：段の名前
  //   beatsPerSecond：1秒に何回うねるか（0 はうねらない）
  const WAVE_ROWS = [
    { label: "ずれが大きい：速くうねる", beatsPerSecond: 3 },
    { label: "近い：ゆっくりうねる", beatsPerSecond: 1 },
    { label: "ぴったり：うねらない", beatsPerSecond: 0 },
  ];

  /**
   * うなりのイメージの波の線（SVG の path）を作る関数
   * 細かい波（音）の大きさが、うなりの速さで大きくなったり小さくなったりする様子を描く。
   * @param {number} beatsPerSecond - 1秒に何回うねるか（0 はうねらない）
   * @returns {string} path の d 属性の文字
   */
  function makeWavePath(beatsPerSecond) {
    // 線を細かく区切るほど、なめらかな波になる
    const steps = 900;
    const middle = WAVE_HEIGHT / 2;
    const maxAmplitude = WAVE_HEIGHT / 2 - 3;
    let path = "";

    for (let i = 0; i <= steps; i++) {
      // 0〜2秒の、どの時刻か
      const time = (i / steps) * WAVE_SECONDS;

      // 波の大きさ：うねるときは、1秒に beatsPerSecond 回、大きくなったり小さくなったりする
      const envelope = beatsPerSecond > 0 ? Math.abs(Math.cos(Math.PI * beatsPerSecond * time)) : 1;

      // 細かい波（音そのもの）
      const value = Math.sin(2 * Math.PI * (WAVE_CYCLES / WAVE_SECONDS) * time);

      const x = (i / steps) * WAVE_WIDTH;
      const y = middle - value * envelope * maxAmplitude;
      path += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1) + " ";
    }

    return path;
  }
</script>

<!-- ページのタイトル・説明文・OGP（リンクを送ったときに出る画像など） -->
<PageMeta
  title="ドローンの使い方｜ビオラ音色練習"
  description="ドローン（持続音）を使ったビオラの音程練習のしかた。うなりの聞き方、設定、練習の順番、調ごとの音の合わせ方の表の見方を説明します。"
  path="/drone/guide"
/>

<!-- ===== ドローンへ戻るリンクと見出し ===== -->
<a class="back" href="/drone">← ドローンに戻る</a>
<h1 class="title">ドローンの使い方</h1>

<!-- ===== うなりとは ===== -->
<section class="section">
  <h2>ドローンで何が分かるの？</h2>
  <p>
    2つの音を同時に鳴らすと、高さが少しずれているときは「ワンワン」「ウォンウォン」と音がうねって聞こえます。これを<strong>うなり</strong>といいます。
  </p>
  <ul>
    <li>ずれが大きいほど、うなりは<strong>速く</strong>なる</li>
    <li>近づくほど<strong>ゆっくり</strong>になる</li>
    <li>ぴったり合うと、<strong>うなりが消えて</strong>、音がすっと澄んで響く</li>
  </ul>

  <!-- うなりのイメージ図 -->
  <div class="waves" aria-label="うなりのイメージ図" role="img">
    {#each WAVE_ROWS as row (row.label)}
      <p class="wave-label">{row.label}</p>
      <svg class="wave" viewBox="0 0 {WAVE_WIDTH} {WAVE_HEIGHT}" aria-hidden="true">
        <path d={makeWavePath(row.beatsPerSecond)} />
      </svg>
    {/each}
  </div>

  <p>
    ドローンは、このうなりを「物差し」にして、<strong>メーターを見ずに耳で音程を合わせる練習</strong
    >です。チューナーは「今どれだけずれているか」を目で教えてくれますが、ドローンは「合っている響き」そのものを耳に覚えさせてくれます。
  </p>
</section>

<!-- ===== 設定のしかた ===== -->
<section class="section">
  <h2>設定のしかた</h2>
  <ul>
    <li><strong>調</strong>：練習する曲や音階の調にする（例：ニ長調の音階なら「ニ長調」）</li>
    <li><strong>鳴らす音</strong>：最初は「主音」だけ。慣れたら「主音＋5度」も</li>
    <li>
      <strong>高さ</strong>：「低い」がおすすめ。自分の音とぶつかりにくく、うなりが聞き取りやすい
    </li>
    <li>
      <strong>音量</strong>：自分の音と同じくらいか、少し小さめ。消音器を付けているなら、かなり小さめ（20〜40くらい）から。ドローンが大きすぎると、自分の音が聞こえなくなります
    </li>
  </ul>
</section>

<!-- ===== 練習の順番 ===== -->
<section class="section">
  <h2>練習の順番</h2>
  <ol>
    <li>
      <strong>開放弦で「合っている響き」を知る</strong
      >：たとえばニ長調で主音（レ）を鳴らし、D線の開放弦を弾く。調弦が合っていれば、うなりのない澄んだ響きになります。このアプリのドローンはピタゴラス音律なので、開放弦（ド・ソ・レ・ラ）とはぴったり合う高さです。ハ長調なら、主音（ド）を鳴らして C線の開放弦で同じように確かめられます
    </li>
    <li>
      <strong>同じ音・オクターブを指で合わせる</strong>：同じくレのドローンで、A線の3の指のレ（オクターブ上）を弾き、指を少し上下に動かして、うなりが消える場所を探す
    </li>
    <li>
      <strong>よく響く音から順に</strong>：ドローンのページの「この調の音の合わせ方」の表で、<span class="dot dot-clear">●</span>の音から合わせていく
    </li>
    <li>
      <strong>音階をゆっくり</strong>：1つの音を4拍くらいずつのばして、1音ずつ響きを確かめながら上がっていく。合わない音があったら、そこで止まって指を動かして合う場所を探す
    </li>
    <li>
      <strong>曲で使う</strong>：曲の調の主音を鳴らしながら、ゆっくり弾く。特にのばす音で、響きが澄んでいるかを確かめる
    </li>
  </ol>
</section>

<!-- ===== 表の見方 ===== -->
<section class="section">
  <h2>「この調の音の合わせ方」の表の見方</h2>

  <h3>うなりの印</h3>
  <ul>
    <li><span class="dot dot-clear">●</span><strong>はっきり消える</strong>：同じ音・5度・4度</li>
    <li>
      <span class="dot dot-soft">●</span><strong>消えるが、聞き分けにくい</strong>：3度・6度。合うと、やわらかく甘く響く
    </li>
    <li>
      <span class="dot dot-none">○</span><strong>消えない</strong>：2度・7度。いつも少しざらざらするので、主音のドローンだけでは合っているかを耳で判断しにくい
    </li>
  </ul>

  <h3>なぜ、うなりが消える音と消えない音があるの？（倍音のこと）</h3>
  <p>
    楽器の音には、鳴らしている高さ（基音）のほかに、その2倍・3倍・4倍…の高さの音が少しずつ混ざっています。これを<strong>倍音</strong>といいます。
  </p>
  <p>
    2つの音の倍音どうしが同じ高さで重なると、ぴったり合ったときにうなりが消えます。同じ音・オクターブ・5度・4度は、低いほうの倍音（2倍・3倍・4倍）で重なるので、はっきり分かります。3度・6度は、もっと上の倍音（5倍・6倍）で重なるので、うなりが小さく、少し聞き分けにくくなります。2度・7度は、重なる倍音がとても上の小さいところにしかないので、うなりが消える感じがほとんど分かりません。
  </p>

  <h3>2度・7度は「主音＋5度」で合わせる</h3>
  <p>
    主音で合わせにくい音は、「主音＋5度」にして、<strong>5度の音を相手に</strong>合わせます。たとえばニ長調なら5度の音はラなので、
  </p>
  <ul>
    <li>ミ（2度）は、ラから見ると<strong>5度</strong> → はっきり合わせられる</li>
    <li>ド♯（7度）は、ラから見ると<strong>3度</strong> → 合わせられる</li>
  </ul>
  <p>表の「合わせ方」には、調ごとに、どの音と合わせればよいかが書いてあります。</p>

  <h3>チューナーの目安</h3>
  <p>うなりが消える高さ（純正律の高さ）を、ふつうのチューナー（平均律・ラ＝442Hz）で見たときに、何セントずれて見えるかの目安です。マイナスはチューナーより低め、プラスは高めです。</p>
</section>

<!-- ===== 長3度はチューナーより低め ===== -->
<section class="section">
  <h2>長3度は「チューナーより低め」が合う</h2>
  <p>
    たとえばニ長調のファ♯（主音から長3度）は、ドローンに合わせてうなりを消すと、ふつうのチューナーより<strong>15セントくらい低い</strong
    >ところで落ち着きます。これが和音がきれいに響く高さ（純正律）です。
  </p>
  <p>
    なので、ドローンで練習すると「チューナーではちょっと低いのに、響きはきれい」ということが起こります。間違いではなく、耳が響きの合う高さを見つけた、ということです。反対に、短調の短3度は、チューナーより少し高めで合います。
  </p>
</section>

<!-- ===== ほかの機能と組み合わせる ===== -->
<section class="section">
  <h2>ほかの練習と組み合わせる</h2>
  <ul>
    <li>
      ドローンで合わせた音を、<a href="/longtone">ロングトーン</a>の「自由」でのばして、ずれを数字で確かめる
    </li>
    <li>
      ドローンで音階を弾いているところを<a href="/record">録音</a>し、音律を「純正律」・調を同じにして見ると、3度や6度が純正律の高さに近づいているかがグラフで分かる
    </li>
  </ul>
</section>

<!-- ===== 1日の目安 ===== -->
<section class="section">
  <h2>1日の目安</h2>
  <p>
    最初は1日5分くらいで十分です。「開放弦 → オクターブ →
    音階を1回ゆっくり」くらいから始めて、うなりが聞き分けられるようになってきたら、曲に広げていきましょう。うなりは、はじめは聞き取りにくいですが、続けているとだんだん分かるようになります。
  </p>
</section>

<a class="back-button" href="/drone">ドローンに戻る</a>

<style>
  /* ----- 戻るリンクと見出し ----- */
  .back {
    display: inline-block;
    margin-bottom: 8px;
    color: var(--accent);
    text-decoration: none;
    font-size: 0.95rem;
  }

  .title {
    margin: 0 0 16px;
    font-size: 1.5rem;
  }

  /* ----- それぞれの説明のまとまり ----- */
  .section {
    margin-bottom: 24px;
  }

  .section h2 {
    margin: 0 0 8px;
    padding-left: 8px;
    /* 左に紫の線を引いて、見出しを目立たせる */
    border-left: 4px solid var(--accent);
    font-size: 1.1rem;
  }

  .section h3 {
    margin: 16px 0 4px;
    font-size: 1rem;
  }

  .section p,
  .section li {
    font-size: 0.95rem;
  }

  .section p {
    margin: 0 0 8px;
  }

  .section ul,
  .section ol {
    margin: 0 0 8px;
    padding-left: 1.4em;
  }

  .section li {
    margin-bottom: 4px;
  }

  .section a {
    color: var(--accent);
  }

  /* ----- うなりのイメージ図 ----- */
  .waves {
    margin: 12px 0;
    padding: 8px 12px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
  }

  .wave-label {
    margin: 4px 0 0;
    font-size: 0.8rem;
    color: var(--text-sub);
  }

  .wave {
    display: block;
    width: 100%;
    height: auto;
  }

  .wave path {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1;
  }

  /* ----- うなりの消えやすさの印（ドローンのページの表と同じ色） ----- */
  .dot {
    margin-right: 4px;
  }

  .dot-clear {
    color: var(--ok);
  }

  .dot-soft {
    color: #e0a12f;
  }

  .dot-none {
    color: #9a9a9a;
  }

  /* ----- 一番下の戻るボタン ----- */
  .back-button {
    display: block;
    padding: 12px;
    text-align: center;
    text-decoration: none;
    border: 1px solid var(--accent);
    border-radius: 10px;
    color: var(--accent);
    background: var(--card-bg);
  }
</style>
