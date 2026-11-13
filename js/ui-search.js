// 搜索：翻以前的日记

import * as entries from './entries.js';
import { dateCN, weekdayCN, timeHM, todayKey, relativeLabel } from './dates.js';
import { getStartHour } from './settings.js';
import { go } from './router.js';

const SHOW_LIMIT = 200;

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 截一段带上下文的文字，并把命中的词标出来 */
function snippet(text, q, radius = 34) {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx < 0) {
    const cut = text.length > 90 ? text.slice(0, 90) + '…' : text;
    return escapeHtml(cut);
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + q.length + radius);
  const before = (start > 0 ? '…' : '') + text.slice(start, idx);
  const hit = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length, end) + (end < text.length ? '…' : '');
  return escapeHtml(before) + '<mark>' + escapeHtml(hit) + '</mark>' + escapeHtml(after);
}

export async function renderSearch(root) {
  const startHour = getStartHour();
  const today = todayKey(startHour);

  root.innerHTML = `
    <div class="page">
      <div class="search-box">
        <input type="search" id="q" placeholder="搜以前写过的话…" autocomplete="off" enterkeyhint="search">
      </div>
      <div class="scroll">
        <div class="year-bar" id="years"></div>
        <div class="search-list" id="list"></div>
      </div>
    </div>
  `;

  const input = root.querySelector('#q');
  const list = root.querySelector('#list');
  const yearsBar = root.querySelector('#years');

  let timer = null;
  let seq = 0;
  let hits = [];
  let activeYear = 'all';
  let query = '';

  function emptyHint() {
    yearsBar.innerHTML = '';
    list.innerHTML = `
      <div class="empty-state">
        <div class="big">写过的都会在这儿</div>
        十年的日记也搜得动。试试搜：累、加班、周末、妈妈
      </div>`;
  }

  function paintYears() {
    if (!hits.length) {
      yearsBar.innerHTML = '';
      return;
    }
    const byYear = new Map();
    for (const e of hits) {
      const y = e.dayKey.slice(0, 4);
      byYear.set(y, (byYear.get(y) || 0) + 1);
    }
    const years = [...byYear.keys()].sort();
    if (years.length <= 1) {
      yearsBar.innerHTML = '';
      yearsBar.style.display = 'none';
      return;
    }
    yearsBar.style.display = 'flex';
    yearsBar.innerHTML = '';
    const makeChip = (id, label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pill' + (activeYear === id ? ' on' : '');
      b.textContent = label;
      b.addEventListener('click', () => {
        activeYear = id;
        paintResults();
      });
      yearsBar.appendChild(b);
    };
    makeChip('all', `全部 ${hits.length}`);
    for (const y of years) makeChip(y, `${y}年 ${byYear.get(y)}`);
  }

  function paintResults() {
    paintYears();
    const filtered = activeYear === 'all' ? hits : hits.filter((e) => e.dayKey.startsWith(activeYear));
    const shown = filtered.slice(0, SHOW_LIMIT);

    list.innerHTML = '';

    const byDay = new Map();
    for (const e of shown) {
      if (!byDay.has(e.dayKey)) byDay.set(e.dayKey, []);
      byDay.get(e.dayKey).push(e);
    }

    const summary = document.createElement('div');
    summary.className = 'search-summary';
    summary.textContent =
      filtered.length > shown.length
        ? `找到 ${filtered.length} 条，先显示最近的 ${shown.length} 条 —— 加个更具体的词能缩小范围`
        : `找到 ${filtered.length} 条，分布在 ${byDay.size} 天`;
    list.appendChild(summary);

    for (const [dayKey, items] of byDay) {
      const group = document.createElement('div');
      group.className = 'search-group';

      const head = document.createElement('div');
      head.className = 'search-day';
      head.textContent = `${dateCN(dayKey)} ${weekdayCN(dayKey)} · ${relativeLabel(dayKey, today)}`;
      group.appendChild(head);

      for (const e of items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'search-hit';
        btn.innerHTML = `<span class="t">${timeHM(e.createdAt)}</span>${snippet(e.text, query)}`;
        btn.addEventListener('click', () => go('#/day/' + dayKey));
        group.appendChild(btn);
      }
      list.appendChild(group);
    }
  }

  async function run(q) {
    const mySeq = ++seq;
    query = q;
    if (!q.trim()) {
      hits = [];
      emptyHint();
      return;
    }
    const found = await entries.search(q);
    if (mySeq !== seq) return;
    hits = found;
    activeYear = 'all';
    if (!hits.length) {
      yearsBar.innerHTML = '';
      list.innerHTML = `<div class="empty-state"><div class="big">没找到「${escapeHtml(q)}」</div>换个说法试试。</div>`;
      return;
    }
    paintResults();
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const v = input.value;
    timer = setTimeout(() => run(v), 160);
  });

  emptyHint();
  setTimeout(() => input.focus({ preventScroll: true }), 120);

  return () => clearTimeout(timer);
}
