export function initShortcuts() {
  document.addEventListener('keydown', e => {
    const os = Alpine.store('os');
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'k') {
      e.preventDefault();
      // Toggles the Spaces menu (onboarding hub). Dispatched on window so the
      // body's @os:launcher-toggle.window handler receives it.
      window.dispatchEvent(new CustomEvent('os:launcher-toggle'));
    }
    if (mod && e.key === 'w') {
      e.preventDefault();
      const focused = os.windows.find(w => w.focused);
      if (focused) os.close(focused.id);
    }
    if (e.key === 'Escape') {
      os.hideContextMenu();
    }
  });
}
