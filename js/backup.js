// 备份：导出一个 zip（文字 + 图片），导入时合并，另外能导出成纯文本。

import { dateCN, weekdayCN, timeHM, todayKey, pad2 } from './dates.js';
import { moodEmoji } from './moods.js';
import { makeZip, readZip, isZip } from './zip.js';

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

export function stampReadable(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 6000);
}

/** 优先走手机/系统的分享面板，不行就退回下载 */
export async function shareOrDownload(blob, filename, title = '一日 · 日记备份') {
  try {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

export function backupFilename() {
  return `一日日记-备份-${stamp()}.zip`;
}

export function markdownFilename() {
  return `一日日记-${todayKey(0)}.md`;
}

const enc = new TextEncoder();

const README = `这是「一日」日记的备份文件。

里面有三样东西：
  backup.json   你的日记文字（还有回顾记录）
  images/       日记里的图片
  README.txt    就是你正在看的这个

怎么恢复：
  在一日里打开 设置 → 导入 / 合并，选中这个 zip 文件。
  已经有的不会重复，也没有的会补上，两边都保留。

别删这个文件。日记只存在手机浏览器里，
这份备份是唯一能把它带到新设备的东西。
`;

/**
 * 生成备份 zip
 * @param {{entries:Array, reviews:Array, notes:Array, images:Array, settings:Object}} data
 */
export async function exportBackupBlob({ entries, reviews = [], notes = [], images = [], settings = null }) {
  const files = [];

  const meta = {
    app: 'yiri',
    format: 2,
    exportedAt: Date.now(),
    count: entries.filter((e) => !e.deleted).length,
    entries,
    reviews,
    notes,
    settings: settings ? JSON.parse(JSON.stringify(settings)) : null,
    images: images.map((a) => ({
      id: a.id,
      w: a.w || 0,
      h: a.h || 0,
      mime: a.mime || 'image/jpeg',
      bytes: a.bytes || 0,
      createdAt: a.createdAt || 0,
    })),
  };

  // 万一调用方把整份设置都传进来了，这里再兜一次：Key 绝不进备份文件
  if (meta.settings && meta.settings.ai) delete meta.settings.ai.apiKey;

  files.push({ name: 'backup.json', data: enc.encode(JSON.stringify(meta)) });
  files.push({ name: 'README.txt', data: enc.encode(README) });

  for (const a of images) {
    if (!a.blob) continue;
    files.push({ name: `images/${a.id}.jpg`, data: new Uint8Array(await a.blob.arrayBuffer()) });
    if (a.thumb) {
      files.push({ name: `images/${a.id}_t.jpg`, data: new Uint8Array(await a.thumb.arrayBuffer()) });
    }
  }

  const bytes = makeZip(files);
  return new Blob([bytes], { type: 'application/zip' });
}

/** 让用户挑一个文件，返回 { name, bytes: ArrayBuffer } */
export function pickFile(accept = '.zip,.json,application/zip,application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(val);
    };
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return done(null);
      const reader = new FileReader();
      reader.onload = () => done({ name: file.name, bytes: reader.result });
      reader.onerror = () => done(null);
      reader.readAsArrayBuffer(file);
    });
    window.addEventListener(
      'focus',
      () =>
        setTimeout(() => {
          if (!input.files || !input.files.length) done(null);
        }, 1500),
      { once: true }
    );
    input.click();
  });
}

/**
 * 解析备份文件。返回 { kind, entries, reviews, images }
 * images 里每项是 { id, blob, thumb, w, h, mime, bytes, createdAt }
 */
export async function parseBackupBuffer(buffer) {
  const u8 = new Uint8Array(buffer);

  if (isZip(u8)) {
    let files;
    try {
      files = readZip(u8);
    } catch (e) {
      throw new Error(e.message || '这个 zip 读不了');
    }
    const raw = files.get('backup.json');
    if (!raw) throw new Error('这个 zip 里没有 backup.json，可能不是一日的备份');

    let meta;
    try {
      meta = JSON.parse(new TextDecoder('utf-8').decode(raw));
    } catch {
      throw new Error('备份里的 backup.json 坏了，读不出来');
    }

    const images = [];
    for (const img of meta.images || []) {
      const main = files.get(`images/${img.id}.jpg`);
      if (!main) continue;
      const thumb = files.get(`images/${img.id}_t.jpg`) || main;
      images.push({
        id: img.id,
        blob: new Blob([main], { type: img.mime || 'image/jpeg' }),
        thumb: new Blob([thumb], { type: img.mime || 'image/jpeg' }),
        w: img.w || 0,
        h: img.h || 0,
        mime: img.mime || 'image/jpeg',
        bytes: main.byteLength,
        createdAt: img.createdAt || Date.now(),
      });
    }

    return {
      kind: 'zip',
      entries: meta.entries || [],
      reviews: meta.reviews || [],
      notes: meta.notes || [],
      settings: meta.settings || null,
      images,
      meta,
    };
  }

  // 老格式：纯 JSON
  let data;
  try {
    data = JSON.parse(new TextDecoder('utf-8').decode(u8));
  } catch {
    throw new Error('这个文件读不出来。请选一日导出的 .zip 备份');
  }
  if (Array.isArray(data)) {
    return { kind: 'json', entries: data, reviews: [], notes: [], settings: null, images: [], meta: {} };
  }
  if (data && Array.isArray(data.entries)) {
    return {
      kind: 'json',
      entries: data.entries,
      reviews: data.reviews || [],
      notes: data.notes || [],
      settings: data.settings || null,
      images: [],
      meta: data,
    };
  }
  throw new Error('这个文件里没有找到日记数据');
}

export function makeMarkdownBlob(entries) {
  return new Blob([toMarkdown(entries)], { type: 'text/markdown;charset=utf-8' });
}

/** 把条目排成一天一段的 Markdown */
export function toMarkdown(entries, { includeDeleted = false } = {}) {
  const live = entries.filter((e) => includeDeleted || !e.deleted);
  const byDay = new Map();
  for (const e of live) {
    if (!byDay.has(e.dayKey)) byDay.set(e.dayKey, []);
    byDay.get(e.dayKey).push(e);
  }
  const keys = [...byDay.keys()].sort();

  const lines = [];
  lines.push('# 一日 · 日记');
  lines.push('');
  lines.push(`> 导出于 ${stampReadable(Date.now())}　共 ${keys.length} 天 ${live.length} 条`);
  lines.push('');

  for (const key of keys) {
    const items = byDay.get(key).sort((a, b) => a.createdAt - b.createdAt);
    lines.push('');
    lines.push(`## ${dateCN(key)} ${weekdayCN(key)}`);
    lines.push('');
    for (const e of items) {
      const parts = [];
      parts.push(`**${timeHM(e.createdAt)}**`);
      if (e.mood) parts.push(moodEmoji(e.mood));
      if (e.images && e.images.length) parts.push(`〔${e.images.length} 张图〕`);
      lines.push(parts.join(' '));
      lines.push('');
      if (e.text.trim()) {
        lines.push(e.text.replace(/\n{3,}/g, '\n\n').trim());
        lines.push('');
      }
    }
  }
  return lines.join('\n');
}
