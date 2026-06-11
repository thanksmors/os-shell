import { setSession, setWorkspace, resetPolling } from './api.js';
import { getSavedSession, getSavedUser, saveUser, clearSession, startGoogleLogin, consumeAuthRedirect, fetchMe } from './auth.js';
import { fetchWorkspaces, acceptInvite } from './workspace.js';

export function registerAuthStore() {
  Alpine.store('auth', {
    user: null,
    workspaces: [],
    workspace: null,
    screen: 'loading', // 'loading' | 'login' | 'workspace-select' | 'desktop'
    inviteId: null,
    inviteInfo: null,
    error: null,
    managingWs: null,
    members: [],
    membersLoading: false,

    async init() {
      // Capture invite link (if any) before we scrub the query string.
      const params = new URLSearchParams(window.location.search);
      this.inviteId = params.get('invite') || null;

      // Pull a freshly-minted session (or error) from the backend OAuth redirect.
      const redirect = consumeAuthRedirect();
      if (redirect.error) this.error = 'Sign-in failed. Please try again.';

      const session = redirect.session || getSavedSession();
      if (!session) { this.screen = 'login'; return; }

      try {
        setSession(session);

        // Resolve the user profile (cached, then refreshed from /me).
        this.user = getSavedUser();
        const me = await fetchMe(session);
        if (!me || me.error || !me.userId) throw new Error('invalid session');
        this.user = { userId: me.userId, name: me.name, email: me.email, picture: me.picture };
        saveUser(this.user);

        const workspaces = await fetchWorkspaces(session);
        if (!Array.isArray(workspaces) || workspaces.error) throw new Error('invalid session');
        this.workspaces = workspaces;

        // Accept a pending invite before selecting a workspace.
        if (this.inviteId) {
          try {
            const result = await acceptInvite(this.inviteId, session);
            if (result?.workspaceId) {
              this.workspaces = await fetchWorkspaces(session);
            }
          } catch {}
          const after = new URLSearchParams(window.location.search);
          after.delete('invite');
          const qs = after.toString();
          history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
          this.inviteId = null;
        }

        const savedWsId = localStorage.getItem('os-workspace');
        const savedWs = savedWsId && this.workspaces.find(w => w.workspaceId === savedWsId);
        if (savedWs) {
          await this._activateWorkspace(savedWs, session);
        } else if (this.workspaces.length === 1) {
          await this._activateWorkspace(this.workspaces[0], session);
        } else {
          this.screen = 'workspace-select';
        }
      } catch {
        clearSession();
        setSession(null);
        this.screen = 'login';
      }
    },

    // Kick off the server-driven Google sign-in (full-page redirect).
    login() {
      this.error = null;
      startGoogleLogin();
    },

    async selectWorkspace(workspaceId) {
      const ws = this.workspaces.find(w => w.workspaceId === workspaceId);
      if (!ws) return;
      this.managingWs = null;
      const session = getSavedSession();
      await this._activateWorkspace(ws, session);
    },

    async openManage(workspaceId) {
      this.managingWs = workspaceId;
      this.membersLoading = true;
      this.members = [];
      const { fetchMembers } = await import('./workspace.js');
      this.members = await fetchMembers(workspaceId, getSavedSession());
      this.membersLoading = false;
    },

    closeManage() {
      this.managingWs = null;
      this.members = [];
    },

    async generateInvite() {
      const { createInvite } = await import('./workspace.js');
      const inv = await createInvite(this.managingWs, 'member', getSavedSession());
      const url = `${location.origin}${location.pathname}?invite=${inv.inviteId}`;
      await navigator.clipboard.writeText(url);
      Alpine.store('os').toast('Invite link copied! Valid for 7 days.');
    },

    async removeMemberFromPanel(userId) {
      const { removeMember } = await import('./workspace.js');
      await removeMember(this.managingWs, userId, getSavedSession());
      this.members = this.members.filter(m => m.userId !== userId);
    },

    async _activateWorkspace(ws, session) {
      this.workspace = ws;
      localStorage.setItem('os-workspace', ws.workspaceId);
      setSession(session);
      setWorkspace(ws.workspaceId);
      resetPolling();
      this.screen = 'desktop';
      await Alpine.nextTick();
      Alpine.store('os').loadWorkspaceData();
    },

    async createWorkspace(name, icon) {
      const { createWorkspace } = await import('./workspace.js');
      const session = getSavedSession();
      const ws = await createWorkspace(name, icon || '🏢', session);
      this.workspaces = [...this.workspaces, ws];
      await this._activateWorkspace(ws, session);
    },

    signOut() {
      clearSession();
      setSession(null);
      setWorkspace(null);
      this.user = null;
      this.workspaces = [];
      this.workspace = null;
      this.managingWs = null;
      this.members = [];
      this.screen = 'login';
      Alpine.store('os').windows = [];
      Alpine.store('os').instances = [];
    },
  });
}
