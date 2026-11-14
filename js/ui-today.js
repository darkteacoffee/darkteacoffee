// 「今天」/「某一天」

import * as entries from './entries.js';
import { dateCN, weekdayCN, timeHM, todayKey, relativeLabel, diffDays } from './dates.js';
import { MOODS, moodEmoji } from './moods.js';
import { getStartHour, readDraft, saveDraft, clearDraft, get, save } from './settings.js';
import { toast, toastError, toastOk } from './toast.js';
import { ICONS } from './icons.js';
import { go } from './router.js';
import {
  savePhoto,
  getAssets,
  getAsset,
  deleteAsset,
  makeURL,
  pickImageFile,
  MAX_ENTRY_IMAGES,
} from './assets.js';
import { getNote, saveNote, deleteNote } from './notes.js';
import { PERSONAS, getPersona, buildDayMessages, streamChat, ApiError } from './ai.js';
import { formatMaterials } from './ai.js';
import { renderMarkdown, escapeHtml } from './markdown.js';

let lastFocusedDay = null;

function shouldShowBackupBanner(statsInfo) {
  const s = get();
  if (!s.backupReminder) return false;
  if (!statsInfo || statsInfo.entries === 0) return false;
  const now = Date.now();
  if (s.reminderSnoozeUntil && now < s.reminderSnoozeUntil) return false;
  const since = s.lastBackupAt || 0;
  if (!since) {
    if (!statsInfo.firstDay) return false;
    return diffDays(statsInfo.firstDay, todayKey()) >= 7;
  }
  return now - since > 7 * 86400000;
}

const CAMERA_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h2.6L8 6h8l1.4 2.5H20a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18v-8A1.5 1.5 0 0 1 4 8.5Z"/><circle cx="12" cy="13.5" r="3.2"/></svg>';

