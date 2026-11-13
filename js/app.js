// 启动、路由、收尾

import { parseHash } from './router.js';
import { applyTheme, get, getStartHour } from './settings.js';
import { todayKey } from './dates.js';
import { openDB } from './db.js';
import { requestPersist } from './storage.js';
import { applyBackground } from './background.js';
import { listAll as listAllEntries } from './entries.js';
import { gcOrphans } from './assets.js';
import { renderToday } from './ui-today.js';
import { renderCalendar } from './ui-calendar.js';
import { renderOnDays } from './ui-ondays.js';
import { renderSearch } from './ui-search.js';
import { renderReview } from './ui-review.js';
import { renderSettings } from './ui-settings.js';
import { toastError } from './toast.js';

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
const boot = document.getElementById('boot');

let cleanup = null;
let renderSeq = 0;
let lastDayKey = null;

const TAB_OF = {
  today: 'today',
  day: 'today',
  calendar: 'calendar',
  ondays: 'calendar',
  search: 'search',
  review: 'review',
  settings: null,
};

function setTab(name) {
  tabbar.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('on', b.dataset.route === name);
  });
}

function errorView(err) {
  const msg = err && err.message ? err.message : String(err);
  view.innerHTML = `
    <div class="page">
      <div class="empty-state" style="margin-top:60px">
        <div class="big">这一页没打开</div>
        <div style="color:var(--danger);word-break:break-all;font-size:12.5px;margin-top:8px">${msg.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</div>
        <div style="margin-top:20px"><button class="btn ghost" onclick="location.hash='#/today';location.reload()">回到今天</button></div>
      </div>
    </div>`;
}

async function renderRoute() {
  const mySeq = ++renderSeq;
  const route = parseHash();

  if (cleanup) {
    try {
      cleanup();
    } catch (e) {
      console.warn('清理上一页出错', e);
    }
    cleanup = null;
  }

  setTab(TAB_OF[route.name] === undefined ? null : TAB_OF[route.name]);

  let fn;
  let params = {};
  if (route.name === 'today') fn = renderToday;
  else if (route.name === 'day') {
    fn = renderToday;
    params = { dayKey: route.args[0] };
  } else if (route.name === 'calendar') fn = renderCalendar;
  else if (route.name === 'ondays') fn = renderOnDays;
  else if (route.name === 'search') fn = renderSearch;
  else if (route.name === 'review') fn = renderReview;
  else if (route.name === 'settings') {
    fn = renderSettings;
    params = route.params;
  } else {
    location.hash = '#/today';
    return;
  }

  try {
    const result = await fn(view, params);
    if (mySeq !== renderSeq) return; // 已经被下一次导航顶掉了
    cleanup = typeof result === 'function' ? result : null;
  } catch (err) {
    console.error(err);
    if (mySeq === renderSeq) errorView(err);
  }

  hideBoot();
}

function hideBoot() {
  if (!boot || boot.classList.contains('hide')) return;
  boot.classList.add('hide');
  setTimeout(() => boot.remove(), 400);
}

/* ---------- 主循环：跨过凌晨就自己翻页 ---------- */
function watchDayChange() {
  lastDayKey = todayKey(getStartHour());
  setInterval(() => {
    const now = todayKey(getStartHour());
    if (now !== lastDayKey) {
      lastDayKey = now;
      const r = parseHash();
      if (r.name === 'today' || r.name === 'day') renderRoute();
    }
  }, 30000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = todayKey(getStartHour());
    if (now !== lastDayKey) {
      lastDayKey = now;
      const r = parseHash();
      if (r.name === 'today' || r.name === 'day') renderRoute();
    }
  });
}

/* ---------- 离线缓存 ---------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              // 有新版本，悄悄换掉，下次打开就是新的
              sw.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch((e) => console.warn('离线缓存没装上（不影响使用）', e));
  });
}

/* ---------- 全局兜底 ---------- */
window.addEventListener('error', (e) => {
  console.error('[全局错误]', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[未处理的异步错误]', e.reason);
});

/* ---------- 启动 ---------- */
async function bootApp() {
  applyTheme();
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (get().theme === 'auto') applyTheme();
    });
  }

  try {
    await openDB();
  } catch (err) {
    console.error(err);
    errorView(new Error('本地数据库打不开：' + (err.message || '未知原因') + '。如果是安卓的隐私模式，先退出试试。'));
    hideBoot();
    return;
  }

  // 请求"长期保存"，免得浏览器空间紧张时把日记清掉
  requestPersist().catch(() => {});
  // 恢复背景图
  applyBackground().catch(() => {});

  // 清掉没人用的图片（比如选了图但最后没点「记下」）
  try {
    const live = await listAllEntries();
    await gcOrphans(live);
  } catch (e) {
    console.warn('清理孤立图片失败（不影响使用）', e);
  }

  tabbar.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.tab');
    if (!btn) return;
    location.hash = '#/' + btn.dataset.route;
  });

  window.addEventListener('hashchange', renderRoute);

  watchDayChange();
  await renderRoute();
  registerSW();
}

bootApp();
