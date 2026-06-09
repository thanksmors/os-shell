const FONT_SIZES   = ['87.5%', '93.75%', '100%', '112.5%'];
const SIZE_LABELS  = ['XSmall', 'Small', 'Medium', 'Large'];
const FONT_FAMILIES = {
  system: { label: 'System UI',   value: 'system-ui,-apple-system,sans-serif' },
  serif:  { label: 'Serif',       value: 'Georgia,"Times New Roman",serif' },
  mono:   { label: 'Monospace',   value: 'ui-monospace,"Cascadia Code","Fira Code",monospace' },
};
const ACCENTS = [
  { label: 'Blue',    value: '#3b82f6' },
  { label: 'Violet',  value: '#7c3aed' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Amber',   value: '#f59e0b' },
  { label: 'Rose',    value: '#f43f5e' },
  { label: 'Slate',   value: '#64748b' },
];

export function renderAppearanceTab(host, content) {
  const isDark      = document.documentElement.classList.contains('dark');
  const sizeIdx     = Math.min(3, Math.max(0, parseInt(localStorage.getItem('os:font-size') ?? '2', 10)));
  const savedFamily = localStorage.getItem('os:font-family') || 'system';
  const savedAccent = localStorage.getItem('os:accent') || '#3b82f6';

  content.innerHTML = `
    <div class="settings-section">
      <div class="settings-section-title">Theme</div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Dark Mode</div>
          <div class="settings-row-desc">Toggle between light and dark interface</div>
        </div>
        <button class="settings-toggle${isDark ? ' on' : ''}" id="theme-toggle"></button>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Text Size</div>
      <div class="settings-row settings-row--col">
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
          <div class="settings-row-label">Font Size</div>
          <span class="settings-badge" id="size-badge">${SIZE_LABELS[sizeIdx]}</span>
        </div>
        <div class="settings-slider-wrap">
          <input type="range" class="settings-slider" id="font-slider" min="0" max="3" step="1" value="${sizeIdx}">
          <div class="settings-notches">
            ${SIZE_LABELS.map((l, i) => `<span class="settings-notch${i === sizeIdx ? ' active' : ''}">${l}</span>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Font Family</div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Interface Font</div>
          <div class="settings-row-desc">Applies across all windows and modules</div>
        </div>
        <select class="settings-select" id="font-select">
          ${Object.entries(FONT_FAMILIES).map(([k, v]) =>
            `<option value="${k}"${savedFamily === k ? ' selected' : ''}>${v.label}</option>`
          ).join('')}
        </select>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Accent Color</div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Highlight Color</div>
          <div class="settings-row-desc">Active states, toggles, and focus indicators</div>
        </div>
        <div class="settings-swatches" id="swatches">
          ${ACCENTS.map(a => `
            <button class="settings-swatch${a.value === savedAccent ? ' active' : ''}"
              data-color="${a.value}" title="${a.label}"
              style="background:${a.value};"></button>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Dark mode
  const themeToggle = content.querySelector('#theme-toggle');
  themeToggle.addEventListener('click', () => {
    host.api.store.toggleTheme();
    themeToggle.classList.toggle('on', document.documentElement.classList.contains('dark'));
  });

  // Font size
  const slider  = content.querySelector('#font-slider');
  const badge   = content.querySelector('#size-badge');
  const notches = content.querySelectorAll('.settings-notch');

  function updateSliderFill(idx) {
    const pct = (idx / 3) * 100;
    slider.style.backgroundSize = `${pct}% 100%`;
  }
  updateSliderFill(sizeIdx);

  slider.addEventListener('input', () => {
    const i = parseInt(slider.value, 10);
    document.documentElement.style.fontSize = FONT_SIZES[i];
    localStorage.setItem('os:font-size', i);
    badge.textContent = SIZE_LABELS[i];
    notches.forEach((n, j) => n.classList.toggle('active', j === i));
    updateSliderFill(i);
  });

  // Font family
  content.querySelector('#font-select').addEventListener('change', e => {
    const fam = e.target.value;
    document.documentElement.style.fontFamily = FONT_FAMILIES[fam].value;
    localStorage.setItem('os:font-family', fam);
  });

  // Accent color
  content.querySelector('#swatches').addEventListener('click', e => {
    const sw = e.target.closest('.settings-swatch');
    if (!sw) return;
    const color = sw.dataset.color;
    document.documentElement.style.setProperty('--os-accent', color);
    localStorage.setItem('os:accent', color);
    content.querySelectorAll('.settings-swatch').forEach(s => s.classList.toggle('active', s === sw));
  });
}
