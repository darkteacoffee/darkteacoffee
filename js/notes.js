// 每一天的 AI 评价。一天一条，重新生成就覆盖。
// 和「回顾」是两套东西：回顾看的是一段时间，这里只针对某一天。

import * as db from './db.js';

const STORE = db.STORE_NOTES;

export async function getNote(dayKey) {
  const row = await db.getOne(STORE, dayKey);
  return row || null;
}

export async function saveNote({ dayKey, text, personaId = '', personaName = '', model = '' }) {
  const row = {
    dayKey,
    text,
    personaId,
    personaName,
    model,
    createdAt: Date.now(),
  };
  await db.put(STORE, row);
  return row;
}

export async function deleteNote(dayKey) {
  await db.remove(STORE, dayKey);
}

export async function listNotes() {
  return db.getAll(STORE);
}

/** 导入时合并：同一天取更新的那条 */
export async function mergeNotes(list = []) {
  if (!Array.isArray(list) || !list.length) return 0;
  const existing = await db.getAll(STORE);
  const map = new Map(existing.map((n) => [n.dayKey, n]));
  const toWrite = [];
  for (const n of list) {
    if (!n || !n.dayKey || typeof n.text !== 'string') continue;
    const cur = map.get(n.dayKey);
    if (cur && (cur.createdAt || 0) >= (n.createdAt || 0)) continue;
    toWrite.push(n);
    map.set(n.dayKey, n);
  }
  await db.putMany(STORE, toWrite);
  return toWrite.length;
}
