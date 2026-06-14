// Adopts the compiled Tailwind stylesheet into a shadow root + mirrors dark mode
let _sheet = null;

// The CSS is split into ordered partials; concatenate them in the same order
// they would appear in a single sheet (utils → shell chrome → auth) so cascade
// and dark/hover variants resolve identically.
const CSS_PARTS = ['/shell/css/utils.css', '/shell/css/components.css', '/shell/css/shell.css', '/shell/css/auth.css'];

async function getSheet() {
  if (_sheet) return _sheet;
  const parts = await Promise.all(CSS_PARTS.map(p => fetch(p).then(r => r.text())));
  _sheet = new CSSStyleSheet();
  await _sheet.replace(parts.join('\n'));
  return _sheet;
}

export async function adoptTailwind(shadowRoot, wrapperEl) {
  const sheet = await getSheet();
  shadowRoot.adoptedStyleSheets = [sheet];
  // mirror dark class into shadow
  const sync = () => wrapperEl.classList.toggle('dark', document.documentElement.classList.contains('dark'));
  sync();
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}
