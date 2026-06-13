import { setupShell, observeTheme } from '/shell/shell-setup.js';
import { getData, setData, deleteData, forceGetData, subscribe } from '/shell/api.js';

const CHAT_COL     = 'chat';
const MESSAGES_COL = 'chat-messages';
const READ_COL     = 'chat-read';
const CHANNELS_KEY = 'channels';
const MAX_MESSAGES = 100;

const GENERAL = { id: 'ch-general', name: 'general', system: true, createdAt: 0 };

class AppChat extends HTMLElement {
  constructor() {
    super();
    this._channels        = [];
    this._activeChannelId = 'ch-general';
    this._messages        = [];
    this._channelMessages = {}; // channelId → messages[] for unread counts
    this._lastRead        = {}; // channelId → timestamp
    this._user            = null;
    this._unsubs          = [];
    this._sending         = false;
    this._addingChannel   = false;
    this._themeCleanup    = null;
    this._wrapper         = null;
  }

  async connectedCallback() {
    const { wrapper } = await setupShell(this, { cssUrl: '/modules/chat/styles.css' });
    this._wrapper = wrapper;

    this._user = window.Alpine?.store('auth')?.user || null;

    this._applyTheme();
    this._themeCleanup = observeTheme(() => this._applyTheme());

    await this._load();
    this._render();
    this.api?.setReady?.();
    this._setupSubscriptions();
  }

  disconnectedCallback() {
    this._themeCleanup?.();
    this._unsubs.forEach(u => u());
    this._unsubs = [];
  }

  _applyTheme() {
    this._wrapper?.classList.toggle('dark', document.documentElement.classList.contains('dark'));
  }

  _esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── Load ──────────────────────────────────────────────────────────────────

  async _load() {
    const userId = this._user?.userId || 'anon';

    // Parallel fetch: channels, active-channel messages, read state
    const [savedChannels, msgData, readData] = await Promise.all([
      getData(CHAT_COL, CHANNELS_KEY),
      getData(MESSAGES_COL, this._activeChannelId),
      getData(READ_COL, userId),
    ]);

    // Channels
    if (!savedChannels?.channels?.length) {
      this._channels = [{ ...GENERAL, createdAt: Date.now() }];
      setData(CHAT_COL, CHANNELS_KEY, { channels: this._channels });
    } else {
      this._channels = savedChannels.channels;
      if (!this._channels.find(c => c.id === 'ch-general')) {
        this._channels = [{ ...GENERAL, createdAt: Date.now() }, ...this._channels];
        setData(CHAT_COL, CHANNELS_KEY, { channels: this._channels });
      }
    }

    // Messages + read state
    this._messages = msgData?.messages || [];
    this._channelMessages[this._activeChannelId] = this._messages;
    this._lastRead = readData || {};

    // Mark active channel as read
    await this._markRead(this._activeChannelId);
  }

  async _markRead(channelId) {
    const userId = this._user?.userId || 'anon';
    this._lastRead = { ...this._lastRead, [channelId]: Date.now() };
    setData(READ_COL, userId, this._lastRead); // fire-and-forget
    this._updateBadge();
  }

  _unreadCount(channelId) {
    const since = this._lastRead[channelId] || 0;
    const msgs  = this._channelMessages[channelId] || [];
    return msgs.filter(m => m.timestamp > since).length;
  }

  _updateBadge() {
    let total = 0;
    for (const ch of this._channels) {
      if (ch.id !== this._activeChannelId) total += this._unreadCount(ch.id);
    }
    this.api?.store?.setAppBadge?.('chat', total);
  }

  // ─── SSE-driven subscriptions (replaces 15s poll) ─────────────────────────

  _setupSubscriptions() {
    // Subscribe to the channels list (new channels created by other users)
    this._unsubs.push(subscribe(CHAT_COL, CHANNELS_KEY, async () => {
      const d = await getData(CHAT_COL, CHANNELS_KEY);
      if (!d?.channels) return;
      this._channels = d.channels;
      // Re-subscribe to any new channels
      this._subscribeToAllChannels();
      this._renderChannelList();
    }));

    this._subscribeToAllChannels();
  }

