# Sign-in Bug, Capsule Rename, Icon Sizing Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the chronic 5 NOT_FOUND error surfacing on new-email sign-in; rename "Capsule" to "Workspace Capsules" on the auth screen and About module only; bump icon sizes from `[56,68,80,96]` to `[80,96,112,128]`.

**Architecture:** Three independent workstreams bundled into one plan per user request. Bug workstream pivoted from "diagnose then fix" to "apply the known-likely fix directly" — see Pivot note below. Rename and icon sizing are pure text/constant changes. Project is solo + main-only (no worktree, no branches) per root `AGENTS.md` — commits go directly to `main` and Netlify deploys from there.

**Tech Stack:** Alpine.js v3, plain ES modules, Codehooks.io backend, Co-Authored-By commit attribution.

---

## Pivot: why the diagnostic step was dropped

The original plan added a temporary `codehooks/routes/debug.js` with a Node `process.on('unhandledRejection')` listener to capture the actual stack trace. The intent was "no fix on a guess" — the user picked diagnose-first so we'd have evidence before patching.

The runtime blocked that approach. `coho deploy -p test-tp2u` failed with `Failed execution on deploy: process.on is not a function`. The codehooks sandbox exposes a shim `process` (it has `.env`, used in `codehooks-js` README examples) but no `.on` method. There's no global error-capture primitive in this runtime — async rejections can't be caught from outside a route handler, only from inside it via try/catch. So a diagnostic route cannot capture an unhandled rejection that fires during another request.

We already have enough evidence to act without the stack trace:
- 100+ `5 NOT_FOUND: Not found` errors in coho log since 2026-06-09, bursting 5+/sec after every deploy
- The error clusters on new-email sign-in (the only sign-in path that creates a brand-new `workspaceId`)
- The single async call in the new-workspace activation path is `realtime.createListener('/sync', { workspaceId })` in `codehooks/routes/data.js:25`
- `realtime.createListener` is `db.insertOne` against `_event_listeners_sync` (codehooks-js `index.js:286`); on a fresh channel/workspace the underlying collection may not exist yet → `5 NOT_FOUND`
- The frontend already treats `listenerId: null` as "polling only" with exponential backoff (`shell/api.js:296`)

So the fix branch from the spec (Section 1, Step 3 "Likely") is applied directly. If it doesn't resolve the symptom, the next iteration has the fix's own error log to work from.

The committed `codehooks/routes/debug.js` (commits `f4346c2`, `151eed6`) is removed in the same change that applies the fix; the cleanup task is dropped from the plan.

---

## File Structure

**New files:** none.

**Modified files:**
- `codehooks/index.js` — remove `import './routes/debug.js';`
- `codehooks/routes/data.js:22-27` — wrap `realtime.createListener` in try/catch
- `codehooks/AGENTS.md` — new "Debug routes" subsection under Local Contracts (historical pattern; no current debug route)
- `index.html` — 4 changes: lines 47 (icon sizes), 48 (icon emojis), 92 + 101 (Capsule → Workspace Capsules)
- `modules/about/index.js` — 2 changes: lines 20 + 66 (Capsule → Workspace Capsules)
- `modules/settings/tabs/about.js` — 2 changes: lines 67 + 68 (reset-to-defaults values)
- `modules/settings/tabs/appearance.js` — 2 changes: lines 3 + 4 (icon size constants)

