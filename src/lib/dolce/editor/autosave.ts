// **自动保存与崩溃恢复**（参照 MuseScore 的自动保存）：改过还没存的内容隔几秒存进浏览器的 IndexedDB（桌面版的 WebView 里同样有），
// 下次打开时问要不要恢复。识别会话连同原图一起存（识别项目的打包，`omrproject.ts`），恢复后接着核对、不必重新识别。
//
// 只存一份（最近那份）。存盘、打开新文件之后，内容与盘上一致就删掉。一切读写都包 try/catch：隐私窗口、存储被禁时什么也不做。

const DB = "dolce";
const STORE = "drafts";
const KEY = "current";

export interface Draft {
  /** 存的时刻（ms） */
  time: number;
  filePath: string | null;
  docFormat: string;
  text: string;
  /** 识别会话：识别项目的打包字节（`packProject`）；没有为 undefined */
  project?: Uint8Array;
}

/** 连接只开一次（每存一次开一个新连接、又从不关，会攒一堆） */
let dbp: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  dbp ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        const db = req.result;
        db.onclose = () => { dbp = null; };
        resolve(db);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

/** 按事务完成算数（配额超了是在事务 abort 时才报，请求 success 不代表写进去了）。 */
async function tx<T>(mode: IDBTransactionMode, fn: (st: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = t.onabort = () => resolve(undefined);
    } catch {
      dbp = null; // 连接坏了（被浏览器关掉等）：下次重开
      resolve(undefined);
    }
  });
}

export async function saveDraft(d: Draft): Promise<void> {
  await tx("readwrite", (st) => st.put(d, KEY));
}

export async function loadDraft(): Promise<Draft | null> {
  const d = await tx<Draft>("readonly", (st) => st.get(KEY));
  return d && typeof d.text === "string" ? d : null;
}

export async function clearDraft(): Promise<void> {
  await tx("readwrite", (st) => st.delete(KEY));
}
