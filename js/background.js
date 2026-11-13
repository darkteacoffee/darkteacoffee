// 背景图：把用户选的图垫到最底下，并且用当前主题的底色压暗，保证字看得清。

import { get } from './settings.js';
import { getAsset, makeURL } from './assets.js';

let currentUrl = null;
let currentId = null;

function paintLayer(layer, s) {
  const dim = Math.min(0.92, Math.max(0, Number(s.bgDim) || 0));
  const blur = Math.min(20, Math.max(0, Number(s.bgBlur) || 0));
  layer.style.backgroundSize = s.bgFit === 'contain' ? 'contain' : 'cover';
  layer.style.backgroundPosition = 'center';
  layer.style.backgroundRepeat = 'no-repeat';
  layer.style.backgroundImage =
    `linear-gradient(rgba(var(--bg-rgb), ${dim}), rgba(var(--bg-rgb), ${dim})), url("${currentUrl}")`;
  layer.style.filter = blur > 0 ? `blur(${blur}px)` : 'none';
  // 模糊会把边缘糊出透明带，稍微放大一点盖住
  layer.style.transform = blur > 0 ? 'scale(1.08)' : 'none';
}

export async function applyBackground() {
  const layer = document.getElementById('bg-photo');
  if (!layer) return;

  const s = get();

  if (!s.bgAssetId) {
    layer.style.display = 'none';
    layer.style.backgroundImage = 'none';
    layer.style.filter = 'none';
    document.documentElement.classList.remove('has-photo');
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
      currentId = null;
    }
    return;
  }

  // 同一张图，只是调了压暗/模糊：不重新解码
  if (s.bgAssetId === currentId && currentUrl) {
    paintLayer(layer, s);
    layer.style.display = 'block';
    document.documentElement.classList.add('has-photo');
    return;
  }

  let asset = null;
  try {
    asset = await getAsset(s.bgAssetId);
  } catch {
    asset = null;
  }
  if (!asset) {
    layer.style.display = 'none';
    document.documentElement.classList.remove('has-photo');
    return;
  }

  const oldUrl = currentUrl;
  currentUrl = makeURL(asset.blob);
  currentId = s.bgAssetId;
  paintLayer(layer, s);
  layer.style.display = 'block';
  document.documentElement.classList.add('has-photo');

  if (oldUrl) setTimeout(() => URL.revokeObjectURL(oldUrl), 1500);
}
