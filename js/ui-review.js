// 「回顾」：只有你点了才会动作

import * as entries from './entries.js';
import {
  PERSONAS,
  getPersona,
  buildSystemPrompt,
  buildUserMessage,
  groupByDay,
  formatMaterials,
  streamChat,
  ApiError,
} from './ai.js';
import { dateCN, weekdayCN, timeHM, todayKey, addDays, daysRange, mmdd, pad2 } from './dates.js';
import { get, save, getStartHour } from './settings.js';
import { toast, toastError, toastOk } from './toast.js';
import { renderMarkdown, escapeHtml } from './markdown.js';
import { go } from './router.js';
import { ICONS } from './icons.js';

function rangeFor(kind, today) {
  if (kind === 'recent30') return { from: addDays(today, -29), to: today, label: '最近 30 天' };
  if (kind === 'month') {
    const d = new Date();
    const from = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
    return { from, to: today, label: '这个月' };
  }
  return { from: addDays(today, -6), to: today, label: '最近 7 天' };
}

export async function renderReview(root, params = {}) {
  const settings = get();
  const startHour = getStartHour();
  const today = todayKey(startHour);

  let rangeKind = 'recent7';
  let personaId = settings.ai.personaId || 'oldfriend';
  let controller = null;
  let streaming = false;
  let mdIndex = new Map(); // '11-09' -> '2026-11-09'

  root.innerHTML = `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>回顾</h1>
          <div class="sub">只在你点的时候才动，平时不联网</div>
        </div>
        <div class="spacer"></div>
        <button class="icon-btn" id="to-settings" type="button" aria-label="设置">${ICONS.gear}</button>
      </header>
      <div class="scroll">
        <div class="review-body">
          <div class="card" style="padding:14px 0 6px;margin-bottom:14px">
            <div style="padding:0 16px 6px;font-size:12.5px;color:var(--fg-faint);letter-spacing:.08em">让谁来说</div>
            <div class="persona-grid" id="personas"></div>
            <div style="padding:0 16px 4px;font-size:12px;color:var(--fg-faint);line-height:1.6" id="persona-desc"></div>
          </div>

          <div style="padding:0 2px 6px;font-size:12.5px;color:var(--fg-faint);letter-spacing:.08em">看哪一段</div>
          <div class="range-pills" id="ranges"></div>

          <div class="ask-wrap">
            <input type="text" id="question" placeholder="想问点什么？（可以不填）" enterkeyhint="send">
            <button class="btn primary" id="go" type="button">看</button>
          </div>

          <div id="confirm-slot"></div>
          <div id="out-slot"></div>
          <div id="history-slot"></div>
        </div>
      </div>
    </div>
  `;

  const personasEl = root.querySelector('#personas');
  const personaDesc = root.querySelector('#persona-desc');
  const rangesEl = root.querySelector('#ranges');
  const questionEl = root.querySelector('#question');
  const goBtn = root.querySelector('#go');
  const confirmSlot = root.querySelector('#confirm-slot');
  const outSlot = root.querySelector('#out-slot');
  const historySlot = root.querySelector('#history-slot');

  /* ---------- 人设 ---------- */
  function paintPersonas() {
    personasEl.innerHTML = '';
    for (const p of PERSONAS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'persona' + (p.id === personaId ? ' on' : '');
      b.textContent = p.name;
      b.addEventListener('click', () => {
        personaId = p.id;
        save({ ai: { personaId } });
        paintPersonas();
      });
      personasEl.appendChild(b);
    }
    const p = getPersona({ ai: { personaId, personaText: settings.ai.personaText } });
    if (personaId === 'custom') {
      const text = (settings.ai.personaText || '').trim();
      personaDesc.innerHTML = text
        ? escapeHtml(text.slice(0, 120)) + (text.length > 120 ? '…' : '')
        : '还没写。去 <a href="#/settings" style="color:var(--accent)">设置</a> 里写一句你想要的人设。';
    } else {
      personaDesc.textContent = p.desc + '：' + p.prompt.slice(0, 46) + '…';
    }
  }

  /* ---------- 范围 ---------- */
  const RANGES = [
    { id: 'recent7', label: '最近 7 天' },
    { id: 'recent30', label: '最近 30 天' },
    { id: 'month', label: '这个月' },
  ];
  function paintRanges() {
    rangesEl.innerHTML = '';
    for (const r of RANGES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pill' + (r.id === rangeKind ? ' on' : '');
      b.textContent = r.label;
      b.addEventListener('click', () => {
        rangeKind = r.id;
        paintRanges();
      });
      rangesEl.appendChild(b);
    }
  }

  /* ---------- 取材料 ---------- */
  async function collect() {
    const { from, to, label } = rangeFor(rangeKind, today);
    const all = await entries.listAll();
    const picked = all.filter((e) => e.dayKey >= from && e.dayKey <= to);
    const grouped = groupByDay(picked);
    const mat = formatMaterials(grouped, { dateCN, weekdayCN, timeHM });
    return { from, to, label, picked, grouped, mat, question: questionEl.value.trim() };
  }

  /* ---------- 发送确认 ---------- */
  function showConfirm(info, onYes) {
    const chars = info.mat.text.length;
    confirmSlot.innerHTML = `
      <div class="banner" style="margin:0 0 14px">
        <div style="flex:1 1 auto">
          将发送 ${info.mat.days} 天 / ${info.mat.entries} 条 / 约 ${chars.toLocaleString('zh-CN')} 字<br>
          <span style="color:var(--fg-dim)">只有这段时间的日记原文，别的不会发出去。</span>
        </div>
        <button class="b-btn" id="do-send" type="button">发出去</button>
        <button class="b-close" id="do-cancel" type="button">取消</button>
      </div>`;
    const yes = confirmSlot.querySelector('#do-send');
    const no = confirmSlot.querySelector('#do-cancel');
    yes.addEventListener('click', () => {
      confirmSlot.innerHTML = '';
      onYes();
    });
    no.addEventListener('click', () => {
      confirmSlot.innerHTML = '';
    });
    yes.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- 渲染回话 ---------- */
  function paintOutput(text, { live = false, meta = null } = {}) {
    outSlot.innerHTML = `
      ${meta ? `<div style="font-size:12px;color:var(--fg-faint);margin:0 2px 8px;display:flex;gap:10px;flex-wrap:wrap">${meta}</div>` : ''}
      <div class="ai-out" id="ai-out">${renderMarkdown(text)}</div>
      <div class="ai-actions" id="ai-actions"></div>
    `;
    const out = outSlot.querySelector('#ai-out');
    bindCites(out);
    if (!live) {
      const actions = outSlot.querySelector('#ai-actions');
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn ghost sm';
      copy.textContent = '复制';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(text);
          toastOk('复制好了');
        } catch {
          toastError('复制不了，长按选中吧');
        }
      });
      const again = document.createElement('button');
      again.type = 'button';
      again.className = 'btn ghost sm';
      again.textContent = '再来一次';
      again.addEventListener('click', () => start());
      actions.append(copy, again);
    }
  }

  function bindCites(scope) {
    scope.querySelectorAll('.cite').forEach((el) => {
      const ref = el.dataset.ref || '';
      let key = '';
      if (ref.startsWith('key:')) key = ref.slice(4);
      else if (ref.startsWith('md:')) {
        const tail = ref.slice(3);
        for (const [k] of mdIndex) {
          if (k.endsWith(tail)) {
            key = k;
            break;
          }
        }
      }
      if (!key) return;
      el.title = '跳到 ' + key;
      el.addEventListener('click', () => go('#/day/' + key));
    });
  }

  /* ---------- 开跑 ---------- */
  async function start() {
    if (streaming) return;
    confirmSlot.innerHTML = '';

    const s = get();
    if (!s.ai.apiKey) {
      toastError('还没填 API Key，先去设置里贴一个');
      go('#/settings?focus=api');
      return;
    }
    if (personaId === 'custom' && !(s.ai.personaText || '').trim()) {
      toastError('自定义人设还没写，去设置里写一句');
      return;
    }

    const info = await collect();
    if (!info.picked.length) {
      toastError('这段时间没有日记，换个范围试试');
      return;
    }

    if (s.ai.confirmSend) {
      showConfirm(info, () => run(info));
    } else {
      run(info);
    }
  }

  async function run(info) {
    streaming = true;
    goBtn.disabled = true;
    questionEl.disabled = true;

    mdIndex = new Map();
    for (const k of info.grouped.keys()) mdIndex.set(k, k);

    outSlot.innerHTML = `<div class="ai-out"><span class="thinking"><i></i><i></i><i></i></span></div>`;
    const box = outSlot.querySelector('.ai-out');
    const actions = document.createElement('div');
    actions.className = 'ai-actions';
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'btn danger sm';
    stop.textContent = '停';
    actions.appendChild(stop);
    outSlot.appendChild(actions);

    controller = new AbortController();
    stop.addEventListener('click', () => controller.abort());

    const persona = getPersona(get());
    const question = info.question;
    const taskType = question ? 'question' : rangeKind;
    const messages = [
      { role: 'system', content: buildSystemPrompt(persona, get().ai.length) },
      { role: 'user', content: buildUserMessage({ materials: info.mat.text, taskType, question }) },
    ];

    let text = '';
    let raf = 0;
    const paintThrottled = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        box.innerHTML = renderMarkdown(text) + '<span style="color:var(--fg-faint)">▌</span>';
        bindCites(box);
      });
    };

    try {
      text = await streamChat({
        baseUrl: get().ai.baseUrl,
        apiKey: get().ai.apiKey,
        model: get().ai.model,
        messages,
        temperature: Number(get().ai.temperature) || 0.75,
        signal: controller.signal,
        onDelta: (_d, full) => {
          text = full;
          paintThrottled();
        },
      });
      if (raf) cancelAnimationFrame(raf);
      if (!text.trim()) {
        box.innerHTML = '<p style="color:var(--fg-faint)">这次什么都没收到，再试一次？</p>';
      } else {
        const label = question ? `问：${question}` : info.label;
        paintOutput(text, {
          live: false,
          meta: `<span>${persona.name}</span><span>${info.label}</span><span>${info.mat.days} 天 ${info.mat.entries} 条</span>`,
        });
        await entries.saveReview({
          persona,
          personaName: persona.name,
          personaId: persona.id,
          label,
          taskType,
          question,
          from: info.from,
          to: info.to,
          text,
          model: get().ai.model,
        });
        loadHistory();
        toastOk('已保存到回顾记录');
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        if (text.trim()) {
          paintOutput(text, { meta: `<span>${persona.name}</span><span>已停止</span>` });
        } else {
          box.innerHTML = '<p style="color:var(--fg-faint)">停了。</p>';
        }
      } else {
        console.error(err);
        const msg = err instanceof ApiError ? err.friendly : err && err.message ? err.message : '出错了';
        box.innerHTML = `<p style="color:var(--danger)">${escapeHtml(msg)}</p>${
          err && err.detail ? `<p style="color:var(--fg-faint);font-size:12px;word-break:break-all">${escapeHtml(String(err.detail).slice(0, 300))}</p>` : ''
        }`;
        if (err instanceof ApiError && err.status === 401) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn ghost sm';
          b.textContent = '去改 Key';
          b.addEventListener('click', () => go('#/settings?focus=api'));
          box.appendChild(b);
        }
      }
    } finally {
      streaming = false;
      controller = null;
      goBtn.disabled = false;
      questionEl.disabled = false;
    }
  }

  /* ---------- 历史 ---------- */
  async function loadHistory() {
    const list = await entries.listReviews(30);
    if (!list.length) {
      historySlot.innerHTML = '';
      return;
    }
    historySlot.innerHTML = `
      <div style="padding:22px 2px 6px;font-size:12.5px;color:var(--fg-faint);letter-spacing:.08em">以前的回顾</div>
      <div id="hist-list"></div>`;
    const host = historySlot.querySelector('#hist-list');
    for (const r of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'history-item';
      const d = new Date(r.createdAt);
      b.innerHTML = `<div class="h-top"><span>${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}</span><span>${escapeHtml(r.personaName || '')}</span><span>${escapeHtml(r.label || '')}</span></div><div class="h-text">${escapeHtml(String(r.text || '').slice(0, 90))}</div>`;
      b.addEventListener('click', () => {
        paintOutput(r.text, {
          meta: `<span>${escapeHtml(r.personaName || '')}</span><span>${escapeHtml(r.label || '')}</span>`,
        });
        outSlot.scrollIntoView({ block: 'start' });
      });
      host.appendChild(b);
    }
  }

  /* ---------- 事件 ---------- */
  goBtn.addEventListener('click', start);
  questionEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      start();
    }
  });
  root.querySelector('#to-settings').addEventListener('click', () => go('#/settings'));

  paintPersonas();
  paintRanges();
  loadHistory();

  return () => {
    if (controller) controller.abort();
  };
}
