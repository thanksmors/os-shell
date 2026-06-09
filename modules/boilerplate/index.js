import { AppModuleBase } from '/shell/module-base.js';

class AppBoilerplate extends AppModuleBase {
  async _load() {
    // fetch your data here and set this._state
    this._state = { name: 'Boilerplate' };
  }

  _getTitle() { return this._state?.name || 'Boilerplate'; }

  _render() {
    this._wrapper.innerHTML = `
      <div class="body">
        <div>
          <div class="title">🧩 Boilerplate App</div>
          <div class="sub">Copy this folder to start a new module.<br>Edit manifest.json, index.js, and styles.css.</div>
        </div>
        <button class="primary-btn">Accent-colored action</button>
      </div>
    `;
  }
}

customElements.define('app-boilerplate', AppBoilerplate);
