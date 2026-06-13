import { setupShell, observeTheme, assembleModuleBlobs, moduleFiles } from '/shell/shell-setup.js';
import { getData, setData, deleteData, aiRequest } from '/shell/api.js';

const MODULES_COLLECTION = 'generated-modules';
const JOBS_COLLECTION = 'build-jobs';
const INDEX_KEY = 'index';

const GREETING = "Hi! Describe the app you want to build. I'll ask a couple of quick questions, write up a plan for your approval, then build it.";

// Snapshot a module's code + manifest without its `prev` (keeps history one
// level deep). Carries a multi-file `files`/`entryFile` map or a legacy `js`.
function moduleSnapshot(m) {
  const s = { manifest: m.manifest, css: m.css };
  if (m.files) { s.files = m.files; s.entryFile = m.entryFile || 'main.js'; }
  else { s.js = m.js; }
  if (Array.isArray(m.deferred)) s.deferred = m.deferred; // Revise roadmap
  return s;
}

// Session-global monotonic counter. Custom-element tags are immutable per page
// session, so every (re)install must register under a brand-new tag for the
// revised class to be defined and run. Module-level so it survives the builder
// element being closed/reopened; resets only on reload (where the registry is
// empty anyway). Never derive the suffix from a per-app version — revert→revise
// would reuse an already-defined tag and bring back the stale-code bug.
let TAG_SEQ = 0;

class AppBuilder extends HTMLElement {
  constructor() {
    super();
    this._jobs = {};
    this._modules = {};
    this._activeTab = 'build';
    this._wrapper = null;
    this._themeCleanup = null;
    this._loadingTimer = null;
    this._loadingStart = 0;
    this._building = false;
    this._resetDraft();
  }

  _resetDraft() {
    this._convo = [{ role: 'ai', text: GREETING }];
    this._aiMessages = [];   // {role:'user'|'assistant', content} sent to the backend
    this._phase = 'idle';    // idle | thinking | questions | plan
    this._questions = [];
    this._qIndex = 0;
    this._plan = null;
    this._reviseJobId = null;
  }

  async connectedCallback() {
    const { wrapper } = await setupShell(this, { cssUrl: '/modules/builder/styles.css' });
    this._wrapper = wrapper;

    this._applyTheme();
    this._themeCleanup = observeTheme(() => this._applyTheme());

    const [jobs, modules] = await Promise.all([
      getData(JOBS_COLLECTION, INDEX_KEY),
      getData(MODULES_COLLECTION, INDEX_KEY),
    ]);
    this._jobs = jobs || {};
    this._modules = modules || {};
    // Anything stuck "building" from a closed session goes back in the queue
    Object.values(this._jobs).forEach(j => { if (j.status === 'building') j.status = 'queued'; });
    // Migrate old installed modules from generated-modules into the jobs list
    let migrated = false;
    for (const [appId, mod] of Object.entries(this._modules)) {
      if (!mod?.manifest) continue;
      const alreadyHasJob = Object.values(this._jobs).some(j => j.appId === appId);
      if (!alreadyHasJob) {
        const jobId = `migrated-${appId}`;
        this._jobs[jobId] = {
          jobId, appId,
          title: mod.manifest.title || appId,
          icon: mod.manifest.icon || '📦',
          status: 'installed',
          plan: null,
          messages: [],
          module: moduleSnapshot(mod),
          createdAt: Date.now(),
          migrated: true,
        };
        migrated = true;
      }
    }
    if (migrated) await this._saveJobs();
    this._render();
    this._processQueue();
  }

  disconnectedCallback() {
    this._themeCleanup?.();
    clearInterval(this._loadingTimer);
  }

  _applyTheme() {
    this._wrapper?.classList.toggle('dark', document.documentElement.classList.contains('dark'));
  }

