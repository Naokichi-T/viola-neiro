// ===== 周波数検出のための設定値 =====

// 検出する周波数の下限（Hz）。ビオラの最低音（C線の開放弦、約131Hz）より少し低くしておく
// （バイオリン版は G線の約196Hz に合わせて 180 だった。ビオラは5度低いドまで出るので 120 にする）
// 低くするほど調べるずらし幅が増えるが、120Hz でも周期は約400個なので、2048個の波形の中に5回ほど入り十分に測れる
const MIN_FREQUENCY = 120;

// 検出する周波数の上限（Hz）。ビオラの高い音域（と倍音の聞き間違いの余裕）までカバーする
const MAX_FREQUENCY = 3600;

// これより音が小さいときは検出しない（雑音を拾わないため）
// 小さくするほど、弱い音でも検出するようになるが、まわりの物音にも反応しやすくなる
// const MIN_RMS = 0.01;
const MIN_RMS = 0.004;

// 波形の「繰り返しのはっきり度」がこれより低いときは検出しない（0〜1、1に近いほどはっきり）
const MIN_CLARITY = 0.8;

// 一番高い山の何割以上の高さがあれば「周期の候補」として採用するか
// （1オクターブ低い音と間違えるのを防ぐため、最初に見つかった十分に高い山を使う）
// 【2026/11/10 0.9 → 0.985 に変更】
//   C線（ド3）を弓で弾いた録音を調べると、スマホのマイクでは基音（約131Hz）がとても弱く録れ、
//   2倍音（ド4 の高さ）が、ほかの倍音より 24dB 以上強かった。
//   そのため、本当の周期の「半分」の位置の山の高さが、本当の周期の山の 97〜97.7％ にもなり、
//   0.9（や 0.95）だと半分の位置の山を選んで、1オクターブ上（ド4）と測り間違えていた。
//   0.985 にすると、半分の位置の山は選ばれず、本当の周期の山を選ぶようになる
//   （実際の録音で、弓で弾いている間の142回すべてがド3 になった）。
//   ただし大きくしすぎると、今度は1オクターブ下と測りやすくなる
//   （計算で試したところ 0.99 では、ミ4・ラ4 などでまれに1オクターブ下になった。0.985 では外れなし）
// 【2026/11/10 あわせて、山の高さを「放物線で補った頂上の高さ」で比べるように変更（手順4）】
//   ビオラ音程チェック（viola-pitch）を同じように直したときに計算で試したところ、0.985 にするだけだと、
//   シ5〜シ6 あたりの高い音で、ときどき1オクターブ下と測り間違えることが分かった。
//   高い音は周期が20〜30個ぶんと短く、整数の位置で測った山の高さが、本当の頂上より少し低く出ることがあり、
//   本当の周期の山が 98.5％ に届かず、2倍の位置の山が選ばれてしまうため。
//   補った頂上の高さで比べると、ド3〜ド7 のすべての音で外れがなくなった（波形2048個・4096個のどちらでも）
const PEAK_RATIO = 0.985;

/**
 * 音の大きさ（RMS）を計算する関数
 * RMS は「二乗平均平方根」のことで、波形の振れ幅の平均的な大きさを表す。
 * @param {Float32Array} data - 波形データ（-1 〜 1 の値が並んだ配列）
 * @returns {number} 音の大きさ（0 に近いほど静か）
 */
export function calculateRms(data) {
  // 各値を二乗したものの合計
  let sumOfSquares = 0;

  // 波形データを1つずつ取り出して、二乗して足していく
  for (let i = 0; i < data.length; i++) {
    sumOfSquares += data[i] * data[i];
  }

  // 合計を個数で割って平均を出し、その平方根を返す
  return Math.sqrt(sumOfSquares / data.length);
}

/**
 * 山の本当の頂上の高さを求める関数（2026/11/10 追加）
 * 重なり具合は、ずらし幅が整数（1個、2個…）のところでしか分からないが、本当の頂上はその間にあることが多い。
 * 山の一番高い点とその両隣の3点を通る放物線を考えて、その放物線の一番高いところの値を返す。
 * （detectPitch の手順7で「頂上の位置」を求めているのと同じ放物線を使って、「頂上の高さ」を求めている）
 * @param {Float32Array} similarity - ずらし幅ごとの重なり具合（-1 〜 1）
 * @param {number} peakLag - 山の一番高い点のずらし幅（両隣があること。0 や配列の最後ではないこと）
 * @returns {number} 補った頂上の高さ。うまく補えないときは、一番高い点の値をそのまま返す
 */
function estimatePeakHeight(similarity, peakLag) {
  // 頂上とその両隣の値
  const left = similarity[peakLag - 1];
  const center = similarity[peakLag];
  const right = similarity[peakLag + 1];

  // 放物線の曲がり具合。山の形（上に出っぱった形）なら、マイナスになる
  const curve = left - 2 * center + right;

  // 山の形になっていない（平ら・へこんでいる）ときは、補わずにそのまま返す
  if (curve >= 0) {
    return center;
  }

  // 放物線の一番高いところの値（3点を通る放物線の頂点の高さの公式）
  return center - ((left - right) * (left - right)) / (8 * curve);
}

