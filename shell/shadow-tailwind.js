// Adopts the compiled Tailwind stylesheet into a shadow root + mirrors dark mode
let _sheet = null;

async function getSheet() {
  if (_sheet) return _sheet;
  const res = await fetch('/shell/tailwind.build.css');
  const css = await res.text();
  _sheet = new CSSStyleSheet();
  await _sheet.replace(css);
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
