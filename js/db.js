// 极简 IndexedDB 封装。只做三件事：打开、读全部、写一条。

const DB_NAME = 'yiri';
const DB_VERSION = 3;

export const STORE_ENTRIES = 'entries';
export const STORE_REVIEWS = 'reviews';
export const STORE_ASSETS = 'assets';
export const STORE_NOTES = 'notes';

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('这个浏览器不支持本地数据库（IndexedDB）'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const s = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
        s.createIndex('dayKey', 'dayKey', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_REVIEWS)) {
        const r = db.createObjectStore(STORE_REVIEWS, { keyPath: 'id' });
        r.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        const a = db.createObjectStore(STORE_ASSETS, { keyPath: 'id' });
        a.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_NOTES)) {
        db.createObjectStore(STORE_NOTES, { keyPath: 'dayKey' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('数据库被另一个标签页占用了，关掉其他页面再试'));
  });
  return dbPromise;
}

function reqAsPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

export async function getAll(storeName) {
  const store = await tx(storeName, 'readonly');
  return reqAsPromise(store.getAll());
}

export async function getOne(storeName, id) {
  const store = await tx(storeName, 'readonly');
  return reqAsPromise(store.get(id));
}

export async function put(storeName, value) {
  const store = await tx(storeName, 'readwrite');
  await reqAsPromise(store.put(value));
  return value;
}

export async function putMany(storeName, values) {
  if (!values.length) return 0;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, 'readwrite');
    const s = t.objectStore(storeName);
    for (const v of values) s.put(v);
    t.oncomplete = () => resolve(values.length);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('批量写入被中断'));
  });
}

export async function remove(storeName, id) {
  const store = await tx(storeName, 'readwrite');
  await reqAsPromise(store.delete(id));
}

export async function count(storeName) {
  const store = await tx(storeName, 'readonly');
  return reqAsPromise(store.count());
}
