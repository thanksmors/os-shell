import { registerAuthStore } from './store-auth.js';
import { registerOsStore } from './store-os.js';

// Registers both Alpine stores. Must run inside the `alpine:init` listener,
// before Alpine core loads (see index.html script ordering note in CLAUDE.md).
export function initStore() {
  registerAuthStore();
  registerOsStore();
}
