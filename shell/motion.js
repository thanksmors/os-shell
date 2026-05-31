// Motion language tokens — all animation goes through here
import { animate } from 'https://cdn.jsdelivr.net/npm/motion@11/+esm';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const spring = {
  snappy: { type: 'spring', stiffness: 520, damping: 30 },
  smooth: { type: 'spring', stiffness: 280, damping: 30 },
  gentle: { type: 'spring', stiffness: 120, damping: 26 },
};

export function motion(el, keyframes, options = {}) {
  if (reduced) {
    // snap to end state
    const last = Array.isArray(keyframes) ? keyframes[keyframes.length - 1] : keyframes;
    Object.assign(el.style, last);
    return { finished: Promise.resolve() };
  }
  return animate(el, keyframes, options);
}
