# Module Boilerplate

Copy this folder to create a new Alpine OS Shell module.

## 5-step quickstart

1. **Copy** `modules/boilerplate/` → `modules/your-app/`
2. **Edit `manifest.json`**
   - `appId` → unique string, e.g. `"your-app"`
   - `tag` → custom element name, e.g. `"app-your-app"` (must contain a hyphen)
   - `title`, `icon`, `defaultSize`, `singleton`, `resizable`, `minSize`
3. **Edit `index.js`**
   - Rename the class: `AppBoilerplate` → `AppYourApp`
   - Update `customElements.define('app-your-app', AppYourApp)`
   - Update the `fetch` path for `styles.css`
   - Build your UI inside `wrapper.innerHTML`
4. **Edit `styles.css`** — styles are scoped to your shadow root; they won't leak
5. **Add your appId to `/registry.json`** — the shell auto-discovers it on next reload

## The `el.api` contract

The shell attaches `this.api` to your element after `connectedCallback`. Access it after one tick:

```js
await new Promise(r => setTimeout(r, 0));
if (this.api) {
  this.api.setTitle('New Title');   // update the window titlebar
  this.api.notify('Saved!', 'success');  // fire a toast
  this.api.requestClose();          // close this window
  const isDark = this.api.isDark;   // current theme
  const mode = this.api.mode;       // 'windowed' | 'fullscreen'
}
```

## Persistence

Use `shell/api.js` for data that should survive a reload:

```js
import { getData, setData } from '/shell/api.js';

// Load
const data = await getData('my-collection', this.api.windowId);

// Save
await setData('my-collection', this.api.windowId, { key: 'value' });
```

Set `BACKEND_URL` in `shell/config.js` to sync across devices via Codehooks.
