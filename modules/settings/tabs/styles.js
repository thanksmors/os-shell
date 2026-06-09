export const SETTINGS_CSS = `
  /* Double-class selector: the shell sheet arrives via adoptedStyleSheets which
     cascades AFTER this <style> tag, so .module-root { flex-direction:column }
     would win a single-class tie and stack the sidebar above the content. */
  .module-root.settings-root {
    background: #ffffff;
    color: #111827;
    display: flex;
    flex-direction: row;
    overflow: hidden;
    height: 100%;
  }
  .dark .settings-root { background: #1e2433; color: #e5e7eb; }

  /* ── Sidebar ── */
  .settings-sidebar {
    width: 150px;
    min-width: 130px;
    flex-shrink: 0;
    background: #f9fafb;
    border-right: 1px solid #e5e7eb;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .dark .settings-sidebar { background: #161d2e; border-right-color: rgba(255,255,255,0.07); }
  .settings-sidebar-title {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #9ca3af;
    padding: 6px 10px 4px;
  }
  .settings-tab-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 8px;
    border: none;
    background: transparent;
    font-size: 0.8125rem;
    color: #374151;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: background 150ms, color 150ms;
  }
  .settings-tab-btn:hover { background: #e5e7eb; }
  .dark .settings-tab-btn { color: #d1d5db; }
  .dark .settings-tab-btn:hover { background: rgba(255,255,255,0.07); }
  .settings-tab-btn.active { background: color-mix(in srgb, var(--os-accent, #3b82f6) 15%, transparent); color: var(--os-accent, #3b82f6); font-weight: 600; }
  .dark .settings-tab-btn.active { background: color-mix(in srgb, var(--os-accent, #3b82f6) 18%, transparent); color: color-mix(in srgb, var(--os-accent, #3b82f6) 80%, white); }

  /* ── Content pane ── */
  .settings-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    min-width: 0;
  }
  .settings-section { margin-bottom: 24px; }
  .settings-section-title {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #9ca3af;
    margin-bottom: 10px;
  }

  /* ── Row ── */
  .settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    margin-bottom: 8px;
  }
  .dark .settings-row { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.07); }
  .settings-row--col { flex-direction: column; align-items: stretch; gap: 10px; }
  .settings-row-label { font-size: 0.875rem; font-weight: 500; }
  .settings-row-desc { font-size: 0.75rem; color: #9ca3af; margin-top: 2px; }

  /* ── Toggle switch ── */
  .settings-toggle {
    position: relative;
    width: 44px;
    height: 24px;
    background: #e5e7eb;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    transition: background 200ms;
    flex-shrink: 0;
  }
  .settings-toggle.on { background: var(--os-accent, #3b82f6); }
  .settings-toggle::after {
    content: '';
    position: absolute;
    top: 2px; left: 2px;
    width: 20px; height: 20px;
    background: #fff;
    border-radius: 50%;
    transition: transform 200ms;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
  .settings-toggle.on::after { transform: translateX(20px); }

  /* ── Badge ── */
  .settings-badge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 20px;
    background: color-mix(in srgb, var(--os-accent, #3b82f6) 12%, transparent);
    color: var(--os-accent, #3b82f6);
  }
  .dark .settings-badge { background: color-mix(in srgb, var(--os-accent, #3b82f6) 18%, transparent); color: color-mix(in srgb, var(--os-accent, #3b82f6) 80%, white); }

  /* ── Slider ── */
  .settings-slider-wrap { width: 100%; }
  .settings-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: #e5e7eb;
    outline: none;
    cursor: pointer;
    background-image: linear-gradient(var(--os-accent, #3b82f6), var(--os-accent, #3b82f6));
    background-repeat: no-repeat;
  }
  .dark .settings-slider { background-color: rgba(255,255,255,0.12); }
  .settings-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px; height: 20px;
    border-radius: 50%;
    background: var(--os-accent, #3b82f6);
    border: 3px solid #fff;
    box-shadow: 0 1px 6px rgba(0,0,0,0.25);
    cursor: pointer;
    transition: transform 120ms;
  }
  .settings-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }
  .settings-slider::-moz-range-thumb {
    width: 20px; height: 20px;
    border-radius: 50%;
    background: var(--os-accent, #3b82f6);
    border: 3px solid #fff;
    box-shadow: 0 1px 6px rgba(0,0,0,0.25);
    cursor: pointer;
  }
  .settings-notches {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    padding: 0 2px;
  }
  .settings-notch {
    font-size: 0.68rem;
    color: #9ca3af;
    cursor: pointer;
    transition: color 150ms, font-weight 150ms;
  }
  .settings-notch.active { color: var(--os-accent, #3b82f6); font-weight: 600; }

  /* ── Select ── */
  .settings-select {
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid #d1d5db;
    background: #fff;
    font-size: 0.8125rem;
    color: #374151;
    cursor: pointer;
    outline: none;
    flex-shrink: 0;
    transition: border-color 150ms;
  }
  .settings-select:focus { border-color: var(--os-accent, #3b82f6); }
  .dark .settings-select { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.12); color: #e5e7eb; }

  /* ── Color swatches ── */
  .settings-swatches { display: flex; gap: 7px; flex-shrink: 0; flex-wrap: wrap; }
  .settings-swatch {
    width: 24px; height: 24px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 120ms, box-shadow 120ms;
    outline: none;
  }
  .settings-swatch:hover { transform: scale(1.15); }
  .settings-swatch.active {
    border-color: #fff;
    box-shadow: 0 0 0 2px var(--os-accent, #3b82f6), 0 2px 6px rgba(0,0,0,0.25);
  }
  .dark .settings-swatch.active { border-color: #1e2433; }

  /* ── Button ── */
  .settings-btn {
    padding: 7px 16px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: #fff;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    color: #374151;
    transition: background 150ms, border-color 150ms;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .settings-btn:hover { background: #f3f4f6; border-color: #d1d5db; }
  .dark .settings-btn { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.1); color: #d1d5db; }
  .dark .settings-btn:hover { background: rgba(255,255,255,0.10); }
  .settings-btn--danger { border-color: #fca5a5; color: #dc2626; }
  .settings-btn--danger:hover { background: #fef2f2; border-color: #f87171; }
  .dark .settings-btn--danger { border-color: rgba(239,68,68,0.3); color: #f87171; }
  .dark .settings-btn--danger:hover { background: rgba(239,68,68,0.08); }

  /* ── Info grid (reused in about tab) ── */
  .settings-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .settings-info-card {
    padding: 12px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
  }
  .dark .settings-info-card { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.07); }
  .settings-info-label { font-size: 0.7rem; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .settings-info-value { font-size: 0.875rem; font-weight: 600; }

  /* ── About hero ── */
  .about-hero {
    text-align: center;
    padding: 20px 0 24px;
  }
  .about-logo { font-size: 2.5rem; line-height: 1; margin-bottom: 8px; }
  .about-title { font-size: 1.125rem; font-weight: 700; margin-bottom: 4px; }
  .about-version { font-size: 0.75rem; color: #9ca3af; }
`;
