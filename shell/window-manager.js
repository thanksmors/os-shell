// Window drag + resize behaviour, extracted from the inline index.html handlers.
// Registered as an Alpine magic ($wm) so the markup can call $wm.startDrag(...)
// and $wm.startResize(...). Each method mutates the reactive `win` proxy directly,
// which is how Alpine picks up live position/size changes during a drag.

const windowManager = {
  // Titlebar drag. Anchors the cursor to its grab point and clamps the window
  // inside the viewport (leaving room for the 48px taskbar at the bottom).
  startDrag(event, win, store) {
    if (store.isMobile || win.state === 'maximized') return;
    store.focus(win.id);
    const startX = event.clientX - win.x;
    const startY = event.clientY - win.y;
    const onMove = e => {
      win.x = Math.max(0, Math.min(window.innerWidth - win.w, e.clientX - startX));
      win.y = Math.max(0, Math.min(window.innerHeight - 96, e.clientY - startY));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  },

  // Edge/corner resize. `handle` is one of n/s/e/w/nw/ne/sw/se. N and W edges
  // move the opposite corner anchor by adjusting x/y alongside w/h.
  startResize(event, win, handle) {
    const h = handle;
    const startW = win.w, startH = win.h, startX2 = win.x, startY2 = win.y;
    const startMX = event.clientX, startMY = event.clientY;
    const onMove = e => {
      const dx = e.clientX - startMX, dy = e.clientY - startMY;
      if (h.includes('e')) win.w = Math.max(win.minSize.w, startW + dx);
      if (h.includes('s')) win.h = Math.max(win.minSize.h, startH + dy);
      if (h.includes('w')) { const nw = Math.max(win.minSize.w, startW - dx); win.x = startX2 + (startW - nw); win.w = nw; }
      if (h.includes('n')) { const nh = Math.max(win.minSize.h, startH - dy); win.y = startY2 + (startH - nh); win.h = nh; }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  },
};

export function registerWindowManager() {
  Alpine.magic('wm', () => windowManager);
}
