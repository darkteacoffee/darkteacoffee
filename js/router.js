// 极简 hash 路由

export function go(hash) {
  const target = hash.startsWith('#') ? hash : '#' + hash;
  if (location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  location.hash = target;
}

export function replaceGo(hash) {
  const target = hash.startsWith('#') ? hash : '#' + hash;
  history.replaceState(null, '', target);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/today';
  const [pathPart, queryPart] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean);
  const params = {};
  if (queryPart) {
    new URLSearchParams(queryPart).forEach((v, k) => {
      params[k] = v;
    });
  }
  return { name: segs[0] || 'today', args: segs.slice(1), params };
}

export function currentRouteName() {
  return parseHash().name;
}
