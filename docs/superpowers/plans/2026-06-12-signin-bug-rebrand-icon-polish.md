# Sign-in Bug, Capsule Rename, Icon Sizing Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diagnose and fix the chronic 5 NOT_FOUND error surfacing on new-email sign-in; rename "Capsule" to "Workspace Capsules" on the auth screen and About module only; bump icon sizes from `[56,68,80,96]` to `[80,96,112,128]`.

**Architecture:** Three independent workstreams bundled into one plan per user request. Bug workstream is iterative (diagnose → fix → cleanup); rename and icon sizing are pure text/constant changes. Project is solo + main-only (no worktree, no branches) per root `AGENTS.md` — commits go directly to `main` and Netlify deploys from there.

**Tech Stack:** Alpine.js v3, plain ES modules, Codehooks.io backend, Co-Authored-By commit attribution.

---

## File Structure

**New files (transient):**
- `codehooks/routes/debug.js` — temporary diagnostic route + error middleware, deleted in cleanup task

**Modified files:**
- `codehooks/index.js` — add `import './routes/debug.js';` (and remove in cleanup)
- `codehooks/routes/data.js` — likely fix: wrap `realtime.createListener` in try/catch
- `codehooks/AGENTS.md` — new "Debug routes" subsection under Local Contracts
- `index.html` — 4 changes: lines 47 (icon sizes), 48 (icon emojis), 92 + 101 (Capsule → Workspace Capsules)
- `modules/about/index.js` — 2 changes: lines 20 + 66 (Capsule → Workspace Capsules)
- `modules/settings/tabs/about.js` — 2 changes: lines 67 + 68 (reset-to-defaults values)
- `modules/settings/tabs/appearance.js` — 2 changes: lines 3 + 4 (icon size constants)

**Deleted in cleanup:**
- `codehooks/routes/debug.js`

---

## Task 1: Add temporary debug route + error middleware

**Files:**
- Create: `codehooks/routes/debug.js`
- Modify: `codehooks/index.js` (add import line)

- [ ] **Step 1: Create `codehooks/routes/debug.js`**

Write the file in full:

```js
import { app } from 'codehooks-js';
import { kvSet, kvGet } from '../lib/db.js';

// ─── Debug routes (TEMPORARY — remove after the issue is fixed) ───────────────
// Captures the most recent unhandled exception into KV so we can read it from
// the browser. Pattern matches prior debug routes (a3194de, de866a8, a26a195).

const KV_KEY = 'last_error';

// Express-style error middleware. Codehooks-js supports `app.use((err, req, res, next) => ...)`
// — any unhandled throw inside a route handler passes through here. We log to
// console.error (visible in coho log if it surfaces) AND persist to KV
// (reliable even if coho log truncates async errors).
app.use(async (err, req, res, next) => {
  try {
    const payload = {
      method: req?.method,
      path: req?.path,
      query: req?.query,
      message: err?.message,
      stack: err?.stack,
      ts: Date.now(),
    };
    await kvSet(KV_KEY, payload);
    console.error('[debug] captured unhandled error:', payload);
  } catch {}
  // Let Codehooks' default handler return the generic 500 to the client.
  next(err);
});

app.get('/debug/last-error', async (req, res) => {
  const last = await kvGet(KV_KEY);
  res.json(last || { error: 'none' });
});
```

- [ ] **Step 2: Add the import to `codehooks/index.js`**

Open `codehooks/index.js`. After the line `import './routes/data.js';` (currently line 20), add:

```js
import './routes/debug.js';
```

- [ ] **Step 3: Commit**