  _subscribeToAllChannels() {
    // Subscribe to messages for every channel
    for (const ch of this._channels) {
      const channelId = ch.id;
      // Avoid double-subscribing the same channel
      if (this._unsubs.find(u => u._channelId === channelId)) continue;
      const unsub = subscribe(MESSAGES_COL, channelId, async () => {
        const d = await getData(MESSAGES_COL, channelId);
        const msgs = d?.messages || [];
        this._channelMessages[channelId] = msgs;

        if (channelId === this._activeChannelId) {
          this._messages = msgs;
          this._renderMessages();
          await this._markRead(channelId);
        }
        this._updateBadge();
        this._renderChannelList();
      });
      unsub._channelId = channelId;
      this._unsubs.push(unsub);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  _render() {
    this._wrapper.innerHTML = `
      <div class="layout">
        <aside class="sidebar">
          <div class="sidebar-header">
            <span class="sidebar-title">💬 Chat</span>
            <button class="add-btn" id="add-ch-btn" title="New channel">+</button>
          </div>
          <div class="channel-list" id="channel-list"></div>
          <div class="sidebar-user">
            <div class="user-avatar">${this._esc((this._user?.name || '?')[0].toUpperCase())}</div>
            <span class="user-name">${this._esc(this._user?.name || 'Anonymous')}</span>
          </div>
        </aside>
        <div class="main">
          <div class="main-header" id="main-header"></div>
          <div class="messages-area" id="messages-area"></div>
          <div class="input-bar" id="input-bar"></div>
        </div>
      </div>
    `;
    this._renderChannelList();
    this._renderMainHeader();
    this._renderMessages();
    this._renderInputBar();
    this._bindStaticEvents();
  }

  _renderChannelList() {
    const list = this._wrapper.querySelector('#channel-list');
    if (!list) return;
    list.innerHTML = this._channels.map(ch => {
      const unread  = this._unreadCount(ch.id);
      const isActive = ch.id === this._activeChannelId;
      return `
        <div class="ch-item${isActive ? ' active' : ''}" data-ch="${this._esc(ch.id)}">
          <span class="ch-hash">#</span>
          <span class="ch-name${unread && !isActive ? ' has-unread' : ''}">${this._esc(ch.name)}</span>
          ${unread && !isActive ? `<span class="ch-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
          ${!ch.system ? `<button class="ch-del" data-del="${this._esc(ch.id)}" title="Delete">✕</button>` : ''}
        </div>
      `;
    }).join('') + (this._addingChannel ? `
      <div class="ch-item ch-new">
        <span class="ch-hash">#</span>
        <input class="ch-new-input" id="ch-new-input" placeholder="channel-name" maxlength="40" />
      </div>
    ` : '');
    this._bindChannelListEvents();
  }

  _renderMainHeader() {
    const el = this._wrapper.querySelector('#main-header');
    if (!el) return;
    const ch = this._channels.find(c => c.id === this._activeChannelId);
    el.innerHTML = `<span class="main-ch-name"># ${this._esc(ch?.name || 'general')}</span>`;
  }

  _renderMessages() {
    const area = this._wrapper.querySelector('#messages-area');
    if (!area) return;
    if (!this._messages.length) {
      area.innerHTML = `<div class="empty-msg">No messages yet. Say hello! 👋</div>`;
      return;
    }
    let html = '';
    let lastUserId = null;
    let lastDateStr = null;
    for (const msg of this._messages) {
      const d = new Date(msg.timestamp);
      const dateStr = d.toLocaleDateString();
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const isOwn   = msg.userId === (this._user?.userId || 'anon');
      const initial = (msg.userName || '?')[0].toUpperCase();
      const showDate   = dateStr !== lastDateStr;
      const showHeader = showDate || msg.userId !== lastUserId;
      lastDateStr = dateStr;
      lastUserId  = msg.userId;
      if (showDate) {
        html += `<div class="date-sep"><span>${this._esc(dateStr)}</span></div>`;
      }
      if (isOwn) {
        html += `
          <div class="msg-row own${showHeader ? '' : ' compact'}">
            <div class="msg-body own">
              ${showHeader ? `<div class="msg-meta own"><span class="msg-time">${timeStr}</span></div>` : ''}
              <div class="msg-bubble own">${this._esc(msg.text)}</div>
            </div>
          </div>`;
      } else {
        html += `
          <div class="msg-row${showHeader ? '' : ' compact'}">
            ${showHeader
              ? `<div class="msg-av">${this._esc(initial)}</div>`
              : `<div class="msg-av-gap"></div>`}
            <div class="msg-body">
              ${showHeader ? `<div class="msg-meta"><span class="msg-name">${this._esc(msg.userName || 'Unknown')}</span><span class="msg-time">${timeStr}</span></div>` : ''}
              <div class="msg-bubble">${this._esc(msg.text)}</div>
            </div>
          </div>`;
      }
    }
    area.innerHTML = html;
    area.scrollTop = area.scrollHeight;
  }

  _renderInputBar() {
    const bar = this._wrapper.querySelector('#input-bar');
    if (!bar) return;
    const ch = this._channels.find(c => c.id === this._activeChannelId);
    bar.innerHTML = `
      <input class="msg-input" id="msg-input" placeholder="Message #${this._esc(ch?.name || 'general')}" ${this._sending ? 'disabled' : ''} />
      <button class="send-btn" id="send-btn" ${this._sending ? 'disabled' : ''}>Send</button>
    `;
    this._bindInputEvents();
  }

  // ─── Event binding ─────────────────────────────────────────────────────────

  _bindStaticEvents() {
    this._wrapper.querySelector('#add-ch-btn')?.addEventListener('click', () => {
      this._addingChannel = true;
      this._renderChannelList();
      this._wrapper.querySelector('#ch-new-input')?.focus();
    });
  }

  _bindChannelListEvents() {
    // New channel input
    const newInput = this._wrapper.querySelector('#ch-new-input');
    if (newInput) {
      const submit = async () => {
        const raw  = newInput.value.trim();
        const name = raw.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        this._addingChannel = false;
        if (!name) { this._renderChannelList(); return; }
        const id = `ch-${Date.now()}`;
        this._channels = [...this._channels, { id, name, createdAt: Date.now() }];
        await setData(CHAT_COL, CHANNELS_KEY, { channels: this._channels });
        await setData(MESSAGES_COL, id, { messages: [] });
        this._renderChannelList();
      };
      newInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') { this._addingChannel = false; this._renderChannelList(); }
      });
      newInput.addEventListener('blur', submit);
    }

    // Channel click
    this._wrapper.querySelectorAll('.ch-item[data-ch]').forEach(item => {
      item.addEventListener('click', async e => {
        if (e.target.closest('.ch-del')) return;
        const id = item.dataset.ch;
        if (id === this._activeChannelId) return;
        this._activeChannelId = id;
        const d = await getData(MESSAGES_COL, id);
        this._messages = d?.messages || [];
        this._channelMessages[id] = this._messages;
        await this._markRead(id);
        this._renderChannelList();
        this._renderMainHeader();
        this._renderMessages();
        this._renderInputBar();
        this._wrapper.querySelector('#msg-input')?.focus();
      });
    });

    // Delete channel
    this._wrapper.querySelectorAll('.ch-del').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const id = btn.dataset.del;
        const ch = this._channels.find(c => c.id === id);
        if (!ch || ch.system) return;
        if (!confirm(`Delete #${ch.name}? All messages will be lost.`)) return;
        this._channels = this._channels.filter(c => c.id !== id);
        await setData(CHAT_COL, CHANNELS_KEY, { channels: this._channels });
        deleteData(MESSAGES_COL, id); // fire-and-forget
        delete this._channelMessages[id];
        if (this._activeChannelId === id) {
          this._activeChannelId = 'ch-general';
          const d = await getData(MESSAGES_COL, 'ch-general');
          this._messages = d?.messages || [];
          this._channelMessages['ch-general'] = this._messages;
          this._renderMainHeader();
          this._renderMessages();
          this._renderInputBar();
        }
        this._renderChannelList();
      });
    });
  }

  _bindInputEvents() {
    const input = this._wrapper.querySelector('#msg-input');
    const btn   = this._wrapper.querySelector('#send-btn');
    if (!btn || !input) return;
    const send = () => this._sendMessage(input.value);
    btn.addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  }

  // ─── Send ──────────────────────────────────────────────────────────────────

  async _sendMessage(text) {
    text = text.trim();
    if (!text || this._sending) return;
    this._sending = true;

    const input = this._wrapper.querySelector('#msg-input');
    if (input) input.value = '';

    // Fetch latest from server to minimise lost-update races (skip when offline)
    const fresh = navigator.onLine ? await forceGetData(MESSAGES_COL, this._activeChannelId) : null;
    const base  = fresh?.messages || this._messages;

    const msg = {
      id:        `msg-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      userId:    this._user?.userId   || 'anon',
      userName:  this._user?.name || 'Anonymous',
      text,
      timestamp: Date.now(),
    };

    this._messages = [...base, msg].slice(-MAX_MESSAGES);
    this._channelMessages[this._activeChannelId] = this._messages;
    this._renderMessages();

    await setData(MESSAGES_COL, this._activeChannelId, { messages: this._messages });
    await this._markRead(this._activeChannelId);

    this._sending = false;
    this._renderInputBar();
    this._wrapper.querySelector('#msg-input')?.focus();
  }
}

if (!customElements.get('app-chat')) customElements.define('app-chat', AppChat);
