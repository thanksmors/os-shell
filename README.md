# Alpine OS Shell

A beautiful browser-based desktop environment built with Alpine.js v3, Tailwind CSS, and Web Components.

## Features

- **Window Manager** — draggable, resizable, minimizable, maximizable windows
- **App Launcher** — press `⌘K` / `Ctrl+K` or click the 🏔️ button
- **Module System** — apps as Web Components with Shadow DOM isolation
- **4 Built-in Apps** — Notepad, Files, About, Settings
- **Dark Mode** — system-aware with manual toggle
- **Notifications** — toast stack with auto-dismiss
- **Context Menu** — right-click on the desktop
- **Keyboard Shortcuts** — `⌘K` launcher, `⌘W` close window, `Esc` dismiss menus

## Requirements

The app uses root-absolute paths (`/shell/store.js`, `/modules/notepad/index.js`, etc.) and ES modules, so it **must be served over HTTP** — it will not work opened directly as a `file://` URL.

## Quick Start

### Using Python (built-in)

```bash
cd /path/to/os-shell
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080) in your browser.

### Using Node.js (npx serve)

```bash
cd /path/to/os-shell
npx serve -p 8080
```

### Using Node.js (http-server)

```bash
npm install -g http-server
cd /path/to/os-shell
http-server -p 8080
```

### Using Deno

```bash
deno run --allow-net --allow-read https://deno.land/std/http/file_server.ts -p 8080
```

## File Structure

```
os-shell/
  index.html                  Main entry point
  shell/
    store.js                  Alpine.store('os') — window manager state
    motion.js                 Animation helpers (motion.dev)
    shadow-tailwind.js        Adopts Tailwind CSS into shadow roots
    icon.js                   Twemoji SVG URL helper
    shortcuts.js              Global keyboard shortcuts
    tailwind.build.css        Hand-crafted Tailwind-compatible utility CSS
  modules/
    notepad/                  Text editor with word count
    about/                    About this OS screen
    files/                    File tree browser
    settings/                 System settings (theme, etc.)
  build/
    tailwind.config.js        Tailwind v3 config (for future builds)
    input.css                 Tailwind input (for future builds)
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Toggle app launcher |
| `⌘W` / `Ctrl+W` | Close focused window |
| `Esc` | Close launcher / context menu |

## Architecture

### Store (`Alpine.store('os')`)

The store is the single source of truth for the window manager. All window state (position, size, z-index, focus, minimized/maximized) lives in `store.windows[]`.

### Modules

Each app is a Web Component registered with `customElements.define()`. Modules:
1. Use Shadow DOM for style isolation
2. Receive an `api` object via `el.api` for inter-op with the OS
3. Adopt the compiled Tailwind CSS via `adoptTailwind(shadowRoot, wrapperEl)`
4. Are loaded lazily when first launched

### Module API

```js
el.api = {
  windowId: string,
  get mode(): 'fullscreen' | 'windowed',
  get isDark(): boolean,
  setTitle(title: string): void,
  notify(msg: string, type: 'info' | 'success' | 'error' | 'warning'): void,
  requestClose(): void,
  store: Alpine.store('os'),
}
```

## Browser Support

Requires a modern browser with support for:
- ES Modules (import/export)
- Web Components (Custom Elements v1, Shadow DOM v1)
- CSS `backdrop-filter`
- `CSSStyleSheet.replace()` (Constructable Stylesheets)

Chrome 80+, Firefox 101+, Safari 16.4+, Edge 80+.
