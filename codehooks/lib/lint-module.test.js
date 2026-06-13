// Plain-node test for lintModule (no test framework — run: node codehooks/lib/lint-module.test.js).
// Establishes the pattern: assert with node:assert, print pass count, exit nonzero on failure.
import assert from 'node:assert';
import { lintModule } from './lint-module.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('  ok -', name);
}
// Assert exactly one violation whose message starts with `code`, on `file`.
function expectRule(violations, code, file) {
  const hit = violations.find(v => v.message.startsWith(code) && (!file || v.file === file));
  assert.ok(hit, `expected rule ${code}${file ? ' in ' + file : ''}; got: ${JSON.stringify(violations)}`);
}

// ── Valid modules must lint clean (no-regression guarantee) ──────────────────
const VALID_SINGLE = {
  manifest: { appId: 'counter' },
  js: "import { AppModuleBase } from '/shell/module-base.js';\n"
    + "import { getData, setData } from '/shell/api.js';\n"
    + "class AppCounter extends AppModuleBase {\n"
    + "  async _load() { this._state = await getData('counters', this._appId) || { name: 'Counter', count: 0 }; }\n"
    + "  _render() { this._wrapper.innerHTML = '<div></div>'; }\n"
    + "  _getTitle() { return this._state.name; }\n"
    + "}\n"
    + "if (!customElements.get('app-counter')) customElements.define('app-counter', AppCounter);",
};

const VALID_MULTI = {
  manifest: { appId: 'game' },
  entryFile: 'main.js',
  files: {
    'main.js': "import { AppModuleBase } from '/shell/module-base.js';\n"
      + "import { getData, setData } from '/shell/api.js';\n"
      + "import { renderDeck } from './feature-deck.js';\n"
      + "class AppGame extends AppModuleBase {\n"
      + "  async _load() { this._state = await getData('games', this._appId) || { name: 'Game', deck: [] }; }\n"
      + "  _render() { this._wrapper.innerHTML = '<div class=\"deck\"></div>'; renderDeck(this); }\n"
      + "  _getTitle() { return this._state.name; }\n"
      + "}\n"
      + "customElements.define('app-game', AppGame);",
    'feature-deck.js': "import { setData } from '/shell/api.js';\n"
      + "export function renderDeck(host) { host._wrapper.querySelector('.deck').textContent = host._state.deck.length; }",
  },
};

check('valid single-file lints clean', () => {
  assert.deepStrictEqual(lintModule(VALID_SINGLE), []);
});
check('valid multi-file lints clean', () => {
  assert.deepStrictEqual(lintModule(VALID_MULTI), []);
});

// ── Entry-file rules ─────────────────────────────────────────────────────────
check('E1 missing AppModuleBase import', () => {
  expectRule(lintModule({ manifest: { appId: 'x' }, js:
    "class AppX {}\ncustomElements.define('app-x', AppX);" }), 'E1');
});

check('E2 missing customElements.define', () => {
  expectRule(lintModule({ manifest: { appId: 'x' }, js:
    "import { AppModuleBase } from '/shell/module-base.js';\nclass AppX extends AppModuleBase {}" }), 'E2');
});

check('E2 mismatched tag', () => {
  expectRule(lintModule({ manifest: { appId: 'x' }, js:
    "import { AppModuleBase } from '/shell/module-base.js';\nclass AppX extends AppModuleBase {}\ncustomElements.define('app-y', AppX);" }), 'E2');
});

check('E3 overrides connectedCallback', () => {
  expectRule(lintModule({ manifest: { appId: 'x' }, js:
    "import { AppModuleBase } from '/shell/module-base.js';\nclass AppX extends AppModuleBase { connectedCallback() {} }\ncustomElements.define('app-x', AppX);" }), 'E3');
});

check('E4 _load without this._state assignment', () => {
  expectRule(lintModule({ manifest: { appId: 'x' }, js:
    "import { AppModuleBase } from '/shell/module-base.js';\nclass AppX extends AppModuleBase { async _load() { const d = 1; } }\ncustomElements.define('app-x', AppX);" }), 'E4');
});

check('E4 entry with no _load at all', () => {
  expectRule(lintModule({ manifest: { appId: 'x' }, js:
    "import { AppModuleBase } from '/shell/module-base.js';\nclass AppX extends AppModuleBase { _render() {} }\ncustomElements.define('app-x', AppX);" }), 'E4');
});

check('E5 windowId used as data key', () => {
  expectRule(lintModule({ manifest: { appId: 'x' }, js:
    "import { AppModuleBase } from '/shell/module-base.js';\nimport { getData } from '/shell/api.js';\nclass AppX extends AppModuleBase { async _load() { this._state = await getData('x', this.api.windowId) || {}; } }\ncustomElements.define('app-x', AppX);" }), 'E5');
});

