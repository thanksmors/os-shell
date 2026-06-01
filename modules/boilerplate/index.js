import { adoptTailwind } from '/shell/shadow-tailwind.js';

class AppBoilerplate extends HTMLElement {
  async connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });

    // Load module-scoped styles
    const styleEl = document.createElement('style');
    const css = await fetch('/modules/boilerplate/styles.css').then(r => r.text());
    styleEl.textContent = css;

    const wrapper = document.createElement('div');
    wrapper.className = 'wrapper';
    wrapper.innerHTML = `
      <div class="body">
        <div>
          <div class="title">🧩 Boilerplate App</div>
          <div class="sub">Copy this folder to start a new module.<br>Edit manifest.json, index.js, and styles.css.</div>
        </div>
      </div>
    `;

    shadow.appendChild(styleEl);
    shadow.appendChild(wrapper);
    await adoptTailwind(shadow, wrapper);

    // el.api is set by the shell after connectedCallback — access it in a tick
    await new Promise(r => setTimeout(r, 0));
    if (this.api) this.api.setTitle('Boilerplate');
  }
}

customElements.define('app-boilerplate', AppBoilerplate);
