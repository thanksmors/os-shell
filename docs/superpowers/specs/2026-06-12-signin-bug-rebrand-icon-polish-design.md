# Sign-in bug, Capsule rename, icon sizing polish

**Date:** 2026-06-12
**Status:** Approved (in conversation)
**Scope:** Three small, related changes bundled into one spec per user request

## Background

Three independent threads surfaced in a single conversation:

1. **Sign-in bug.** User signed in with a new email and got the browser-facing "Unhandled Codehook exception, check logs (2)". `bootstrapSession()` in `codehooks/lib/session.js:23` is designed to auto-create a Personal workspace on first sign-in, so the user's expectation that it "should just push through and create a workspace" is the intended behaviour. The user also reports that the same flow works on a returning email.
2. **Naming clarity.** "Capsule" alone is too ambiguous (pill? spacecraft? container?). User wants the product referred to as "Workspace Capsules" in the two highest-visibility surfaces (auth screen, About module) and keeps the short form "Capsule" everywhere else.
3. **Icon sizing too small.** Current `[56, 68, 80, 96]` px values leave the largest option still feeling small. User wants a +24 to +32 px shift on all four steps.

The coho log shows the bug is not isolated to the new sign-in: 100+ `5 NOT_FOUND: Not found` errors since 2026-06-09, clustering in bursts of 5+ per second after every deploy. The new sign-in just happened to land in one of those bursts. Returning-email sign-ins also hit the same errors, but the user only noticed them on the new-email flow because the auto-created workspace is a different code path.

## Approach

### 1. Sign-in bug — diagnose first, fix second

The error message in coho log does not identify which route threw. We have a strong guess (`realtime.createListener` for a brand-new workspaceId in `codehooks/routes/data.js:25` is not wrapped in try/catch), but we should not fix on a guess.

**Step 1 — add a temporary capture route + process-level error listener.**

New file `codehooks/routes/debug.js`, imported by `codehooks/index.js`. It registers:

- Node's `process.on('unhandledRejection')` and `process.on('uncaughtException')` listeners that stash the most recent error into a KV record under `last_error` with shape `{ source, message, stack, ts }`. **Why not Express-style error middleware (`app.use((err, req, res, next) => ...)`)?** The suspect failure is async — `realtime.createListener` is awaited inside a route handler. Even in a fully-Express-compatible framework, async rejections do not auto-route to error middleware; they become unhandled promise rejections unless the handler explicitly calls `next(err)`. Node's process-level listeners are the only capture guaranteed to fire.
- `GET /debug/last-error` — returns the stored record (or `{ error: 'none' }` if nothing has been captured). Read-after-triggers pattern, like the prior `a3194de` / `de866a8` / `a26a195` debug routes.

The listener uses `console.error` first (cheap, surfaces in `coho log` if it works) and persists to KV as the source of truth (reliable even if coho log truncates async errors).

**Step 2 — trigger and read.**

User signs in with the new email. Immediately afterwards, the user (or we) `curl` the debug route:

```bash
curl "https://test-tp2u.api.codehooks.io/dev/debug/last-error?apikey=..."
```

The response identifies the failing route + stack. If the error is what we guessed (`realtime.createListener`), the stack will point to `codehooks/routes/data.js:25`. If it's elsewhere, we design the fix from the actual evidence.

**Step 3 — fix.**

Branch on what the diagnostic returns:

- *Likely: `realtime.createListener` throws on a fresh workspaceId.* Wrap the call in try/catch, return `{ listenerId: null }` on failure. The frontend already treats a null listener as "polling only" (`shell/api.js:296-298` retries with exponential backoff). No frontend change needed.
- *Other.* Design the fix in a follow-up brainstorm once we know the actual cause. Do not speculatively patch routes that the diagnostic did not implicate.

**Step 4 — cleanup.**

Remove `codehooks/routes/debug.js` and its import in `codehooks/index.js` after the fix ships and is confirmed working. The three prior debug routes all followed this pattern (a3194de, de866a8, a26a195) — temporary, removed, not left in prod.

### 2. Rename "Capsule" → "Workspace Capsules" (auth + About only)

Three text changes, no data model or API changes:

| File | Line | From | To |
|---|---|---|---|
| `index.html` | 92 | `Capsule` (loading screen title) | `Workspace Capsules` |
| `index.html` | 101 | `Capsule` (login screen title) | `Workspace Capsules` |
| `modules/about/index.js` | 20 | `Capsule` (hero h1) | `Workspace Capsules` |
| `modules/about/index.js` | 66 | `© 2025 Capsule` | `© 2025 Workspace Capsules` |

**Explicitly NOT changed** (kept as short form "Capsule"):

- `index.html:6` — `<title>Capsule</title>` (browser tab)
- `index.html:555` — `<h2 class="os-ob-title">Welcome to Capsule</h2>` (onboarding)
- `modules/settings/tabs/about.js:5` — Settings > About tab title
- `codehooks/routes/ai.js:10` — AI system prompt (would change the model context; not worth the risk for a copy tweak)

