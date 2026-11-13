// 极简 Markdown 渲染。只给 AI 的回话用。
// 原则：先转义，再加格式，任何情况下都不允许原样插入 HTML。

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 行内格式：加粗、行内代码、引用标记 */
function inline(escaped) {
  let s = escaped;
  // 引用标记：【2026-11-09】或【11-09】
  s = s.replace(/【(\d{4}-\d{2}-\d{2}|\d{1,2}-\d{1,2})】/g, (_m, d) => {
    const key = d.length === 5 ? `md:${d}` : `key:${d}`;
    return `<span class="cite" data-ref="${key}">${d}</span>`;
  });
  // 顺带兼容 [11-09] 写法
  s = s.replace(/\[(\d{4}-\d{2}-\d{2})\]/g, (_m, d) => `<span class="cite" data-ref="key:${d}">${d}</span>`);

  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  return s;
}

export function renderMarkdown(text) {
  const lines = String(text || '').split('\n');
  const out = [];
  let listType = null;
  let para = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      flushPara();
      closeList();
      continue;
    }
    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      closeList();
      out.push(`<h3>${inline(escapeHtml(h[2]))}</h3>`);
      continue;
    }
    // 分隔线
    if (/^(---+|\*\*\*+)$/.test(line.trim())) {
      flushPara();
      closeList();
      continue;
    }
    // 无序列表
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (listType !== 'ul') {
        closeList();
        out.push('<ul>');
        listType = 'ul';
      }
      out.push(`<li>${inline(escapeHtml(ul[1]))}</li>`);
      continue;
    }
    // 有序列表
    const ol = line.match(/^\s*(\d+)[.、)]\s+(.*)$/);
    if (ol) {
      flushPara();
      if (listType !== 'ol') {
        closeList();
        out.push('<ol>');
        listType = 'ol';
      }
      out.push(`<li>${inline(escapeHtml(ol[2]))}</li>`);
      continue;
    }
    // 引用
    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      flushPara();
      closeList();
      out.push(`<blockquote>${inline(escapeHtml(bq[1]))}</blockquote>`);
      continue;
    }
    closeList();
    para.push(escapeHtml(line));
  }
  flushPara();
  closeList();
  return out.join('');
}
