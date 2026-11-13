// 日记的读写。一条记录 = 一次「记下」的片段。

import * as db from './db.js';
import { dayKeyOf, isValidKey } from './dates.js';
import { getStartHour } from './settings.js';

const STORE = db.STORE_ENTRIES;

let cache = null;      // 全部未删除条目，按时间升序
let cacheDirty = true;

function invalidate() {
  cacheDirty = true;
}

function uid() {
  if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'e-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function normalize(raw) {
  const createdAt = Number(raw.createdAt) || Date.now();
  return {
    id: String(raw.id || uid()),
    createdAt,
    updatedAt: Number(raw.updatedAt) || createdAt,
    dayKey: isValidKey(raw.dayKey) ? raw.dayKey : dayKeyOf(createdAt, getStartHour()),
    text: typeof raw.text === 'string' ? raw.text : '',
    mood: Number.isFinite(raw.mood) && raw.mood > 0 ? Math.round(raw.mood) : 0,
    images: Array.isArray(raw.images) ? raw.images.filter((x) => typeof x === 'string') : [],
    deleted: raw.deleted ? 1 : 0,
  };
}

export async function addEntry({ text = '', mood = 0, images = [], dayKey = null, ts = Date.now() } = {}) {
  const entry = normalize({
    id: uid(),
    createdAt: ts,
    updatedAt: ts,
    dayKey: dayKey || dayKeyOf(ts, getStartHour()),
    text,
    mood,
    images,
  });
  await db.put(STORE, entry);
  invalidate();
  return entry;
}

export async function updateEntry(id, patch = {}) {
  const old = await db.getOne(STORE, id);
  if (!old) throw new Error('这条记录找不到了');
  const next = {
    ...normalize(old),
    ...patch,
    updatedAt: Date.now(),
  };
  if ('text' in patch) next.text = String(patch.text);
  if ('mood' in patch) next.mood = Number(patch.mood) || 0;
  await db.put(STORE, next);
  invalidate();
  return next;
}

export async function deleteEntry(id) {
  const old = await db.getOne(STORE, id);
  if (!old) return;
  // 软删除：留个墓碑，将来和电脑合并时不会"删掉的又冒出来"
  await db.put(STORE, { ...normalize(old), deleted: 1, updatedAt: Date.now() });
  invalidate();
}

export async function getEntry(id) {
  const e = await db.getOne(STORE, id);
  return e ? normalize(e) : null;
}

/** 全部未删除条目，时间升序 */
export async function listAll({ fresh = false } = {}) {
  if (!fresh && !cacheDirty && cache) return cache;
  const rows = await db.getAll(STORE);
  cache = rows.map(normalize).filter((e) => !e.deleted).sort((a, b) => a.createdAt - b.createdAt);
  cacheDirty = false;
  return cache;
}

export async function listDay(dayKey) {
  const all = await listAll();
  return all.filter((e) => e.dayKey === dayKey);
}

export async function countsByDay() {
  const all = await listAll();
  const map = new Map();
  for (const e of all) map.set(e.dayKey, (map.get(e.dayKey) || 0) + 1);
  return map;
}

export async function charCountByDay() {
  const all = await listAll();
  const map = new Map();
  for (const e of all) map.set(e.dayKey, (map.get(e.dayKey) || 0) + e.text.length);
  return map;
}

/** 把一段文本里所有的空白压成一个空格，方便搜索 */
function squash(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

export async function search(query, limit = 5000) {
  const q = squash(query).toLowerCase();
  if (!q) return [];
  const all = await listAll();
  const hits = [];
  for (let i = all.length - 1; i >= 0 && hits.length < limit; i--) {
    const e = all[i];
    if (!e.text) continue;
    if (squash(e.text).toLowerCase().includes(q)) hits.push(e);
  }
  return hits;
}

export async function stats() {
  // 用已经读进内存的那份，别每次再翻一遍数据库
  const live = await listAll();
  const days = new Set(live.map((e) => e.dayKey));
  let chars = 0;
  for (const e of live) chars += e.text.length;
  const keys = [...days].sort();
  return {
    entries: live.length,
    days: days.size,
    chars,
    firstDay: keys[0] || null,
    lastDay: keys[keys.length - 1] || null,
  };
}

/** 导出用的原始数据（含墓碑，保证合并正确） */
export async function exportRows() {
  const rows = await db.getAll(STORE);
  return rows.map(normalize);
}

export function makeBackup(rows, extra = {}) {
  return {
    app: 'yiri',
    format: 1,
    exportedAt: Date.now(),
    count: rows.filter((r) => !r.deleted).length,
    entries: rows,
    ...extra,
  };
}

/**
 * 合并一份备份进来。按 id 去重，同一个 id 取 updatedAt 新的。
 * 返回 { added, updated, skipped, invalid }
 */
export async function merge(rowsIn) {
  if (!Array.isArray(rowsIn)) throw new Error('这个文件里没有日记数据');
  const existingRows = await db.getAll(STORE);
  const map = new Map();
  for (const r of existingRows) {
    const n = normalize(r);
    map.set(n.id, n);
  }

  const toWrite = [];
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let invalid = 0;

  for (const raw of rowsIn) {
    if (!raw || typeof raw !== 'object' || !raw.id) {
      invalid++;
      continue;
    }
    const incoming = normalize(raw);
    const cur = map.get(incoming.id);
    if (!cur) {
      toWrite.push(incoming);
      map.set(incoming.id, incoming);
      added++;
    } else if (incoming.updatedAt > cur.updatedAt) {
      toWrite.push(incoming);
      map.set(incoming.id, incoming);
      updated++;
    } else {
      skipped++;
    }
  }

  await db.putMany(STORE, toWrite);
  invalidate();
  return { added, updated, skipped, invalid };
}

/** 存一次 AI 回顾 */
export async function saveReview(review) {
  const row = {
    id: uid(),
    createdAt: Date.now(),
    persona: review.persona || '',
    personaName: review.personaName || '',
    label: review.label || '',
    from: review.from || '',
    to: review.to || '',
    text: review.text || '',
    model: review.model || '',
    ...review,
  };
  await db.put(db.STORE_REVIEWS, row);
  return row;
}

export async function listReviews(limit = 50) {
  const rows = await db.getAll(db.STORE_REVIEWS);
  return rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export async function deleteReview(id) {
  await db.remove(db.STORE_REVIEWS, id);
}

/** 合并导入的回顾记录（按 id 去重，只加不改） */
export async function mergeReviews(list = []) {
  if (!Array.isArray(list) || !list.length) return 0;
  const existing = await db.getAll(db.STORE_REVIEWS);
  const have = new Set(existing.map((r) => r.id));
  const toWrite = [];
  for (const r of list) {
    if (!r || !r.id || have.has(r.id)) continue;
    toWrite.push({ createdAt: Date.now(), ...r });
    have.add(r.id);
  }
  await db.putMany(db.STORE_REVIEWS, toWrite);
  return toWrite.length;
}

export async function getReview(id) {
  return db.getOne(db.STORE_REVIEWS, id);
}
