import { adoptTailwind } from '/shell/shadow-tailwind.js';

// Shared Web-Component scaffolding, composed by AppModuleBase and the standalone
// modules (chat, builder, files, notes) so the boilerplate lives in one place.

// Session-level CSS text cache — re-opening a window type skips the network.
const _cssCache = new Map();
export async function fetchCssCached(url) {
  if (_cssCache.has(url)) return _cssCache.get(url);
  const text = await fetch(url).then(r => r.text()).catch(() => '');
  _cssCache.set(url, text);
  return text;
}

// Attach shadow DOM, inject module CSS (plus any extras), create the .wrapper,
// adopt Tailwind, then wait one tick for the shell to set el.api on the element.
// Returns { shadow, wrapper }.
export async function setupShell(host, { cssUrl, extraCssUrls = [] } = {}) {
  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  const sheets = await Promise.all([cssUrl, ...extraCssUrls].filter(Boolean).map(fetchCssCached));
  styleEl.textContent = sheets.join('\n');
  const wrapper = document.createElement('div');
  wrapper.className = 'wrapper';
  shadow.appendChild(styleEl);
  shadow.appendChild(wrapper);
  await adoptTailwind(shadow, wrapper);
  // Wait one tick for el.api to be set by the shell after the element is created.
  await new Promise(r => setTimeout(r, 0));
  return { shadow, wrapper };
}

// Watch <html class> for dark-mode flips and run applyFn on change.
// Returns a cleanup fn for disconnectedCallback.
export function observeTheme(applyFn) {
  const obs = new MutationObserver(applyFn);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => obs.disconnect();
}
