import { adoptTailwind } from '/shell/shadow-tailwind.js';

class AppAbout extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this._render();
  }

  async _render() {
    const wrapper = document.createElement('div');
    wrapper.className = 'module-root about-root';

    wrapper.innerHTML = `
      <div class="about-hero">
        <div class="about-logo">🪐</div>
        <h1 class="about-title">ODVI Spaces</h1>
        <p class="about-tagline">A shared workspace for your team.</p>
        <p class="about-version">Version 1.0.0</p>
      </div>

      <div class="about-body">
        <p class="about-desc">
          Everything your team needs in one place — projects, roadmaps, workload, files, and chat.
          No build step required. Runs entirely in the browser.
        </p>

        <div class="about-section">
          <h2 class="about-section-title">Built With</h2>
          <div class="about-tech-grid">
            <div class="about-tech-item">
              <span class="about-tech-icon">⚡</span>
              <div>
                <div class="about-tech-name">Alpine.js v3</div>
                <div class="about-tech-desc">Reactive UI framework</div>
              </div>
            </div>
            <div class="about-tech-item">
              <span class="about-tech-icon">🎨</span>
              <div>
                <div class="about-tech-name">Tailwind CSS</div>
                <div class="about-tech-desc">Utility-first styling</div>
              </div>
            </div>
            <div class="about-tech-item">
              <span class="about-tech-icon">🎬</span>
              <div>
                <div class="about-tech-name">Motion (motion.dev)</div>
                <div class="about-tech-desc">Spring animations</div>
              </div>
            </div>
            <div class="about-tech-item">
              <span class="about-tech-icon">🧩</span>
              <div>
                <div class="about-tech-name">Web Components</div>
                <div class="about-tech-desc">Shadow DOM modules</div>
              </div>
            </div>
          </div>
        </div>

        <div class="about-footer">
          <span>© 2026 ODVI Spaces</span>
          <span class="about-dot">·</span>
          <span>Open Source</span>
        </div>
      </div>
    `;

    this._shadow.appendChild(wrapper);
    await adoptTailwind(this._shadow, wrapper);

    const style = document.createElement('style');
    style.textContent = `
      .about-root {
        background: #ffffff;
        color: #111827;
        overflow-y: auto;
      }
      .dark .about-root {
        background: #1e2433;
        color: #e5e7eb;
      }
      .about-hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 28px 24px 20px;
        background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
        color: #ffffff;
      }
      .about-logo {
        font-size: 3rem;
        line-height: 1;
        margin-bottom: 10px;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
      }
      .about-title {
        font-size: 1.5rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        margin: 0 0 2px;
      }
      .about-tagline {
        font-size: 0.85rem;
        color: rgba(255,255,255,0.65);
        margin: 0 0 4px;
      }
      .about-version {
        font-size: 0.8rem;
        color: rgba(255,255,255,0.6);
        margin: 0;
        font-variant-numeric: tabular-nums;
      }
      .about-body {
        padding: 16px 20px;
      }
      .about-desc {
        font-size: 0.875rem;
        line-height: 1.6;
        color: #6b7280;
        margin-bottom: 16px;
      }
      .dark .about-desc { color: #9ca3af; }
      .about-section { margin-bottom: 16px; }
      .about-section-title {
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #9ca3af;
        margin-bottom: 10px;
      }
      .about-tech-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .about-tech-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
      }
      .dark .about-tech-item {
        background: rgba(255,255,255,0.04);
        border-color: rgba(255,255,255,0.07);
      }
      .about-tech-icon { font-size: 1.25rem; flex-shrink: 0; }
      .about-tech-name { font-size: 0.8rem; font-weight: 600; }
      .about-tech-desc { font-size: 0.7rem; color: #9ca3af; }
      .about-footer {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.75rem;
        color: #9ca3af;
        padding-top: 8px;
        border-top: 1px solid #f3f4f6;
        margin-top: 4px;
      }
      .dark .about-footer { border-top-color: rgba(255,255,255,0.06); }
      .about-dot { color: #d1d5db; }
    `;
    this._shadow.appendChild(style);
  }
}

customElements.define('app-about', AppAbout);
