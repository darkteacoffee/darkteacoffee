// 往年今日：同一个月日，过去每一年都写过什么

import * as entries from './entries.js';
import { dateCN, weekdayCN, timeHM, todayKey, mmdd, relativeLabel, diffDays } from './dates.js';
import { moodEmoji } from './moods.js';
import { getStartHour } from './settings.js';
import { ICONS } from './icons.js';
import { go } from './router.js';

export async function renderOnDays(root) {
  const startHour = getStartHour();
  const today = todayKey(startHour);
  const tail = mmdd(today); // '11-13'

  const all = await entries.listAll();
  const matched = all.filter((e) => e.dayKey.slice(5) === tail);

  const byYear = new Map();
  for (const e of matched) {
    const y = e.dayKey.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(e);
  }
  const years = [...byYear.keys()].sort().reverse();

  root.innerHTML = `
    <div class="page ondays">
      <header class="page-head">
        <button class="icon-btn" id="back" type="button" aria-label="返回日历">${ICONS.back}</button>
        <div>
          <h1>往年今日</h1>
          <div class="sub">${today.slice(5, 7).replace(/^0/, '')}月${today.slice(8).replace(/^0/, '')}日 · ${
            years.length ? `写过 ${years.length} 个年份` : '还没写过'
          }</div>
        </div>
      </header>
      <div class="scroll">
        <div class="settings-body" id="body"></div>
      </div>
    </div>
  `;

  const body = root.querySelector('#body');

  if (!years.length) {
    body.innerHTML = `
      <div class="empty-state" style="padding-top:40px">
        <div class="big">这一天，往年还没写过</div>
        从明年开始，你每年都能在这儿看到从前的自己。
      </div>`;
  } else {
    for (const y of years) {
      const items = byYear.get(y).sort((a, b) => a.createdAt - b.createdAt);
      const key = items[0].dayKey;
      const ago = Math.round(diffDays(key, today) / 365.25);
      const agoText = ago >= 1 ? `${ago} 年前` : relativeLabel(key, today);

      const sect = document.createElement('div');
      sect.className = 'sect';

      const h = document.createElement('h2');
      h.innerHTML = `${dateCN(key)} ${weekdayCN(key)}　<span style="color:var(--accent);letter-spacing:0">${agoText}</span>`;
      sect.appendChild(h);

      const card = document.createElement('div');
      card.className = 'card card-pad';

      for (const e of items) {
        const art = document.createElement('article');
        art.className = 'seg onday-seg';
        art.tabIndex = 0;
        art.setAttribute('role', 'button');

        const meta = document.createElement('div');
        meta.className = 'seg-meta';
        const t = document.createElement('time');
        t.textContent = timeHM(e.createdAt);
        meta.appendChild(t);
        if (e.mood) {
          const chip = document.createElement('span');
          chip.className = 'mood-chip';
          chip.textContent = moodEmoji(e.mood);
          meta.appendChild(chip);
        }
        const arrow = document.createElement('span');
        arrow.className = 'go-day';
        arrow.textContent = '看这天';
        meta.appendChild(arrow);

        const b = document.createElement('div');
        b.className = 'seg-body';
        if (e.text) b.textContent = e.text;
        else {
          b.classList.add('empty');
          b.textContent = '（只记了心情）';
        }

        art.append(meta, b);
        art.addEventListener('click', () => go('#/day/' + e.dayKey));
        art.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            go('#/day/' + e.dayKey);
          }
        });
        card.appendChild(art);
      }

      sect.appendChild(card);
      body.appendChild(sect);
    }
  }

  root.querySelector('#back').addEventListener('click', () => go('#/calendar'));
  return () => {};
}
