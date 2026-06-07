import { adoptTailwind } from '/shell/shadow-tailwind.js';
import { subscribe } from '/shell/api.js';

/**
 * Base class for data-backed modules (List, Kanban, Gantt, Rocks).
 *
 * Handles all boilerplate in connectedCallback/disconnectedCallback so
 * subclasses only implement their actual logic:
 *
 *   async _load()     — fetch data, populate this._state
 *   _render()         — build innerHTML / DOM from this._state
 *   _getTitle()       — window title string (optional, defaults to this._state?.name)
 *   _collection()     — subscribe topic (optional, defaults to manifest appId)
 *
 * Shared utilities (no longer copy-pasted per module):
 *   _esc(str)         — HTML-escape a string for innerHTML
 *   _applyTheme()     — sync dark class on this._wrapper
 *   _resolveAppId()   — stable instanceId || windowId || appId-timestamp
 *
 * Sync is automatic when the module's manifest includes "sync": true.
 * The base class reads that field from this.api.store.apps and wires
 * subscribe() / unsubscribe without any per-module code.
 */
export class AppModuleBase extends HTMLElement {
  constructor() {
    super();
    this._state = null;
    this._appId = null;
    this._wrapper = null;
    this._themeObserver = null;
    this._unsub = null;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async connectedCallback() {
    // 1. Shadow DOM setup
    const shadow = this.attachShadow({ mode: 'open' });
    const styleEl = document.createElement('style');
    const moduleId = this._moduleId();
    styleEl.textContent = await fetch(`/modules/${moduleId}/styles.css`).then(r => r.text()).catch(() => '');
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'wrapper';
    shadow.appendChild(styleEl);
    shadow.appendChild(this._wrapper);
    await adoptTailwind(shadow, this._wrapper);

    // 2. Wait one tick for el.api to be set by the shell
    await new Promise(r => setTimeout(r, 0));

    // 3. Resolve stable appId
    this._appId = this._resolveAppId();

    // 4. Load data (subclass)
    await this._load();

    // 5. Render (subclass)
    this._applyTheme();
    this._render();
    if (this.api) this.api.setTitle(this._getTitle());

    // 6. Theme observer
    this._themeObserver = new MutationObserver(() => this._applyTheme());
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // 7. Cross-client sync — only if manifest declares sync:true
    const manifest = this.api?.store?.apps?.[this._manifestId()];
    if (manifest?.sync) {
      const collection = this._collection();
      this._unsub = subscribe(collection, this._appId, async () => {
        await this._load();
        this._render();
        if (this.api) this.api.setTitle(this._getTitle());
      });
    }
  }

  disconnectedCallback() {
    this._themeObserver?.disconnect();
    this._unsub?.();
  }

  // ─── Subclass hooks ───────────────────────────────────────────────────────

  /** Fetch data and populate this._state. Must be implemented by subclass. */
  async _load() {}

  /** Build the module's DOM/innerHTML from this._state. Must be implemented by subclass. */
  _render() {}

  /** Window title shown in the titlebar. Override to customise. */
  _getTitle() {
    return this._state?.name || '';
  }

  /**
   * The subscribe collection name (e.g. 'lists', 'boards', 'gantt', 'rocks').
   * Defaults to the manifest appId. Override only if the collection name differs.
   */
  _collection() {
    return this._manifestId();
  }

  // ─── Shared utilities ─────────────────────────────────────────────────────

  /** Escape a value for safe use in innerHTML. */
  _esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Mirror the document dark class onto the wrapper so module CSS dark: selectors work. */
  _applyTheme() {
    this._wrapper?.classList.toggle('dark', document.documentElement.classList.contains('dark'));
  }

  /** Returns the stable per-instance ID used as the data key. */
  _resolveAppId() {
    const id = this._manifestId();
    return this.api?.instanceId || this.api?.windowId || (`${id}-${Date.now()}`);
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  /**
   * Derives the module folder name from the custom element tag name.
   * e.g. AppList (tag: app-list) → 'list'
   * Used to fetch /modules/{id}/styles.css and as the default collection name.
   */
  _moduleId() {
    // customElements registry stores the tag; fall back to class name heuristic
    const tag = this.tagName.toLowerCase(); // e.g. 'app-list'
    return tag.replace(/^app-/, '');        // → 'list'
  }

  /** The appId in the manifest registry — same as _moduleId() for all current modules. */
  _manifestId() {
    return this._moduleId();
  }
}
