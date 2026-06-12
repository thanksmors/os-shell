import { motion, spring, stagger } from '/shell/motion.js';
import { iconUrl } from './icon.js';
import { getInstances, saveInstances, subscribe, getData, deleteData } from './api.js';
import { ODVI_APPS } from './odvi-apps.js';

export function registerOsStore() {
  Alpine.store('os', {
    windows: [],
    apps: {},
    topZ: 100,
    theme: localStorage.getItem('os-theme') || 'light',
    isMobile: window.matchMedia('(max-width: 767px)').matches,
    toasts: [],
    contextMenu: { visible: false, x: 0, y: 0, items: [] },
    instances: [],
    appBadges: {},
    dragInstanceId: null,
    dragOverFolderId: null,
    dragDesktopKey: null,
    dragOverDesktopKey: null,
    desktopOrder: JSON.parse(localStorage.getItem('os:desktopOrder') || '[]'),
    showOnboarding: false,
    animatedBg: localStorage.getItem('os:animated-bg') === '1',
    wallpaper: localStorage.getItem('os:wallpaper') || 'aurora',
    startMenuOpen: false,
    recentApps: JSON.parse(localStorage.getItem('os:recent-apps') || '[]'),
    hiddenApps: JSON.parse(localStorage.getItem('os:hidden-apps') ??
      (localStorage.setItem('os:hidden-apps', '["data"]'), '["data"]')),
    odviApps: ODVI_APPS,

    init() {
      // keep <html class="dark"> in sync with reactive theme, and persist it
      Alpine.effect(() => {
        document.documentElement.classList.toggle('dark', this.theme === 'dark');
        localStorage.setItem('os-theme', this.theme);
      });
      // mobile watch (only set up once)
      if (!this._mobileWatcher) {
        this._mobileWatcher = true;
        window.matchMedia('(max-width: 767px)').addEventListener('change', e => {
          this.isMobile = e.matches;
        });
      }
      // load manifests
      this._loadManifests();
      // instances are loaded by auth store after workspace is selected
    },

    setAppBadge(appId, count) {
      this.appBadges = { ...this.appBadges, [appId]: count > 0 ? count : 0 };
    },

    openOnboarding() { this.showOnboarding = true; },

    closeOnboarding(showAlways) {
      this.showOnboarding = false;
      if (showAlways) localStorage.removeItem('os:onboarding-seen');
      else            localStorage.setItem('os:onboarding-seen', '1');
    },

    toggleAnimatedBg() {
      this.animatedBg = !this.animatedBg;
      localStorage.setItem('os:animated-bg', this.animatedBg ? '1' : '');
    },

    setWallpaper(name) {
      this.wallpaper = name;
      localStorage.setItem('os:wallpaper', name);
    },

    _pushRecent(appId) {
      if (!appId) return;
      this.recentApps = [appId, ...this.recentApps.filter(a => a !== appId)].slice(0, 6);
      localStorage.setItem('os:recent-apps', JSON.stringify(this.recentApps));
    },

    isAppHidden(appId) { return this.hiddenApps.includes(appId); },

    toggleAppHidden(appId) {
      this.hiddenApps = this.isAppHidden(appId)
        ? this.hiddenApps.filter(a => a !== appId)
        : [...this.hiddenApps, appId];
      localStorage.setItem('os:hidden-apps', JSON.stringify(this.hiddenApps));
    },

    async pickIcon(anchorEl, current, onPick) {
      const { showEmojiPicker } = await import('/shell/emoji-picker.js');
      showEmojiPicker(anchorEl, current, onPick);
    },

    // Called by auth store after workspace is activated
    loadWorkspaceData() {
      this.instances = [];
      this._loadInstances();
      this._loadGeneratedModules();
      this._prefetchModules();
      this._checkChatBadge();
    },

    async _checkChatBadge() {
      try {
        const userStr = localStorage.getItem('os-user');
        if (!userStr) return;
        const user = JSON.parse(userStr);
        const userId = user?.userId;
        if (!userId) return;

        // Wave 1: channels list + read state in parallel
        const [channelsData, lastRead] = await Promise.all([
          getData('chat', 'channels'),
          getData('chat-read', userId),
        ]);
        const channels = channelsData?.channels || [];
        if (!channels.length) return;
        const readState = lastRead || {};

        // Wave 2: all channel message counts in parallel
        const allMsgs = await Promise.all(channels.map(ch => getData('chat-messages', ch.id)));
        let total = 0;
        for (let i = 0; i < channels.length; i++) {
          const messages = allMsgs[i]?.messages || [];
          const since = readState[channels[i].id] || 0;
          total += messages.filter(m => m.timestamp > since).length;
        }
        this.setAppBadge('chat', total);
      } catch {}
    },

    // Warm module JS + CSS during idle time so first launch skips the network
    // (the import fetch is the biggest contributor to skeleton time).
    _prefetchModules() {
      const warm = async () => {
        const { fetchCssCached } = await import('/shell/module-base.js');
        for (const app of Object.values(this.apps)) {
          if (!app.entry || app.entry.startsWith('blob:')) continue;
          import(app.entry).catch(() => {});
          fetchCssCached(app.cssUrl || `/modules/${app.appId}/styles.css`);
        }
      };
      if ('requestIdleCallback' in window) requestIdleCallback(() => warm(), { timeout: 4000 });
      else setTimeout(warm, 2000);
    },

    async _loadGeneratedModules() {
      try {
        const stored = await getData('generated-modules', 'index');
        if (!stored || typeof stored !== 'object') return;
        const origin = window.location.origin;
        for (const [appId, mod] of Object.entries(stored)) {
          if (!mod?.manifest || !mod?.js) continue;
          const absoluteJs = mod.js
            .replace(/from '\/shell\//g, `from '${origin}/shell/`)
            .replace(/from "\/shell\//g, `from "${origin}/shell/`)
            .replace(/from '\/modules\//g, `from '${origin}/modules/`)
            .replace(/from "\/modules\//g, `from "${origin}/modules/`);
          const blobUrl = URL.createObjectURL(new Blob([absoluteJs], { type: 'application/javascript' }));
          const cssUrl = mod.css
            ? URL.createObjectURL(new Blob([mod.css], { type: 'text/css' }))
            : null;
          this.registerApp({ ...mod.manifest, entry: blobUrl, ...(cssUrl && { cssUrl }) });
        }
      } catch(e) {
        console.warn('Could not load generated modules', e);
      }
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

    unregisterApp(appId) {
      const { [appId]: _, ...rest } = this.apps;
      this.apps = rest;
    },

    async launch(appId, config = {}) {
      const app = this.apps[appId];
      if (!app) return;
      this._pushRecent(appId);
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
        ready: false,
      };
      this.windows.forEach(w => w.focused = false);
      win.focused = true;
      this.windows = [...this.windows, win];
      // mount module after DOM updates
      await Alpine.nextTick();
      this._mount(win, config);
    },

    async _mount(win, config = {}) {
      // Re-resolve through the store so `win` is the reactive proxy — mutations
      // on the raw object passed in would update silently without triggering
      // Alpine re-renders (x-show="!win.ready" would never re-evaluate).
      win = this.windows.find(w => w.id === win.id) || win;
      const hostEl = document.querySelector(`[data-win-host="${win.id}"]`);
      if (!hostEl) return;
      const app = this.apps[win.appId];
      if (!app) { win.ready = true; return; }

      // Animate the window frame in immediately — before the module import —
      // so the frame never paints fully visible and then restarts the animation.
      const winEl = hostEl.closest('.os-window');
      if (winEl) motion(winEl, { opacity: [0, 1], scale: [0.92, 1] }, { ...spring.snappy() });

      // lazy import module (skeleton covers the content area meanwhile)
      if (!customElements.get(app.tag)) {
        try { await import(app.entry); } catch(e) { console.error(e); win.ready = true; return; }
      }

      const el = document.createElement(app.tag);
      el.api = {
        windowId: win.id,
        config,
        get mode() { return win.state === 'maximized' ? 'fullscreen' : 'windowed'; },
        get isDark() { return document.documentElement.classList.contains('dark'); },
        setTitle: (t) => { win.title = t; },
        setReady: () => { win.ready = true; },
        notify: (msg, type) => Alpine.store('os').notify(msg, type),
        requestClose: () => Alpine.store('os').close(win.id),
        store: Alpine.store('os'),
      };
      hostEl.appendChild(el);
      this._awaitModuleReady(win, el);
    },

    // AppModuleBase modules call api.setReady() after their first render;
    // plain web components render synchronously, so mark them ready now.
    // The timeout is a safety net so the skeleton can never get stuck.
    _awaitModuleReady(win, el) {
      if (typeof el._render !== 'function') {
        win.ready = true;
        return;
      }
      setTimeout(() => { win.ready = true; }, 5000);
    },

    _winEl(id) {
      return document.querySelector(`[data-win-host="${id}"]`)?.closest('.os-window') || null;
    },

    focus(id) {
      const win = this.windows.find(w => w.id === id);
      if (!win) return;
      const wasMinimized = win.state === 'minimized';
      const wasFocused   = win.focused;
      this.windows.forEach(w => w.focused = false);
      win.focused = true;
      win.z = ++this.topZ;
      if (wasMinimized) {
        win.state = 'normal';
        Alpine.nextTick(() => {
          const winEl = this._winEl(id);
          if (winEl) motion(winEl,
            { opacity: [0, 1], scale: [0.85, 1], y: [20, 0] },
            { ...spring.snappy() });
        });
      } else if (!wasFocused) {
        Alpine.nextTick(() => {
          const winEl = this._winEl(id);
          if (winEl) motion(winEl, { scale: [1, 1.007, 1] }, { ...spring.snappy() });
        });
      }
    },

    async minimize(id) {
      const win = this.windows.find(w => w.id === id);
      if (!win) return;
      const winEl = this._winEl(id);
      if (winEl) {
        try {
          await motion(winEl, { opacity: [1, 0], scale: [1, 0.85], y: [0, 20] },
            { ...spring.smooth() }).finished;
        } catch(e) {}
        winEl.style.opacity = '';
        winEl.style.transform = '';
      }
      win.state = 'minimized';
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
      Alpine.nextTick(() => {
        const winEl = this._winEl(id);
        if (winEl) motion(winEl, { scale: [0.97, 1] },
          { ...spring.smooth() });
      });
    },

    async close(id) {
      const win = this.windows.find(w => w.id === id);
      if (!win) return;
      const winEl = this._winEl(id);
      if (winEl) {
        try {
          await motion(winEl, { opacity: 0, scale: 0.95 }, { duration: 0.15 }).finished;
        } catch(e) {}
      }
      this.windows = this.windows.filter(w => w.id !== id);
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
      this.toasts = [...this.toasts, { id, msg, type }];
      setTimeout(async () => {
        const el = document.querySelector(`[data-toast-id="${id}"]`);
        if (el) await motion(el, { opacity: 0, x: 16, scale: 0.95 }, { duration: 0.18 }).finished;
        this.toasts = this.toasts.filter(t => t.id !== id);
      }, 3500);
    },

    showContextMenu(x, y, items) {
      this.contextMenu = { visible: true, x, y, items };
    },

    hideContextMenu() {
      this.contextMenu.visible = false;
    },

    async _loadInstances() {
      // Subscribe to cross-client instance changes (first call starts polling)
      if (!this._instancesUnsub) {
        this._instancesUnsub = subscribe('meta', 'instances', () => this._loadInstances());
      }
      const loaded = await getInstances();
      // Merge: preserve any instances created while the async fetch was in flight.
      const isFirstLoad = this.instances.length === 0;
      if (isFirstLoad) {
        this.instances = loaded;
        this._staggerDesktopIcons();
      } else {
        const existingIds = new Set(this.instances.map(i => i.instanceId));
        this.instances = [...this.instances, ...loaded.filter(i => !existingIds.has(i.instanceId))];
      }
    },

    _staggerDesktopIcons() {
      Alpine.nextTick(() => {
        const icons = document.querySelectorAll('.os-desktop-icon');
        Array.from(icons).slice(0, 20).forEach((el, i) => {
          motion(el,
            { opacity: [0, 1], y: [10, 0], scale: [0.82, 1] },
            { ...spring.snappy(), delay: i * 0.045 }
          );
        });
      });
    },

    async createInstance(appId, config = {}) {
      const instanceId = 'inst-' + Date.now();
      const app = this.apps[appId];
      this._pushRecent(appId);
      const instance = {
        instanceId,
        appId,
        name: config.name || app?.title || appId,
        icon: config.icon || app?.icon || '📄',
        parentId: null,
      };
      this.instances = [...this.instances, instance];
      window.dispatchEvent(new CustomEvent('os:instances-changed'));
      saveInstances(this.instances); // fire-and-forget
      await this._launchInstance(instance);
    },

    async _launchInstance(instance) {
      // If already open, just focus it
      const existing = this.windows.find(w => w._instanceId === instance.instanceId);
      if (existing) { this.focus(existing.id); return; }

      const app = this.apps[instance.appId];
      if (!app) return;
      const id = `win-${Date.now()}`;
      const isMobile = this.isMobile;
      const win = {
        id,
        appId: instance.appId,
        _instanceId: instance.instanceId,
        title: instance.name,
        icon: instance.icon,
        hasSettings: app.hasSettings || false,
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
        ready: false,
      };
      this.windows.forEach(w => w.focused = false);
      win.focused = true;
      this.windows = [...this.windows, win];
      await Alpine.nextTick();
      this._mountInstance(win, instance);
    },

    async _mountInstance(win, instance) {
      // Re-resolve to the reactive proxy (see _mount).
      win = this.windows.find(w => w.id === win.id) || win;
      const hostEl = document.querySelector(`[data-win-host="${win.id}"]`);
      if (!hostEl) return;
      const app = this.apps[instance.appId];
      if (!app) { win.ready = true; return; }

      const winEl = hostEl.closest('.os-window');
      if (winEl) motion(winEl, { opacity: [0, 1], scale: [0.92, 1] }, { ...spring.snappy() });

      if (!customElements.get(app.tag)) {
        try { await import(app.entry); } catch(e) { console.error(e); win.ready = true; return; }
      }
      const self = this;
      const el = document.createElement(app.tag);
      el.api = {
        windowId: win.id,
        instanceId: instance.instanceId,
        config: {},
        get mode() { return win.state === 'maximized' ? 'fullscreen' : 'windowed'; },
        get isDark() { return document.documentElement.classList.contains('dark'); },
        setTitle: (t) => { win.title = t; },
        setReady: () => { win.ready = true; },
        notify: (msg, type) => Alpine.store('os').notify(msg, type),
        requestClose: () => Alpine.store('os').close(win.id),
        updateInstance: async (name, icon) => {
          const inst = self.instances.find(i => i.instanceId === instance.instanceId);
          if (inst) {
            inst.name = name;
            inst.icon = icon;
            win.title = name;
            win.icon = icon;
            self.instances = [...self.instances];
            saveInstances(self.instances); // fire-and-forget
          }
        },
        store: Alpine.store('os'),
      };
      hostEl.appendChild(el);
      this._awaitModuleReady(win, el);
    },

    launchInstance(instanceId) {
      const instance = this.instances.find(i => i.instanceId === instanceId);
      if (instance) this._launchInstance(instance);
    },

    async removeInstance(instanceId) {
      const win = this.windows.find(w => w._instanceId === instanceId);
      if (win) this.close(win.id);
      // Capture app manifest before removing so we can clean up storage
      const inst = this.instances.find(i => i.instanceId === instanceId);
      const app = inst ? this.apps[inst.appId] : null;
      // If deleting a folder, move its children back to the desktop
      this.instances.forEach(i => { if (i.parentId === instanceId) i.parentId = null; });
      this.instances = this.instances.filter(i => i.instanceId !== instanceId);
      window.dispatchEvent(new CustomEvent('os:instances-changed'));
      saveInstances(this.instances); // fire-and-forget

      // Clean up Data collections this instance created via requiredCollections.
      // module-settings stores _createdCollections; only delete if the _owner stamp
      // still points to this instance (guards against the user reassigning collections).
      const modSettings = await getData('module-settings', instanceId).catch(() => null);
      const createdCollections = modSettings?._createdCollections;
      if (Array.isArray(createdCollections) && createdCollections.length) {
        try {
          const { deleteCollection, getCollections } = await import('/modules/data/api.js');
          const all = await getCollections();
          for (const name of createdCollections) {
            const col = all[name];
            if (col && (!col._owner || col._owner.instanceId === instanceId)) {
              deleteCollection(name); // fire-and-forget
            }
          }
        } catch {}
      }
      // Clean module-settings record (always, regardless of requiredCollections).
      deleteData('module-settings', instanceId);

      // Clean up declared dataCollections — deleteData handles workspace-scoped keys + backend
      for (const col of (app?.dataCollections || [])) {
        deleteData(col, instanceId); // fire-and-forget
      }
    },

    buildInstanceContextMenu(x, y, item) {
      this.showContextMenu(x, y, [
        { label: '🗑 Delete', action: () => this.removeInstance(item.id) },
      ]);
    },

    beginInstanceDrag(id) {
      this.dragInstanceId = id;
      this.dragDesktopKey = `inst:${id}`;
    },

    endInstanceDrag() {
      this.dragInstanceId = null;
      this.dragDesktopKey = null;
    },

    dropOnFolder(folderId) {
      const id = this.dragInstanceId;
      this.dragInstanceId = null;
      this.dragDesktopKey = null;
      this.dragOverFolderId = null;
      this.dragOverDesktopKey = null;
      if (id) this.moveToFolder(id, folderId);
    },

    // Merged ordered list of all desktop items (non-generator apps + root instances)
    desktopItems() {
      const map = {};
      Object.values(this.apps).filter(a => !a.generator && !this.isAppHidden(a.appId)).forEach(a => {
        map[`app:${a.appId}`] = { key: `app:${a.appId}`, type: 'app', id: a.appId, icon: a.icon, label: a.title };
      });
      this.instances.filter(i => !i.parentId).forEach(i => {
        const app = this.apps[i.appId];
        map[`inst:${i.instanceId}`] = { key: `inst:${i.instanceId}`, type: 'instance', id: i.instanceId, icon: i.icon, label: i.name, appId: i.appId, acceptsDroppedInstances: app?.acceptsDroppedInstances || false };
      });
      const seen = new Set();
      const out = [];
      for (const k of this.desktopOrder) {
        if (map[k]) { out.push(map[k]); seen.add(k); }
      }
      for (const k of Object.keys(map)) {
        if (!seen.has(k)) out.push(map[k]);
      }
      return out;
    },

    reorderDesktop(dragKey, targetKey) {
      const current = this.desktopItems().map(i => i.key);
      const from = current.indexOf(dragKey);
      const to = current.indexOf(targetKey);
      if (from === -1 || to === -1 || from === to) return;
      const [moved] = current.splice(from, 1);
      current.splice(to, 0, moved);
      this.desktopOrder = current;
      localStorage.setItem('os:desktopOrder', JSON.stringify(current));
    },

    renameInstance(instanceId, name) {
      const inst = this.instances.find(i => i.instanceId === instanceId);
      if (!inst) return;
      inst.name = name || inst.name;
      const win = this.windows.find(w => w._instanceId === instanceId);
      if (win) win.title = inst.name;
      this.instances = [...this.instances];
      saveInstances(this.instances); // fire-and-forget
    },

    toggleWindowSettings(id) {
      const hostEl = document.querySelector(`[data-win-host="${id}"]`);
      hostEl?.firstElementChild?.dispatchEvent(new CustomEvent('os:toggle-settings'));
    },

    reorderInstance(dragId, targetId) {
      const arr = [...this.instances];
      const from = arr.findIndex(i => i.instanceId === dragId);
      const to   = arr.findIndex(i => i.instanceId === targetId);
      if (from === -1 || to === -1 || from === to) return;
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      this.instances = arr;
      window.dispatchEvent(new CustomEvent('os:instances-changed'));
      saveInstances(this.instances); // fire-and-forget
    },

    moveToFolder(instanceId, folderId) {
      const inst = this.instances.find(i => i.instanceId === instanceId);
      if (!inst) return;
      inst.parentId = folderId || null;
      this.instances = [...this.instances];
      window.dispatchEvent(new CustomEvent('os:instances-changed'));
      saveInstances(this.instances); // fire-and-forget
    },

    moveToDesktop(instanceId) {
      this.moveToFolder(instanceId, null);
    },

    buildDesktopContextMenu(x, y) {
      const items = [];
      for (const app of Object.values(this.apps)) {
        if (app.contextMenu && app.contextMenu.length) {
          for (const entry of app.contextMenu) {
            if (app.generator) {
              items.push({
                label: entry.label,
                action: () => this.createInstance(app.appId, entry.config || {}),
              });
            } else {
              items.push({
                label: entry.label,
                action: () => this.launch(app.appId, entry.config || {}),
              });
            }
          }
        }
      }
      if (items.length) items.push({ separator: true });
      items.push({ label: '🎨 Change Theme', action: () => this.toggleTheme() });
      items.push({ label: '🪐 About', action: () => this.launch('about') });
      this.showContextMenu(x, y, items);
    },

    staggerLauncherTiles() {
      Alpine.nextTick(() => {
        const tiles = document.querySelectorAll('.os-app-tile');
        Array.from(tiles).slice(0, 32).forEach((el, i) => {
          motion(el,
            { opacity: [0, 1], y: [10, 0], scale: [0.92, 1] },
            { ...spring.snappy(), delay: i * 0.035 }
          );
        });
      });
    },

    clickDesktopIcon(iconEl, item) {
      motion(iconEl, { scale: [1, 0.84, 1.1, 1], y: [0, -6, 0] }, { ...spring.snappy() });
      if (item.type === 'app') this.launch(item.id);
      else this.launchInstance(item.id);
    },

    toggleTheme() {
      this.theme = this.theme === 'light' ? 'dark' : 'light';
    },

    iconUrl(emoji) { return iconUrl(emoji); },
  });
}
