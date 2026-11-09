// ===== 前の録音（音程のデータ）をブラウザに保存する仕組み =====
// ブラウザの中のデータベース（IndexedDB）に、録音ごとの音程のデータを保存する。
// 音そのもの（録音のファイル）は保存しない（音程のグラフを見比べるためのもの）。
//
// 残し方：
//   ・★の付いていない録音は、新しいものから5つだけ残し、それより古いものは自動で消す
//   ・★の付いた録音は、古くなっても消さない（5つの数にも入れない）
//
// localStorage ではなく IndexedDB を使うのは、5分の録音だと音程のデータが数百KBになり、
// ★を付けた録音が増えると localStorage の容量（5MBくらい）を超えてしまうため。

// ===== 設定値 =====

// データベースの名前と版（形を変えるときは版を上げる）
const DB_NAME = "viola-neiro";
const DB_VERSION = 1;

// 録音を入れる入れ物（ストア）の名前
const STORE_NAME = "recordings";

// ★の付いていない録音を、いくつまで残すか
export const MAX_UNSTARRED = 5;

// ===== 保存する録音のデータの形 =====
//   id            ：録音を区別する番号（保存した時刻のミリ秒）
//   createdAt     ：録音した日時（ミリ秒）
//   duration      ：グラフの長さ（秒）
//   keyId         ：録音したときの調の id
//   temperamentId ：録音したときの音律の id
//   starred       ：★が付いているか
//   memo          ：メモ（曲名など）。読み込んだ音源のときは、最初からファイル名が入る
//   tempo         ：メトロノームのテンポ（♩＝）。メトロノームを使わなかったときは null
//   beatMarks     ：メトロノームのクリックが鳴った位置（time はグラフの左端からの秒、downbeat は小節の頭か）。グラフの拍の線に使う
//   samples     ：音程のデータ（time はグラフの左端からの秒、frequency は周波数）

/**
 * 保存する録音のデータの形を、VSCode にも分かるように名前を付けて定義しておく（中身は上のコメントと同じ）
 * （{object} と書くと「中身の分からないオブジェクト」とみなされ、recording.starred などが赤くなるため）
 * @typedef {object} Recording
 * @property {number} id - 録音を区別する番号
 * @property {number} createdAt - 録音した日時（ミリ秒）
 * @property {number} duration - グラフの長さ（秒）
 * @property {string} keyId - 録音したときの調の id
 * @property {string} temperamentId - 録音したときの音律の id
 * @property {boolean} starred - ★が付いているか
 * @property {string} memo - メモ
 * @property {number|null} [tempo] - メトロノームのテンポ（使わなかったとき・前の版で保存した録音は null かなし）
 * @property {{time: number, downbeat: boolean}[]} [beatMarks] - クリックが鳴った位置（使わなかったときは空。前の版で保存した録音はなし）
 * @property {{time: number, frequency: number}[]} samples - 音程のデータ
 */

/**
 * データベースを開く関数
 * 初めて開くときは、録音を入れる入れ物を作る。
 * @returns {Promise<IDBDatabase>} 開いたデータベース
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("このブラウザでは、録音を保存できません。"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // 初めて開くとき（または版を上げたとき）に、入れ物を作る
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * データベースへの1回の読み書きを、待てる形（Promise）にする関数
 * @param {"readonly"|"readwrite"} mode - 読むだけか、書き込むか
 * @param {(store: IDBObjectStore) => IDBRequest} action - 入れ物に対してすること
 * @returns {Promise<any>} 読み書きの結果
 */
async function runRequest(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));

    // 書き込みが全部終わってから結果を返す（終わる前に次の読み書きをしても、古い中身を読まないように）
    transaction.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

/**
 * 保存した録音を、新しい順に全部読み込む関数
 * @returns {Promise<Recording[]>} 録音のデータの配列（新しい順）
 */
export async function listRecordings() {
  /** @type {Recording[]} */
  const all = await runRequest("readonly", (store) => store.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * ★の付いていない古い録音を消して、MAX_UNSTARRED 個だけ残す関数
 * @returns {Promise<void>}
 */
async function pruneRecordings() {
  const all = await listRecordings();

  // ★の付いていない録音（新しい順）のうち、残す数より後ろのものを消す
  const unstarred = all.filter((recording) => !recording.starred);
  const toDelete = unstarred.slice(MAX_UNSTARRED);
  for (const recording of toDelete) {
    await runRequest("readwrite", (store) => store.delete(recording.id));
  }
}

/**
 * 録音を保存する関数（保存したあと、古い録音を消す）
 * @param {{createdAt: number, duration: number, keyId: string, temperamentId: string, tempo: number|null, beatMarks: {time: number, downbeat: boolean}[], samples: {time: number, frequency: number}[], memo?: string}} data - 保存する録音（tempo はメトロノームのテンポ。使わなかったときは null、beatMarks は空。memo は最初に入れておくメモで、なければ空）
 * @returns {Promise<number>} 保存した録音の id
 */
export async function saveRecording(data) {
  // データを小さくするため、時刻は1ミリ秒、周波数は0.01Hz まで丸める（グラフの見た目は変わらない）
  const samples = data.samples.map((sample) => ({
    time: Math.round(sample.time * 1000) / 1000,
    frequency: Math.round(sample.frequency * 100) / 100,
  }));

  const recording = {
    id: Date.now(),
    createdAt: data.createdAt,
    duration: data.duration,
    keyId: data.keyId,
    temperamentId: data.temperamentId,
    starred: false,
    // 最初に入れておくメモ（読み込んだ音源のファイル名など）。渡されなければ空にする
    memo: data.memo ?? "",
    tempo: data.tempo,
    // クリックの位置も、時刻を1ミリ秒まで丸めて保存する
    beatMarks: data.beatMarks.map((mark) => ({
      time: Math.round(mark.time * 1000) / 1000,
      downbeat: mark.downbeat,
    })),
    samples,
  };

  await runRequest("readwrite", (store) => store.put(recording));
  await pruneRecordings();
  return recording.id;
}

/**
 * 録音の★やメモを変える関数（★を外したときは、古い録音を消す）
 * @param {number} id - 録音の id
 * @param {{starred?: boolean, memo?: string}} changes - 変える内容
 * @returns {Promise<void>}
 */
export async function updateRecording(id, changes) {
  const recording = await runRequest("readonly", (store) => store.get(id));
  if (!recording) {
    return;
  }

  await runRequest("readwrite", (store) => store.put({ ...recording, ...changes }));

  // ★を外すと、★なしの数が増えるので、多すぎたら古いものを消す
  if (changes.starred === false) {
    await pruneRecordings();
  }
}

/**
 * 録音を消す関数
 * @param {number} id - 録音の id
 * @returns {Promise<void>}
 */
export async function deleteRecording(id) {
  await runRequest("readwrite", (store) => store.delete(id));
}
