// ─── Contract lint for AI-generated app modules ───────────────────────────────
//
// Pure (no codehooks-js / network) so it is unit-testable in plain node — see
// lint-module.test.js. `lintModule` statically checks generated code against the
// module contract documented in modules/AGENTS.md + codehooks/AGENTS.md, catching
// the violations that otherwise crash or silently break at install/runtime. The
// AI build pipeline (codehooks/routes/ai.js → buildModule) runs this before CSS;
// violations trigger one targeted repair re-prompt, then a hard reject.
//
// Rules are deliberately HIGH-PRECISION: a valid AppModuleBase module must lint
// clean (zero violations) so the pass can never reject a currently-working build.
// The test suite asserts that for representative valid single- and multi-file
// modules.

// Imports a generated file is allowed to use. Entry may also import feature files
// (relative); feature files may not (star topology — see F2).
const ALLOWED_IMPORT_PREFIXES = ['/shell/', '/modules/', './', '../'];

// Extract every module-specifier string from `import … from '<spec>'`, bare
// `import '<spec>'`, AND `export … from '<spec>'` re-exports (a re-export from a
// sibling breaks blob assembly exactly like an import, so it must be caught too).
function importSpecifiers(code) {
  const specs = [];
  const re = /\b(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code)) !== null) specs.push(m[1] || m[2]);
  return specs;
}

// Rules for the entry file (the single-file `js`, or `files[entryFile]`). These
// only fire on things a correct AppModuleBase module never does.
function lintEntry(code, appId) {
  const out = [];

  // E1 — must extend the base class via the canonical import.
  if (!/import\s*\{[^}]*\bAppModuleBase\b[^}]*\}\s*from\s*['"]\/shell\/module-base\.js['"]/.test(code)) {
    out.push("E1: missing `import { AppModuleBase } from '/shell/module-base.js'`.");
  }

  // E2 — must register the custom element under the app's tag.
  const defRe = /customElements\.define\(\s*['"]([^'"]+)['"]/;
  const defMatch = code.match(defRe);
  if (!defMatch) {
    out.push("E2: missing `customElements.define('app-" + appId + "', ClassName)`.");
  } else if (appId && defMatch[1] !== `app-${appId}`) {
    out.push(`E2: customElements.define tag '${defMatch[1]}' must be 'app-${appId}' (matches manifest.appId).`);
  }

  // E3 — overriding connectedCallback runs _render before _state exists (crashes).
  if (/\bconnectedCallback\s*\(/.test(code)) {
    out.push('E3: do NOT override connectedCallback — AppModuleBase runs _load() before _render(); overriding it crashes with "this._state is null".');
  }

  // E4 — the entry must assign this._state somewhere (in _load) or _render crashes
  // on null. Catches both a missing _load and a _load that forgets the assignment.
  if (!/this\._state\s*=/.test(code)) {
    out.push('E4: the entry must assign this._state in _load() (e.g. `this._state = await getData(coll, key) || { ...defaults }`) — _render crashes on null _state.');
  }

  // E5 — windowId is ephemeral; using it as a persistence key loses data each launch.
  if (/(get|set|delete)Data\s*\([^)]*windowId/.test(code)) {
    out.push('E5: never use windowId as a persistence key — use this._appId (generator) or a fixed literal key (singleton).');
  }

  // E6 — all persistence must go through getData/setData, never raw storage.
  if (/\b(localStorage|sessionStorage)\b/.test(code)) {
    out.push('E6: do not touch localStorage/sessionStorage directly — persist via getData/setData from /shell/api.js.');
  }

  // E7 — only /shell/, /modules/, or relative imports (entry may import features).
  for (const spec of importSpecifiers(code)) {
    if (!ALLOWED_IMPORT_PREFIXES.some(p => spec.startsWith(p))) {
      out.push(`E7: disallowed import '${spec}' — only /shell/…, /modules/…, or relative ./… imports are allowed (no npm/CDN/URL).`);
    }
  }

  return out;
}

// Rules for feature files (every file that is not the entry). Star topology:
// features import only /shell/ and never define the element.
function lintFeature(code) {
  const out = [];

  // F1 — only the entry file may register the element.
  if (/customElements\.define\s*\(/.test(code)) {
    out.push('F1: feature files must NOT call customElements.define — only the entry (main.js) defines the element.');
  }

  // F2 — features must not import siblings or main (blob assembly wires only the
  // entry's relative imports, so a feature's relative import ships broken).
  for (const spec of importSpecifiers(code)) {
    if (spec.startsWith('./') || spec.startsWith('../')) {
      out.push(`F2: feature file used a relative import '${spec}' — feature files may import ONLY /shell/…; share state through the host argument.`);
    } else if (!spec.startsWith('/shell/') && !spec.startsWith('/modules/')) {
      out.push(`F2: disallowed import '${spec}' in feature file — only /shell/… (and /modules/…) imports are allowed.`);
    }
  }

  return out;
}

/**
 * Lint a generated module against the contract.
 * @param {{manifest?:object, js?:string, files?:Record<string,string>, entryFile?:string}} module
 * @returns {{file:string, message:string}[]} one entry per violation; [] when clean.
 */
export function lintModule(module) {
  if (!module || typeof module !== 'object') return [{ file: '(module)', message: 'lint: no module object' }];
  const appId = module.manifest?.appId || '';
  const out = [];

  // Single-file: the whole module is `js`; treat it as the entry.
  if (typeof module.js === 'string') {
    for (const message of lintEntry(module.js, appId)) out.push({ file: 'main.js', message });
    return out;
  }

  // Multi-file: entry = files[entryFile] (default 'main.js'); the rest are features.
  const files = module.files || {};
  const entryName = module.entryFile || 'main.js';
  const entryCode = files[entryName];
  if (typeof entryCode !== 'string') {
    return [{ file: entryName, message: `E0: entry file '${entryName}' missing from files.` }];
  }
  for (const message of lintEntry(entryCode, appId)) out.push({ file: entryName, message });
  for (const [name, code] of Object.entries(files)) {
    if (name === entryName || typeof code !== 'string') continue;
    for (const message of lintFeature(code)) out.push({ file: name, message });
  }
  return out;
}
