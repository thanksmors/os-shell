// Motion language tokens — all animation goes through here
// Dynamically imports motion so a CDN failure degrades gracefully instead of breaking boot.

let _animate = null;
let _springFn = null;
export let inView = null;
export let hover = null;
export let press = null;
export let stagger = null;

(async () => {
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/motion@11/+esm');
    _animate = mod.animate;
    _springFn = mod.spring;
    inView = mod.inView;
    hover = mod.hover;
    press = mod.press;
    stagger = mod.stagger;
  } catch(e) {
    console.warn('Motion library failed to load; animations disabled.', e);
  }
})();

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// vanilla Motion v11 spring takes { visualDuration, bounce }, not React's { stiffness, damping }
export const spring = {
  snappy: () => _springFn ? _springFn({ visualDuration: 0.3, bounce: 0.35 }) : 'ease-out',
  smooth: () => _springFn ? _springFn({ visualDuration: 0.5, bounce: 0.1 }) : 'ease-in-out',
  gentle: () => _springFn ? _springFn({ visualDuration: 0.7, bounce: 0.05 }) : 'ease-in-out',
};

export function motion(el, keyframes, options = {}) {
  const last = Array.isArray(keyframes) ? keyframes[keyframes.length - 1] : keyframes;
  if (reduced || !_animate) {
    Object.assign(el.style, last);
    return { finished: Promise.resolve() };
  }
  try {
    return _animate(el, keyframes, options);
  } catch (e) {
    console.warn('motion() failed:', e);
    Object.assign(el.style, last);
    return { finished: Promise.resolve() };
  }
}