```bash
cd /home/mors/Projects/os-shell2
git add codehooks/routes/debug.js codehooks/index.js
git commit -m "Add temp /debug/last-error route to diagnose 5 NOT_FOUND errors

Captures unhandled exceptions to KV so we can read the actual route + stack
without relying on coho log surfacing async errors. To be removed after the
underlying issue is fixed.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Deploy the diagnostic and read the captured error

**Files:** none (deploy only)

- [ ] **Step 1: Pull and deploy**

Per `codehooks/AGENTS.md` "Deploy discipline" — `coho deploy` ships *local* code, not git.

```bash
cd /home/mors/Projects/os-shell2
git pull origin main
coho deploy -p <your-project-name>
```

- [ ] **Step 2: Verify the route is live**

```bash
curl "https://test-tp2u.api.codehooks.io/dev/debug/last-error?apikey=$API_KEY"
```

Expected: `{"error":"none"}` (no errors captured yet, but the route is reachable).

- [ ] **Step 3: Sign in with the brand-new email**

In a browser, open the app, click "Sign in with Google", pick the email that triggered the original failure. Complete the OAuth flow.

- [ ] **Step 4: Immediately read the captured error**

Within 30 seconds of the failed sign-in, run:

```bash
curl "https://test-tp2u.api.codehooks.io/dev/debug/last-error?apikey=$API_KEY" | python3 -m json.tool
```

- [ ] **Step 5: Record the result**

The response will have shape `{ method, path, query, message, stack, ts }` or `{ error: 'none' }`. Save the full output to a temp file (e.g. `/tmp/last-error.json`). You will need it in Task 3 to choose the fix.

Expected if the hypothesis was right: the `stack` line points to `codehooks/routes/data.js:25` and `message` is something like "5 NOT_FOUND: Not found".

If the response is `{ error: 'none' }`, the bug did not reproduce on this sign-in — sign in with a different new email and re-curl.

---

## Task 3: Implement the fix (likely branch — `realtime.createListener`)

**STOP:** if the captured error from Task 2 has a different `path` or `message` than the likely branch described here, do NOT proceed with this fix. Replan based on the actual evidence. The "Other" branch in the spec (`docs/superpowers/specs/2026-06-12-signin-bug-rebrand-icon-polish-design.md` Section 1 Step 3) covers this case.

**Files:**
- Modify: `codehooks/routes/data.js:22-27`

- [ ] **Step 1: Wrap `realtime.createListener` in try/catch**

Open `codehooks/routes/data.js`. Find the existing block:

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
    // The frontend treats `listenerId: null` as "polling only" and retries with
    // exponential backoff (see shell/api.js:296). A null listener on a fresh
    // workspace is non-fatal — the user can still use the app via polling.
    console.error('[sse-listener] createListener failed, falling back to polling:', err?.message);
    res.json({ listenerId: null });
  }
});
```

- [ ] **Step 2: Commit**

```bash
cd /home/mors/Projects/os-shell2
git add codehooks/routes/data.js
git commit -m "Wrap realtime.createListener in try/catch — return null on failure

The first listener for a brand-new workspaceId sometimes fails with
5 NOT_FOUND. Frontend already treats null listenerId as 'polling only',
so the user can still use the app — just without live cross-tab sync
on a fresh workspace.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Deploy the fix and verify the bug is gone

**Files:** none (deploy only)

- [ ] **Step 1: Pull and deploy**

```bash
cd /home/mors/Projects/os-shell2
git pull origin main
coho deploy -p <your-project-name>
```

- [ ] **Step 2: Sign in with the new email a second time**

In a browser, sign in with the same new email from Task 2. The sign-in should complete and the workspace selector / desktop should appear (auto-creating the Personal workspace via `bootstrapSession`).

- [ ] **Step 3: Read the captured error — `ts` should be older than the sign-in from Step 2, OR the response should be `{"error":"none"}`**

```bash
curl "https://test-tp2u.api.codehooks.io/dev/debug/last-error?apikey=$API_KEY"
```

If the response is `{ error: 'none' }` — the fix worked, no new error captured. If the response has a `ts` field, compare it to the time of the Step 2 sign-in. If `ts` predates the sign-in, the error is stale (from Task 2) and the fix worked. If `ts` is fresher than the sign-in, the fix did not address the actual cause — STOP, replan.

- [ ] **Step 4: Watch `coho log` for 10 minutes, confirm no new 5 NOT_FOUND**

```bash
coho log -p <your-project-name> -s <space> | tail -50
```

Look for any new lines starting with `[error]`. Expected: no new lines containing `5 NOT_FOUND: Not found`.

---

## Task 5: Remove the temporary debug route (cleanup)

**Files:**
- Delete: `codehooks/routes/debug.js`
- Modify: `codehooks/index.js` (remove the import)

- [ ] **Step 1: Delete the debug route file**

```bash
cd /home/mors/Projects/os-shell2
rm codehooks/routes/debug.js
```

- [ ] **Step 2: Remove the import from `codehooks/index.js`**

Open `codehooks/index.js`. Delete the line `import './routes/debug.js';` (added in Task 1).

- [ ] **Step 3: Commit**

```bash
cd /home/mors/Projects/os-shell2
git add codehooks/routes/debug.js codehooks/index.js
git commit -m "Remove temp /debug/last-error route after fix ships

