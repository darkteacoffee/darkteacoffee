// 屏幕下方的轻提示

let wrap = null;

function ensure() {
  if (!wrap) wrap = document.getElementById('toast-wrap');
  return wrap;
}

export function toast(message, type = '', ms = 2400) {
  const host = ensure();
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;
  host.appendChild(el);
  const timer = setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, ms);
  return () => {
    clearTimeout(timer);
    el.remove();
  };
}

export const toastError = (msg) => toast(msg, 'err', 3600);
export const toastOk = (msg) => toast(msg, '', 2000);
