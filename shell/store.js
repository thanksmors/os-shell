import { motion, spring } from './motion.js';
import { iconUrl } from './icon.js';
import { adoptTailwind } from './shadow-tailwind.js';

export function initStore() {
  Alpine.store('os', {
    windows: [],
    apps: {},
    topZ: 100,
    theme: localStorage.getItem('os-theme') || 'light',
    isMobile: window.matchMedia('(max-width: 767px)').matches,
    toasts: [],
    contextMenu: { visible: false, x: 0, y: 0, items: [] },

    init() {
      // apply saved theme
      document.documentElement.classList.toggle('dark', this.theme === 'dark');
      // mobile watch
      window.matchMedia('(max-width: 767px)').addEventListener('change', e => {
        this.isMobile = e.matches;
      });
      // load manifests
      this._loadManifests();
    },

    async _loadManifests() {
      try {
        const ids = await fetch('/registry.json').then(r => r.json());
        for (const id of ids) {
          try {
            const r = await fetch(`/modules/${id}/manifest.json`);
            if (r.ok) this.registerApp(await r.json());
          } catch(e) {}
        }
      } catch(e) {
        console.warn('Could not load registry.json', e);
      }
    },

    registerApp(manifest) {
      this.apps = { ...this.apps, [manifest.appId]: manifest };
    },

    async launch(appId) {
      const app = this.apps[appId];
      if (!app) return;
      if (app.singleton) {
        const existing = this.windows.find(w => w.appId === appId);
        if (existing) { this.focus(existing.id); return; }
      }
      const id = `win-${Date.now()}`;
      const isMobile = this.isMobile;
      const win = {
        id,
        appId,
        title: app.title,
        icon: app.icon,
        x: isMobile ? 0 : 80 + Math.random() * 120,
        y: isMobile ? 0 : 60 + Math.random() * 80,
        w: isMobile ? window.innerWidth : (app.defaultSize?.w || 560),
        h: isMobile ? window.innerHeight - 48 : (app.defaultSize?.h || 380),
        z: ++this.topZ,
        state: isMobile ? 'maximized' : 'normal',
        prev: null,
        focused: false,
        resizable: app.resizable !== false,
        minSize: app.minSize || { w: 240, h: 180 },
      };
      this.windows.forEach(w => w.focused = false);
      win.focused = true;
      this.windows.push(win);
      // mount module after DOM updates
      await Alpine.nextTick();
      this._mount(win);
    },

    async _mount(win) {
      const hostEl = document.querySelector(`[data-win-host="${win.id}"]`);
      if (!hostEl) return;
      const app = this.apps[win.appId];
      if (!app) return;

      // lazy import module
      if (!customElements.get(app.tag)) {
        try { await import(app.entry); } catch(e) { console.error(e); return; }
      }

      const el = document.createElement(app.tag);
      el.api = {
        windowId: win.id,
        get mode() { return win.state === 'maximized' ? 'fullscreen' : 'windowed'; },
        get isDark() { return document.documentElement.classList.contains('dark'); },
        setTitle: (t) => { win.title = t; },
        notify: (msg, type) => Alpine.store('os').notify(msg, type),
        requestClose: () => Alpine.store('os').close(win.id),
        store: Alpine.store('os'),
      };
      hostEl.appendChild(el);
    },

    focus(id) {
      this.windows.forEach(w => w.focused = false);
      const win = this.windows.find(w => w.id === id);
      if (!win) return;
      win.focused = true;
      win.z = ++this.topZ;
      if (win.state === 'minimized') win.state = 'normal';
    },

    minimize(id) {
      const win = this.windows.find(w => w.id === id);
      if (win) win.state = 'minimized';
    },

    toggleMaximize(id) {
      const win = this.windows.find(w => w.id === id);
      if (!win) return;
      if (win.state === 'maximized') {
        win.state = 'normal';
        if (win.prev) Object.assign(win, win.prev);
        win.prev = null;
      } else {
        win.prev = { x: win.x, y: win.y, w: win.w, h: win.h };
        win.state = 'maximized';
      }
    },

    close(id) {
      const idx = this.windows.findIndex(w => w.id === id);
      if (idx !== -1) this.windows.splice(idx, 1);
    },

    taskbarClick(id) {
      const win = this.windows.find(w => w.id === id);
      if (!win) return;
      if (win.focused && win.state !== 'minimized') {
        this.minimize(id);
      } else {
        this.focus(id);
      }
    },

    notify(msg, type = 'info') {
      const id = Date.now();
      this.toasts.push({ id, msg, type });
      setTimeout(() => {
        const i = this.toasts.findIndex(t => t.id === id);
        if (i !== -1) this.toasts.splice(i, 1);
      }, 3500);
    },

    showContextMenu(x, y, items) {
      this.contextMenu = { visible: true, x, y, items };
    },

    hideContextMenu() {
      this.contextMenu.visible = false;
    },

    toggleTheme() {
      this.theme = this.theme === 'light' ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', this.theme === 'dark');
      localStorage.setItem('os-theme', this.theme);
    },

    iconUrl(emoji) { return iconUrl(emoji); },
  });
}