  _esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async _saveJobs() {
    await setData(JOBS_COLLECTION, INDEX_KEY, this._jobs);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  _render() {
    const jobCount = Object.keys(this._jobs).length;
    this._wrapper.innerHTML = `
      <div class="tab-bar">
        <button class="tab ${this._activeTab === 'build' ? 'active' : ''}" data-tab="build">💬 Build</button>
        <button class="tab ${this._activeTab === 'jobs' ? 'active' : ''}" data-tab="jobs">📋 Jobs${jobCount ? ` (${jobCount})` : ''}</button>
      </div>
      ${this._activeTab === 'build' ? this._renderBuild() : this._renderJobs()}
    `;
    this._bindEvents();
  }

  _renderBuild() {
    const inputEnabled = this._phase === 'idle' || this._phase === 'plan';
    const placeholder = this._phase === 'plan'
      ? 'Describe what to change in the plan…'
      : (this._reviseJobId ? 'Describe what you want to change…' : 'Describe the app you want to build…');
    return `
      <div class="messages" id="messages">
        ${this._convo.map(m => this._renderMessage(m)).join('')}
        ${this._phase === 'questions' ? this._renderQuestion() : ''}
        ${this._phase === 'plan' && this._plan ? this._renderPlanCard() : ''}
        ${this._phase === 'thinking' ? `<div class="msg ai"><div class="bubble loading"><span>Thinking</span><span class="loading-timer" id="loading-timer"></span></div></div>` : ''}
      </div>
      <div class="input-bar">
        <textarea class="chat-input" id="chat-input" placeholder="${placeholder}" rows="2" ${inputEnabled ? '' : 'disabled'}></textarea>
        <button class="send-btn" id="send-btn" ${inputEnabled ? '' : 'disabled'}>Send →</button>
      </div>
    `;
  }

  _renderMessage(msg) {
    return `<div class="msg ${msg.role}"><div class="bubble">${this._esc(msg.text)}</div></div>`;
  }

  _renderQuestion() {
    const q = this._questions[this._qIndex];
    if (!q) return '';
    return `
      <div class="msg ai">
        <div class="bubble">${this._esc(q.question)} <span class="q-progress">(${this._qIndex + 1}/${this._questions.length})</span></div>
        <div class="q-options">
          ${(q.options || []).map((o, i) => `
            <button class="q-option ${o.recommended ? 'recommended' : ''}" data-opt="${i}">
              <span class="q-option-label">${this._esc(o.label)}${o.recommended ? ' <span class="q-rec-badge">Recommended</span>' : ''}</span>
              ${o.detail ? `<span class="q-option-detail">${this._esc(o.detail)}</span>` : ''}
            </button>
          `).join('')}
          <button class="q-option q-skip" data-action="choose-for-me">🎲 Choose for me</button>
        </div>
      </div>
    `;
  }

  _renderPlanCard() {
    const p = this._plan;
    return `
      <div class="msg ai">
        <div class="plan-card">
          <div class="plan-header">
            <span class="plan-icon">${p.icon || '📦'}</span>
            <span class="plan-title">${this._esc(p.title)}</span>
            <span class="plan-type ${p.type}">${p.type}</span>
          </div>
          <div class="plan-summary">${this._esc(p.summary || '')}</div>
          ${Array.isArray(p.features) && p.features.length ? `
            <ul class="plan-features">${p.features.map(f => `<li>${this._esc(f)}</li>`).join('')}</ul>
          ` : ''}
          ${Array.isArray(p.deferred) && p.deferred.length ? `
            <div class="plan-later"><strong>Later (one-tap Revise after install):</strong>
              <ul class="plan-deferred">${p.deferred.map(d => `<li>${this._esc(d.title || d.desc || '')}</li>`).join('')}</ul>
            </div>
          ` : ''}
          ${p.dataModel ? `<div class="plan-data"><strong>Data:</strong> ${this._esc(p.dataModel)}</div>` : ''}
          <div class="plan-actions">
            <button class="approve-btn" data-action="approve">✅ Approve &amp; queue build</button>
            <span class="plan-hint">…or type changes below</span>
          </div>
        </div>
      </div>
    `;
  }

  _renderJobs() {
    const jobs = Object.values(this._jobs).sort((a, b) => b.createdAt - a.createdAt);
    return `
      <div class="modules-list">
        ${jobs.length === 0 ? '<div class="empty-state">No build jobs yet.<br>Switch to Build to create your first app.</div>' : ''}
        ${jobs.map(j => this._renderJobRow(j)).join('')}
      </div>
    `;
  }

  _renderJobRow(job) {
    // While building, surface the live polling phase so users see progress.
    const buildingLabel = {
      queued:   '⏳ waiting for worker…',
      building: '🔨 building…',
      retrying: '🔁 retrying without queue…',
    }[job.phase] || '🔨 building…';
    const badge = {
      queued:    '<span class="status-badge queued">⏳ queued</span>',
      building:  `<span class="status-badge building">${buildingLabel}</span>`,
      done:      '<span class="status-badge done">✅ ready</span>',
      installed: '<span class="status-badge installed">📦 installed</span>',
      error:     '<span class="status-badge error">❌ error</span>',
    }[job.status] || '';
    const type = job.plan?.type === 'generator' ? 'generator' : 'singleton';
    const actions = {
      queued:    `<button class="job-btn" data-action="cancel" data-job="${job.jobId}">Cancel</button>`,
      building:  '',
      done:      `<button class="job-btn primary" data-action="install" data-job="${job.jobId}">⬇ Install</button>
                  <button class="job-btn" data-action="toggle-code" data-job="${job.jobId}">Code ▾</button>`,
      installed: `<button class="job-btn" data-action="revise" data-job="${job.jobId}">✏️ Revise</button>
                  ${this._modules[job.appId]?.prev ? `<button class="job-btn" data-action="revert" data-job="${job.jobId}" title="Restore the previous version">↩ Revert</button>` : ''}
                  <button class="job-btn" data-action="toggle-code" data-job="${job.jobId}">Code ▾</button>
                  <button class="del-btn" data-action="delete" data-job="${job.jobId}" title="Uninstall + remove job">🗑</button>`,
      error:     `<button class="job-btn primary" data-action="retry" data-job="${job.jobId}">↻ Retry</button>
                  <button class="del-btn" data-action="cancel" data-job="${job.jobId}" title="Remove job">🗑</button>`,
    }[job.status] || '';
    return `
      <div class="module-row" data-jobrow="${job.jobId}">
        <span class="mod-icon">${job.icon || '📦'}</span>
        <div class="job-main">
          <span class="mod-name">${this._esc(job.title)}</span>
          <span class="job-meta">${type}${job.revisedAt ? ' · revised' : ''}${job.error ? ` — ${this._esc(job.error)}` : ''}</span>
        </div>
        ${badge}
        <div class="job-actions">${actions}</div>
      </div>
      ${this._renderRoadmap(job)}
      ${this._renderCodePanel(job)}
    `;
  }

  // Deferred-feature roadmap: one-tap "➕ Add" buttons on an installed app that
  // seed a scoped Revise. Survives reload (deferred is stored on the module).
  _renderRoadmap(job) {
    const deferred = job.status === 'installed' ? this._modules[job.appId]?.deferred : null;
    if (!Array.isArray(deferred) || !deferred.length) return '';
    return `<div class="roadmap">
      <span class="roadmap-label">Add later:</span>
      ${deferred.map((d, i) => `<button class="roadmap-btn" data-action="add-feature" data-job="${job.jobId}" data-idx="${i}" title="${this._esc(d.desc || '')}">➕ ${this._esc(d.title || d.desc || 'feature')}</button>`).join('')}
    </div>`;
  }

  // Code viewer: a file switcher (entry + feature files + CSS) over one <pre>.
  _renderCodePanel(job) {
    if (!job.module) return '';
    const { files, entryFile } = moduleFiles(job.module);
    const names = Object.keys(files);
    const first = files[entryFile] != null ? entryFile : names[0];
    const opts = [...names, 'CSS'];
    return `<div class="code-panel" id="code-${job.jobId}" style="display:none">
      <select class="code-file" data-job="${job.jobId}">${opts.map(n => `<option value="${this._esc(n)}"${n === first ? ' selected' : ''}>${this._esc(n)}</option>`).join('')}</select>
      <pre><code data-code="${job.jobId}">${this._esc(files[first] || '')}</code></pre>
    </div>`;
  }

  // ─── Events ────────────────────────────────────────────────────────────────

  _bindEvents() {
    this._wrapper.querySelectorAll('.tab[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => { this._activeTab = btn.dataset.tab; this._render(); });
    });

    const sendBtn = this._wrapper.querySelector('#send-btn');
    const input = this._wrapper.querySelector('#chat-input');
    if (sendBtn && input) {
      sendBtn.addEventListener('click', () => this._send(input.value));
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(input.value); }
      });
    }

    this._wrapper.querySelectorAll('.q-option[data-opt]').forEach(btn => {
      btn.addEventListener('click', () => this._answer(parseInt(btn.dataset.opt)));
    });
    this._wrapper.querySelector('[data-action="choose-for-me"]')
      ?.addEventListener('click', () => this._chooseForMe());
    this._wrapper.querySelector('[data-action="approve"]')
      ?.addEventListener('click', () => this._approve());

    this._wrapper.querySelectorAll('[data-action][data-job]').forEach(btn => {
      const job = this._jobs[btn.dataset.job];
      if (!job) return;
      const handlers = {
        'install': () => this._install(job),
        'revise': () => this._startRevise(job),
        'add-feature': () => this._addFeature(job, parseInt(btn.dataset.idx)),
        'revert': () => this._revert(job),
        'retry': () => { job.status = 'queued'; job.error = null; job.autoRetried = false; this._saveJobs(); this._render(); this._processQueue(); },
        'cancel': () => { delete this._jobs[job.jobId]; this._saveJobs(); this._render(); },
        'delete': () => this._deleteInstalled(job),
        'toggle-code': () => {
          const panel = this._wrapper.querySelector(`#code-${job.jobId}`);
          if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        },
      };
      btn.addEventListener('click', handlers[btn.dataset.action] || (() => {}));
    });

    this._wrapper.querySelectorAll('.code-file[data-job]').forEach(sel => {
      sel.addEventListener('change', () => {
        const job = this._jobs[sel.dataset.job];
        if (!job?.module) return;
        const { files } = moduleFiles(job.module);
        const code = this._wrapper.querySelector(`code[data-code="${sel.dataset.job}"]`);
        if (code) code.textContent = sel.value === 'CSS' ? (job.module.css || '') : (files[sel.value] || '');
      });
    });

    const msgs = this._wrapper.querySelector('#messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  // ─── Chat flow: clarify → plan → approve ──────────────────────────────────

  _setThinking() {
    this._phase = 'thinking';
    this._loadingStart = Date.now();
    this._render();
    clearInterval(this._loadingTimer);
    this._loadingTimer = setInterval(() => {
      const el = this._wrapper.querySelector('#loading-timer');
      if (el) el.textContent = ` (${Math.floor((Date.now() - this._loadingStart) / 1000)}s)`;
    }, 1000);
  }

  _pushUser(text) {
    this._convo.push({ role: 'user', text });
    this._aiMessages.push({ role: 'user', content: text });
  }

  _pushAi(text) {
    this._convo.push({ role: 'ai', text });
    this._aiMessages.push({ role: 'assistant', content: text });
  }

  async _send(text) {
    text = text.trim();
    if (!text || (this._phase !== 'idle' && this._phase !== 'plan')) return;
    const wasPlan = this._phase === 'plan';
    this._pushUser(text);
    if (wasPlan) await this._requestPlan();
    else await this._requestClarify();
  }

  async _requestClarify() {
    this._setThinking();
    try {
      const result = await aiRequest('clarify', { messages: this._aiMessages });
      clearInterval(this._loadingTimer);
      if (Array.isArray(result?.questions) && result.questions.length) {
        this._questions = result.questions.slice(0, 3);
        this._qIndex = 0;
        this._phase = 'questions';
      } else {
        if (result?.summary) this._pushAi(result.summary);
        return this._requestPlan();
      }
    } catch (err) {
      clearInterval(this._loadingTimer);
      const msg = this._backendErrMsg(err);
      this._convo.push({ role: 'ai', text: msg });
      this._phase = 'idle';
    }
    this._render();
  }

  _backendErrMsg(err) {
    const m = err.message || '';
    if (m.includes('prompt string')) {
      return `❌ Build App needs a backend update. Please run \`coho deploy\` from the \`codehooks/\` directory, then try again.\n\nDetails: ${m}`;
    }
    return `❌ ${m}`;
  }

  _answer(optIdx) {
    const q = this._questions[this._qIndex];
    const opt = q?.options?.[optIdx];
    if (!opt) return;
    this._pushUser(`${q.question} → ${opt.label}`);
    this._advanceQuestions();
  }

  _chooseForMe() {
    for (let i = this._qIndex; i < this._questions.length; i++) {
      const q = this._questions[i];
      const rec = q.options?.find(o => o.recommended) || q.options?.[0];
      if (rec) this._pushUser(`${q.question} → ${rec.label} (auto-picked)`);
    }
    this._qIndex = this._questions.length;
    this._requestPlan();
  }

  _advanceQuestions() {
    this._qIndex++;
    if (this._qIndex >= this._questions.length) this._requestPlan();
    else this._render();
  }

  async _requestPlan() {
    this._setThinking();
    try {
      const result = await aiRequest('plan', { messages: this._aiMessages });
      clearInterval(this._loadingTimer);
      const plan = result?.plan;
      if (!plan?.title) throw new Error('Planner returned no plan — try rephrasing.');
      if (plan.type !== 'generator') plan.type = 'singleton'; // singleton default, enforced again at build
      this._plan = plan;
      this._aiMessages.push({ role: 'assistant', content: `PLAN: ${JSON.stringify(plan)}` });
      this._phase = 'plan';
    } catch (err) {
      clearInterval(this._loadingTimer);
      this._convo.push({ role: 'ai', text: `❌ ${err.message}` });
      this._phase = 'idle';
    }
    this._render();
  }

  async _approve() {
    const plan = this._plan;
    if (!plan) return;
    const reviseJob = this._reviseJobId ? this._jobs[this._reviseJobId] : null;
    const jobId = reviseJob ? reviseJob.jobId : `bj-${Date.now()}`;
    this._jobs[jobId] = {
      ...(reviseJob || {}),
      jobId,
      appId: reviseJob?.appId || plan.appId || null,
      title: plan.title,
      icon: plan.icon || '📦',
      status: 'queued',
      plan,
      messages: [...this._aiMessages],
      revise: !!reviseJob,
      error: null,
      createdAt: reviseJob?.createdAt || Date.now(),
      ...(reviseJob && { revisedAt: Date.now() }),
    };
    await this._saveJobs();
    this._resetDraft();
    this._convo.push({ role: 'ai', text: `${plan.icon || '📦'} "${plan.title}" queued! Track it in the Jobs tab — you can describe another app right away.` });
    this._render();
    this._processQueue();
  }

  // ─── Queue runner — builds jobs one at a time ──────────────────────────────

  async _processQueue() {
    if (this._building) return;
    const next = Object.values(this._jobs)
      .filter(j => j.status === 'queued')
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!next) return;

    this._building = true;
    next.status = 'building';
    await this._saveJobs();
    this._render();

    try {
      const existing = next.revise && next.appId ? this._modules[next.appId] : undefined;
      const result = await aiRequest(next.revise ? 'revise' : 'build', {
        messages: next.messages,
        plan: next.plan,
        ...(existing && { existing }),
      }, (phase) => {
        // Live phase from the polling loop: queued → building (worker picked it
        // up) → retrying (queue dead, inline fallback). Render so users see
        // progress instead of an opaque spinner.
        next.phase = phase;
        this._render();
      });
      if (!result?.manifest || (!result?.js && !result?.files)) throw new Error('Build returned no module');
      // Revisions must keep the original appId so user data survives
      if (next.revise && next.appId) {
        result.manifest.appId = next.appId;
        const mod = this._modules[next.appId];
        if (mod?.manifest?.tag) result.manifest.tag = mod.manifest.tag;
      }
      next.module = result;
      next.appId = result.manifest.appId;
      next.status = 'done';
      this.api?.notify(`${next.icon} ${next.title} built — install it from Jobs`, 'success');
      // Revisions of installed apps auto-reinstall (code overwrite, data kept)
      if (next.revise) await this._install(next, { quiet: true });
    } catch (err) {
      // Timeouts here are intermittent, not deterministic: M3 calls occasionally
      // hang for minutes and the worker's abort setTimeout is unreliable (gotcha 8),
      // so even a small scoped build can stall and get killed (→ "timed out") on
      // bad luck. A fresh attempt usually succeeds, and scope-split keeps cores
      // small so a retry is cheap. Auto-retry once on any timeout — both the clean
      // "took over Ns" abort and the frontend "…timed out" stuck-build fail-fast.
      // Truncation ("too large") / invalid JSON are deterministic — not retried.
      if (/took over|timed out/.test(err.message || '') && !next.autoRetried) {
        next.autoRetried = true;
        next.error = null;
        next.phase = null;
        next.status = 'queued';
        this.api?.notify(`${next.icon} ${next.title} timed out — retrying once…`, 'info');
      } else {
        next.status = 'error';
        next.error = err.message;
        this.api?.notify(`Build failed: ${next.title}`, 'error');
      }
    }

    await this._saveJobs();
    this._building = false;
    this._render();
    this._processQueue(); // pick up the next queued job
  }

  // ─── Install / revise / delete ─────────────────────────────────────────────

  async _install(job, { quiet = false } = {}) {
    const mod = job.module || {};
    if (!mod.manifest || (!mod.js && !mod.files)) return;
    try {
      const appId = mod.manifest.appId;
      // Keep one previous version so a bad revision can be rolled back.
      const cur = this._modules[appId];
      // Carry the deferred roadmap from the approved plan onto the stored module
      // (persists in generated-modules so the "➕ Add" buttons survive reload).
      const deferred = Array.isArray(job.plan?.deferred) ? job.plan.deferred : [];
      this._modules[appId] = { ...moduleSnapshot(mod), deferred, prev: cur ? moduleSnapshot(cur) : null };
      await setData(MODULES_COLLECTION, INDEX_KEY, this._modules);

      this._registerModule(this._modules[appId]);
      this._refreshOpenWindows(appId);

      job.status = 'installed';
      await this._saveJobs();
      if (!quiet) this.api?.notify(`${mod.manifest.icon} ${mod.manifest.title} installed!`, 'success');
      this._render();
    } catch (err) {
      this.api?.notify('Install failed: ' + err.message, 'error');
    }
  }

  // Register generated code under a fresh, unique custom-element tag so the new
  // class can be defined this session (tags are immutable once defined). The
  // stored code keeps the canonical base tag (manifest.tag); only the runtime
  // blob is rewritten. _moduleId() strips the --v{n} suffix to recover the appId.
  // Handles multi-file modules (entry + feature files) via assembleModuleBlobs.
  _registerModule(mod) {
    const { manifest } = mod;
    const { files, entryFile } = moduleFiles(mod);
    const tag = `${manifest.tag}--v${++TAG_SEQ}`;
    const entry = assembleModuleBlobs({ files, entryFile, fromTag: manifest.tag, toTag: tag });
    const cssUrl = mod.css ? URL.createObjectURL(new Blob([mod.css], { type: 'text/css' })) : null;
    this.api?.store?.registerApp({ ...manifest, tag, entry, ...(cssUrl && { cssUrl }) });
  }

  // Close any open windows of an app after (re)install so the next open mounts
  // the fresh code instead of the already-running old element.
  _refreshOpenWindows(appId) {
    const store = this.api?.store;
    if (!store) return;
    store.windows.filter(w => w.appId === appId).forEach(w => store.close(w.id));
  }

  async _revert(job) {
    const cur = this._modules[job.appId];
    if (!cur?.prev) { this.api?.notify('No previous version to revert to', 'info'); return; }
    try {
      // Swap so revert is itself reversible (toggle between the two versions).
      const restored = { ...moduleSnapshot(cur.prev), prev: moduleSnapshot(cur) };
      this._modules[job.appId] = restored;
      await setData(MODULES_COLLECTION, INDEX_KEY, this._modules);

      this._registerModule(restored);
      this._refreshOpenWindows(job.appId);

      job.module = moduleSnapshot(restored);
      await this._saveJobs();
      this.api?.notify(`${restored.manifest.icon} ${restored.manifest.title} reverted to previous version`, 'success');
      this._render();
    } catch (err) {
      this.api?.notify('Revert failed: ' + err.message, 'error');
    }
  }

  _startRevise(job) {
    this._resetDraft();
    this._reviseJobId = job.jobId;
    this._activeTab = 'build';
    this._aiMessages.push({
      role: 'user',
      content: `I want to revise my existing app "${job.title}". Current plan: ${JSON.stringify(job.plan)}. I'll describe the changes next.`,
    });
    this._convo = [{ role: 'ai', text: `✏️ Revising ${job.icon} ${job.title} — your saved data will be kept. What would you like to change?` }];
    this._render();
  }

  // One-tap "add a deferred feature": seed a revise with that feature and go
  // straight to planning. The re-plan moves it into the core and updates the
  // deferred roadmap; the revise build keeps appId/tag so data survives.
  _addFeature(job, idx) {
    const d = this._modules[job.appId]?.deferred?.[idx];
    if (!d) return;
    this._resetDraft();
    this._reviseJobId = job.jobId;
    this._activeTab = 'build';
    this._aiMessages.push({
      role: 'user',
      content: `Revise my existing app "${job.title}". Current plan: ${JSON.stringify(job.plan)}. Add this previously-deferred feature into the core now: ${d.title} — ${d.desc || ''}. Keep all existing behavior and leave any other deferred features deferred.`,
    });
    this._convo = [{ role: 'ai', text: `➕ Adding “${this._esc(d.title || d.desc || 'feature')}” to ${job.icon} ${job.title} — planning…` }];
    this._render();
    this._requestPlan();
  }

  async _deleteInstalled(job) {
    const { appId } = job;
    const manifest = job.module?.manifest || this._modules[appId]?.manifest;

    if (appId && this.api?.store) {
      // Remove all desktop instances of this app. Must happen before unregisterApp
      // so the store can still resolve dataCollections from the manifest.
      const instances = (this.api.store.instances || []).filter(i => i.appId === appId);
      for (const inst of instances) {
        await this.api.store.removeInstance(inst.instanceId);
      }
      // For singletons the data key is a fixed string, not an instanceId.
      // Clean the two common patterns the AI prompt instructs: (col, 'data') and (col, appId).
      if (manifest?.singleton !== false && Array.isArray(manifest?.dataCollections)) {
        for (const col of manifest.dataCollections) {
          deleteData(col, 'data');
          deleteData(col, appId);
        }
      }
    }

    if (appId && this._modules[appId]) {
      delete this._modules[appId];
      await setData(MODULES_COLLECTION, INDEX_KEY, this._modules);
      this.api?.store?.unregisterApp(appId);
    }
    delete this._jobs[job.jobId];
    await this._saveJobs();
    this.api?.notify('App removed', 'info');
    this._render();
  }
}

if (!customElements.get('app-builder')) {
  customElements.define('app-builder', AppBuilder);
}
