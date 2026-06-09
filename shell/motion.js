// Motion language tokens — all animation goes through here
// Dynamically imports motion so a CDN failure degrades gracefully instead of breaking boot.

let _animate = null;
let _springFn = null;
export let inView = null;
export let hover = null;
export let press = null;

(async () => {
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/motion@11/+esm');
    _animate = mod.animate;
    _springFn = mod.spring;
    inView = mod.inView;
    hover = mod.hover;
    press = mod.press;
  } catch(e) {
    console.warn('Motion library failed to load; animations disabled.', e);
  }
})();

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const spring = {
  snappy: () => _springFn ? _springFn({ stiffness: 520, damping: 30 }) : 'ease-out',
  smooth: () => _springFn ? _springFn({ stiffness: 280, damping: 30 }) : 'ease-in-out',
  gentle: () => _springFn ? _springFn({ stiffness: 120, damping: 26 }) : 'ease-in-out',
};

export function motion(el, keyframes, options = {}) {
  const last = Array.isArray(keyframes) ? keyframes[keyframes.length - 1] : keyframes;
  if (reduced || !_animate) {
    Object.assign(el.style, last);
    return { finished: Promise.resolve() };
  }
  return _animate(el, keyframes, options);
}
