// Shared stylesheet for the Settings module shadow root.
export const SETTINGS_CSS = `
      .settings-root {
        background: #ffffff;
        color: #111827;
        display: flex;
        flex-direction: row;
        overflow: hidden;
      }
      .dark .settings-root {
        background: #1e2433;
        color: #e5e7eb;
      }
      .settings-sidebar {
        width: 160px;
        min-width: 140px;
        flex-shrink: 0;
        background: #f9fafb;
        border-right: 1px solid #e5e7eb;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .dark .settings-sidebar {
        background: #161d2e;
        border-right-color: rgba(255,255,255,0.07);
      }
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
        font-size: 0.875rem;
        color: #374151;
        cursor: pointer;
        text-align: left;
        width: 100%;
        transition: background 150ms, color 150ms;
      }
      .settings-tab-btn:hover {
        background: #e5e7eb;
      }
      .dark .settings-tab-btn {
        color: #d1d5db;
      }
      .dark .settings-tab-btn:hover {
        background: rgba(255,255,255,0.07);
      }
      .settings-tab-btn.active {
        background: #dbeafe;
        color: #1d4ed8;
        font-weight: 500;
      }
      .dark .settings-tab-btn.active {
        background: rgba(59,130,246,0.15);
        color: #93c5fd;
      }
      .settings-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }
      .settings-section {
        margin-bottom: 24px;
      }
      .settings-section-title {
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #9ca3af;
        margin-bottom: 12px;
      }
      .settings-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        margin-bottom: 8px;
      }
      .dark .settings-row {
        background: rgba(255,255,255,0.04);
        border-color: rgba(255,255,255,0.07);
      }
      .settings-row-label {
        font-size: 0.875rem;
        font-weight: 500;
      }
      .settings-row-desc {
        font-size: 0.75rem;
        color: #9ca3af;
        margin-top: 2px;
      }
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
      .settings-toggle.on {
        background: #3b82f6;
      }
      .settings-toggle::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 20px;
        height: 20px;
        background: #ffffff;
        border-radius: 50%;
        transition: transform 200ms;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }
      .settings-toggle.on::after {
        transform: translateX(20px);
      }
      .settings-btn {
        padding: 7px 16px;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
        background: #ffffff;
        font-size: 0.8rem;
        font-weight: 500;
        cursor: pointer;
        color: #374151;
        transition: background 150ms, border-color 150ms;
      }
      .settings-btn:hover {
        background: #f3f4f6;
        border-color: #d1d5db;
      }
      .dark .settings-btn {
        background: rgba(255,255,255,0.06);
        border-color: rgba(255,255,255,0.1);
        color: #d1d5db;
      }
      .dark .settings-btn:hover {
        background: rgba(255,255,255,0.10);
      }
      .settings-info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .settings-info-card {
        padding: 12px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
      }
      .dark .settings-info-card {
        background: rgba(255,255,255,0.04);
        border-color: rgba(255,255,255,0.07);
      }
      .settings-info-label {
        font-size: 0.7rem;
        color: #9ca3af;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 4px;
      }
      .settings-info-value {
        font-size: 0.875rem;
        font-weight: 600;
      }
    `;