Cleanup per the debug-routes pattern in codehooks/AGENTS.md.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 4: Pull and deploy**

```bash
cd /home/mors/Projects/os-shell2
git pull origin main
coho deploy -p <your-project-name>
```

---

## Task 6: Rename "Capsule" → "Workspace Capsules" in auth + About

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

## Task 7: Bump icon sizes [56, 68, 80, 96] → [80, 96, 112, 128]

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

## Task 8: Update `codehooks/AGENTS.md` with Debug routes subsection

**Files:**
- Modify: `codehooks/AGENTS.md` (add subsection under Local Contracts)

- [ ] **Step 1: Open `codehooks/AGENTS.md` and locate the "Local Contracts" section**

The Local Contracts section starts after the "## Local Contracts" header. Find the last subsection in that section (currently "## CLI reference" near the bottom).

- [ ] **Step 2: Add a "Debug routes" subsection before "## CLI reference"**

Insert this block (preserving the existing `##` heading style) just above the "## CLI reference" heading:

```markdown
### Debug routes — temporary, must be removed before merge

The codebase has used temporary `codehooks/routes/debug.js` routes to diagnose
runtime issues (commits a3194de, de866a8, a26a195, and the 2026-06-12
signin-bug spec). When adding a debug route:

- Put it in a dedicated `routes/debug.js` file, imported by `index.js`.
- Gate it on `process.env.NODE_ENV !== 'production'` (or similar) so it
  cannot ship to prod.
- Capture unhandled exceptions via `app.use((err, req, res, next) => ...)`
  error middleware, persisting to KV (not just `console.error`, which can
  be truncated for async errors).
- Remove the file + its import in the same commit that fixes the underlying
  issue. Do not leave debug routes that dump raw session/user data in prod.

---
```

- [ ] **Step 3: Commit**

```bash
cd /home/mors/Projects/os-shell2
git add codehooks/AGENTS.md
git commit -m "Document debug-routes pattern in codehooks/AGENTS.md

Fourth time we've added a temp debug.js; codify the pattern so future
ones follow the same shape and the cleanup contract is explicit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Final verification + closeout

**Files:** none (verification only)

- [ ] **Step 1: Pull and deploy remaining changes (Tasks 6, 7, 8)**

```bash
cd /home/mors/Projects/os-shell2
git pull origin main
coho deploy -p <your-project-name>
```

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

Expected: no new `[error]` lines containing `5 NOT_FOUND: Not found`.

- [ ] **Step 6: Verify the debug route is gone**

```bash
curl "https://test-tp2u.api.codehooks.io/dev/debug/last-error?apikey=$API_KEY"
```

Expected: a 404 (route no longer exists) or Codehooks' generic 500 (the import was removed, so even errors during boot would not register this route).

- [ ] **Step 7: Run the DOX orphan check**

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

- [ ] **Step 8: Report closeout**

In the final user-facing message, list:
- Which Task 3 branch was taken (likely vs other)
- The captured error details (route + stack) from Task 2 — useful for future debugging
- Any AGENTS.md / spec files intentionally left unchanged and why (per root `AGENTS.md` "Closeout" rule)

---

## Notes

- **Co-Authored-By** lines match recent Claude-authored commits. Remove if the user prefers no attribution on implementation commits.
- **The "Likely" branch in Task 3 is a guess, not a known.** Task 2 captures the real error. If Task 2 shows a different route, STOP at Task 3 and replan.
- **All deploys go through Codehooks.** Per `codehooks/AGENTS.md`, the AI build probe `GET /ai/ping` returns `{ build, hasKey, ok }` and can be used to confirm a deploy landed. The `AI_BUILD` string in `codehooks/routes/ai.js:8` is `'2026-06-10-m3-worker'`; it does not need to be bumped for this plan (no ai.js changes).
- **Netlify is auto-deployed from `main`.** Each commit in this plan triggers a Netlify build. No manual Netlify deploy step.
