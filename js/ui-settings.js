// 设置

import * as entries from './entries.js';
import * as backup from './backup.js';
import { get, save, applyTheme, getStartHour } from './settings.js';
import { toast, toastError, toastOk } from './toast.js';
import {
  PERSONAS,
  PROVIDERS,
  guessProvider,
  getPersona,
  personaIsEdited,
  testConnection,
  listModels,
  buildSystemPrompt,
  buildUserMessage,
  groupByDay,
  formatMaterials,
  ApiError,
} from './ai.js';
import { todayKey, addDays, dateCN, weekdayCN, timeHM } from './dates.js';
import { ICONS } from './icons.js';
import { go } from './router.js';
import { escapeHtml } from './markdown.js';
import { stampReadable } from './backup.js';
import { usage as storageUsage, formatBytes, requestPersist } from './storage.js';
import {
  pickImageFile,
  savePhoto,
  deleteAsset,
  getAsset,
  putAsset,
  listAssets,
  totalBytes,
} from './assets.js';
import { applyBackground } from './background.js';
import { listNotes, mergeNotes } from './notes.js';

export async function renderSettings(root, params = {}) {
  const s = get();
  const info = await entries.stats();
  let imgBytes = 0;
  try {
    imgBytes = await totalBytes();
  } catch { /* 忽略 */ }

  root.innerHTML = `
    <div class="page">
      <header class="page-head">
        <button class="icon-btn" id="back" type="button" aria-label="返回">${ICONS.back}</button>
        <h1>设置</h1>
        <div class="spacer"></div>
      </header>
      <div class="scroll">
        <div class="settings-body">

          <div class="sect" id="sect-write">
            <h2>写作</h2>
            <div class="card">
              <div class="row">
                <div class="lab">
                  <div class="t">每天从几点开始</div>
                  <div class="d">半夜写的日记算前一天，还是算新的一天。默认凌晨 4 点。</div>
                </div>
                <div class="ctl">
                  <select id="day-start">
                    ${[0, 1, 2, 3, 4, 5, 6].map((h) => `<option value="${h}" ${h === s.dayStartHour ? 'selected' : ''}>${h === 0 ? '0 点（自然日）' : '凌晨 ' + h + ' 点'}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="row">
                <div class="lab"><div class="t">字号</div></div>
                <div class="ctl">
                  <select id="font-scale">
                    <option value="0.9" ${s.fontScale == 0.9 ? 'selected' : ''}>小</option>
                    <option value="1" ${s.fontScale == 1 ? 'selected' : ''}>标准</option>
                    <option value="1.12" ${s.fontScale == 1.12 ? 'selected' : ''}>大</option>
                    <option value="1.24" ${s.fontScale == 1.24 ? 'selected' : ''}>特大</option>
                  </select>
                </div>
              </div>
              <div class="row">
                <div class="lab">
                  <div class="t">浅色 / 深色</div>
                  <div class="d">默认跟随手机系统。</div>
                </div>
                <div class="ctl">
                  <select id="theme">
                    <option value="auto" ${s.theme === 'auto' ? 'selected' : ''}>跟随系统</option>
                    <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>深色</option>
                    <option value="light" ${s.theme === 'light' ? 'selected' : ''}>浅色</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div class="sect" id="sect-look">
            <h2>外观</h2>
            <div class="card">
              <div class="row">
                <div class="lab">
                  <div class="t">背景图</div>
                  <div class="d" id="bg-state">没有设置</div>
                </div>
                <div class="ctl">
                  <button class="btn ghost sm" id="bg-pick" type="button">选择</button>
                  <button class="btn ghost sm" id="bg-clear" type="button">移除</button>
                </div>
              </div>
              <div class="field" id="bg-tune" style="display:none">
                <label>压暗　<span id="dim-val">50%</span></label>
                <input type="range" id="bg-dim" min="0" max="0.9" step="0.05">
                <label style="margin-top:10px">模糊　<span id="blur-val">0px</span></label>
                <input type="range" id="bg-blur" min="0" max="16" step="1">
                <label style="margin-top:12px">怎么铺</label>
                <select id="bg-fit">
                  <option value="cover">铺满整屏（图的比例不对，边缘会被裁掉）</option>
                  <option value="contain">完整显示（会留边，但整张图都在）</option>
                </select>
                <div class="hint">图太花、字看不清的时候，把「压暗」往右拉。它压的是你当前主题的底色，不会把浅色界面弄黑。</div>
              </div>
            </div>
          </div>

          <div class="sect" id="sect-ai">
            <h2>AI</h2>
            <div class="card">
              <div class="field" id="field-api">
                <label for="api-key">API Key</label>
                <div style="display:flex;gap:8px">
                  <input type="password" id="api-key" placeholder="sk-..." autocomplete="off" spellcheck="false" value="${escapeHtml(s.ai.apiKey || '')}">
                  <button class="btn ghost sm" id="toggle-key" type="button" style="flex:0 0 auto">显示</button>
                </div>
                <div class="hint">贴进来就行，只存在这台手机里。点「看」之前，什么都不会发出去。</div>
              </div>

              <div class="field">
                <label for="provider">用哪一家</label>
                <select id="provider"></select>
                <div class="hint">换一家会自动把地址填好，你只要贴那家的 Key。用中转或者地址不在列表里，选「自定义」自己填。</div>
              </div>

              <div class="field">
                <label for="base-url">接口地址</label>
                <input type="text" id="base-url" spellcheck="false" value="${escapeHtml(s.ai.baseUrl || '')}">
              </div>

              <div class="field">
                <label for="model">模型</label>
                <div style="display:flex;gap:8px">
                  <input type="text" id="model" list="model-list" spellcheck="false" placeholder="比如 deepseek-chat" value="${escapeHtml(s.ai.model || '')}">
                  <button class="btn ghost sm" id="fetch-models" type="button" style="flex:0 0 auto">读取列表</button>
                </div>
                <datalist id="model-list"></datalist>
                <div id="model-chips" class="chip-row"></div>
                <div class="hint">不知道填什么就点「读取列表」，用你的 Key 问服务商现在有哪些模型。也可以直接手打。</div>
              </div>

              <div class="row">
                <div class="lab">
                  <div class="t">AI 说多长</div>
                  <div class="d">嫌它啰嗦就选「简短」。回顾和每天的评价都跟着这个走。</div>
                </div>
                <div class="ctl">
                  <select id="ai-length">
                    <option value="short" ${s.ai.length === 'short' ? 'selected' : ''}>简短</option>
                    <option value="normal" ${s.ai.length === 'normal' ? 'selected' : ''}>标准</option>
                    <option value="long" ${s.ai.length === 'long' ? 'selected' : ''}>详细</option>
                  </select>
                </div>
              </div>

              <div class="field">
                <label>人设</label>
                <div class="persona-grid" id="personas" style="padding:0"></div>
                <textarea id="persona-text" style="margin-top:10px;min-height:120px" placeholder="写一段你想要的人设，比如：说话直接，不要安慰我，问我问题多于给结论。"></textarea>
                <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
                  <div class="hint" id="persona-hint" style="margin:0;flex:1 1 auto"></div>
                  <button class="btn ghost sm" id="persona-reset" type="button" hidden style="flex:0 0 auto">恢复默认</button>
                  <button class="btn ghost sm" id="persona-save" type="button" disabled style="flex:0 0 auto">保存</button>
                </div>
              </div>

              <div class="row">
                <div class="lab">
                  <div class="t">发送前先确认</div>
                  <div class="d">每次点「看」时，先告诉你要发多少内容出去。</div>
                </div>
                <div class="ctl"><button class="switch ${s.ai.confirmSend ? 'on' : ''}" id="sw-confirm" type="button" aria-label="切换"></button></div>
              </div>
              <div class="row">
                <div class="lab">
                  <div class="t">看看实际发出去的内容</div>
                  <div class="d">把当前人设拼好的提示词原样摊开，确认 AI 真的收到了你写的那段话。</div>
                </div>
                <div class="ctl"><button class="btn ghost sm" id="preview-ai" type="button">预览</button></div>
              </div>
              <div class="row">
                <div class="lab">
                  <div class="t">测一下</div>
                  <div class="d">发一条极短的请求，看 Key 和模型通不通。</div>
                </div>
                <div class="ctl"><button class="btn ghost sm" id="test-ai" type="button">测试连接</button></div>
              </div>
            </div>
          </div>

          <div class="sect" id="sect-data">
            <h2>数据</h2>
            <div class="card">
              <div class="mini-stat">
                <span>一共 <b>${info.days}</b> 天</span>
                <span><b>${info.entries}</b> 条</span>
                <span><b>${info.chars.toLocaleString('zh-CN')}</b> 字</span>
                ${imgBytes > 0 ? `<span>图片 <b>${formatBytes(imgBytes)}</b></span>` : ''}
                ${info.firstDay ? `<span>从 <b>${info.firstDay}</b> 起</span>` : ''}
              </div>
            </div>
            <div class="card" style="margin-top:10px">
              <div class="row">
                <div class="lab">
                  <div class="t">占用的空间</div>
                  <div class="d" id="storage-info">正在统计…</div>
                </div>
              </div>
            </div>
            <div class="card" style="margin-top:10px">
              <div class="row" id="row-backup">
                <div class="lab">
                  <div class="t">备份</div>
                  <div class="d">${
                    s.lastBackupAt
                      ? '上次备份：' + stampReadable(s.lastBackupAt)
                      : '还没备份过。日记和图片只在这台手机里，清浏览器数据就没了。'
                  }</div>
                </div>
                <div class="ctl"><button class="btn primary sm" id="do-backup" type="button">备份</button></div>
              </div>
              <div class="row">
                <div class="lab">
                  <div class="t">导入 / 合并</div>
                  <div class="d">从另一台设备导出的备份，合并进来不会覆盖这边的。图片也会一起带过来。</div>
                </div>
                <div class="ctl"><button class="btn ghost sm" id="do-import" type="button">选文件</button></div>
              </div>
              <div class="row">
                <div class="lab">
                  <div class="t">导出成纯文字</div>
                  <div class="d">一天一段的 Markdown，什么软件都能打开（不含图片）。</div>
                </div>
                <div class="ctl"><button class="btn ghost sm" id="do-md" type="button">导出</button></div>
              </div>
              <div class="row">
                <div class="lab">
                  <div class="t">每周提醒备份</div>
                  <div class="d">超过一周没备份时，在今天那页提示一下。</div>
                </div>
                <div class="ctl"><button class="switch ${s.backupReminder ? 'on' : ''}" id="sw-reminder" type="button" aria-label="切换"></button></div>
              </div>
            </div>
          </div>

          <div class="sect">
            <h2>关于</h2>
            <div class="card">
              <div class="row">
                <div class="lab">
                  <div class="t">一日 · v1.11.0</div>
                  <div class="d">日记和图片只存在这台设备上，不上传、不需要账号。AI 只在你点「看」的时候，把选中的那几天发出去（不含图片）。</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  `;

  const $ = (sel) => root.querySelector(sel);

  $('#back').addEventListener('click', () => go('#/today'));

  $('#day-start').addEventListener('change', (e) => {
    save({ dayStartHour: Number(e.target.value) });
    toastOk('改好了，只影响以后写的');
  });
  $('#font-scale').addEventListener('change', (e) => {
    save({ fontScale: Number(e.target.value) });
    applyTheme();
  });
  $('#theme').addEventListener('change', (e) => {
    save({ theme: e.target.value });
    applyTheme();
    applyBackground();
  });

  /* ---------- 背景图 ---------- */
  function refreshBg() {
    const cur = get();
    const has = !!cur.bgAssetId;
    const state = $('#bg-state');
    if (state) state.textContent = has ? '已设置，往下可以调压暗和模糊' : '没有设置';
    const tune = $('#bg-tune');
    if (tune) tune.style.display = has ? 'block' : 'none';
    const pick = $('#bg-pick');
    if (pick) pick.textContent = has ? '换一张' : '选择';
    const dim = $('#bg-dim');
    const blur = $('#bg-blur');
    if (dim) dim.value = String(cur.bgDim ?? 0.5);
    if (blur) blur.value = String(cur.bgBlur ?? 0);
    const fit = $('#bg-fit');
    if (fit) fit.value = cur.bgFit === 'contain' ? 'contain' : 'cover';
    const dv = $('#dim-val');
    const bv = $('#blur-val');
    if (dv) dv.textContent = Math.round((cur.bgDim ?? 0.5) * 100) + '%';
    if (bv) bv.textContent = (cur.bgBlur ?? 0) + 'px';
  }

  $('#bg-pick').addEventListener('click', async () => {
    const files = await pickImageFile(false);
    if (!files.length) return;
    const btn = $('#bg-pick');
    btn.disabled = true;
    const tick = toast('正在处理图片…', '', 20000);
    try {
      const old = get().bgAssetId;
      const a = await savePhoto(files[0]);
      save({ bgAssetId: a.id });
      await applyBackground();
      if (old && old !== a.id) deleteAsset(old).catch(() => {});
      refreshBg();
      toastOk('背景换好了');
    } catch (err) {
      toastError(err && err.message ? err.message : '这张图没处理好');
    } finally {
      btn.disabled = false;
      if (tick) tick();
    }
  });

  $('#bg-clear').addEventListener('click', async () => {
    const old = get().bgAssetId;
    save({ bgAssetId: '' });
    await applyBackground();
    if (old) deleteAsset(old).catch(() => {});
    refreshBg();
    toastOk('背景去掉了');
  });

  let bgTimer = null;
  function onBgSlide() {
    const dim = Number($('#bg-dim').value);
    const blur = Number($('#bg-blur').value);
    save({ bgDim: dim, bgBlur: blur });
    $('#dim-val').textContent = Math.round(dim * 100) + '%';
    $('#blur-val').textContent = blur + 'px';
    clearTimeout(bgTimer);
    bgTimer = setTimeout(() => applyBackground(), 60);
  }
  $('#bg-dim').addEventListener('input', onBgSlide);
  $('#bg-blur').addEventListener('input', onBgSlide);
  $('#bg-fit').addEventListener('change', async (e) => {
    save({ bgFit: e.target.value });
    await applyBackground();
  });

  /* ---------- AI：Key 和服务商 ---------- */
  const keyInput = $('#api-key');
  let keyTimer = null;
  keyInput.addEventListener('input', () => {
    clearTimeout(keyTimer);
    keyTimer = setTimeout(() => save({ ai: { apiKey: keyInput.value.trim() } }), 400);
  });
  $('#toggle-key').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const showing = keyInput.type === 'text';
    keyInput.type = showing ? 'password' : 'text';
    btn.textContent = showing ? '显示' : '隐藏';
  });

  const providerEl = $('#provider');
  const baseInput = $('#base-url');
  const modelInput = $('#model');
  const modelListEl = $('#model-list');
  const modelChips = $('#model-chips');

  for (const p of PROVIDERS) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name;
    providerEl.appendChild(o);
  }
  providerEl.value = s.ai.provider || guessProvider(s.ai.baseUrl);

  function fillModelOptions(models) {
    modelListEl.innerHTML = '';
    modelChips.innerHTML = '';
    if (!models.length) return;
    for (const m of models) {
      const o = document.createElement('option');
      o.value = m;
      modelListEl.appendChild(o);
    }
    for (const m of models.slice(0, 24)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pill' + (modelInput.value.trim() === m ? ' on' : '');
      b.textContent = m;
      b.addEventListener('click', () => {
        modelInput.value = m;
        save({ ai: { model: m } });
        [...modelChips.children].forEach((c) => c.classList.toggle('on', c === b));
        modelInput.focus();
      });
      modelChips.appendChild(b);
    }
  }

  providerEl.addEventListener('change', () => {
    const p = PROVIDERS.find((x) => x.id === providerEl.value);
    if (!p) return;
    fillModelOptions(p.models);
    if (p.base) baseInput.value = p.base;
    if (p.models.length) {
      const cur = modelInput.value.trim();
      if (!cur || !p.models.includes(cur)) modelInput.value = p.models[0];
    }
    save({
      ai: { provider: p.id, baseUrl: baseInput.value.trim(), model: modelInput.value.trim() },
    });
    toastOk(p.id === 'custom' ? '自己填地址和模型名' : '地址已自动填好，贴上这家的 Key 就行');
  });

  baseInput.addEventListener('change', () => {
    const base = baseInput.value.trim();
    save({ ai: { baseUrl: base, provider: guessProvider(base) } });
    providerEl.value = guessProvider(base);
  });

  modelInput.addEventListener('change', () => {
    save({ ai: { model: modelInput.value.trim() } });
    [...modelChips.children].forEach((c) => c.classList.toggle('on', c.textContent === modelInput.value.trim()));
  });

  $('#fetch-models').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '问…';
    try {
      const cur = get();
      const models = await listModels({
        baseUrl: baseInput.value.trim() || cur.ai.baseUrl,
        apiKey: keyInput.value.trim() || cur.ai.apiKey,
      });
      fillModelOptions(models);
      if (!modelInput.value.trim() || !models.includes(modelInput.value.trim())) modelInput.value = models[0];
      save({ ai: { model: modelInput.value.trim() } });
      toastOk(`读到 ${models.length} 个模型，点上面的小方块就能换`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.friendly : err && err.message ? err.message : '读不到模型列表';
      toastError(msg);
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  });

  /* ---------- AI：篇幅 ---------- */
  $('#ai-length').addEventListener('change', (e) => {
    save({ ai: { length: e.target.value } });
    toastOk('下次生成就按这个长度');
  });

  /* ---------- AI：人设 ---------- */
  const personasEl = $('#personas');
  const personaText = $('#persona-text');
  const personaHint = $('#persona-hint');
  const personaReset = $('#persona-reset');
  const personaSave = $('#persona-save');
  let personaId = get().ai.personaId || 'oldfriend';
  let personaSaved = ''; // 上一次保存下来的文本，用来判断有没有改动

  function builtinPrompt(id) {
    if (id === 'custom') return '';
    const p = PERSONAS.find((x) => x.id === id);
    return p ? p.prompt : '';
  }

  /** 这个人当前存着的有效文本 */
  function storedTextOf(id) {
    const cur = get();
    const ov = cur.ai.personaOverrides || {};
    if (id === 'custom') return String(ov.custom ?? cur.ai.personaText ?? '');
    const edited = String(ov[id] || '');
    return edited.trim() ? edited : builtinPrompt(id);
  }

  function setHint() {
    const dirty = personaText.value !== personaSaved;
    const edited = personaIsEdited(get(), personaId);
    personaSave.disabled = !dirty;
    personaSave.classList.toggle('primary', dirty);
    personaSave.classList.toggle('ghost', !dirty);
    personaHint.classList.toggle('dirty', dirty);

    if (dirty) {
      personaHint.textContent = '有改动，还没保存';
    } else if (personaId === 'custom' && !personaText.value.trim()) {
      personaHint.textContent = '还是空的。写一句你想让它怎么说话，然后点「保存」。';
    } else if (edited) {
      personaHint.textContent = '已保存。这段是你改过的，会一直生效。';
    } else {
      personaHint.textContent = '这是默认的人设原文，改完点「保存」。';
    }
  }

  /** 把输入框里的内容写进设置，返回是否真的写了 */
  function commitPersona(silent = true) {
    if (personaText.value === personaSaved) return false;
    const cur = get();
    const ov = { ...(cur.ai.personaOverrides || {}) };
    const val = personaText.value;
    // 改回和默认一模一样，就不算「改过」
    ov[personaId] = val.trim() === builtinPrompt(personaId).trim() ? '' : val;
    save({ ai: { personaOverrides: ov } });
    personaSaved = val;
    personaReset.hidden = !personaIsEdited(get(), personaId);
    setHint();
    if (!silent) toastOk('人设已保存');
    return true;
  }

  function paintPersonas() {
    personasEl.innerHTML = '';
    for (const p of PERSONAS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'persona' + (p.id === personaId ? ' on' : '');
      b.textContent = p.name;
      b.title = p.desc;
      b.addEventListener('click', () => {
        commitPersona(true); // 切换前先把上一段存住
        personaId = p.id;
        save({ ai: { personaId } });
        paintPersonas();
      });
      personasEl.appendChild(b);
    }

    personaText.value = storedTextOf(personaId);
    personaSaved = personaText.value;
    personaReset.hidden = !personaIsEdited(get(), personaId);
    setHint();
  }

  personaText.addEventListener('input', setHint);

  personaSave.addEventListener('click', () => {
    if (!commitPersona(false)) toast('没有改动');
  });

  personaReset.addEventListener('click', () => {
    const cur = get();
    const ov = { ...(cur.ai.personaOverrides || {}) };
    ov[personaId] = '';
    save({ ai: { personaOverrides: ov } });
    paintPersonas();
    toastOk('恢复默认了');
  });

  const swConfirm = $('#sw-confirm');
  swConfirm.addEventListener('click', () => {
    const on = !swConfirm.classList.contains('on');
    swConfirm.classList.toggle('on', on);
    save({ ai: { confirmSend: on } });
  });

  const swReminder = $('#sw-reminder');
  swReminder.addEventListener('click', () => {
    const on = !swReminder.classList.contains('on');
    swReminder.classList.toggle('on', on);
    save({ backupReminder: on });
  });

  /* ---------- 看实际发出去的提示词 ---------- */
  function showPreview(name, sys, user) {
    const overlay = document.createElement('div');
    overlay.className = 'sheet-backdrop';
    const cut = user.length > 1800;
    overlay.innerHTML = `
      <div class="sheet preview-sheet">
        <div class="sheet-head">
          <div class="sheet-title">人设：${escapeHtml(name)}　这是每次生成时真的发出去的东西</div>
          <button class="btn ghost sm" id="pv-close" type="button">关闭</button>
        </div>
        <div class="preview-body">
          <div class="preview-label">第一部分 · 告诉它是谁（你写的人设就在最上面）</div>
          <pre class="preview-pre">${escapeHtml(sys)}</pre>
          <div class="preview-label">第二部分 · 让它看的内容</div>
          <pre class="preview-pre">${escapeHtml(cut ? user.slice(0, 1800) + '\n\n……后面还有 ' + (user.length - 1800) + ' 字' : user)}</pre>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#pv-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  $('#preview-ai').addEventListener('click', async () => {
    const cur = get();
    const persona = getPersona(cur);
    const sys = buildSystemPrompt(persona, cur.ai.length);

    let user = '';
    try {
      const all = await entries.listAll();
      const today = todayKey(getStartHour());
      const from = addDays(today, -6);
      const picked = all.filter((e) => e.dayKey >= from && e.dayKey <= today);
      const mat = formatMaterials(groupByDay(picked), { dateCN, weekdayCN, timeHM });
      user = buildUserMessage({ materials: mat.text || '（最近七天没有记录）', taskType: 'recent7' });
    } catch {
      user = buildUserMessage({ materials: '（读取失败）', taskType: 'recent7' });
    }

    showPreview(persona.name, sys, user);
  });

  $('#test-ai').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const cur = get();
    btn.disabled = true;
    btn.textContent = '测…';
    try {
      await testConnection({
        baseUrl: baseInput.value.trim() || cur.ai.baseUrl,
        apiKey: keyInput.value.trim() || cur.ai.apiKey,
        model: modelInput.value.trim() || cur.ai.model,
      });
      toastOk('通了，Key 和模型都能用');
    } catch (err) {
      const msg = err instanceof ApiError ? err.friendly : err && err.message ? err.message : '连不上';
      toastError(msg);
    } finally {
      btn.disabled = false;
      btn.textContent = '测试连接';
    }
  });

  /* ---------- 数据 ---------- */
  $('#do-backup').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '打包中…';
    try {
      const rows = await entries.exportRows();
      const live = rows.filter((r) => !r.deleted);
      if (!live.length) {
        toastError('还没有可备份的内容');
        return;
      }
      const cur = get();
      const used = new Set(rows.flatMap((r) => r.images || []));
      if (cur.bgAssetId) used.add(cur.bgAssetId);
      const allImgs = await listAssets();
      const imgs = allImgs.filter((a) => used.has(a.id));
      const reviews = await entries.listReviews(1000);
      const notes = await listNotes();
      const blob = await backup.exportBackupBlob({
        entries: rows,
        reviews,
        notes,
        images: imgs,
        settings: {
          dayStartHour: cur.dayStartHour,
          theme: cur.theme,
          fontScale: cur.fontScale,
          bgAssetId: cur.bgAssetId,
          bgDim: cur.bgDim,
          bgBlur: cur.bgBlur,
          bgFit: cur.bgFit,
          ai: {
            provider: cur.ai.provider,
            baseUrl: cur.ai.baseUrl,
            model: cur.ai.model,
            personaId: cur.ai.personaId,
            personaOverrides: cur.ai.personaOverrides,
            personaText: cur.ai.personaText,
            length: cur.ai.length,
            confirmSend: cur.ai.confirmSend,
          },
        },
      });
      const mode = await backup.shareOrDownload(blob, backup.backupFilename());
      if (mode === 'cancelled') return;
      save({ lastBackupAt: Date.now(), reminderSnoozeUntil: 0 });
      const size = (blob.size / 1024 / 1024).toFixed(2);
      toastOk(`备份好了：${live.length} 条 + ${imgs.length} 张图，${size} MB`);
      const sub = root.querySelector('#row-backup .d');
      if (sub) sub.textContent = '上次备份：' + stampReadable(Date.now());
    } catch (err) {
      console.error(err);
      toastError('备份失败：' + (err && err.message ? err.message : '未知原因'));
    } finally {
      btn.disabled = false;
      btn.textContent = '备份';
    }
  });

  $('#do-import').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '读文件中…';
    try {
      const file = await backup.pickFile();
      if (!file) return;
      const parsed = await backup.parseBackupBuffer(file.bytes);

      let newImgs = 0;
      for (const img of parsed.images) {
        if (await getAsset(img.id)) continue;
        await putAsset(img);
        newImgs++;
      }

      const res = await entries.merge(parsed.entries);
      const rv = await entries.mergeReviews(parsed.reviews);
      const nt = await mergeNotes(parsed.notes);

      let applied = false;
      if (parsed.settings) {
        const yes = window.confirm(
          '这个备份里还带着那台设备的外观和 AI 设置（人设、背景图、模型名、篇幅等）。\n\n要一起套用到这台设备吗？\n\n（API Key 不在备份里，不会覆盖你现在填的）'
        );
        if (yes) {
          save(parsed.settings);
          applyTheme();
          await applyBackground();
          applied = true;
        }
      }

      toastOk(
        `合并完成：新增 ${res.added} 条，更新 ${res.updated} 条` +
          (newImgs ? `，图片 ${newImgs} 张` : '') +
          (rv ? `，回顾 ${rv} 条` : '') +
          (nt ? `，当日评价 ${nt} 条` : '') +
          (applied ? '，设置已套用' : '')
      );
      if (res.invalid) toast(`${res.invalid} 条格式不对，已跳过`, 'err');
    } catch (err) {
      console.error(err);
      toastError('导入失败：' + (err && err.message ? err.message : '这个文件读不了'));
    } finally {
      btn.disabled = false;
      btn.textContent = '选文件';
    }
  });

  $('#do-md').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const live = await entries.listAll({ fresh: true });
      if (!live.length) {
        toastError('还没有可导出的内容');
        return;
      }
      const blob = backup.makeMarkdownBlob(live);
      const mode = await backup.shareOrDownload(blob, backup.markdownFilename(), '一日 · 日记文本');
      if (mode !== 'cancelled') toastOk('导出好了');
    } catch (err) {
      console.error(err);
      toastError('导出失败：' + (err && err.message ? err.message : '未知原因'));
    } finally {
      btn.disabled = false;
    }
  });

  paintPersonas();
  fillModelOptions([]);
  refreshBg();

  /* ---------- 空间占用 ---------- */
  (async () => {
    const el = root.querySelector('#storage-info');
    if (!el) return;
    const u = await storageUsage();
    let persisted = false;
    try {
      if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted();
      if (!persisted) persisted = (await requestPersist()) === 'granted';
    } catch { /* 拿不到就算了 */ }
    const bits = [];
    if (u) bits.push(`已占 ${formatBytes(u.used)}，这台设备最多能给约 ${formatBytes(u.quota)}`);
    bits.push(persisted ? '已获得长期保存，空间紧张时也不会被自动清掉' : '还没拿到长期保存授权，务必备份');
    el.textContent = bits.join('。') + '。';
  })();

  /* ---------- 跳转聚焦 ---------- */
  if (params.focus === 'api') {
    setTimeout(() => {
      const el = $('#field-api');
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        keyInput.focus({ preventScroll: true });
      }
    }, 200);
  } else if (params.focus === 'backup') {
    setTimeout(() => {
      const el = $('#row-backup');
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 200);
  }

  return () => {
    // 离开设置页之前，把没点保存的内容也存住
    commitPersona(true);
    clearTimeout(keyTimer);
    clearTimeout(bgTimer);
  };
}