check('E6 raw localStorage', () => {
  expectRule(lintModule({ manifest: { appId: 'x' }, js:
    "import { AppModuleBase } from '/shell/module-base.js';\nclass AppX extends AppModuleBase { async _load() { this._state = JSON.parse(localStorage.getItem('x')) || {}; } }\ncustomElements.define('app-x', AppX);" }), 'E6');
});

check('E7 disallowed npm import', () => {
  expectRule(lintModule({ manifest: { appId: 'x' }, js:
    "import { AppModuleBase } from '/shell/module-base.js';\nimport _ from 'lodash';\nclass AppX extends AppModuleBase { async _load() { this._state = {}; } }\ncustomElements.define('app-x', AppX);" }), 'E7');
});

// ── Feature-file rules ───────────────────────────────────────────────────────
check('F1 feature defines element', () => {
  const v = lintModule({ manifest: { appId: 'game' }, entryFile: 'main.js', files: {
    'main.js': VALID_MULTI.files['main.js'],
    'feature-deck.js': "export function renderDeck(host) {}\ncustomElements.define('app-extra', class {});",
  }});
  expectRule(v, 'F1', 'feature-deck.js');
});

check('F2 feature relative import', () => {
  const v = lintModule({ manifest: { appId: 'game' }, entryFile: 'main.js', files: {
    'main.js': VALID_MULTI.files['main.js'],
    'feature-deck.js': "import { x } from './feature-board.js';\nexport function renderDeck(host) {}",
  }});
  expectRule(v, 'F2', 'feature-deck.js');
});

check('F2 feature relative re-export (export … from)', () => {
  const v = lintModule({ manifest: { appId: 'game' }, entryFile: 'main.js', files: {
    'main.js': VALID_MULTI.files['main.js'],
    'feature-deck.js': "export { helper } from './feature-board.js';\nexport function renderDeck(host) {}",
  }});
  expectRule(v, 'F2', 'feature-deck.js');
});

check('E0 missing entry file', () => {
  expectRule(lintModule({ manifest: { appId: 'x' }, entryFile: 'main.js', files: { 'feature.js': '' } }), 'E0');
});

// ── D1 — feature calls must pass exactly `this` ──────────────────────────────
function multiWithMainCall(call) {
  return { manifest: { appId: 'game' }, entryFile: 'main.js', files: {
    'main.js': "import { AppModuleBase } from '/shell/module-base.js';\n"
      + "import { getData } from '/shell/api.js';\n"
      + "import { renderDeck } from './feature-deck.js';\n"
      + "class AppGame extends AppModuleBase {\n"
      + "  async _load() { this._state = await getData('games', this._appId) || { deck: [] }; }\n"
      + "  _render() { this._wrapper.innerHTML = '<div></div>'; " + call + " }\n"
      + "}\ncustomElements.define('app-game', AppGame);",
    'feature-deck.js': "export function renderDeck(host) { host._state.deck; }",
  }};
}
check('D1 feature called with no arg (pac-man: host undefined)', () => {
  expectRule(lintModule(multiWithMainCall('renderDeck();')), 'D1', 'main.js');
});
check('D1 feature called with this._state (habit: host._state undefined)', () => {
  expectRule(lintModule(multiWithMainCall('renderDeck(this._state);')), 'D1', 'main.js');
});
check('D1 feature called with this is clean', () => {
  assert.deepStrictEqual(lintModule(multiWithMainCall('renderDeck(this);')), []);
});

// ── D2 — constructor must not touch instance state ───────────────────────────
check('D2 constructor touches this._state', () => {
  expectRule(lintModule({ manifest: { appId: 'x' }, js:
    "import { AppModuleBase } from '/shell/module-base.js';\n"
    + "class AppX extends AppModuleBase { constructor() { super(); this._state = {}; } async _load() { this._state = {}; } }\n"
    + "customElements.define('app-x', AppX);" }), 'D2');
});
check('D2 settings-listener constructor is clean', () => {
  assert.deepStrictEqual(lintModule({ manifest: { appId: 'x' }, js:
    "import { AppModuleBase } from '/shell/module-base.js';\n"
    + "import { getData } from '/shell/api.js';\n"
    + "class AppX extends AppModuleBase {\n"
    + "  constructor() { super(); this._settingsOpen = false; this.addEventListener('os:toggle-settings', () => { this._settingsOpen = !this._settingsOpen; this._render(); }); }\n"
    + "  async _load() { this._state = await getData('x', this._appId) || {}; }\n"
    + "}\ncustomElements.define('app-x', AppX);" }), []);
});

console.log(`\n${passed} checks passed.`);
