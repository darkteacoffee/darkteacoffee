// 日历：看哪天写过，能直接跳到任意年任意月

import * as entries from './entries.js';
import { monthRows, todayKey, WEEKDAY_CN, monthTitle, pad2 } from './dates.js';
import { getStartHour } from './settings.js';
import { ICONS } from './icons.js';
import { go } from './router.js';

export async function renderCalendar(root) {
  const startHour = getStartHour();
  const today = todayKey(startHour);
  const todayDate = new Date();
  let year = todayDate.getFullYear();
  let month = todayDate.getMonth();

  const counts = await entries.countsByDay();
  const chars = await entries.charCountByDay();

  // 每个年份写了多少
  const perYear = new Map();
  for (const [k, v] of counts) {
    const y = k.slice(0, 4);
    const cur = perYear.get(y) || { entries: 0, days: 0 };
    cur.entries += v;
    cur.days += 1;
    perYear.set(y, cur);
  }

  const yearsWithData = new Set([...perYear.keys()].map(Number));
  const currentYear = todayDate.getFullYear();
  const earliest = yearsWithData.size ? Math.min(...yearsWithData) : currentYear;
  // 至少往前 30 年，有更早的记录就再往前放
  const minYear = Math.min(earliest, currentYear - 30);
  const maxYear = currentYear;

  root.innerHTML = `
    <div class="page">
      <header class="cal-head">
        <button class="icon-btn" id="prev" type="button" aria-label="上个月">${ICONS.left}</button>
        <button class="cal-month-btn" id="pick" type="button" aria-label="选择年月">
          <span id="month-label"></span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>
        </button>
        <button class="icon-btn" id="next" type="button" aria-label="下个月">${ICONS.right}</button>
        <div class="spacer"></div>
        <button class="btn ghost sm" id="back-today" type="button">今天</button>
      </header>
      <div class="cal-weekdays">
        ${[1, 2, 3, 4, 5, 6, 0].map((i) => `<span>${WEEKDAY_CN[i]}</span>`).join('')}
      </div>
      <div class="scroll">
        <div class="cal-grid" id="grid"></div>
        <div class="cal-stats" id="stats"></div>
        <div class="empty-state" id="hint" style="display:none;padding-top:8px">
          <div class="big">这个月还没有记录</div>
        </div>
        <div class="cal-ondays">
          <button class="btn ghost" id="ondays" type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true" style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v4h4"/><path d="M12 8v4.5l3 1.8"/></svg>
            往年今日
          </button>
        </div>
      </div>
    </div>
  `;

  const grid = root.querySelector('#grid');
  const label = root.querySelector('#month-label');
  const statsEl = root.querySelector('#stats');
  const hint = root.querySelector('#hint');

  function paint() {
    label.textContent = monthTitle(year, month);
    grid.innerHTML = '';

    const rows = monthRows(year, month);
    for (const row of rows) {
      for (const cell of row) {
        const c = document.createElement('button');
        c.type = 'button';
        c.className = 'cal-cell';
        if (!cell.inMonth) c.classList.add('out');
        if (cell.key === today) c.classList.add('today');

        const n = counts.get(cell.key) || 0;
        if (n > 0) {
          c.classList.add('has');
          const dot = document.createElement('span');
          dot.className = 'dot' + (n >= 4 ? ' d3' : n >= 2 ? ' d2' : '');
          c.appendChild(dot);
        }

        const num = document.createElement('span');
        num.textContent = String(cell.day);
        c.appendChild(num);

        c.addEventListener('click', () => go('#/day/' + cell.key));
        grid.appendChild(c);
      }
    }

    const prefix = `${year}-${pad2(month + 1)}-`;
    let dayCount = 0;
    let entryCount = 0;
    let charCount = 0;
    for (const [k, v] of counts) {
      if (k.startsWith(prefix)) {
        dayCount++;
        entryCount += v;
      }
    }
    for (const [k, v] of chars) {
      if (k.startsWith(prefix)) charCount += v;
    }

    if (dayCount > 0) {
      hint.style.display = 'none';
      statsEl.style.display = 'flex';
      statsEl.innerHTML = `<span>写了 <b>${dayCount}</b> 天</span><span><b>${entryCount}</b> 条</span><span><b>${charCount.toLocaleString('zh-CN')}</b> 字</span>`;
    } else {
      statsEl.style.display = 'none';
      hint.style.display = 'block';
    }
  }

  function jumpTo(y, m) {
    if (y < minYear) y = minYear;
    if (y > maxYear) {
      y = maxYear;
      if (m > todayDate.getMonth() && y === currentYear) return;
    }
    year = y;
    month = m;
    paint();
  }

  function shift(delta) {
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y--;
    } else if (m > 11) {
      m = 0;
      y++;
    }
    jumpTo(y, m);
  }

  /* ---------- 年月选择面板：先竖着选年，再选月 ---------- */
  function openPicker() {
    let pickYear = year;
    let mode = 'years';

    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.innerHTML = `
      <div class="sheet" role="dialog" aria-label="选择年月">
        <div class="sheet-head">
          <button class="icon-btn sheet-back" type="button" id="sheet-back" aria-label="回到年份" hidden>${ICONS.back}</button>
          <div class="sheet-title" id="sheet-title">选年份</div>
          <button class="btn ghost sm" type="button" id="sheet-close">关闭</button>
        </div>
        <div class="year-list" id="year-list"></div>
        <div class="month-grid" id="month-grid" hidden></div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const listEl = backdrop.querySelector('#year-list');
    const monthsEl = backdrop.querySelector('#month-grid');
    const titleEl = backdrop.querySelector('#sheet-title');
    const backBtn = backdrop.querySelector('#sheet-back');

    function showYears() {
      mode = 'years';
      titleEl.textContent = '选年份';
      backBtn.hidden = true;
      listEl.hidden = false;
      monthsEl.hidden = true;
      listEl.innerHTML = '';

      for (let y = maxYear; y >= minYear; y--) {
        const st = perYear.get(String(y));
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'year-row' + (y === pickYear ? ' on' : '');
        row.innerHTML = `<span class="y">${y} 年</span><span class="c">${
          st ? `${st.days} 天 · ${st.entries} 条` : '没写过'
        }</span>`;
        row.addEventListener('click', () => {
          pickYear = y;
          showMonths();
        });
        listEl.appendChild(row);
      }

      requestAnimationFrame(() => {
        const on = listEl.querySelector('.year-row.on');
        if (!on) return;
        listEl.scrollTop = on.offsetTop - listEl.clientHeight / 2 + on.offsetHeight / 2;
      });
    }

    function showMonths() {
      mode = 'months';
      titleEl.textContent = `${pickYear} 年 · 选月份`;
      backBtn.hidden = false;
      listEl.hidden = true;
      monthsEl.hidden = false;
      monthsEl.innerHTML = '';

      for (let m = 0; m < 12; m++) {
        const prefix = `${pickYear}-${pad2(m + 1)}-`;
        let cnt = 0;
        for (const [k, v] of counts) if (k.startsWith(prefix)) cnt += v;

        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'month-cell' + (pickYear === year && m === month ? ' on' : '');
        b.textContent = `${m + 1} 月`;
        if (cnt > 0) {
          b.classList.add('has');
          const d = document.createElement('span');
          d.className = 'm-dot';
          b.appendChild(d);
        }
        b.addEventListener('click', () => {
          jumpTo(pickYear, m);
          close();
        });
        monthsEl.appendChild(b);
      }
    }

    function close() {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Backspace' && mode === 'months') {
        e.preventDefault();
        showYears();
      }
    }

    backBtn.addEventListener('click', showYears);
    backdrop.querySelector('#sheet-close').addEventListener('click', close);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    document.addEventListener('keydown', onKey);

    showYears();
  }

  root.querySelector('#prev').addEventListener('click', () => shift(-1));
  root.querySelector('#next').addEventListener('click', () => shift(1));
  root.querySelector('#pick').addEventListener('click', openPicker);
  root.querySelector('#back-today').addEventListener('click', () => {
    const d = new Date();
    jumpTo(d.getFullYear(), d.getMonth());
  });
  root.querySelector('#ondays').addEventListener('click', () => go('#/ondays'));

  paint();
  return () => {};
}
