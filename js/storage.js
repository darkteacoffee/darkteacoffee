// 让浏览器别在空间紧张时把日记清掉，顺便看看占了多少地方。

export async function requestPersist() {
  if (!navigator.storage || !navigator.storage.persist) return 'unsupported';
  try {
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return 'granted';
    const ok = await navigator.storage.persist();
    return ok ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

export async function usage() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const { usage: used = 0, quota = 0 } = await navigator.storage.estimate();
    return { used, quota };
  } catch {
    return null;
  }
}

export function formatBytes(n) {
  if (!n || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
