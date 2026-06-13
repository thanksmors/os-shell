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

// ─── Generated-module blob assembly ──────────────────────────────────────────
// Generated apps are stored as a files map (or legacy single `js`). At runtime
// each file becomes a blob URL; the entry file imports feature files by relative
// name. Blob URLs have no origin, so absolute /shell//modules imports and the
// relative ./feature.js imports must be rewritten before blob creation.

const _rewriteAbsImports = (code, origin) => code
  .replace(/from '\/shell\//g, `from '${origin}/shell/`)
  .replace(/from "\/shell\//g, `from "${origin}/shell/`)
  .replace(/from '\/modules\//g, `from '${origin}/modules/`)
  .replace(/from "\/modules\//g, `from "${origin}/modules/`);

// Normalize a stored module to { files, entryFile }. Legacy single-file modules
// (`{ js }`) become a one-entry map so all readers share one code path.
export function moduleFiles(mod) {
  if (mod?.files && typeof mod.files === 'object' && Object.keys(mod.files).length) {
    return { files: mod.files, entryFile: mod.entryFile || 'main.js' };
  }
  return { files: { 'index.js': mod?.js || '' }, entryFile: 'index.js' };
}

// Create a blob per JS file (star topology: entry imports ./feature.js files;
// features import only /shell//modules). Optionally swap the custom-element tag
// in the entry file (fromTag→toTag, for the hot-swap versioning). Returns the
// entry file's blob URL to register as the app `entry`.
export function assembleModuleBlobs({ files, entryFile, fromTag, toTag }) {
  const origin = window.location.origin;
  const nameToUrl = {};
  for (const [name, code] of Object.entries(files)) {
    if (name === entryFile) continue;
    const js = _rewriteAbsImports(code || '', origin);
    nameToUrl[name] = URL.createObjectURL(new Blob([js], { type: 'application/javascript' }));
  }
  let entry = files[entryFile] || '';
  if (fromTag && toTag) {
    entry = entry.replaceAll(`'${fromTag}'`, `'${toTag}'`).replaceAll(`"${fromTag}"`, `"${toTag}"`);
  }
  entry = _rewriteAbsImports(entry, origin);
  for (const [name, url] of Object.entries(nameToUrl)) {
    const noExt = name.replace(/\.js$/, '');
    for (const spec of [`./${name}`, `./${noExt}`]) {
      entry = entry.replaceAll(`'${spec}'`, `'${url}'`).replaceAll(`"${spec}"`, `"${url}"`);
    }
  }
  return URL.createObjectURL(new Blob([entry], { type: 'application/javascript' }));
}

// Watch <html class> for dark-mode flips and run applyFn on change.
// Returns a cleanup fn for disconnectedCallback.
export function observeTheme(applyFn) {
  const obs = new MutationObserver(applyFn);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => obs.disconnect();
}
