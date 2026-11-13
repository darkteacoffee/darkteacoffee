// 日期工具。全书唯一处理"每天从几点开始"的地方。

export const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'];
export const WEEKDAY_FULL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

export const pad2 = (n) => String(n).padStart(2, '0');

/** 时间戳 → 'YYYY-MM-DD'。凌晨 startHour 点之前算前一天。 */
export function dayKeyOf(ts, startHour = 4) {
  const d = new Date(ts);
  if (d.getHours() < startHour) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 'YYYY-MM-DD' → 当天零点的 Date 对象（本地时区） */
export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(startHour = 4) {
  return dayKeyOf(Date.now(), startHour);
}

export function isValidKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key);
}

/** 时间戳 → 'HH:MM' */
export function timeHM(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 'YYYY-MM-DD' → '2026年11月13日' */
export function dateCN(key, withYear = true) {
  const d = keyToDate(key);
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return withYear ? `${d.getFullYear()}年${md}` : md;
}

/** 'YYYY-MM-DD' → '星期四' */
export function weekdayCN(key) {
  return WEEKDAY_FULL[keyToDate(key).getDay()];
}

/** 'YYYY-MM-DD' → '11-13'，用于引用 */
export function mmdd(key) {
  return key.slice(5);
}

export function addDays(key, n) {
  const d = keyToDate(key);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 相差天数，b - a */
export function diffDays(a, b) {
  return Math.round((keyToDate(b).getTime() - keyToDate(a).getTime()) / 86400000);
}

/** 相对说法：今天 / 昨天 / 前天 / 11月3日 */
export function relativeLabel(key, todayK) {
  const d = diffDays(key, todayK);
  if (d === 0) return '今天';
  if (d === 1) return '昨天';
  if (d === 2) return '前天';
  if (d === -1) return '明天';
  const dt = keyToDate(key);
  const td = keyToDate(todayK);
  if (dt.getFullYear() === td.getFullYear()) return `${dt.getMonth() + 1}月${dt.getDate()}日`;
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
}

/** 从 from 到 to（含两端），返回按时间顺序的日期数组 */
export function daysRange(from, to) {
  const out = [];
  let cur = from;
  let guard = 0;
  while (diffDays(cur, to) >= 0 && guard++ < 4000) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/**
 * 日历用：返回某年某月的周矩阵，从周一开始。
 * rows: [[{key, day, inMonth, count}], ...]
 */
export function monthRows(year, month /* 0-11 */) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // getDay(): 0=周日。转成「周一为 0」
  const lead = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < lead; i++) {
    const d = new Date(year, month, 1 - (lead - i));
    cells.push({ key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, day: d.getDate(), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ key: `${year}-${pad2(month + 1)}-${pad2(day)}`, day, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const d = keyToDate(last.key);
    d.setDate(d.getDate() + 1);
    cells.push({ key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, day: d.getDate(), inMonth: false });
  }
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** 现在是不是已经跨过了"新的一天"的界线，用来判断页面要不要自动翻页 */
export function msUntilNextDay(startHour = 4) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(startHour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

export function nowHM() {
  return timeHM(Date.now());
}

/** 中文数字年月，日历标题用 */
export function monthTitle(year, month) {
  return `${year}年${month + 1}月`;
}
