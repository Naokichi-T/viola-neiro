// ===== ドローンの使い方のページで使う、調ごとの表の計算 =====
// 調の音階の音（7つ）について、主音のドローンと合わせたときに、
//   ・主音から何の音程か（長3度など）
//   ・うなりが消えるか（倍音が重なる音程ほど、はっきり消える）
//   ・どう合わせればよいか（主音と合わせる／5度の音と合わせる）
//   ・響きが合う高さは、ふつうのチューナー（平均律）で見ると何セントずれて見えるか
// をまとめる。
//
// 響きが合う高さは、純正律（主音とのきれいな比）の高さ。
// 2度・7度は主音とは合わせにくいので、5度の音と合わせたときの高さ（9/8・15/8・9/5）になるが、
// これは tuning.js の純正律の比と同じなので、そのまま getCentsFromEqual で求められる。

// 音番号の計算と、音名の一覧
import { getNoteNumber, STEP_NAMES } from "./score.js";

// 調号から、各音名に付く♯・♭を求める関数
import { getSignatureAccidentals } from "./key.js";

// 選んだ音律での高さが、平均律と比べて何セントずれているかを求める関数
import { getCentsFromEqual } from "./tuning.js";

// 主音から半音いくつ分か（0〜11）ごとの、音程の名前
const INTERVAL_NAMES = {
  0: "同じ音",
  1: "短2度",
  2: "長2度",
  3: "短3度",
  4: "長3度",
  5: "完全4度",
  6: "増4度",
  7: "完全5度",
  8: "短6度",
  9: "長6度",
  10: "短7度",
  11: "長7度",
};

// 主音から半音いくつ分か（0〜11）ごとの、うなりの消えやすさ
//   level：'clear'＝はっきり消える、'soft'＝消えるが聞き分けにくい、'none'＝消えない
//   text ：画面に出す言葉
const CLARITY = {
  0: { level: "clear", text: "とてもはっきり消える" },
  7: { level: "clear", text: "はっきり消える" },
  5: { level: "clear", text: "はっきり消える" },
  4: { level: "soft", text: "消えるが、少し聞き分けにくい" },
  3: { level: "soft", text: "消えるが、少し聞き分けにくい" },
  9: { level: "soft", text: "消えるが、少し聞き分けにくい" },
  8: { level: "soft", text: "消えるが、少し聞き分けにくい" },
};

// うなりが消えない音程のときの、言葉
const NO_CLARITY = { level: "none", text: "消えない（いつも少しざらざらする）" };

/**
 * 音名の番号と♯・♭を、「ファ♯」のような文字にする関数
 * @param {number} step - 音名の番号（0〜6）
 * @param {number} accidental - 変化記号（1 が♯、-1 が♭、0 がなし）
 * @returns {string} 音名（例：'ファ♯'）
 */
function spell(step, accidental) {
  const mark = accidental === 1 ? "♯" : accidental === -1 ? "♭" : "";
  return STEP_NAMES[step] + mark;
}

/**
 * 調ごとの表の行を作る関数
 * @param {import("./key.js").Key} key - 調のデータ
 * @returns {{degree: number, name: string, intervalName: string, clarity: string, clarityText: string,
 *   how: string, centsFromEqual: number}[]} 音階の7つの音の行（主音から順に）
 *   degree         ：音階の何番目の音か（1〜7）
 *   name           ：音名（例：'ファ♯'）
 *   intervalName   ：主音との音程（例：'長3度'）
 *   clarity        ：うなりの消えやすさ（'clear'・'soft'・'none'）
 *   clarityText    ：うなりの消えやすさの言葉
 *   how            ：合わせ方
 *   centsFromEqual ：響きが合う高さが、チューナー（平均律）でどれだけずれて見えるか（セント）
 */
export function getDroneGuideRows(key) {
  const accidentals = getSignatureAccidentals(key.signature);

  // 主音（オクターブ4）と、その音番号
  const tonic = { step: key.tonicStep, accidental: accidentals[key.tonicStep], octave: 4 };
  const tonicNumber = getNoteNumber(tonic);

  // 5度の音の名前（2度・7度を合わせるときの相手）
  const fifthStep = (key.tonicStep + 4) % 7;
  const fifthName = spell(fifthStep, accidentals[fifthStep]);

  const rows = [];

  for (let degree = 0; degree < 7; degree++) {
    // 音階の音（主音から順に）。主音より下にならないように、シを越えたらオクターブを1つ上げる
    const step = (key.tonicStep + degree) % 7;
    const octave = key.tonicStep + degree >= 7 ? 5 : 4;
    const note = { step, accidental: accidentals[step], octave };

    // 主音から半音いくつ分か（0〜11）
    const semitones = (((getNoteNumber(note) - tonicNumber) % 12) + 12) % 12;

    // うなりの消えやすさ
    const clarity = CLARITY[semitones] ?? NO_CLARITY;

    // 合わせ方：消えない音程は、5度の音と合わせる（5度の音から見た音程を書く）
    let how;
    if (semitones === 0) {
      how = "主音と合わせる（いちばん分かりやすい）";
    } else if (clarity.level !== "none") {
      how = "主音と合わせる";
    } else {
      // 5度の音から半音いくつ分か（0〜11）
      const fromFifth = (((semitones - 7) % 12) + 12) % 12;
      how = "「主音＋5度」にして、5度の音（" + fifthName + "）と合わせる（" + fifthName + "から見ると" + (INTERVAL_NAMES[fromFifth] ?? "") + "）";
    }

    rows.push({
      degree: degree + 1,
      name: spell(step, accidentals[step]),
      intervalName: INTERVAL_NAMES[semitones] ?? "",
      clarity: clarity.level,
      clarityText: clarity.text,
      how,
      // 響きが合う高さ（純正律）が、チューナー（平均律）でどれだけずれて見えるか
      centsFromEqual: getCentsFromEqual(note, key, "just"),
    });
  }

  return rows;
}
