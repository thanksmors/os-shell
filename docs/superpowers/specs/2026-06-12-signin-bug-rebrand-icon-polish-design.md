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

### 1. Sign-in bug — apply the likely fix directly

The error message in coho log does not identify which route threw. We have a strong guess (`realtime.createListener` for a brand-new workspaceId in `codehooks/routes/data.js:25` is not wrapped in try/catch), but the original plan was to add a temporary diagnostic route to confirm before patching.

**The diagnostic was abandoned before deploy.** The codehooks runtime sandbox does not expose Node's `process.on` — `coho deploy` failed with `process.on is not a function`. There is no global error-capture primitive in this runtime, so a probe route cannot catch an unhandled rejection that fires during another request. (The committed `codehooks/routes/debug.js` in commits `f4346c2` + `151eed6` is removed in the same change that applies the fix.)

**Step 1 — apply the likely fix.**

Wrap the suspect call in try/catch in `codehooks/routes/data.js:22-27`:

```js
app.post('/w/:workspaceId/sse-listener', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }
  try {
    const listener = await realtime.createListener('/sync', { workspaceId: req.params.workspaceId });
    res.json({ listenerId: listener._id });
  } catch (err) {
    console.error('[sse-listener] createListener failed, falling back to polling:', err?.message);
    res.json({ listenerId: null });
  }
});
```

The frontend already treats a null listener as "polling only" (`shell/api.js:296-298` retries with exponential backoff). No frontend change needed.

**Step 2 — verify.**

Sign in with the new email again. Expected: sign-in completes, no "Unhandled Codehook exception" in the browser, the Personal workspace auto-creates, the user lands on the desktop. `coho log` shows no new `5 NOT_FOUND: Not found` lines from the `sse-listener` path over the next 10 minutes.

**Step 3 — iterate if the symptom persists.**

If the bug continues, the captured error message from `[sse-listener] createListener failed, falling back to polling: ...` in the new logs is the next round of evidence. The fix may need to address a deeper cause (e.g., the listener collection's initialization on a brand-new channel) rather than the symptom.

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

One targeted update to `codehooks/AGENTS.md` — add a new "Debug routes" subsection under "Local Contracts" (where the other gotcha-rules live). Codifies the pattern from the three prior successful temp debug routes (a3194de, de866a8, a26a195) and records the runtime constraint that blocked the 2026-06-12 attempt (`process.on` is not available in the codehooks sandbox). Includes a guidance bullet that future debug routes should capture errors at the route-handler level (try/catch) or via a probe endpoint that calls the suspect function, not via global listeners.

No other doc changes. `shell/AGENTS.md`, `modules/AGENTS.md`, and root `AGENTS.md` do not reference the icon-sizing constants or the "Capsule" brand name.

## Verification

- **Bug (fix):** after the fix deploys, sign in with the new email. The sign-in completes without "Unhandled Codehook exception" in the browser. The Personal workspace auto-creates, the user lands on the desktop. `coho log -p <project> -s <space>` shows no new `5 NOT_FOUND: Not found` lines from the `sse-listener` path over the next 10 minutes.
- **Bug (iterate):** if a fresh `5 NOT_FOUND` from `sse-listener` still appears, the new `[sse-listener] createListener failed, falling back to polling: ...` log line is the next round of evidence — the cause is deeper than a missing try/catch.
- **Naming:** deploy, visit `/` (loading + login screens) and open the About module. Both show "Workspace Capsules". Browser tab still shows "Capsule". Settings > About and onboarding unchanged.
- **Icon sizes:** reload `index.html`, observe default desktop icons are noticeably larger. Open Settings > Appearance, drag the Icon Size slider, confirm all four positions render at the new sizes. Hit "Reset Appearance" in About tab, confirm desktop reverts to `112px` / `3rem` emoji.
- **Cleanup:** `codehooks/routes/debug.js` and its import in `codehooks/index.js` are removed in the same commit that applies the bug fix. Final deploy confirms the file is gone and no `process.on` deploy error occurs.

## Out of scope

- Renaming the data model (`workspaces` → `workspace_capsules`, etc.) — explicitly not requested.
- Changing the product name in the browser tab title, onboarding, or AI prompt — kept as "Capsule" short form.
- Touching `build/` Tailwind config — unactivated, per `AGENTS.md` "Stack summary".
- Refactoring `bootstrapSession` race conditions or other latent issues — addressed only if the fix does not resolve the symptom.
- Adding a different diagnostic mechanism (probe endpoint, custom try/catch wrapper, etc.) — the next iteration's evidence is the `[sse-listener] createListener failed, falling back to polling: ...` log line the fix itself emits.

## Open questions

None at design time. The fix for the sign-in bug is applied on the strong evidence already in hand (coho log pattern + new-workspace sign-in correlation + `createListener` is the only async call in the new-workspace activation path). If the symptom persists after the fix deploys, the next iteration has the fix's own error log to work from.
