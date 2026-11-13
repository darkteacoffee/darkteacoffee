// 图片：压缩、存盘、取出来、清垃圾。
// 图片不塞进日记记录里（那样每次列表都要把所有图片读进内存），单独存一个表。

import * as db from './db.js';
import { get } from './settings.js';

const STORE = db.STORE_ASSETS;
const MAX_ENTRY_IMAGES = 9;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export { MAX_ENTRY_IMAGES };

function uid() {
  if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch { /* 走下面那条路 */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('这张图打不开，换一张试试'));
      i.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
}

function drawScaled(bmp, srcW, srcH, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  return { canvas, w, h };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片压缩失败'))), type, quality);
    } else {
      try {
        const data = canvas.toDataURL(type, quality).split(',')[1];
        resolve(new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type }));
      } catch (e) {
        reject(e);
      }
    }
  });
}

/** 读进一张图，压成大图 + 小图，返回两块 Blob */
export async function processImage(file, opts = {}) {
  const maxSide = opts.maxSide || 1600;
  const thumbSide = opts.thumbSide || 480;
  if (!file) throw new Error('没有选到图片');
  if (file.size > MAX_FILE_BYTES) throw new Error('这张图太大了（超过 25MB），先裁一下再传');

  const bmp = await loadBitmap(file);
  const srcW = bmp.width || bmp.naturalWidth;
  const srcH = bmp.height || bmp.naturalHeight;
  if (!srcW || !srcH) throw new Error('这张图读不出尺寸');

  const big = drawScaled(bmp, srcW, srcH, maxSide);
  const small = drawScaled(bmp, srcW, srcH, thumbSide);
  if (bmp.close) bmp.close();

  const blob = await canvasToBlob(big.canvas, 'image/jpeg', 0.84);
  const thumb = await canvasToBlob(small.canvas, 'image/jpeg', 0.72);
  return { blob, thumb, w: big.w, h: big.h };
}

/** 存一张用户刚选的图，返回记录（里面有 id） */
export async function savePhoto(file) {
  const p = await processImage(file);
  return putAsset({ ...p, mime: 'image/jpeg', bytes: p.blob.size });
}

export async function putAsset(asset) {
  const row = {
    id: asset.id || uid(),
    blob: asset.blob,
    thumb: asset.thumb || asset.blob,
    w: asset.w || 0,
    h: asset.h || 0,
    mime: asset.mime || 'image/jpeg',
    bytes: asset.bytes || (asset.blob ? asset.blob.size : 0),
    createdAt: asset.createdAt || Date.now(),
  };
  await db.put(STORE, row);
  return row;
}

export async function getAsset(id) {
  if (!id) return null;
  return db.getOne(STORE, id);
}

export async function getAssets(ids = []) {
  if (!ids.length) return [];
  const rows = await Promise.all(ids.map((id) => db.getOne(STORE, id)));
  return rows.filter(Boolean);
}

export async function listAssets() {
  return db.getAll(STORE);
}

export async function deleteAsset(id) {
  if (!id) return;
  await db.remove(STORE, id);
}

export function makeURL(blob) {
  // 图坏了不该让整页崩掉，拿不到地址就当没图
  try {
    return URL.createObjectURL(blob);
  } catch {
    return '';
  }
}

/**
 * 清理没人用的图片：不属于任何条目、也不是背景图、且超过一天。
 * 一天内的先留着，因为可能正在写、还没点「记下」。
 */
export async function gcOrphans(entries, keepIds = []) {
  const used = new Set(keepIds);
  for (const e of entries) {
    for (const id of e.images || []) used.add(id);
  }
  const bgId = get().bgAssetId;
  if (bgId) used.add(bgId);

  let all = [];
  try {
    all = await db.getAll(STORE);
  } catch {
    return 0;
  }
  const now = Date.now();
  let removed = 0;
  for (const a of all) {
    if (used.has(a.id)) continue;
    if (now - (a.createdAt || 0) < 86400000) continue;
    await db.remove(STORE, a.id);
    removed++;
  }
  return removed;
}

export async function totalBytes() {
  const all = await db.getAll(STORE);
  return all.reduce((s, a) => s + (a.bytes || 0), 0);
}

/** 让用户选图片，返回 File 数组（用户取消就是空数组） */
export function pickImageFile(multiple = true) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multiple;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);

    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      setTimeout(() => input.remove(), 50);
      resolve(val);
    };

    input.addEventListener('change', () => done([...(input.files || [])]));
    window.addEventListener(
      'focus',
      () =>
        setTimeout(() => {
          if (!input.files || !input.files.length) done([]);
        }, 1500),
      { once: true }
    );
    input.click();
  });
}