**Deleted in this change:** `codehooks/routes/debug.js` (created in `f4346c2`, fixed-up in `151eed6`; runtime doesn't support the chosen capture mechanism).

---

## Task 1: Apply the fix to `data.js` and remove the dead debug route

**Files:**
- Modify: `codehooks/routes/data.js:22-27` (wrap createListener in try/catch)
- Delete: `codehooks/routes/debug.js`
- Modify: `codehooks/index.js` (remove the debug import)

- [ ] **Step 1: Open `codehooks/routes/data.js`.** The block at lines 22–27 is:

```js
app.post('/w/:workspaceId/sse-listener', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }
  const listener = await realtime.createListener('/sync', { workspaceId: req.params.workspaceId });
  res.json({ listenerId: listener._id });
});
```

Replace it with:

```js
app.post('/w/:workspaceId/sse-listener', async (req, res) => {
  const authUser = await getSessionUser(req);
  if (!authUser) { sendUnauth(res); return; }
  try {
    const listener = await realtime.createListener('/sync', { workspaceId: req.params.workspaceId });
    res.json({ listenerId: listener._id });
  } catch (err) {
    // createListener calls db.insertOne against the channel's listener
    // collection. On a brand-new workspace this can fail with 5 NOT_FOUND
    // (no event-listener collection exists yet for that channel). The
    // frontend treats listenerId: null as "polling only" (shell/api.js),
    // so the user can still use the app — just without live cross-tab
    // sync on the first sign-in to a fresh workspace.
    console.error('[sse-listener] createListener failed, falling back to polling:', err?.message);
    res.json({ listenerId: null });
  }
});
```

- [ ] **Step 2: Delete the debug route file**

```bash
cd /home/mors/Projects/os-shell2
rm codehooks/routes/debug.js
```

- [ ] **Step 3: Remove the import from `codehooks/index.js`**

Open `codehooks/index.js`. Delete the line `import './routes/debug.js';`.

- [ ] **Step 4: Commit**

```bash
cd /home/mors/Projects/os-shell2
git add codehooks/routes/data.js codehooks/routes/debug.js codehooks/index.js
git commit -m "Fix sse-listener on fresh workspace; remove unworkable debug route

The diagnostic was meant to capture the exact stack from realtime.createListener
on new-workspace sign-in. The codehooks sandbox exposes process.env but not
process.on, so 'coho deploy' rejected the listener with 'process.on is not
a function' — no global error capture is available in this runtime.

Strong evidence already exists: 100+ 5 NOT_FOUND errors over 2 days,
clustering on new-email sign-in (the only path that creates a fresh
workspaceId); realtime.createListener (codehooks-js index.js:286) is the
only async call in the new-workspace activation path; the frontend already
treats listenerId: null as 'polling only' with exponential backoff.

Wrap the call in try/catch and return null listenerId on failure. The user
can still use the app via polling on first sign-in; cross-tab sync resumes
on subsequent sign-ins once the listener collection exists.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Deploy the fix and verify the bug is gone

**Files:** none (deploy only)

- [ ] **Step 1: Pull and deploy**

Per `codehooks/AGENTS.md` "Deploy discipline" — `coho deploy` ships *local* code, not git.

```bash
cd /home/mors/Projects/os-shell2
git pull origin main
coho deploy -p <your-project-name>
```

Expected: deploy succeeds. No `process.on is not a function` error this time (debug route is gone).

- [ ] **Step 2: Sign in with the new email a second time**

In a browser, sign in with the same new email that triggered the original failure. The sign-in should complete and the workspace selector / desktop should appear (auto-creating the Personal workspace via `bootstrapSession`). No "Unhandled Codehook exception" in the browser.

- [ ] **Step 3: Watch `coho log` for 10 minutes**

```bash
coho log -p <your-project-name> -s <space> | tail -50
```

Expected: no new `[error]` lines containing `5 NOT_FOUND: Not found` from the `sse-listener` path. (Other 5 NOT_FOUND errors from other sources would still be visible if they exist — the fix only addresses the listener-registration path.)

If a fresh `5 NOT_FOUND` line appears, capture the full log line and the workspaceId it came from. The fix may not be addressing the actual cause; we will iterate.

---

## Task 3: Rename "Capsule" → "Workspace Capsules" in auth + About

**Files:**
- Modify: `index.html` (lines 92, 101)
- Modify: `modules/about/index.js` (lines 20, 66)

- [ ] **Step 1: Update `index.html` line 92 (loading screen title)**

Open `index.html`. Find:

```html
          <div class="os-auth-title">Capsule</div>
```

in the loading template (the first occurrence of this string in the file, around line 92). Replace with:

```html
          <div class="os-auth-title">Workspace Capsules</div>
```

- [ ] **Step 2: Update `index.html` line 101 (login screen title)**

In the same file, find the second occurrence of:

```html
          <div class="os-auth-title">Capsule</div>
```

(inside the login template, around line 101). Replace with:

```html
          <div class="os-auth-title">Workspace Capsules</div>
```

- [ ] **Step 3: Update `modules/about/index.js` line 20 (hero h1)**

Open `modules/about/index.js`. Find:

```html
        <h1 class="about-title">Capsule</h1>
```

Replace with:

```html
        <h1 class="about-title">Workspace Capsules</h1>
```

- [ ] **Step 4: Update `modules/about/index.js` line 66 (footer copyright)**

In the same file, find:

```html
          <span>© 2025 Capsule</span>
```

Replace with:

```html
          <span>© 2025 Workspace Capsules</span>
```

- [ ] **Step 5: Commit**

```bash
cd /home/mors/Projects/os-shell2
git add index.html modules/about/index.js
git commit -m "Rename 'Capsule' to 'Workspace Capsules' in auth and About

Affects only the two highest-visibility surfaces (auth screen loading + login,
About module hero + footer). Per user 'auth + About' scope, kept 'Capsule' as
the short form in browser tab title, onboarding, Settings > About, and the AI
system prompt.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Bump icon sizes [56, 68, 80, 96] → [80, 96, 112, 128]

**Files:**
- Modify: `index.html` (lines 47, 48)
- Modify: `modules/settings/tabs/appearance.js` (lines 3, 4)
- Modify: `modules/settings/tabs/about.js` (lines 67, 68)

- [ ] **Step 1: Update `index.html` line 47 (inline init script icon sizes)**

Open `index.html`. Find:

```js
      var iconSizes  = [56,68,80,96];
```

Replace with:

```js
      var iconSizes  = [80,96,112,128];
```

- [ ] **Step 2: Update `index.html` line 48 (inline init script icon emojis)**

In the same file, find:

```js
      var iconEmojis = ['1.5rem','1.75rem','2rem','2.5rem'];
```

Replace with:

```js
      var iconEmojis = ['2.125rem','2.5rem','3rem','3.375rem'];
```

- [ ] **Step 3: Update `modules/settings/tabs/appearance.js` line 3**

Open `modules/settings/tabs/appearance.js`. Find:

```js
const ICON_SIZES   = [56, 68, 80, 96];
```

Replace with:

```js
const ICON_SIZES   = [80, 96, 112, 128];
```

- [ ] **Step 4: Update `modules/settings/tabs/appearance.js` line 4**

In the same file, find:

```js
const ICON_EMOJIS  = ['1.5rem', '1.75rem', '2rem', '2.5rem'];
```

Replace with:

```js
const ICON_EMOJIS  = ['2.125rem', '2.5rem', '3rem', '3.375rem'];
```

- [ ] **Step 5: Update `modules/settings/tabs/about.js` line 67 (reset-to-defaults icon size)**

Open `modules/settings/tabs/about.js`. Find the line in the `btn-reset` click handler that contains:

```js
    document.documentElement.style.setProperty('--os-icon-size', '80px');
```

Replace with:

```js
    document.documentElement.style.setProperty('--os-icon-size', '112px');
```

- [ ] **Step 6: Update `modules/settings/tabs/about.js` line 68 (reset-to-defaults emoji size)**

In the same handler, find:

```js
    document.documentElement.style.setProperty('--os-icon-emoji', '2rem');
```

Replace with:

```js
    document.documentElement.style.setProperty('--os-icon-emoji', '3rem');
```

- [ ] **Step 7: Commit**

```bash
cd /home/mors/Projects/os-shell2
git add index.html modules/settings/tabs/appearance.js modules/settings/tabs/about.js
git commit -m "Bump icon sizes [56,68,80,96] -> [80,96,112,128]

Shifts every step up by 24-32px. Emoji sizes scale proportionally to keep
the same ~42% emoji-to-container ratio. Reset Appearance in About tab now
restores to the new Medium (112px / 3rem), matching the slider's default
index — without this, Reset would silently downgrade the user's icons.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Update `codehooks/AGENTS.md` with Debug routes subsection

**Files:**
- Modify: `codehooks/AGENTS.md` (add subsection under Local Contracts)

- [ ] **Step 1: Open `codehooks/AGENTS.md` and locate the "Local Contracts" section**

The Local Contracts section starts after the "## Local Contracts" header. Find the last subsection in that section (currently "## CLI reference" near the bottom).

- [ ] **Step 2: Add a "Debug routes" subsection before "## CLI reference"**

Insert this block (preserving the existing `##` heading style) just above the "## CLI reference" heading:

```markdown
### Debug routes — temporary, must be removed before merge

The codebase has used temporary `codehooks/routes/debug.js` routes to diagnose
runtime issues (commits a3194de, de866a8, a26a195). The 2026-06-12 signin-bug
attempt to add a fourth was abandoned — see the implementation plan for the
runtime constraint that blocked it.

When adding a debug route:
- Put it in a dedicated `routes/debug.js` file, imported by `index.js`.
- Gate it on `process.env.NODE_ENV !== 'production'` (or similar) so it
  cannot ship to prod.
- Persist captured state to KV via `kvSet`/`kvGet` (not raw `db.set`/`db.get`
  — see "KV store" above), not just `console.error`, which can be truncated.
- Do not assume Node primitives are available — the codehooks runtime is a
  sandbox where `process.on` does not exist. Capture errors at the route
  handler level (try/catch) or by calling the suspect function from a probe
  endpoint, not via global listeners.
- Remove the file + its import in the same commit that fixes the underlying
  issue. Do not leave debug routes that dump raw session/user data in prod.

---
```

- [ ] **Step 3: Commit**

```bash
cd /home/mors/Projects/os-shell2
git add codehooks/AGENTS.md
git commit -m "Document debug-routes pattern in codehooks/AGENTS.md

Three prior temp debug.js routes (a3194de, de866a8, a26a195); codify the
pattern so future ones follow the same shape and the cleanup contract is
explicit. Also note the runtime constraint that blocked the 2026-06-12
attempt (process.on is not available in the codehooks sandbox).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Final verification + closeout

**Files:** none (verification only)

- [ ] **Step 1: Pull and deploy remaining changes (Tasks 3, 4, 5)**

```bash
cd /home/mors/Projects/os-shell2
git pull origin main
coho deploy -p <your-project-name>
```

Netlify auto-deploys from `main` for the frontend, so the rename and icon sizing
changes are live immediately on push — no manual Netlify step.

- [ ] **Step 2: Browser-check the rename**

Open `https://<your-netlify-site>/` in a private/incognito window. Verify:
- Loading screen shows "Workspace Capsules"
- Login screen shows "Workspace Capsules"
- Open the About module (from the launcher), verify hero h1 and footer both say "Workspace Capsules"
- Browser tab title still says "Capsule"
- Settings > About tab still says "Capsule"
- Onboarding (only visible on a fresh user) still says "Welcome to Capsule"

- [ ] **Step 3: Browser-check the icon sizes**

In the same browser session:
- Default desktop icons should be noticeably larger (112px vs the old 80px)
- Open Settings > Appearance, drag the Icon Size slider through all 4 positions
  - XSmall → 80px
  - Small → 96px
  - Medium → 112px
  - Large → 128px
- Open Settings > About, click "Reset Appearance". Desktop icons should revert to 112px (Medium) with the new default emoji size.

- [ ] **Step 4: Browser-check the bug is gone**

Sign in with a brand-new email that has never signed in before. Expected:
- The sign-in completes (no "Unhandled Codehook exception" in the browser)
- The Personal workspace auto-creates
- The user lands on the desktop

- [ ] **Step 5: Watch `coho log` for 10 minutes**

```bash
coho log -p <your-project-name> -s <space> | tail -50
```

Expected: no new `[error]` lines from the `sse-listener` path containing
`5 NOT_FOUND: Not found`. (Other 5 NOT_FOUND errors from other paths would
still be visible if they exist; the fix only addresses listener registration.)

- [ ] **Step 6: Run the DOX orphan check**

Per root `AGENTS.md` "No orphans" rule:

```bash
cd /home/mors/Projects/os-shell2
for f in $(find . -mindepth 2 -name AGENTS.md -not -path '*/node_modules/*' -not -path '*/.git/*'); do
  d=$(dirname "$f"); p=$(dirname "$d")
  while [ ! -f "$p/AGENTS.md" ] && [ "$p" != "." ]; do p=$(dirname "$p"); done
  grep -q "$d" "$p/AGENTS.md" 2>/dev/null || echo "ORPHAN: $f not indexed in $p/AGENTS.md"
done
```

Expected: no `ORPHAN:` lines. (This task did not add or move any `AGENTS.md` files, so the check is a sanity test that previous spec commits left the index intact.)

- [ ] **Step 7: Report closeout**

In the final user-facing message, list:
- Which Task 1 branch was taken (only the "likely" branch, since diagnostic was abandoned)
- The runtime constraint that blocked the diagnostic, for future reference
- Any AGENTS.md / spec files intentionally left unchanged and why (per root `AGENTS.md` "Closeout" rule)

---

## Notes

- **Co-Authored-By** lines match recent Claude-authored commits. Remove if the user prefers no attribution on implementation commits.
- **All deploys go through Codehooks.** Per `codehooks/AGENTS.md`, the AI build probe `GET /ai/ping` returns `{ build, hasKey, ok }` and can be used to confirm a deploy landed. The `AI_BUILD` string in `codehooks/routes/ai.js:8` is `'2026-06-10-m3-worker'`; it does not need to be bumped for this plan (no ai.js changes).
- **Netlify is auto-deployed from `main`.** Each commit in this plan triggers a Netlify build. No manual Netlify deploy step.
- **Iterate if the fix doesn't resolve the symptom.** If Task 2 Step 3 still shows `5 NOT_FOUND` from `sse-listener`, the captured error message from `[sse-listener] createListener failed, falling back to polling: ...` is the new evidence to work from.
