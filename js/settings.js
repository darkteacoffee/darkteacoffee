// 设置：存在浏览器 localStorage 里，不联网。

const KEY = 'yiri.settings.v1';

export const DEFAULT_SETTINGS = {
  dayStartHour: 4,        // 凌晨几点前算前一天；0 表示按自然日
  theme: 'auto',          // auto | dark | light
  fontScale: 1,           // 0.9 | 1 | 1.12
  backupReminder: true,
  lastBackupAt: 0,
  reminderSnoozeUntil: 0,

  bgAssetId: '',   // 背景图的图片 id
  bgDim: 0.5,      // 0 ~ 0.85，压暗程度，图太花时保证字看得清
  bgBlur: 0,       // 0 ~ 16，模糊像素
  bgFit: 'cover',  // cover=铺满（边缘会被裁）/ contain=完整（可能留边）

  ai: {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    apiKey: '',
    personaId: 'oldfriend',
    personaOverrides: {},
    personaText: '',
    length: 'normal',
    temperature: 0.75,
    confirmSend: true,
  },
};

let cache = null;
const listeners = new Set();

function deepMerge(base, patch) {
  const out = { ...base };
  for (const k of Object.keys(patch || {})) {
    const v = patch[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export function load() {
  if (cache) return cache;
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    stored = {};
  }
  cache = deepMerge(DEFAULT_SETTINGS, stored);
  return cache;
}

export function get() {
  return load();
}

export function save(patch = {}) {
  cache = deepMerge(load(), patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('设置保存失败', e);
  }
  listeners.forEach((fn) => fn(cache));
  return cache;
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getStartHour() {
  return Number(load().dayStartHour) || 0;
}

/* ---------- 主题 ---------- */
export function applyTheme() {
  const s = load();
  const html = document.documentElement;
  let theme = s.theme;
  if (theme === 'auto') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  html.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#faf7f1' : '#100f0d');
  html.style.setProperty('--fs', `${(17 * (Number(s.fontScale) || 1)).toFixed(1)}px`);
}

/* ---------- 草稿：没点「记下」也不丢 ---------- */
const DRAFT_PREFIX = 'yiri.draft.';

export function saveDraft(dayKey, draft) {
  try {
    if (!draft || (!draft.text && !draft.mood)) {
      localStorage.removeItem(DRAFT_PREFIX + dayKey);
    } else {
      localStorage.setItem(DRAFT_PREFIX + dayKey, JSON.stringify(draft));
    }
  } catch { /* 存不下就算了，不影响主流程 */ }
}

export function readDraft(dayKey) {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + dayKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearDraft(dayKey) {
  try {
    localStorage.removeItem(DRAFT_PREFIX + dayKey);
  } catch { /* 忽略 */ }
}