/**
 * 波形データから周波数を検出する関数
 * 波形を少しずつずらして元の波形と比べ、一番よく重なるずらし幅（周期）を探す。
 * 周期が分かれば「1秒あたりのデータ数 ÷ 周期」で周波数が求まる。
 * @param {Float32Array} data - 波形データ（-1 〜 1 の値が並んだ配列）
 * @param {number} sampleRate - 1秒あたりのデータ数（例：48000）
 * @returns {number|null} 検出した周波数（Hz）。検出できなかったときは null
 */
export function detectPitch(data, sampleRate) {
  // ----- 手順1：音が小さすぎるときは検出しない -----
  if (calculateRms(data) < MIN_RMS) {
    return null;
  }

  // ----- 手順2：調べるずらし幅の最大値を決める -----
  // 一番低い音（MIN_FREQUENCY）の周期が、調べる必要のある最大のずらし幅になる
  const maxLag = Math.ceil(sampleRate / MIN_FREQUENCY);

  // ----- 手順3：ずらし幅ごとに「重なり具合」を計算する -----
  // similarity[ずらし幅] に、-1 〜 1 の値が入る（1 に近いほどよく重なっている）
  const similarity = new Float32Array(maxLag + 1);

  for (let lag = 0; lag <= maxLag; lag++) {
    // 元の波形と、ずらした波形を掛け合わせたものの合計（重なっているほど大きくなる）
    let product = 0;

    // 元の波形と、ずらした波形それぞれの二乗の合計（大きさをそろえるために使う）
    let energy = 0;

    // ずらした分だけ比べられるデータが減るので、data.length - lag 個ぶんを比べる
    for (let i = 0; i < data.length - lag; i++) {
      product += data[i] * data[i + lag];
      energy += data[i] * data[i] + data[i + lag] * data[i + lag];
    }

    // 音の大きさに左右されないように、-1 〜 1 の範囲にそろえる
    similarity[lag] = energy > 0 ? (2 * product) / energy : 0;
  }

  // ----- 手順4：重なり具合の「山」を探す -----
  // ずらし幅 0 の付近は必ずよく重なる（自分自身と比べているため）ので、最初の山は読み飛ばす
  let lag = 0;
  while (lag <= maxLag && similarity[lag] > 0) {
    lag++;
  }

  // 見つかった山の位置（ずらし幅）を入れておく配列
  const peakLags = [];

  // 見つかった山の「補った頂上の高さ」を入れておく配列（peakLags と同じ順番で並ぶ）
  // （2026/11/10 追加：高い音で1オクターブ下と測り間違えないように、整数の位置の高さではなく、こちらで比べる）
  const peakHeights = [];

  // 見つかった山の中で一番高い値
  let highestPeak = 0;

  while (lag <= maxLag) {
    // 値が 0 以下の区間（谷）を読み飛ばす
    while (lag <= maxLag && similarity[lag] <= 0) {
      lag++;
    }

    // 値がプラスの区間の中で、一番高い位置を探す
    let peakLag = -1;
    let peakValue = 0;
    while (lag <= maxLag && similarity[lag] > 0) {
      if (similarity[lag] > peakValue) {
        peakValue = similarity[lag];
        peakLag = lag;
      }
      lag++;
    }

    // 山が見つかり、それが調べた範囲の端ではないときだけ採用する
    // （端にあるものは、本当の頂上かどうか分からないため）
    if (peakLag !== -1 && peakLag < maxLag) {
      // 山の本当の頂上の高さを求める（2026/11/10 追加）
      const height = estimatePeakHeight(similarity, peakLag);

      peakLags.push(peakLag);
      peakHeights.push(height);

      // 一番高い山も、補った頂上の高さで決める
      if (height > highestPeak) {
        highestPeak = height;
      }
    }
  }

  // ----- 手順5：はっきりした繰り返しがないときは検出しない -----
  if (peakLags.length === 0 || highestPeak < MIN_CLARITY) {
    return null;
  }

  // ----- 手順6：十分に高い山のうち、最初のものを周期として採用する -----
  // 一番高い山ではなく「最初の十分に高い山」を選ぶことで、
  // 周期の2倍・3倍の位置にある山（1オクターブ低い音）と間違えるのを防ぐ
  // （2026/11/10 変更：山の高さは、整数の位置の値ではなく、補った頂上の高さ（peakHeights）で比べる）
  let bestLag = peakLags[0];
  for (let i = 0; i < peakLags.length; i++) {
    if (peakHeights[i] >= highestPeak * PEAK_RATIO) {
      bestLag = peakLags[i];
      break;
    }
  }

  // ----- 手順7：山の頂上の位置を、より細かく求める -----
  // ずらし幅は整数（1個、2個…）でしか調べられないが、本当の頂上はその間にあることが多い。
  // 頂上とその両隣の3点を通る放物線を考えて、本当の頂上の位置を小数で求める
  const left = similarity[bestLag - 1];
  const center = similarity[bestLag];
  const right = similarity[bestLag + 1];
  const denominator = 2 * (left - 2 * center + right);

  // 補正後の周期（小数）
  let period = bestLag;
  if (denominator !== 0) {
    period = bestLag + (left - right) / denominator;
  }

  // ----- 手順8：周期から周波数を計算する -----
  const frequency = sampleRate / period;

  // ----- 手順9：ビオラの音域から外れた結果は捨てる -----
  if (frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY) {
    return null;
  }

  return frequency;
}
