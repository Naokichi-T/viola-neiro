<script>
  // ===== 録音のずれのグラフ（部品） =====
  // 一番近い音からのずれを線で描き、音名の札と、音の切れ目の点線を付ける。
  // 今の録音と前の録音の両方で使う。横幅（width）を同じにして渡すと、同じ秒数が縦にそろう。
  // 縦の目盛りの数字は左に固定し、グラフ本体だけが横にスクロールする。

  import { GAP_SECONDS, PX_PER_SECOND } from "#lib/recordGraph.js";

  // ===== 受け取る値 =====
  //   points        ：グラフの点（analyzeSamples の結果）
  //   labels        ：音名の札（makeNoteLabels の結果）
  //   beatLines     ：拍の線（makeBeatLines の結果）。出さないときは空の配列
  //   duration      ：この録音の長さ（秒）。時刻の数字をどこまで出すかに使う
  //   width         ：グラフ本体の横幅（px）
  //   cursorTime    ：再生している位置（秒）。縦線を出さないときは null
  //   onseek        ：グラフを押したときに呼ぶ関数（押した場所の秒を渡す）。押せないときは null
  //   onscroll      ：横にスクロールしたときに呼ぶ関数（上下のグラフのスクロールを連動させるため）
  //   scroller      ：横スクロールの枠（呼び出し元からスクロール位置を動かせるように、受け渡しする）
  //   scrollerWidth ：横スクロールの枠の幅（px）（呼び出し元でグラフの横幅を決めるのに使う）
  let { points, labels, beatLines = [], duration, width, cursorTime = null, onseek = null, onscroll = null, scroller = $bindable(null), scrollerWidth = $bindable(0) } = $props();

  // ===== 設定値 =====

  // これ以内のずれなら「合っている」とみなす（うすい緑の帯）幅（セント）
  const OK_CENTS = 5;

  // グラフの縦の目盛りの上限・下限（セント）。はみ出したら端に貼り付ける
  const GRAPH_CENTS = 50;

  // グラフの高さと、線を描く範囲（SVG の座標）
  const GRAPH_HEIGHT = 200;
  const PLOT_TOP = 28;
  const PLOT_BOTTOM = 184;

  // 縦の目盛りの数字を出す、左の欄の幅（px）
  const AXIS_WIDTH = 40;

  // 縦の目盛り（セント）
  const Y_TICKS = [50, 25, 0, -25, -50];

  // ===== 計算する値 =====

  // グラフの線
  const graphPath = $derived(makeGraphPath(points));

  // 5秒ごとの時刻の目盛り（秒）
  const ticks = $derived.by(() => {
    const list = [];
    for (let t = 0; t <= duration; t += 5) {
      list.push(t);
    }
    return list;
  });

  /**
   * 秒を、グラフの横の位置（SVG の x 座標）に直す関数
   * @param {number} time - グラフの左端からの秒
   * @returns {number} x 座標
   */
  function timeToX(time) {
    return time * PX_PER_SECOND;
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
   * グラフの点から、線（SVG の path）を作る関数
   * 音が途切れたところと、別の音に変わったところでは、線をいったん切る。
   * @param {{time: number, cents: number, name: string}[]} list - グラフの点
   * @returns {string} path の d 属性の文字（点がないときは空文字）
   */
  function makeGraphPath(list) {
    let path = "";
    let previous = null;

    for (const point of list) {
      const x = timeToX(point.time).toFixed(1);
      const y = centsToY(point.cents).toFixed(1);

      // 最初の点・時間があいたとき・別の音に変わったときは「ここから描き始める」（M）
      // それ以外は「前の点から線を引く」（L）
      const startNew = previous === null || point.time - previous.time > GAP_SECONDS || point.name !== previous.name;
      path += (startNew ? "M" : "L") + x + "," + y + " ";
      previous = point;
    }

    return path;
  }

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
   * グラフを押したときの関数：押した場所の秒を、呼び出し元に知らせる
   * @param {MouseEvent} event - 押したときの情報
   */
  function handleClick(event) {
    if (onseek === null) {
      return;
    }
    // 押した場所が、グラフの左端から何 px か
    const rect = /** @type {SVGElement} */ (event.currentTarget).getBoundingClientRect();
    const x = event.clientX - rect.left;
    onseek(x / PX_PER_SECOND);
  }
</script>

<div class="graph-area">
  <!-- 縦の目盛りの数字（横にスクロールしても動かない） -->
  <svg class="axis" width={AXIS_WIDTH} height={GRAPH_HEIGHT} aria-hidden="true">
    {#each Y_TICKS as value (value)}
      <text class="graph-label" x={AXIS_WIDTH - 6} y={centsToY(value) + 4} text-anchor="end">
        {value > 0 ? "+" + value : value === 0 ? "0" : "−" + Math.abs(value)}
      </text>
    {/each}
  </svg>

  <!-- グラフ本体（長い録音は横にスクロールする） -->
  <div class="scroller" bind:this={scroller} bind:clientWidth={scrollerWidth} onscroll={() => onscroll?.()}>
    <!-- グラフを押すとその場所から再生する。キーボードでは「再生」ボタンで操作できるので、グラフ自体はクリックだけにする -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <svg class="graph" class:seekable={onseek !== null} {width} height={GRAPH_HEIGHT} role="img" aria-label="時間ごとの、一番近い音からの音程のずれのグラフ" onclick={handleClick}>
      <!-- 「合っている」範囲（±5セント）を、うすい緑で塗る -->
      <rect class="graph-ok" x="0" y={centsToY(OK_CENTS)} {width} height={centsToY(-OK_CENTS) - centsToY(OK_CENTS)} />

      <!-- 横の線（+50・+25・0・−25・−50） -->
      {#each Y_TICKS as value (value)}
        <line class={value === 0 ? "graph-zero" : "graph-grid"} x1="0" x2={width} y1={centsToY(value)} y2={centsToY(value)} />
      {/each}

      <!-- 拍の線（メトロノームのクリックが鳴った位置）。小節の頭は少し濃くして、小節の番号を付ける -->
      <!-- 音の線より先に描いて、音の線が上に重なるようにする -->
      {#each beatLines as beat, index (index)}
        <line class={beat.downbeat ? "bar-line" : "beat-line"} x1={timeToX(beat.time)} x2={timeToX(beat.time)} y1={PLOT_TOP} y2={PLOT_BOTTOM} />
        {#if beat.bar !== null}
          <text class="bar-number" x={timeToX(beat.time) + 3} y={PLOT_BOTTOM - 4}>{beat.bar}</text>
        {/if}
      {/each}

      <!-- 5秒ごとの時刻の数字 -->
      {#each ticks as t (t)}
        <text class="graph-label" x={timeToX(t) + 2} y={GRAPH_HEIGHT - 2}>{formatTime(t)}</text>
      {/each}

      <!-- 音名の札と、音の切れ目の点線 -->
      {#each labels as label, index (index)}
        <line class="graph-divider" x1={timeToX(label.start)} x2={timeToX(label.start)} y1={PLOT_TOP - 4} y2={PLOT_BOTTOM} />
        <text class="note-label" x={timeToX(label.start) + 3} y={PLOT_TOP - 10}>{label.name}</text>
      {/each}

      <!-- 音程の線 -->
      <path class="graph-line" d={graphPath} />

      <!-- 再生している位置の縦線 -->
      {#if cursorTime !== null}
        <line class="graph-cursor" x1={timeToX(cursorTime)} x2={timeToX(cursorTime)} y1={PLOT_TOP - 20} y2={PLOT_BOTTOM} />
      {/if}
    </svg>
  </div>
</div>

<style>
  .graph-area {
    display: flex;
    margin-bottom: 12px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }

  /* 縦の目盛りの欄は、縮まないようにする */
  .axis {
    flex: 0 0 auto;
    display: block;
  }

  /* グラフ本体は、残りの幅で横にスクロールする */
  .scroller {
    flex: 1;
    min-width: 0;
    overflow-x: auto;
  }

  .graph {
    display: block;
  }

  /* 押すと再生できるグラフは、指の形のカーソルにする */
  .graph.seekable {
    cursor: pointer;
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

  .graph-divider {
    stroke: #c8c8c8;
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }

  /* 拍の線（うすい緑）。音の切れ目の点線（灰色）と見分けられるように、色を変える */
  .beat-line {
    stroke: var(--ok);
    stroke-width: 1;
    opacity: 0.25;
  }

  /* 小節の頭の線は、少し濃く太くする */
  .bar-line {
    stroke: var(--accent);
    stroke-width: 1.5;
    opacity: 0.6;
  }

  /* 小節の番号 */
  .bar-number {
    font-size: 10px;
    fill: var(--accent);
  }

  .graph-label {
    font-size: 10px;
    fill: var(--text-sub);
  }

  .note-label {
    font-size: 11px;
    fill: var(--text);
  }

  .graph-line {
    fill: none;
    stroke: #333333;
    stroke-width: 1.5;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .graph-cursor {
    stroke: #e07a2f;
    stroke-width: 2;
  }
</style>
