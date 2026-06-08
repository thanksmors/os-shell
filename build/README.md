# build/ — Aspirational Tailwind Pipeline

This directory contains a Tailwind CSS build configuration that is **not used**.

```
build/
├── tailwind.config.js   — Tailwind v3 config (dark mode: class, container-queries plugin)
└── input.css            — Tailwind directives (@tailwind base/components/utilities)
```

## Why it exists

This was set up early in the project as a possible future build step. It was never
activated because the project has no build pipeline — everything is plain HTML,
CSS, and ES modules loaded directly in the browser.

## What's actually used

All utility classes are hand-written in `shell/css/utils.css`. The class names
are Tailwind-compatible (same naming conventions), but they are authored manually
rather than generated. This means:

- No Node.js, no `npm install`, no build command
- Classes are only present if they were explicitly written — no purging needed
- Adding a new class means adding it to `shell/css/utils.css` by hand

Shadow DOM modules get these utilities via `shell/shadow-tailwind.js`, which
fetches and adopts `utils.css` (plus `shell.css` and `auth.css`) as a shared
`CSSStyleSheet` injected into each shadow root.

## If you want to activate the build

1. `cd build && npm install tailwindcss @tailwindcss/container-queries`
2. `npx tailwindcss -i input.css -o ../shell/css/utils.css --watch`
3. Replace the hand-written `utils.css` content with the generated output
4. Add the build step to your deployment pipeline

Until then, ignore this directory.