export async function renderToday(root, params = {}) {
  const startHour = getStartHour();
  const today = todayKey(startHour);
  const dayKey = params.dayKey && /^\d{4}-\d{2}-\d{2}$/.test(params.dayKey) ? params.dayKey : today;
  const isToday = dayKey === today;

  let items = await entries.listDay(dayKey);
  let note = await getNote(dayKey);
  const statsInfo = await entries.stats();
  const draft = readDraft(dayKey);

  // 往年的今天写过几年（只在「今天」页给个入口）
  let pastYears = 0;
  if (isToday) {
    const all = await entries.listAll();
    const tail = dayKey.slice(5);
    const set = new Set();
    for (const e of all) {
      if (e.dayKey !== dayKey && e.dayKey.slice(5) === tail) set.add(e.dayKey.slice(0, 4));
    }
    pastYears = set.size;
  }

  root.innerHTML = `
    <div class="page">
      <header class="day-head">
        <div class="d-main">
          <div class="d-date" id="d-date">${dateCN(dayKey)}</div>
          <div class="d-meta" id="d-meta">
            <span>${weekdayCN(dayKey)}</span>
            <span class="dot-sep">·</span>
            <span id="rel">${relativeLabel(dayKey, today)}</span>
            <span class="dot-sep">·</span>
            <span id="cnt">${items.length ? items.length + ' 条' : '还没有记录'}</span>
            ${isToday ? '' : '<span class="dot-sep">·</span><a href="#/today" class="back-today">回到今天</a>'}
          </div>
        </div>
        <button class="icon-btn" id="btn-settings" type="button" aria-label="设置">${ICONS.gear}</button>
      </header>

      ${
        shouldShowBackupBanner(statsInfo)
          ? `<div class="banner" id="backup-banner">
               <div style="flex:1 1 auto">已经有一阵没备份了。日记只存在这台手机里，清浏览器数据会没了。</div>
               <button class="b-btn" data-act="backup" type="button">备份</button>
               <button class="b-close" data-act="snooze" type="button" aria-label="稍后">${ICONS.close}</button>
             </div>`
          : ''
      }

      <div class="segments" id="segments"></div>

      <div class="composer">
        <div class="composer-inner">
          <div class="composer-imgs" id="pending" style="display:none"></div>
          <textarea id="ta" rows="1" placeholder="${isToday ? '今天想写点什么…' : '补记点什么…'}" enterkeyhint="enter" autocomplete="off"></textarea>
          <div class="composer-bar">
            <button class="img-btn" id="btn-img" type="button" aria-label="加图片" title="加图片">${CAMERA_ICON}</button>
            <div class="moods" id="moods">
              ${MOODS.map((m) => `<button class="mood-btn" type="button" data-mood="${m.v}" aria-label="${m.label}" title="${m.label}">${m.emoji}</button>`).join('')}
            </div>
            <button class="send-btn" id="send" type="button">记下</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const segWrap = root.querySelector('#segments');
  const ta = root.querySelector('#ta');
  const sendBtn = root.querySelector('#send');
  const moodsWrap = root.querySelector('#moods');
  const cntEl = root.querySelector('#cnt');
  const pendingWrap = root.querySelector('#pending');
  const imgBtn = root.querySelector('#btn-img');

  let selectedMood = draft && draft.mood ? Number(draft.mood) : 0;
  let busy = false;
  let noteBusy = false;
  let pending = []; // { id, url }
  let thumbUrls = [];

  /* ---------- 图片：已选未发的 ---------- */
  function paintPending() {
    if (!pending.length) {
      pendingWrap.style.display = 'none';
      pendingWrap.innerHTML = '';
      return;
    }
    pendingWrap.style.display = 'flex';
    pendingWrap.innerHTML = '';
    for (const p of pending) {
      const box = document.createElement('div');
      box.className = 'thumb';
      const img = document.createElement('img');
      img.src = p.url;
      img.alt = '';
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'x';
      x.textContent = '×';
      x.setAttribute('aria-label', '去掉这张');
      x.addEventListener('click', async () => {
        URL.revokeObjectURL(p.url);
        pending = pending.filter((q) => q.id !== p.id);
        paintPending();
        updateSendState();
        try {
          await deleteAsset(p.id);
        } catch { /* 下次启动会再清 */ }
      });
      box.append(img, x);
      pendingWrap.appendChild(box);
    }
  }

  async function addImages() {
    if (busy) return;
    const room = MAX_ENTRY_IMAGES - pending.length;
    if (room <= 0) {
      toastError(`一条最多 ${MAX_ENTRY_IMAGES} 张图`);
      return;
    }
    const files = await pickImageFile(true);
    if (!files.length) return;

    const take = files.slice(0, room);
    if (files.length > room) toast(`一次最多 ${MAX_ENTRY_IMAGES} 张，多的先放掉了`, 'err', 2600);

    busy = true;
    imgBtn.style.opacity = '0.4';
    const toastTimer = toast('正在处理图片…', '', 20000);
    try {
      for (const f of take) {
        try {
          const a = await savePhoto(f);
          pending.push({ id: a.id, url: makeURL(a.thumb || a.blob) });
          paintPending();
        } catch (err) {
          toastError(err && err.message ? err.message : '这张图没处理好');
        }
      }
    } finally {
      busy = false;
      imgBtn.style.opacity = '';
      if (toastTimer) toastTimer();
      paintPending();
      updateSendState();
    }
  }

  /* ---------- 看图 ---------- */
  async function openViewer(ids, index) {
    const overlay = document.createElement('div');
    overlay.className = 'viewer';
    overlay.innerHTML = `
      <button class="close" type="button" aria-label="关闭">${ICONS.close}</button>
      <img alt="">
    `;
    document.body.appendChild(overlay);

    const imgEl = overlay.querySelector('img');
    let showIdx = index;
    let url = null;
    let navPrev = null;
    let navNext = null;

    async function show(i) {
      showIdx = (i + ids.length) % ids.length;
      const a = await getAsset(ids[showIdx]);
      if (!a) return;
      if (url) URL.revokeObjectURL(url);
      url = makeURL(a.blob);
      imgEl.src = url;
    }

    if (ids.length > 1) {
      navPrev = document.createElement('button');
      navPrev.className = 'viewer-nav prev';
      navPrev.type = 'button';
      navPrev.textContent = '‹';
      navNext = document.createElement('button');
      navNext.className = 'viewer-nav next';
      navNext.type = 'button';
      navNext.textContent = '›';
      overlay.append(navPrev, navNext);
      navPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        show(showIdx - 1);
      });
      navNext.addEventListener('click', (e) => {
        e.stopPropagation();
        show(showIdx + 1);
      });
    }

    function close() {
      if (url) URL.revokeObjectURL(url);
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft' && navPrev) show(showIdx - 1);
      if (e.key === 'ArrowRight' && navNext) show(showIdx + 1);
    }

    overlay.querySelector('.close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target === imgEl) {
        if (e.target === imgEl && ids.length > 1) {
          show(showIdx + 1);
          return;
        }
        close();
      }
    });
    document.addEventListener('keydown', onKey);

    await show(index);
  }

  /* ---------- 渲染这一天 ---------- */
  async function paintSegments() {
    for (const u of thumbUrls) URL.revokeObjectURL(u);
    thumbUrls = [];

    const keepTop = segWrap.scrollTop;
    segWrap.innerHTML = '';

    const ids = items.flatMap((e) => e.images || []);
    let assetMap = new Map();
    if (ids.length) {
      try {
        const rows = await getAssets(ids);
        assetMap = new Map(rows.map((a) => [a.id, a]));
      } catch { /* 图读不出来就先不显示 */ }
    }

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = isToday
        ? '<div class="big">今天还是一片空白</div>写一句也算，贴张图也算。'
        : '<div class="big">这天没有记录</div>如果想起来点什么，下面可以补记。';
      segWrap.appendChild(empty);
    } else {
      for (const e of items) segWrap.appendChild(buildSegment(e, assetMap));
      segWrap.appendChild(buildNoteBlock());
    }

    if (pastYears > 0) {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'ondays-link';
      link.innerHTML = `往年今日 · 写过 <b>${pastYears}</b> 个年份 ›`;
      link.addEventListener('click', () => go('#/ondays'));
      segWrap.appendChild(link);
    }

    segWrap.scrollTop = keepTop;
  }

  function buildSegment(e, assetMap) {
    const art = document.createElement('article');
    art.className = 'seg';
    art.dataset.id = e.id;

    const meta = document.createElement('div');
    meta.className = 'seg-meta';
    const time = document.createElement('time');
    time.textContent = timeHM(e.createdAt);
    meta.appendChild(time);

    if (e.mood) {
      const chip = document.createElement('span');
      chip.className = 'mood-chip';
      chip.textContent = moodEmoji(e.mood);
      chip.title = MOODS.find((m) => m.v === e.mood)?.label || '';
      meta.appendChild(chip);
    }

    const actions = document.createElement('div');
    actions.className = 'seg-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.dataset.act = 'edit';
    editBtn.textContent = '改';
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.dataset.act = 'del';
    delBtn.className = 'del';
    delBtn.textContent = '删';
    actions.append(editBtn, delBtn);
    meta.appendChild(actions);

    const body = document.createElement('div');
    body.className = 'seg-body';
    if (e.text) {
      body.textContent = e.text;
    } else if (!e.images || !e.images.length) {
      body.classList.add('empty');
      body.textContent = '（只记了心情）';
    } else {
      body.style.display = 'none';
    }

    art.append(meta, body);

    if (e.images && e.images.length) {
      const box = document.createElement('div');
      box.className = 'seg-imgs';
      const SHOW = 6;
      const list = e.images.slice(0, SHOW);

      list.forEach((id, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-label', '看大图');
        const a = assetMap.get(id);
        if (a) {
          const src = makeURL(a.thumb || a.blob);
          thumbUrls.push(src);
          const img = document.createElement('img');
          img.src = src;
          img.alt = '';
          img.loading = 'lazy';
          btn.appendChild(img);
        } else {
          btn.style.background = 'var(--bg-elev-2)';
        }
        if (i === list.length - 1 && e.images.length > SHOW) {
          const more = document.createElement('span');
          more.className = 'more';
          more.textContent = `+${e.images.length - SHOW}`;
          btn.appendChild(more);
        }
        btn.addEventListener('click', () => openViewer(e.images, i));
        box.appendChild(btn);
      });

      art.appendChild(box);
    }

    return art;
  }

  /* ---------- 这一天的 AI 评价 ---------- */
  function buildNoteBlock() {
    const wrap = document.createElement('div');
    wrap.className = 'day-note';

    if (!note) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'note-ask';
      btn.innerHTML = '<span class="spark">✦</span>让 AI 说说这一天';
      btn.addEventListener('click', () => generateNote());
      wrap.appendChild(btn);
      return wrap;
    }

    const card = document.createElement('div');
    card.className = 'note-card';

    const head = document.createElement('div');
    head.className = 'note-head';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = note.personaName || 'AI';
    const when = document.createElement('span');
    when.textContent = '对 ' + dateCN(dayKey) + ' 的看法';
    head.append(who, when);
    card.appendChild(head);

    const body = document.createElement('div');
    body.className = 'note-body';
    body.innerHTML = renderMarkdown(note.text);
    card.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'note-actions';

    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'btn ghost sm';
    again.textContent = '重新生成';
    again.addEventListener('click', () => generateNote(note.personaId));

    const swap = document.createElement('button');
    swap.type = 'button';
    swap.className = 'btn ghost sm';
    swap.textContent = '换个人设';
    swap.addEventListener('click', () => togglePersonaRow(card));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn ghost sm';
    del.textContent = '删掉';
    del.addEventListener('click', async () => {
      if (!window.confirm('删掉这条评价？')) return;
      await deleteNote(dayKey);
      note = null;
      await paintSegments();
    });

    actions.append(again, swap, del);
    card.appendChild(actions);
    wrap.appendChild(card);
    return wrap;
  }

  function togglePersonaRow(card) {
    const old = card.querySelector('.note-personas');
    if (old) {
      old.remove();
      return;
    }
    const row = document.createElement('div');
    row.className = 'note-personas';
    for (const p of PERSONAS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'persona' + (p.id === note.personaId ? ' on' : '');
      b.textContent = p.name;
      b.addEventListener('click', () => generateNote(p.id));
      row.appendChild(b);
    }
    card.appendChild(row);
  }

  async function generateNote(personaId) {
    if (noteBusy) return;
    const s = get();
    if (!s.ai.apiKey) {
      toastError('还没填 API Key，先去设置里贴一个');
      go('#/settings?focus=api');
      return;
    }
    if (!items.length) return;
    const pid = personaId || s.ai.personaId || 'oldfriend';
    const persona = getPersona({ ai: { ...s.ai, personaId: pid } });
    if (pid === 'custom' && persona.isDefault) {
      toastError('自定义人设还是空的，去设置里写一句');
      go('#/settings');
      return;
    }
    const mat = formatMaterials(new Map([[dayKey, items]]), { dateCN, weekdayCN, timeHM });
    const messages = buildDayMessages({
      persona,
      materials: mat.text,
      dateLabel: `${dateCN(dayKey)} ${weekdayCN(dayKey)}`,
      length: s.ai.length,
    });

    noteBusy = true;
    const block = segWrap.querySelector('.day-note');
    if (!block) {
      noteBusy = false;
      return;
    }

    block.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'note-card';
    const head = document.createElement('div');
    head.className = 'note-head';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = persona.name;
    const st = document.createElement('span');
    st.textContent = '正在写…';
    head.append(who, st);
    const body = document.createElement('div');
    body.className = 'note-body';
    body.innerHTML = '<span class="thinking"><i></i><i></i><i></i></span>';
    card.append(head, body);
    block.appendChild(card);

    const controller = new AbortController();
    let text = '';
    let raf = 0;
    const paint = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        body.innerHTML = renderMarkdown(text) + '<span style="color:var(--fg-faint)">▌</span>';
      });
    };

    try {
      text = await streamChat({
        baseUrl: s.ai.baseUrl,
        apiKey: s.ai.apiKey,
        model: s.ai.model,
        messages,
        signal: controller.signal,
        onDelta: (_d, full) => {
          text = full;
          paint();
        },
      });
      if (!text.trim()) throw new Error('这次什么都没收到，再试一次？');
      note = await saveNote({
        dayKey,
        text,
        personaId: persona.id,
        personaName: persona.name,
        model: s.ai.model,
      });
      await paintSegments();
      toastOk('写好了');
    } catch (err) {
      console.error(err);
      const msg = err instanceof ApiError ? err.friendly : err && err.message ? err.message : '出错了';
      body.innerHTML = '';
      const p = document.createElement('p');
      p.style.color = 'var(--danger)';
      p.textContent = msg;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn ghost sm';
      retry.textContent = '再试一次';
      retry.addEventListener('click', () => generateNote(pid));
      body.append(p, retry);
    } finally {
      noteBusy = false;
    }
  }

  /* ---------- 心情 ---------- */
  function paintMoods() {
    moodsWrap.querySelectorAll('.mood-btn').forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.mood) === selectedMood);
    });
  }

  function autoGrow() {
    ta.style.height = 'auto';
    const max = Math.round(window.innerHeight * 0.34);
    ta.style.height = Math.min(ta.scrollHeight, max) + 'px';
  }

  function updateSendState() {
    const ready = ta.value.trim().length > 0 || selectedMood > 0 || pending.length > 0;
    sendBtn.classList.toggle('ready', ready);
  }

  /* ---------- 草稿 ---------- */
  let draftTimer = null;
  function scheduleDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      saveDraft(dayKey, { text: ta.value, mood: selectedMood });
    }, 350);
  }

  /* ---------- 保存 ---------- */
  async function submit() {
    const text = ta.value.replace(/\s+$/, '');
    if (busy) return;
    if (!text.trim() && !selectedMood && !pending.length) return;
    busy = true;
    sendBtn.disabled = true;
    try {
      const created = await entries.addEntry({
        text,
        mood: selectedMood,
        images: pending.map((p) => p.id),
        dayKey: isToday ? null : dayKey,
      });
      for (const p of pending) URL.revokeObjectURL(p.url);
      pending = [];
      ta.value = '';
      selectedMood = 0;
      clearDraft(dayKey);
      autoGrow();
      paintPending();
      paintMoods();
      updateSendState();
      items = await entries.listDay(dayKey);
      await paintSegments();
      cntEl.textContent = items.length + ' 条';
      requestAnimationFrame(() => {
        segWrap.scrollTop = segWrap.scrollHeight;
      });
      toast('记下了 ' + timeHM(created.createdAt), '', 1500);
    } catch (err) {
      console.error(err);
      toastError('没存上：' + (err && err.message ? err.message : '未知原因'));
    } finally {
      busy = false;
      sendBtn.disabled = false;
      if (isToday) ta.focus({ preventScroll: true });
    }
  }

  /* ---------- 编辑 ---------- */
  async function startEdit(art, id) {
    const e = items.find((x) => x.id === id);
    if (!e) return;
    const bodyHtml = art.querySelector('.seg-body');
    if (!bodyHtml) return;
    art.classList.add('seg-edit');

    const wrap = document.createElement('div');
    const editor = document.createElement('textarea');
    editor.value = e.text;
    editor.rows = 3;

    const bar = document.createElement('div');
    bar.className = 'edit-bar';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn ghost sm';
    cancel.textContent = '取消';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn primary sm';
    saveBtn.textContent = '保存';
    bar.append(cancel, saveBtn);

    wrap.append(editor, bar);
    bodyHtml.style.display = '';
    art.replaceChild(wrap, bodyHtml);
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);

    cancel.addEventListener('click', () => {
      art.classList.remove('seg-edit');
      art.replaceChild(bodyHtml, wrap);
    });
    saveBtn.addEventListener('click', async () => {
      const next = editor.value.replace(/\s+$/, '');
      if (next === e.text) {
        cancel.click();
        return;
      }
      saveBtn.disabled = true;
      try {
        await entries.updateEntry(id, { text: next });
        items = await entries.listDay(dayKey);
        await paintSegments();
        toast('改好了', '', 1400);
      } catch (err) {
        toastError('改不了：' + (err && err.message ? err.message : '未知原因'));
        saveBtn.disabled = false;
      }
    });
  }

  async function doDelete(id) {
    const e = items.find((x) => x.id === id);
    const preview = e && e.text ? e.text.slice(0, 24) + (e.text.length > 24 ? '…' : '') : '这条记录';
    const hasImg = e && e.images && e.images.length;
    const tip = hasImg ? `删掉「${preview}」？\n\n这一条连同 ${e.images.length} 张图都会没，找不回来。` : `删掉「${preview}」？\n\n删了就找不回来了。`;
    if (!window.confirm(tip)) return;
    try {
      await entries.deleteEntry(id);
      if (hasImg) {
        for (const imgId of e.images) {
          try {
            await deleteAsset(imgId);
          } catch { /* 忽略 */ }
        }
      }
      items = await entries.listDay(dayKey);
      await paintSegments();
      cntEl.textContent = items.length ? items.length + ' 条' : '还没有记录';
      toast('删掉了', '', 1400);
    } catch (err) {
      toastError('删不掉：' + (err && err.message ? err.message : '未知原因'));
    }
  }

  /* ---------- 事件 ---------- */
  segWrap.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const art = btn.closest('.seg');
    if (!art) return;
    const id = art.dataset.id;
    if (btn.dataset.act === 'edit') startEdit(art, id);
    if (btn.dataset.act === 'del') doDelete(id);
  });

  moodsWrap.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.mood-btn');
    if (!btn) return;
    const v = Number(btn.dataset.mood);
    selectedMood = selectedMood === v ? 0 : v;
    paintMoods();
    updateSendState();
    scheduleDraft();
  });

  imgBtn.addEventListener('click', addImages);

  ta.addEventListener('input', () => {
    autoGrow();
    updateSendState();
    scheduleDraft();
  });
  ta.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      submit();
    }
  });
  sendBtn.addEventListener('click', submit);

  const gear = root.querySelector('#btn-settings');
  if (gear) gear.addEventListener('click', () => go('#/settings'));

  const banner = root.querySelector('#backup-banner');
  if (banner) {
    banner.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'snooze') {
        save({ reminderSnoozeUntil: Date.now() + 3 * 86400000 });
        banner.remove();
      } else if (b.dataset.act === 'backup') {
        go('#/settings?focus=backup');
      }
    });
  }

  /* ---------- 初始化 ---------- */
  paintPending();
  paintMoods();
  if (draft && draft.text) {
    ta.value = draft.text;
  }
  autoGrow();
  updateSendState();
  await paintSegments();

  requestAnimationFrame(() => {
    segWrap.scrollTop = segWrap.scrollHeight;
  });

  if (isToday && lastFocusedDay !== dayKey) {
    lastFocusedDay = dayKey;
    setTimeout(() => {
      try {
        ta.focus({ preventScroll: true });
      } catch { /* 有些浏览器不让自动弹键盘 */ }
    }, 260);
  } else if (!isToday) {
    lastFocusedDay = null;
  }

  let flipTimer = null;
  const scheduleFlip = () => {
    clearTimeout(flipTimer);
    const now = new Date();
    const next = new Date(now);
    next.setHours(startHour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    flipTimer = setTimeout(() => {
      const newToday = todayKey(getStartHour());
      if (newToday !== today) {
        lastFocusedDay = null;
        go('#/today');
      }
    }, Math.max(1500, next - now + 1200));
  };
  scheduleFlip();

  return () => {
    clearTimeout(flipTimer);
    clearTimeout(draftTimer);
    for (const u of thumbUrls) URL.revokeObjectURL(u);
    thumbUrls = [];
  };
}