Rationale: "auth + About" is the highest-visibility copy. The browser tab, settings tab, and AI prompt are seen after the user is already inside the product. The rename has the largest impact on first impressions (sign-in screen) and the product's self-description (About).

Data model: untouched. `workspaces`, `ws_members`, `user_workspaces`, all collection names, all field names stay as-is. No migration, no backwards-compat shim.

### 3. Icon sizing [80, 96, 112, 128]

Four values shift up in two files. Emoji sizes scale proportionally to keep the same ~42% emoji-to-container ratio.

| File | Line | From | To |
|---|---|---|---|
| `index.html` | 47 | `var iconSizes  = [56,68,80,96];` | `var iconSizes  = [80,96,112,128];` |
| `index.html` | 48 | `var iconEmojis = ['1.5rem','1.75rem','2rem','2.5rem'];` | `var iconEmojis = ['2.125rem','2.5rem','3rem','3.375rem'];` |
| `modules/settings/tabs/appearance.js` | 3 | `const ICON_SIZES   = [56, 68, 80, 96];` | `const ICON_SIZES   = [80, 96, 112, 128];` |
| `modules/settings/tabs/appearance.js` | 4 | `const ICON_EMOJIS  = ['1.5rem', '1.75rem', '2rem', '2.5rem'];` | `const ICON_EMOJIS  = ['2.125rem', '2.5rem', '3rem', '3.375rem'];` |
| `modules/settings/tabs/about.js` | 67 | `'--os-icon-size', '80px')` (reset-to-defaults) | `'--os-icon-size', '112px')` |
| `modules/settings/tabs/about.js` | 68 | `'--os-icon-emoji', '2rem')` (reset-to-defaults) | `'--os-icon-emoji', '3rem')` |

The `about.js` reset-to-defaults changes matter: the "Reset Appearance" button previously restored to `80px` / `2rem` (the old Medium). With the new sizes, those values are now Small. The reset must land on Medium to match the slider's default index (index 2 → `112px` / `3rem`), otherwise the reset button silently downgrades the user's icons.

`--os-icon-size` and `--os-icon-emoji` CSS variable defaults in `shell/css/shell.css:3-4` stay at `80px` / `2rem` — those are pre-paint fallbacks. The `index.html` inline init script always runs first and sets the real values, so the CSS defaults only matter if the inline script is skipped (e.g. older browsers or a JS error). The defaults are intentionally not bumped to avoid inflating the unstyled state.

Labels (`XSmall / Small / Medium / Large`) and the 4-step slider stay the same — the step index just maps to larger values.

## AGENTS.md updates

One targeted update to `codehooks/AGENTS.md` — add a new "Debug routes" subsection under "Local Contracts" (where the other gotcha-rules live):

> The codebase has used temporary `codehooks/routes/debug.js` routes to diagnose runtime issues (commits a3194de, de866a8, a26a195, and 2026-06-12 signin-bug spec). When adding a debug route: put it in a dedicated `routes/debug.js` file, gate it on `process.env.NODE_ENV !== 'production'` or similar so it cannot ship to prod, and remove it in the same commit that fixes the underlying issue. Do not leave debug routes that dump raw session/user data in production.

No other doc changes. `shell/AGENTS.md`, `modules/AGENTS.md`, and root `AGENTS.md` do not reference the icon-sizing constants or the "Capsule" brand name.

## Verification

- **Bug (diagnose):** after Step 1 deploy, sign in with a brand-new email, then `curl /debug/last-error` returns `{ route, method, stack, ts }` for the actual failing handler.
- **Bug (fix):** after Step 3 deploy, sign in with the new email a second time. `coho log -p <project> -s <space>` shows no new `5 NOT_FOUND` lines in the next 10 minutes. `curl /debug/last-error` returns `{ error: 'none' }`.
- **Naming:** deploy, visit `/` (loading + login screens) and open the About module. Both show "Workspace Capsules". Browser tab still shows "Capsule". Settings > About and onboarding unchanged.
- **Icon sizes:** reload `index.html`, observe default desktop icons are noticeably larger. Open Settings > Appearance, drag the Icon Size slider, confirm all four positions render at the new sizes. Hit "Reset Appearance" in About tab, confirm desktop reverts to `112px` / `3rem` emoji.
- **Cleanup:** final commit removes `codehooks/routes/debug.js` and its import in `codehooks/index.js`. Deploy. `coho log` shows no errors.

## Out of scope

- Renaming the data model (`workspaces` → `workspace_capsules`, etc.) — explicitly not requested.
- Changing the product name in the browser tab title, onboarding, or AI prompt — kept as "Capsule" short form.
- Touching `build/` Tailwind config — unactivated, per `AGENTS.md` "Stack summary".
- Refactoring `bootstrapSession` race conditions or other latent issues — addressed only if the diagnostic implicates them.

## Open questions

None at design time. The fix for the sign-in bug is intentionally left as a placeholder (Section 1, Step 3) because we are not designing a fix for a guessed cause; the diagnostic determines the fix.
