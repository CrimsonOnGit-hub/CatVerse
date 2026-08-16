/* ============================================================
   CatVerse — A Real Social Network for Cat Lovers
   app.js — Universal Hybrid Architecture (MySQL + Cloud Sync + Local)
   Works seamlessly on GitHub Pages, Netlify, and Localhost Node/MySQL
   ============================================================ */

// ─── Constants ───────────────────────────────────────────────
const DB_KEY = 'catverse_db_v5_clean';
const SESSION_KEY = 'catverse_session_v5_clean';

// ─── Preset Avatars (SVG data-URIs) ─────────────────────────
function generatePresetAvatar(index) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
  const labels = ['M', 'W', 'B', 'L', 'S', 'K'];
  const bg = colors[index % colors.length];
  const label = labels[index % labels.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect width="200" height="200" rx="100" fill="${bg}"/>
    <polygon points="60,90 45,40 85,70" fill="rgba(0,0,0,0.15)"/>
    <polygon points="140,90 155,40 115,70" fill="rgba(0,0,0,0.15)"/>
    <circle cx="100" cy="115" r="50" fill="rgba(0,0,0,0.1)"/>
    <circle cx="82" cy="105" r="7" fill="rgba(0,0,0,0.3)"/>
    <circle cx="118" cy="105" r="7" fill="rgba(0,0,0,0.3)"/>
    <polygon points="100,118 95,124 105,124" fill="rgba(0,0,0,0.25)"/>
    <text x="100" y="170" text-anchor="middle" font-family="Arial" font-size="28" font-weight="bold" fill="rgba(0,0,0,0.3)">${label}</text>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

const PRESET_AVATARS = Array.from({ length: 6 }, (_, i) => generatePresetAvatar(i));

// ─── Default Database ────────────────────────────────────────
function createDefaultDB() {
  return {
    users: {},
    posts: [],
    currentUser: null,
    theme: null,
  };
}

// ─── Store (Local Cache + Session Persistence) ───────────────
const Store = {
  _data: null,

  load() {
    try {
      let raw = localStorage.getItem(DB_KEY);
      this._data = raw ? JSON.parse(raw) : createDefaultDB();
    } catch {
      this._data = createDefaultDB();
    }

    if (!this._data.users) this._data.users = {};
    if (!this._data.posts) this._data.posts = [];

    const activeSession = localStorage.getItem(SESSION_KEY);
    if (activeSession && this._data.users[activeSession]) {
      this._data.currentUser = activeSession;
    } else {
      this._data.currentUser = null;
    }

    this.save();
    return this._data;
  },

  save() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(this._data));
      if (this._data.currentUser) {
        localStorage.setItem(SESSION_KEY, this._data.currentUser);
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  },

  get data() {
    if (!this._data) this.load();
    return this._data;
  },

  reset() {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(SESSION_KEY);
    this._data = createDefaultDB();
    this.save();
  }
};

// ─── Backend API Client (With Fail-Safe Offline/Static Fallback) ─
const API = {
  backendAvailable: null,

  isBackendHost() {
    return location.hostname === 'localhost' ||
           location.hostname === '127.0.0.1' ||
           location.port === '8085' ||
           location.port === '3000' ||
           location.port === '5000';
  },

  async req(endpoint, options = {}) {
    // On static hosts like GitHub Pages, skip /api calls to prevent 404 logs
    if (!this.isBackendHost()) {
      return null;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(endpoint, {
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        ...options
      });
      clearTimeout(timeoutId);
      if (!res.ok) return null;
      this.backendAvailable = true;
      return await res.json();
    } catch {
      this.backendAvailable = false;
      return null;
    }
  },

  async getPosts() { return await this.req('/api/posts'); },
  async createPost(postData) { return await this.req('/api/posts', { method: 'POST', body: JSON.stringify(postData) }); },
  async deletePost(postId) { return await this.req(`/api/posts/${postId}`, { method: 'DELETE' }); },
  async toggleLike(postId, username) { return await this.req(`/api/posts/${postId}/like`, { method: 'POST', body: JSON.stringify({ username }) }); },
  async addComment(postId, author, text) { return await this.req(`/api/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ author, text }) }); },
  async deleteComment(postId, commentId) { return await this.req(`/api/posts/${postId}/comments/${commentId}`, { method: 'DELETE' }); },
  async getUsers() { return await this.req('/api/users'); },
  async toggleFriend(userA, userB) { return await this.req('/api/friends/toggle', { method: 'POST', body: JSON.stringify({ userA, userB }) }); },
  async toggleSave(username, postId) { return await this.req('/api/saves/toggle', { method: 'POST', body: JSON.stringify({ username, postId }) }); },
  async signup(userData) { return await this.req('/api/auth/signup', { method: 'POST', body: JSON.stringify(userData) }); },
  async login(username, password) { return await this.req('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }); }
};

// ─── Smart Image Compressor (Shrinks 10MB Camera Photos to ~40KB for Instant Cloud Sync) ─
function compressImage(fileOrDataUrl, maxWidth = 800, maxHeight = 800, quality = 0.75) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxWidth || h > maxHeight) {
        if (w > h) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        } else {
          w = Math.round((w * maxHeight) / h);
          h = maxHeight;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '');
    if (typeof fileOrDataUrl === 'string') {
      img.src = fileOrDataUrl;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target.result; };
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
}

// ─── Real-Time Global Cloud Sync (Dual-Engine: GunDB + MQTT WebSockets) ──
let gun = null;
let globalPostsNode = null;
let globalUsersNode = null;
let mqttClient = null;

const CLOUD_TOPIC_EVENTS = 'catverse/v5/global/events';

function initCloudSync() {
  // 1. MQTT Cloud WebSockets (Instant <50ms broadcast across all devices worldwide)
  if (typeof mqtt !== 'undefined') {
    try {
      const clientId = 'catverse_client_' + Math.random().toString(36).substring(2, 10);
      mqttClient = mqtt.connect('wss://broker.hivemq.com:8884/mqtt', {
        clientId,
        clean: true,
        reconnectPeriod: 3000
      });

      mqttClient.on('connect', () => {
        console.log('📡 Connected to Global CatVerse Real-Time Cloud Relay');
        mqttClient.subscribe(CLOUD_TOPIC_EVENTS);
      });

      mqttClient.on('message', (topic, payload) => {
        if (topic === CLOUD_TOPIC_EVENTS) {
          try {
            const { event, data } = JSON.parse(payload.toString());
            handleCloudEvent(event, data);
          } catch (e) {}
        }
      });
    } catch (e) {
      console.warn('MQTT init:', e);
    }
  }

  // 2. GunDB P2P WebSockets Network
  if (typeof Gun !== 'undefined') {
    try {
      gun = Gun({
        peers: [
          'https://peer.waller.li/gun',
          'https://relay.peer.ooo/gun',
          'https://gun-us.herokuapp.com/gun',
          'https://dletta.rig.craftws.com/gun'
        ],
        localStorage: false
      });

      globalPostsNode = gun.get('catverse_global_posts_v5');
      globalUsersNode = gun.get('catverse_global_users_v5');

      // Real-Time Incoming Posts from GunDB
      globalPostsNode.map().on((postJson, postId) => {
        if (!postJson) {
          if (Store.data.posts.some(p => p.id === postId)) {
            Store.data.posts = Store.data.posts.filter(p => p.id !== postId);
            Store.save();
            App.renderFeed();
          }
          return;
        }
        try {
          const post = typeof postJson === 'string' ? JSON.parse(postJson) : postJson;
          if (post && post.id) {
            const existingIdx = Store.data.posts.findIndex(p => p.id === post.id);
            if (existingIdx >= 0) {
              Store.data.posts[existingIdx] = post;
            } else {
              Store.data.posts.unshift(post);
              if (post.author !== Store.data.currentUser) {
                showToast(`🐾 New live post from @${post.author}!`, 'info');
              }
            }
            Store.save();
            App.renderFeed();
          }
        } catch (e) {}
      });

      // Real-Time Incoming Users from GunDB
      globalUsersNode.map().on((userJson, username) => {
        if (!userJson) return;
        try {
          const user = typeof userJson === 'string' ? JSON.parse(userJson) : userJson;
          if (user && user.username) {
            Store.data.users[user.username] = {
              ...Store.data.users[user.username],
              ...user
            };
            Store.save();
            App.renderFriendsSidebar();
          }
        } catch (e) {}
      });
    } catch (err) {
      console.warn('Gun cloud init:', err);
    }
  }
}

// ── Handle Global Real-Time Cloud Events ───────────────────────
function handleCloudEvent(event, data) {
  if (!data) return;
  switch (event) {
    case 'NEW_POST':
      if (!Store.data.posts.some(p => p.id === data.id)) {
        Store.data.posts.unshift(data);
        Store.save();
        App.renderFeed();
        if (data.author !== Store.data.currentUser) {
          showToast(`🐾 New live post from @${data.author}!`, 'info');
        }
      }
      break;

    case 'DELETE_POST':
      Store.data.posts = Store.data.posts.filter(p => p.id !== data.postId);
      Store.save();
      App.renderFeed();
      break;

    case 'NEW_USER':
      if (data.username) {
        Store.data.users[data.username] = {
          ...Store.data.users[data.username],
          ...data
        };
        Store.save();
        App.renderFriendsSidebar();
      }
      break;

    case 'LIKE_POST':
      const pLike = Store.data.posts.find(p => p.id === data.postId);
      if (pLike) {
        pLike.likes = data.likes;
        Store.save();
        App.renderFeed();
      }
      break;

    case 'NEW_COMMENT':
      const pComm = Store.data.posts.find(p => p.id === data.postId);
      if (pComm) {
        if (!pComm.comments) pComm.comments = [];
        if (!pComm.comments.some(c => c.id === data.comment.id)) {
          pComm.comments.push(data.comment);
          Store.save();
          App.renderFeed();
        }
      }
      break;
  }
}

// ── Global Broadcast Dispatcher ───────────────────────────────
function broadcastGlobal(event, data) {
  // 1. MQTT Cloud Broadcast
  try {
    if (mqttClient && mqttClient.connected) {
      mqttClient.publish(CLOUD_TOPIC_EVENTS, JSON.stringify({ event, data }));
    }
  } catch (e) {}

  // 2. GunDB Node Update
  try {
    if (event === 'NEW_POST' && globalPostsNode) {
      globalPostsNode.get(data.id).put(JSON.stringify(data));
    } else if (event === 'DELETE_POST' && globalPostsNode) {
      globalPostsNode.get(data.postId).put(null);
    } else if (event === 'NEW_USER' && globalUsersNode) {
      globalUsersNode.get(data.username).put(JSON.stringify(data));
    }
  } catch (e) {}
}

// ─── Real-Time Node Backend WebSocket Listener ───────────────
let ws = null;

function initWebSocket() {
  if (location.protocol === 'file:') return;

  // On GitHub Pages or static CDN hosts, GunDB manages all real-time cloud sync.
  // Only connect to /ws if running on a real Node.js / MySQL backend host.
  const isBackendHost = location.hostname === 'localhost' ||
                        location.hostname === '127.0.0.1' ||
                        location.port === '8085' ||
                        location.port === '3000' ||
                        location.port === '5000';

  if (!isBackendHost) return;

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}/ws`;

  try {
    ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const { event: evType, data } = JSON.parse(event.data);
        switch (evType) {
          case 'NEW_POST':
            if (data && !Store.data.posts.some(p => p.id === data.id)) {
              Store.data.posts.unshift(data);
              Store.save();
              App.renderFeed();
            }
            break;
          case 'DELETE_POST':
            Store.data.posts = Store.data.posts.filter(p => p.id !== data.postId);
            Store.save();
            App.renderFeed();
            break;
          case 'POST_LIKES_UPDATED':
            const postToLike = Store.data.posts.find(p => p.id === data.postId);
            if (postToLike) {
              postToLike.likes = data.likes;
              Store.save();
              App.renderFeed();
            }
            break;
          case 'NEW_COMMENT':
            const postForComment = Store.data.posts.find(p => p.id === data.postId);
            if (postForComment) {
              if (!postForComment.comments) postForComment.comments = [];
              if (!postForComment.comments.some(c => c.id === data.comment.id)) {
                postForComment.comments.push(data.comment);
                Store.save();
                App.renderFeed();
              }
            }
            break;
          case 'NEW_USER':
            if (data && data.username) {
              Store.data.users[data.username] = {
                ...Store.data.users[data.username],
                ...data
              };
              Store.save();
              App.renderFriendsSidebar();
            }
            break;
          case 'FRIENDSHIP_CHANGED':
            App.syncFriendship(data.userA, data.userB, data.isFriend);
            break;
        }
      } catch (err) {}
    };
    ws.onclose = () => setTimeout(initWebSocket, 4000);
  } catch (e) {}
}

// ─── Utilities ───────────────────────────────────────────────
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function uniqueId() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Toast Notifications ─────────────────────────────────────
function showToast(message, type = 'info') {
  const container = $('#toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ─── App Controller ──────────────────────────────────────────
const App = {
  currentFeed: 'home',
  webcamStream: null,
  mediaRecorder: null,
  recordedChunks: [],
  recordingTimerInterval: null,
  recordingSeconds: 0,
  selectedSignupAvatar: null,
  uploadedCatPhoto: null,
  uploadedTakeVideo: null,
  profileTab: 'cats',
  viewingUser: null,
  inlinePostType: 'photo',

  // ── Initialize ───────────────────────────────────────────
  async init() {
    Store.load();
    this.initTheme();
    this.setupPresetAvatars();
    this.bindEvents();

    initCloudSync();
    initWebSocket();

    // Sync with backend if available
    this.syncWithBackend();

    if (Store.data.currentUser && Store.data.users[Store.data.currentUser]) {
      this.hideAuth();
      this.enterApp();
    } else {
      this.showAuth();
    }
  },

  async syncWithBackend() {
    try {
      const [backendPosts, backendUsers] = await Promise.all([
        API.getPosts(),
        API.getUsers()
      ]);

      if (backendPosts && Array.isArray(backendPosts) && backendPosts.length > 0) {
        Store.data.posts = backendPosts;
      }
      if (backendUsers && typeof backendUsers === 'object') {
        Store.data.users = { ...Store.data.users, ...backendUsers };
      }
      Store.save();
      this.renderFeed();
      this.renderFriendsSidebar();
    } catch (e) {}
  },

  syncFriendship(userA, userB, isFriend) {
    [userA, userB].forEach(u => {
      if (!Store.data.users[u]) return;
      if (!Store.data.users[u].friends) Store.data.users[u].friends = [];
    });

    const otherOf = (u) => (u === userA ? userB : userA);

    [userA, userB].forEach(u => {
      const target = otherOf(u);
      if (!Store.data.users[u]) return;
      if (isFriend) {
        if (!Store.data.users[u].friends.includes(target)) Store.data.users[u].friends.push(target);
      } else {
        Store.data.users[u].friends = Store.data.users[u].friends.filter(f => f !== target);
      }
    });

    Store.save();
    this.renderFriendsSidebar();
    if (this.viewingUser) this.openProfile(this.viewingUser);
    if (this.currentFeed === 'friends') this.renderFeed();
  },

  // ── Device & User Theme Detection ────────────────────────
  getEffectiveTheme() {
    if (Store.data.theme === 'dark' || Store.data.theme === 'light') {
      return Store.data.theme;
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  },

  applyTheme() {
    const theme = this.getEffectiveTheme();
    document.documentElement.setAttribute('data-theme', theme);
    const btn = $('#themeToggleBtn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  },

  initTheme() {
    this.applyTheme();

    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', () => {
        if (!Store.data.theme) this.applyTheme();
      });
    }
  },

  toggleTheme() {
    const current = this.getEffectiveTheme();
    const newTheme = current === 'dark' ? 'light' : 'dark';
    Store.data.theme = newTheme;
    Store.save();
    this.applyTheme();
  },

  // ── Auth ─────────────────────────────────────────────────
  showAuth() {
    $('#authModal')?.classList.remove('hidden');
    document.body.classList.add('no-scroll');
  },

  hideAuth() {
    $('#authModal')?.classList.add('hidden');
    document.body.classList.remove('no-scroll');
  },

  switchAuthTab(tab) {
    if (tab === 'login') {
      $('#tabLogin')?.classList.add('active');
      $('#tabSignup')?.classList.remove('active');
      $('#loginForm')?.classList.remove('hidden');
      $('#signupForm')?.classList.add('hidden');
    } else {
      $('#tabSignup')?.classList.add('active');
      $('#tabLogin')?.classList.remove('active');
      $('#signupForm')?.classList.remove('hidden');
      $('#loginForm')?.classList.add('hidden');
    }
  },

  async handleLogin(e) {
    e.preventDefault();
    const rawInput = $('#loginUsername').value.trim();
    const cleanIdentifier = rawInput.replace(/^@/, '').trim().toLowerCase();
    const password = $('#loginPassword').value;

    let user = null;

    // 1. Try Backend REST API (if running on Node server)
    const res = await API.login(cleanIdentifier, password);
    if (res && res.success) {
      user = res.user;
    }

    // 2. Check local store (username, email, or display name)
    if (!user) {
      const allUsers = Object.values(Store.data.users || {});
      const localUser = allUsers.find(u => 
        (u.username && u.username.toLowerCase() === cleanIdentifier) ||
        (u.email && u.email.toLowerCase() === cleanIdentifier) ||
        (u.displayName && u.displayName.toLowerCase() === cleanIdentifier)
      );
      if (localUser && localUser.password === password) {
        user = localUser;
      }
    }

    // 3. If still not found, query GunDB cloud peer network in real-time
    if (!user && typeof globalUsersNode !== 'undefined' && globalUsersNode) {
      const cloudUserJson = await new Promise(resolve => {
        const timeout = setTimeout(() => resolve(null), 1800);
        globalUsersNode.get(cleanIdentifier).once((data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      if (cloudUserJson) {
        try {
          const cloudUser = typeof cloudUserJson === 'string' ? JSON.parse(cloudUserJson) : cloudUserJson;
          if (cloudUser && cloudUser.password === password) {
            user = cloudUser;
            Store.data.users[cloudUser.username] = cloudUser;
          }
        } catch (err) {}
      }
    }

    if (!user) {
      // Check if user exists but wrong password for clearer error
      const userExists = Object.values(Store.data.users || {}).some(u => 
        (u.username && u.username.toLowerCase() === cleanIdentifier) ||
        (u.email && u.email.toLowerCase() === cleanIdentifier)
      );
      if (userExists) {
        showToast('Incorrect password. Please check your password and try again.', 'error');
      } else {
        showToast('Account not found. Please check your username/email or click "Create Account".', 'error');
      }
      return;
    }

    Store.data.users[user.username] = user;
    Store.data.currentUser = user.username;
    Store.save();
    this.hideAuth();
    this.enterApp();
    showToast(`Welcome back, ${user.displayName}! 🐾`, 'success');
  },

  async handleSignup(e) {
    e.preventDefault();
    const banner = $('#signupErrorBanner');
    banner.classList.add('hidden');

    const username = $('#signupUsername').value.trim().toLowerCase().replace(/\s+/g, '_');
    const email = $('#signupEmail')?.value.trim().toLowerCase() || null;
    const password = $('#signupPassword').value;
    const bio = $('#signupBio').value.trim();

    if (!username || username.length < 3) {
      banner.textContent = 'Username must be at least 3 characters.';
      banner.classList.remove('hidden');
      return;
    }
    if (email && (!email.includes('@') || !email.includes('.'))) {
      banner.textContent = 'Please enter a valid email address.';
      banner.classList.remove('hidden');
      return;
    }
    if (!password || password.length < 4) {
      banner.textContent = 'Password must be at least 4 characters.';
      banner.classList.remove('hidden');
      return;
    }

    // Strict account uniqueness check
    if (Store.data.users && Store.data.users[username]) {
      banner.textContent = `The username "@${username}" is already taken. Please choose another username or log in.`;
      banner.classList.remove('hidden');
      return;
    }

    if (email) {
      const emailExists = Object.values(Store.data.users || {}).some(u => u.email && u.email.toLowerCase() === email);
      if (emailExists) {
        banner.textContent = `The email "${email}" is already registered. Please log in instead.`;
        banner.classList.remove('hidden');
        return;
      }
    }

    const pfpInput = $('#signupPfpUpload');
    let avatarSrc = this.selectedSignupAvatar;

    if (!pfpInput.files?.[0] && !avatarSrc) {
      banner.textContent = 'Please select or upload a profile picture.';
      banner.classList.remove('hidden');
      return;
    }

    const submitSignup = async (avatar) => {
      // Re-verify uniqueness before saving
      if (Store.data.users && Store.data.users[username]) {
        banner.textContent = `The username "@${username}" is already taken. Please choose another username.`;
        banner.classList.remove('hidden');
        return;
      }

      const displayName = username.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const newUser = {
        username,
        email: email || null,
        password,
        displayName,
        bio: bio || 'Proud cat parent 🐾',
        avatar,
        friends: [],
        followers: [],
        following: [],
        saved: [],
        joinedAt: Date.now()
      };

      Store.data.users[username] = newUser;
      Store.data.currentUser = username;
      Store.save();

      // Broadcast to GunDB cloud
      try {
        globalUsersNode?.get(username).put(JSON.stringify(newUser));
      } catch (e) {}

      // Asynchronously push to backend API (if available)
      API.signup(newUser).catch(() => {});

      this.hideAuth();
      this.enterApp();
      showToast('Account created! Welcome to CatVerse! 🎉', 'success');
      $('#signupUsername').value = '';
      if ($('#signupEmail')) $('#signupEmail').value = '';
      $('#signupPassword').value = '';
      $('#signupBio').value = '';
      this.selectedSignupAvatar = null;
      $$('.preset-avatar').forEach(a => a.classList.remove('selected'));
    };

    if (pfpInput.files?.[0]) {
      readFileAsDataURL(pfpInput.files[0]).then(submitSignup);
    } else {
      submitSignup(avatarSrc);
    }
  },

  // ── Enter App ────────────────────────────────────────────
  enterApp() {
    const user = Store.data.users[Store.data.currentUser];
    if (!user) return;

    $('#headerAvatar').src = user.avatar;
    $('#sidebarAvatar').src = user.avatar;
    $('#sidebarUsername').textContent = user.displayName;
    $('#createPostAvatar').src = user.avatar;

    this.renderFeed();
    this.renderFriendsSidebar();
  },

  logout() {
    Store.data.currentUser = null;
    Store.save();
    this.showAuth();
    showToast('Logged out', 'info');
  },

  // ── INLINE POST CREATION CONTROLLER ──────────────────────
  openInlineCreate(type = 'photo') {
    if (!Store.data.currentUser) {
      this.showAuth();
      return;
    }

    const card = $('#inlineCreateCard');
    const expanded = $('#expandedCreateArea');
    const actions = $('#collapsedPostActions');

    expanded.classList.remove('hidden');
    actions.classList.add('hidden');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    this.switchInlineType(type);
  },

  closeInlineCreate() {
    const expanded = $('#expandedCreateArea');
    const actions = $('#collapsedPostActions');

    expanded.classList.add('hidden');
    actions.classList.remove('hidden');

    $('#inlineCatForm')?.reset();
    $('#inlineTakeForm')?.reset();

    this.uploadedCatPhoto = null;
    this.uploadedTakeVideo = null;
    this.aiDetectedBreed = null;
    this.aiConfidence = null;

    $('#inlineCatPhotoPreviewWrapper')?.classList.add('hidden');
    $('#inlineTakeVideoPreviewWrapper')?.classList.add('hidden');

    $('#inlineAiStatusBanner').className = 'status-banner status-idle';
    $('#inlineAiStatusBanner').textContent = 'Upload a photo above to verify it\'s a cat.';
    $('#inlineAiPredictionsList')?.classList.add('hidden');
    $('#inlineSubmitCatBtn').disabled = true;

    this.stopWebcam();
  },

  switchInlineType(type) {
    this.inlinePostType = type;
    const tabPhoto = $('#typeTabPhoto');
    const tabVideo = $('#typeTabVideo');
    const formPhoto = $('#inlineCatForm');
    const formVideo = $('#inlineTakeForm');

    if (type === 'photo') {
      tabPhoto.classList.add('active');
      tabVideo.classList.remove('active');
      formPhoto.classList.remove('hidden');
      formVideo.classList.add('hidden');
      this.stopWebcam();
      setTimeout(() => $('#inlineCatName')?.focus(), 50);
    } else {
      tabVideo.classList.add('active');
      tabPhoto.classList.remove('active');
      formVideo.classList.remove('hidden');
      formPhoto.classList.add('hidden');
      this.switchTakeTab('upload');
      setTimeout(() => $('#inlineTakeTitle')?.focus(), 50);
    }
  },

  // ── Cat Photo Upload & Submission ────────────────────────
  async handleCatPhotoUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }
    // Compress image to lightweight ~40KB JPEG for instant global transmission
    const dataUrl = await compressImage(file, 900, 900, 0.78);
    this.uploadedCatPhoto = dataUrl;
    const previewImg = $('#inlineCatPhotoPreview');
    previewImg.src = dataUrl;
    $('#inlineCatPhotoPreviewWrapper')?.classList.remove('hidden');
    $('#inlineSubmitCatBtn').disabled = false;
  },

  async handleInlineCatSubmit(e) {
    e.preventDefault();
    const catName = $('#inlineCatName').value.trim();
    const description = $('#inlineCatDescription').value.trim();
    const tags = $('#inlineCatTags').value.trim().split(',').map(t => t.trim()).filter(Boolean);

    if (!this.uploadedCatPhoto) {
      showToast('Please upload a photo', 'error');
      return;
    }

    const newPost = {
      id: uniqueId(),
      type: 'cat',
      author: Store.data.currentUser,
      catName: catName || 'Cat Photo',
      description: description || (catName ? `Meet ${catName}! 🐾` : 'Check out this cat! 🐾'),
      media: this.uploadedCatPhoto,
      mediaType: 'image',
      tags,
      likes: [],
      comments: [],
      timestamp: Date.now(),
    };

    Store.data.posts.unshift(newPost);
    Store.save();

    // Broadcast globally to all devices across the world in real time (<50ms)
    broadcastGlobal('NEW_POST', newPost);

    // Post to backend API (if running on Node server)
    API.createPost(newPost).catch(() => {});

    this.closeInlineCreate();
    this.switchFeed('home');
    showToast(`${newPost.catName} has been posted! 🐾`, 'success');
  },

  // ── CatTake Video Handlers ────────────────────────────────
  switchTakeTab(tab) {
    if (tab === 'upload') {
      $('#inlineTabTakeUpload')?.classList.add('active');
      $('#inlineTabTakeRecord')?.classList.remove('active');
      $('#inlineTakeUploadSection')?.classList.remove('hidden');
      $('#inlineTakeRecordSection')?.classList.add('hidden');
      this.stopWebcam();
    } else {
      $('#inlineTabTakeRecord')?.classList.add('active');
      $('#inlineTabTakeUpload')?.classList.remove('active');
      $('#inlineTakeRecordSection')?.classList.remove('hidden');
      $('#inlineTakeUploadSection')?.classList.add('hidden');
      this.startWebcam();
    }
  },

  async startWebcam() {
    try {
      this.webcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      $('#inlineWebcamVideo').srcObject = this.webcamStream;
      showToast('Webcam connected', 'success');
    } catch (err) {
      showToast('Could not access webcam', 'error');
    }
  },

  stopWebcam() {
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(t => t.stop());
      this.webcamStream = null;
    }
    const vid = $('#inlineWebcamVideo');
    if (vid) vid.srcObject = null;
    this.stopRecording();
  },

  startRecording() {
    if (!this.webcamStream) {
      showToast('Webcam not active', 'error');
      return;
    }
    this.recordedChunks = [];
    try {
      this.mediaRecorder = new MediaRecorder(this.webcamStream, { mimeType: 'video/webm' });
    } catch {
      this.mediaRecorder = new MediaRecorder(this.webcamStream);
    }
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
      const reader = new FileReader();
      reader.onload = () => {
        this.uploadedTakeVideo = reader.result;
        showToast('Recording ready to post!', 'success');
      };
      reader.readAsDataURL(blob);
    };
    this.mediaRecorder.start();
    this.recordingSeconds = 0;
    $('#inlineRecordingIndicator')?.classList.remove('hidden');
    $('#inlineRecordingTimer')?.classList.remove('hidden');
    $('#inlineStartRecordingBtn')?.classList.add('hidden');
    $('#inlineStopRecordingBtn')?.classList.remove('hidden');
    this.recordingTimerInterval = setInterval(() => {
      this.recordingSeconds++;
      const mins = String(Math.floor(this.recordingSeconds / 60)).padStart(2, '0');
      const secs = String(this.recordingSeconds % 60).padStart(2, '0');
      const t = $('#inlineRecordingTimer');
      if (t) t.textContent = `${mins}:${secs}`;
    }, 1000);
  },

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    if (this.recordingTimerInterval) {
      clearInterval(this.recordingTimerInterval);
      this.recordingTimerInterval = null;
    }
    this.recordingSeconds = 0;
    $('#inlineRecordingIndicator')?.classList.add('hidden');
    const timer = $('#inlineRecordingTimer');
    if (timer) { timer.classList.add('hidden'); timer.textContent = '00:00'; }
    $('#inlineStartRecordingBtn')?.classList.remove('hidden');
    $('#inlineStopRecordingBtn')?.classList.add('hidden');
  },

  async handleTakeVideoUpload(file) {
    if (!file || !file.type.startsWith('video/')) {
      showToast('Please select a video file', 'error');
      return;
    }
    const dataUrl = await readFileAsDataURL(file);
    this.uploadedTakeVideo = dataUrl;
    const preview = $('#inlineTakeVideoPreview');
    if (preview) {
      preview.src = dataUrl;
      $('#inlineTakeVideoPreviewWrapper')?.classList.remove('hidden');
    }
    showToast('Video loaded successfully!', 'success');
  },

  async handleInlineTakeSubmit(e) {
    e.preventDefault();
    const title = $('#inlineTakeTitle').value.trim();
    const description = $('#inlineTakeDescription').value.trim();
    const tags = $('#inlineTakeTags').value.trim().split(',').map(t => t.trim()).filter(Boolean);

    if (!title) {
      showToast('Please enter a title for your CatTake', 'error');
      return;
    }

    const newPost = {
      id: uniqueId(),
      type: 'cattake',
      author: Store.data.currentUser,
      title,
      description: description || '',
      media: this.uploadedTakeVideo || null,
      mediaType: 'video',
      tags,
      likes: [],
      comments: [],
      timestamp: Date.now(),
    };

    Store.data.posts.unshift(newPost);
    Store.save();

    try {
      globalPostsNode?.get(newPost.id).put(JSON.stringify(newPost));
    } catch (e) {}

    API.createPost(newPost).catch(() => {});

    this.closeInlineCreate();
    this.switchFeed('home');
    showToast(`CatTake "${title}" posted! 🎬`, 'success');
  },

  // ── Feed Rendering ──────────────────────────────────────
  renderFeed() {
    const container = $('#fbFeedStream');
    const emptyState = $('#emptyFeedState');
    const emptyText = $('#emptyFeedText');
    const tabHeader = $('#feedTabHeader');
    const tabTitle = $('#feedTabTitle');
    const tabSub = $('#feedTabSubtitle');
    const currentUser = Store.data.currentUser;
    const userObj = Store.data.users[currentUser];

    container.innerHTML = '';

    let posts = [...Store.data.posts];

    if (this.currentFeed === 'friends') {
      tabHeader.classList.remove('hidden');
      tabTitle.textContent = '👥 Friends Feed';
      tabSub.textContent = 'Posts from your friends on CatVerse';
      const friendList = userObj?.friends || [];
      posts = posts.filter(p => friendList.includes(p.author) || p.author === currentUser);
    } else if (this.currentFeed === 'cats') {
      tabHeader.classList.remove('hidden');
      tabTitle.textContent = '🐾 Cat Photos';
      tabSub.textContent = 'All cat photos shared by the community';
      posts = posts.filter(p => p.type === 'cat');
    } else if (this.currentFeed === 'cattakes') {
      tabHeader.classList.remove('hidden');
      tabTitle.textContent = '🎬 CatTakes';
      tabSub.textContent = 'Short cat videos & clips';
      posts = posts.filter(p => p.type === 'cattake');
    } else if (this.currentFeed === 'trending') {
      tabHeader.classList.remove('hidden');
      tabTitle.textContent = '🔥 Trending';
      tabSub.textContent = 'Most loved posts right now';
      posts = posts.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));
    } else if (this.currentFeed === 'saved') {
      tabHeader.classList.remove('hidden');
      tabTitle.textContent = '🔖 Saved Posts';
      tabSub.textContent = 'Posts you bookmarked';
      const savedIds = userObj?.saved || [];
      posts = posts.filter(p => savedIds.includes(p.id));
    } else {
      tabHeader.classList.add('hidden');
    }

    if (this.currentFeed !== 'trending') {
      posts.sort((a, b) => b.timestamp - a.timestamp);
    }

    if (posts.length === 0) {
      emptyState.classList.remove('hidden');
      if (this.currentFeed === 'friends') {
        emptyText.textContent = 'No posts from friends yet. Add friends to populate your feed!';
      } else if (this.currentFeed === 'saved') {
        emptyText.textContent = 'You haven\'t saved any posts yet. Click "Save" on any post to bookmark it.';
      } else {
        emptyText.textContent = 'No posts yet! Be the first to share a post with "What\'s your cat doing today?" above.';
      }
    } else {
      emptyState.classList.add('hidden');
      posts.forEach(post => {
        container.appendChild(this.createPostCard(post));
      });
    }
  },

  createPostCard(post) {
    const author = Store.data.users[post.author];
    const currentUser = Store.data.currentUser;
    const isLiked = post.likes?.includes(currentUser);
    const isSaved = Store.data.users[currentUser]?.saved?.includes(post.id);
    const isOwnPost = post.author === currentUser;

    const card = document.createElement('article');
    card.className = 'post-card';
    card.dataset.postId = post.id;

    let commentsHtml = '';
    const visibleComments = (post.comments || []).slice(-3);
    const hiddenCount = (post.comments || []).length - visibleComments.length;

    if (hiddenCount > 0) {
      commentsHtml += `<button class="view-more-comments" data-post-id="${post.id}">View ${hiddenCount} more comment${hiddenCount > 1 ? 's' : ''}</button>`;
    }

    visibleComments.forEach(c => {
      const commenter = Store.data.users[c.author];
      commentsHtml += `
        <div class="comment">
          <img src="${commenter?.avatar || PRESET_AVATARS[0]}" alt="${c.author}" class="comment-avatar" data-user="${c.author}">
          <div class="comment-bubble">
            <span class="comment-author" data-user="${c.author}">${commenter?.displayName || c.author}</span>
            <span class="comment-text">${escapeHtml(c.text)}</span>
          </div>
          ${c.author === currentUser ? `<button class="delete-comment-btn" data-post-id="${post.id}" data-comment-id="${c.id}" title="Delete">✕</button>` : ''}
        </div>
      `;
    });

    let mediaHtml = '';
    if (post.media && post.mediaType === 'image') {
      mediaHtml = `<div class="post-media"><img src="${post.media}" alt="${post.catName || 'Post media'}" loading="lazy"></div>`;
    } else if (post.media && post.mediaType === 'video') {
      mediaHtml = `<div class="post-media"><video src="${post.media}" controls preload="metadata"></video></div>`;
    }

    let tagsHtml = '';
    if (post.tags && post.tags.length > 0) {
      tagsHtml = `<div class="post-tags">${post.tags.map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join(' ')}</div>`;
    }

    let titleHtml = '';
    if (post.type === 'cattake' && post.title) {
      titleHtml = `<h3 class="post-title">${escapeHtml(post.title)}</h3>`;
    }

    const typeLabel = (post.type === 'cattake') ? '🎬 CatTake' : '🐾 Cat Photo';

    card.innerHTML = `
      <div class="post-header">
        <img src="${author?.avatar || PRESET_AVATARS[0]}" alt="${post.author}" class="post-author-avatar" data-user="${post.author}">
        <div class="post-author-info">
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="post-author-name" data-user="${post.author}">${author?.displayName || post.author}</span>
            ${post.catName ? `<span class="post-cat-label">— ${escapeHtml(post.catName)}</span>` : ''}
          </div>
          <div class="post-meta-row">
            <span class="post-timestamp">${timeAgo(post.timestamp)} · ${typeLabel}</span>
          </div>
        </div>
        <div class="post-menu-container">
          ${isOwnPost ? `<button class="post-menu-btn" data-post-id="${post.id}" title="Delete Post">⋯</button>` : ''}
        </div>
      </div>

      ${titleHtml}

      <div class="post-body">
        <p>${escapeHtml(post.description)}</p>
        ${tagsHtml}
      </div>

      ${mediaHtml}

      <div class="post-stats">
        <div class="post-stats-left">
          ${post.likes?.length > 0 ? `<span class="reaction-count">❤️ ${post.likes.length}</span>` : ''}
        </div>
        <div class="post-stats-right">
          ${(post.comments?.length || 0) > 0 ? `<span class="comment-count">${post.comments.length} comment${post.comments.length !== 1 ? 's' : ''}</span>` : ''}
        </div>
      </div>

      <div class="post-actions">
        <button class="post-action-btn ${isLiked ? 'liked' : ''}" data-action="like" data-post-id="${post.id}">
          ${isLiked ? '❤️' : '🤍'} Like
        </button>
        <button class="post-action-btn" data-action="comment" data-post-id="${post.id}">
          💬 Comment
        </button>
        <button class="post-action-btn" data-action="share" data-post-id="${post.id}">
          ↗️ Share
        </button>
        <button class="post-action-btn ${isSaved ? 'saved' : ''}" data-action="save" data-post-id="${post.id}">
          ${isSaved ? '🔖' : '🏷️'} Save
        </button>
      </div>

      <div class="post-comments-section" data-post-id="${post.id}">
        ${commentsHtml}
        <div class="comment-input-row">
          <img src="${Store.data.users[currentUser]?.avatar || PRESET_AVATARS[0]}" alt="You" class="comment-avatar">
          <form class="comment-form" data-post-id="${post.id}">
            <input type="text" class="comment-input" placeholder="Write a comment..." required>
            <button type="submit" class="comment-submit-btn" title="Post">➤</button>
          </form>
        </div>
      </div>
    `;

    return card;
  },

  // ── Friends & Right Sidebar ──────────────────────────────
  renderFriendsSidebar() {
    const container = $('#contactsList');
    if (!container) return;
    container.innerHTML = '';
    const currentUser = Store.data.currentUser;
    const userObj = Store.data.users[currentUser];
    if (!userObj) return;

    const friends = userObj.friends || [];
    const otherUsers = Object.values(Store.data.users).filter(u => u.username !== currentUser);

    if (otherUsers.length === 0) {
      container.innerHTML = `<div class="contacts-empty">No other members registered yet.<br>Invite friends to connect!</div>`;
      return;
    }

    otherUsers.forEach(u => {
      const isFriend = friends.includes(u.username);
      const item = document.createElement('div');
      item.className = 'contact-item';
      item.innerHTML = `
        <div class="contact-main" data-user="${u.username}">
          <div class="contact-avatar-wrap">
            <img src="${u.avatar}" alt="${u.displayName}" class="contact-avatar">
            ${isFriend ? '<div class="contact-status-dot"></div>' : ''}
          </div>
          <div class="contact-details">
            <span class="contact-name">${u.displayName}</span>
            <span class="contact-badge">${isFriend ? '✓ Friend' : `@${u.username}`}</span>
          </div>
        </div>
        ${!isFriend ? `<button class="contact-mini-btn" data-add-friend="${u.username}">+ Add</button>` : ''}
      `;
      container.appendChild(item);
    });
  },

  async toggleFriend(targetUsername) {
    const currentUser = Store.data.currentUser;
    if (!currentUser || targetUsername === currentUser) return;

    const currentObj = Store.data.users[currentUser];
    const targetObj = Store.data.users[targetUsername];
    if (!currentObj || !targetObj) return;

    if (!currentObj.friends) currentObj.friends = [];
    if (!targetObj.friends) targetObj.friends = [];

    const idx = currentObj.friends.indexOf(targetUsername);
    let isFriend = false;
    if (idx >= 0) {
      currentObj.friends.splice(idx, 1);
      targetObj.friends = targetObj.friends.filter(u => u !== currentUser);
      isFriend = false;
      showToast(`Removed @${targetUsername} from friends`, 'info');
    } else {
      currentObj.friends.push(targetUsername);
      if (!targetObj.friends.includes(currentUser)) {
        targetObj.friends.push(currentUser);
      }
      isFriend = true;
      showToast(`You and ${targetObj.displayName} are now friends! 🐾`, 'success');
    }

    Store.save();

    try {
      globalUsersNode?.get(currentUser).put(JSON.stringify(currentObj));
      globalUsersNode?.get(targetUsername).put(JSON.stringify(targetObj));
    } catch (e) {}

    API.toggleFriend(currentUser, targetUsername).catch(() => {});

    this.renderFriendsSidebar();
    if (this.viewingUser) this.openProfile(this.viewingUser);
    if (this.currentFeed === 'friends') this.renderFeed();
  },

  openFindFriendsModal() {
    const modal = $('#findFriendsModal');
    if (!modal) return;
    this.renderFindFriendsList('');
    modal.classList.remove('hidden');
    document.body.classList.add('no-scroll');
  },

  closeFindFriendsModal() {
    $('#findFriendsModal')?.classList.add('hidden');
    document.body.classList.remove('no-scroll');
  },

  renderFindFriendsList(filterText = '') {
    const container = $('#findFriendsList');
    if (!container) return;
    container.innerHTML = '';
    const currentUser = Store.data.currentUser;
    const userObj = Store.data.users[currentUser];
    const friends = userObj?.friends || [];
    const q = filterText.toLowerCase();

    const users = Object.values(Store.data.users).filter(u =>
      u.username !== currentUser &&
      (!q || u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q))
    );

    if (users.length === 0) {
      container.innerHTML = `<div class="contacts-empty">No cat lovers found matching "${filterText}".</div>`;
      return;
    }

    users.forEach(u => {
      const isFriend = friends.includes(u.username);
      const card = document.createElement('div');
      card.className = 'find-user-card';
      card.innerHTML = `
        <div class="find-user-info" data-user="${u.username}">
          <img src="${u.avatar}" alt="${u.displayName}" class="find-user-avatar">
          <div class="find-user-text">
            <div class="find-user-name">${u.displayName}</div>
            <div class="find-user-bio">${u.bio || `@${u.username}`}</div>
          </div>
        </div>
        <div class="find-user-action">
          <button class="${isFriend ? 'secondary-btn' : 'primary-btn'}" data-friend-toggle="${u.username}">
            ${isFriend ? '✓ Friends' : '➕ Add Friend'}
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  },

  // ── Post Interactions ────────────────────────────────────
  async handlePostAction(action, postId) {
    const post = Store.data.posts.find(p => p.id === postId);
    if (!post) return;
    const currentUser = Store.data.currentUser;

    switch (action) {
      case 'like':
        if (!post.likes) post.likes = [];
        const likeIdx = post.likes.indexOf(currentUser);
        if (likeIdx >= 0) post.likes.splice(likeIdx, 1);
        else post.likes.push(currentUser);

        Store.save();
        broadcastGlobal('LIKE_POST', { postId, likes: post.likes });
        API.toggleLike(postId, currentUser).catch(() => {});
        this.renderFeed();
        break;

      case 'comment':
        const commentInput = document.querySelector(`.comment-form[data-post-id="${postId}"] .comment-input`);
        if (commentInput) commentInput.focus();
        break;

      case 'share':
        if (navigator.clipboard) {
          navigator.clipboard.writeText(`CatVerse post by @${post.author}: ${post.description?.substring(0, 80) || ''}...`);
          showToast('Link copied to clipboard!', 'success');
        } else {
          showToast('Post shared!', 'success');
        }
        break;

      case 'save':
        const user = Store.data.users[currentUser];
        if (!user.saved) user.saved = [];
        const saveIdx = user.saved.indexOf(postId);
        if (saveIdx >= 0) {
          user.saved.splice(saveIdx, 1);
          showToast('Post removed from saved', 'info');
        } else {
          user.saved.push(postId);
          showToast('Post saved to bookmarks!', 'success');
        }
        Store.save();
        API.toggleSave(currentUser, postId).catch(() => {});
        this.renderFeed();
        break;
    }
  },

  async handleComment(postId, text) {
    const post = Store.data.posts.find(p => p.id === postId);
    if (!post) return;
    if (!post.comments) post.comments = [];
    const comment = {
      id: uniqueId(),
      author: Store.data.currentUser,
      text: text.trim(),
      timestamp: Date.now(),
    };
    post.comments.push(comment);
    Store.save();
    broadcastGlobal('NEW_COMMENT', { postId, comment });
    API.addComment(postId, Store.data.currentUser, text).catch(() => {});
    this.renderFeed();
  },

  async deleteComment(postId, commentId) {
    const post = Store.data.posts.find(p => p.id === postId);
    if (!post || !post.comments) return;
    post.comments = post.comments.filter(c => c.id !== commentId);
    Store.save();
    broadcastGlobal('NEW_POST', post);
    API.deleteComment(postId, commentId).catch(() => {});
    this.renderFeed();
    showToast('Comment deleted', 'info');
  },

  async deletePost(postId) {
    Store.data.posts = Store.data.posts.filter(p => p.id !== postId);
    Store.save();
    broadcastGlobal('DELETE_POST', { postId });
    API.deletePost(postId).catch(() => {});
    this.renderFeed();
    showToast('Post deleted', 'info');
  },

  viewAllComments(postId) {
    const post = Store.data.posts.find(p => p.id === postId);
    if (!post) return;
    const section = document.querySelector(`.post-comments-section[data-post-id="${postId}"]`);
    if (!section) return;

    const currentUser = Store.data.currentUser;
    let html = '';
    (post.comments || []).forEach(c => {
      const commenter = Store.data.users[c.author];
      html += `
        <div class="comment">
          <img src="${commenter?.avatar || PRESET_AVATARS[0]}" alt="${c.author}" class="comment-avatar" data-user="${c.author}">
          <div class="comment-bubble">
            <span class="comment-author" data-user="${c.author}">${commenter?.displayName || c.author}</span>
            <span class="comment-text">${escapeHtml(c.text)}</span>
          </div>
          ${c.author === currentUser ? `<button class="delete-comment-btn" data-post-id="${postId}" data-comment-id="${c.id}" title="Delete">✕</button>` : ''}
        </div>
      `;
    });

    const inputRow = section.querySelector('.comment-input-row');
    section.innerHTML = html;
    if (inputRow) section.appendChild(inputRow);
  },

  // ── Profile ──────────────────────────────────────────────
  openProfile(username) {
    const user = Store.data.users[username];
    if (!user) return;
    this.viewingUser = username;
    this.profileTab = 'cats';

    const currentUser = Store.data.currentUser;
    const isFriend = user.friends?.includes(currentUser);
    const isOwnProfile = username === currentUser;

    const bannerColors = ['#1B9AAA', '#E84855', '#4ECDC4', '#45B7D1', '#96CEB4'];
    const bannerIdx = username.charCodeAt(0) % bannerColors.length;
    const banner = $('#profileModal .profile-banner');
    if (banner) {
      banner.style.background = `linear-gradient(135deg, ${bannerColors[bannerIdx]}, ${bannerColors[(bannerIdx + 2) % bannerColors.length]})`;
    }

    $('#profileAvatar').src = user.avatar;
    $('#profileDisplayName').textContent = user.displayName;
    $('#profileHandle').textContent = `@${user.username}`;
    $('#profileBio').textContent = user.bio || '';

    const userPosts = Store.data.posts.filter(p => p.author === username);
    $('#statPosts').textContent = userPosts.length;
    $('#statFriends').textContent = user.friends?.length || 0;
    $('#statFollowers').textContent = user.followers?.length || 0;
    $('#statFollowing').textContent = user.following?.length || 0;

    const friendBtn = $('#profileFriendBtn');
    const followBtn = $('#profileFollowBtn');

    if (isOwnProfile) {
      friendBtn.classList.add('hidden');
      followBtn.textContent = 'Edit Profile';
      followBtn.className = 'secondary-btn';
    } else {
      friendBtn.classList.remove('hidden');
      friendBtn.textContent = isFriend ? '✓ Friends' : '➕ Add Friend';
      friendBtn.className = isFriend ? 'secondary-btn' : 'primary-btn';
      followBtn.textContent = 'Follow';
      followBtn.className = 'secondary-btn';
    }

    this.renderProfileMedia(username);

    $$('.profile-tab').forEach(t => t.classList.remove('active'));
    $('[data-ptab="cats"]')?.classList.add('active');

    $('#profileModal')?.classList.remove('hidden');
    document.body.classList.add('no-scroll');
  },

  renderProfileMedia(username) {
    const grid = $('#profileMediaGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const posts = Store.data.posts.filter(p => p.author === username);
    const filtered = this.profileTab === 'cats'
      ? posts.filter(p => p.type === 'cat')
      : posts.filter(p => p.type === 'cattake');

    if (filtered.length === 0) {
      grid.innerHTML = `<p class="no-media-msg">No ${this.profileTab === 'cats' ? 'cat photos' : 'CatTakes'} shared yet.</p>`;
      return;
    }

    filtered.forEach(post => {
      const item = document.createElement('div');
      item.className = 'media-grid-item';
      if (post.media && post.mediaType === 'image') {
        item.innerHTML = `<img src="${post.media}" alt="${post.catName || post.title}">`;
      } else if (post.media && post.mediaType === 'video') {
        item.innerHTML = `<video src="${post.media}" preload="metadata"></video><div class="media-play-icon">▶</div>`;
      } else {
        item.innerHTML = `<div class="media-placeholder">${post.type === 'cattake' ? '🎬' : '📸'}<br>${escapeHtml(post.title || post.catName || '')}</div>`;
      }
      grid.appendChild(item);
    });
  },

  closeProfile() {
    $('#profileModal')?.classList.add('hidden');
    document.body.classList.remove('no-scroll');
    this.viewingUser = null;
  },

  // ── Navigation ───────────────────────────────────────────
  updateNavTabs() {
    $$('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.feed === this.currentFeed);
    });
    $$('[data-side-feed]').forEach(item => {
      item.classList.toggle('active', item.dataset.sideFeed === this.currentFeed);
    });
    $$('.mobile-nav-btn[data-feed]').forEach(item => {
      item.classList.toggle('active', item.dataset.feed === this.currentFeed);
    });
  },

  switchFeed(feed) {
    this.currentFeed = feed;
    this.updateNavTabs();
    this.renderFeed();
  },

  // ── Search ───────────────────────────────────────────────
  handleSearch(query) {
    if (!query) {
      this.renderFeed();
      return;
    }
    const q = query.toLowerCase();
    const container = $('#fbFeedStream');
    const emptyState = $('#emptyFeedState');
    const emptyText = $('#emptyFeedText');
    container.innerHTML = '';

    const results = Store.data.posts.filter(p =>
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.catName && p.catName.toLowerCase().includes(q)) ||
      (p.title && p.title.toLowerCase().includes(q)) ||
      (p.tags && p.tags.some(t => t.toLowerCase().includes(q))) ||
      (p.author && p.author.toLowerCase().includes(q)) ||
      (p.aiBreed && p.aiBreed.toLowerCase().includes(q))
    );

    if (results.length === 0) {
      emptyState.classList.remove('hidden');
      emptyText.textContent = `No posts found matching "${query}"`;
    } else {
      emptyState.classList.add('hidden');
      results.forEach(post => container.appendChild(this.createPostCard(post)));
    }
  },

  // ── Preset Avatars ───────────────────────────────────────
  setupPresetAvatars() {
    const presets = $$('.preset-avatar');
    presets.forEach((img, i) => {
      img.src = PRESET_AVATARS[i];
    });
  },

  // ── Event Binding ────────────────────────────────────────
  bindEvents() {
    $('#themeToggleBtn')?.addEventListener('click', () => this.toggleTheme());
    $('.logo')?.addEventListener('click', () => this.switchFeed('home'));

    $('#tabLogin')?.addEventListener('click', () => this.switchAuthTab('login'));
    $('#tabSignup')?.addEventListener('click', () => this.switchAuthTab('signup'));

    $('#loginForm')?.addEventListener('submit', (e) => this.handleLogin(e));
    $('#signupForm')?.addEventListener('submit', (e) => this.handleSignup(e));

    $$('.preset-avatar').forEach((img, i) => {
      img.addEventListener('click', () => {
        $$('.preset-avatar').forEach(a => a.classList.remove('selected'));
        img.classList.add('selected');
        this.selectedSignupAvatar = PRESET_AVATARS[i];
        const pfp = $('#signupPfpUpload');
        if (pfp) pfp.value = '';
      });
    });

    $('#signupPfpUpload')?.addEventListener('change', () => {
      $$('.preset-avatar').forEach(a => a.classList.remove('selected'));
      this.selectedSignupAvatar = null;
    });

    // Nav tabs
    $$('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchFeed(tab.dataset.feed));
    });

    // Mobile Bottom Navigation Buttons
    $$('.mobile-nav-btn[data-feed]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchFeed(btn.dataset.feed);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    $('#mobileCreateBtn')?.addEventListener('click', () => {
      this.openInlineCreate('photo');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('#mobileProfileNavBtn')?.addEventListener('click', () => {
      if (Store.data.currentUser) {
        this.openProfile(Store.data.currentUser);
      } else {
        this.showAuth();
      }
    });

    // Sidebar navigation
    $$('[data-side-feed]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchFeed(btn.dataset.sideFeed);
      });
    });

    // INLINE CREATE POST TRIGGERS
    $('#triggerCreatePostBtn')?.addEventListener('click', () => this.openInlineCreate('photo'));
    $('#postActionCatPhoto')?.addEventListener('click', () => this.openInlineCreate('photo'));
    $('#postActionCatTake')?.addEventListener('click', () => this.openInlineCreate('video'));
    $('#postActionFeeling')?.addEventListener('click', () => this.openInlineCreate('photo'));

    $('#createCatBtn')?.addEventListener('click', () => this.openInlineCreate('photo'));
    $('#sideCreateCatBtn')?.addEventListener('click', () => this.openInlineCreate('photo'));
    $('#createTakeBtn')?.addEventListener('click', () => this.openInlineCreate('video'));
    $('#sideCreateTakeBtn')?.addEventListener('click', () => this.openInlineCreate('video'));

    // Inline type switcher
    $('#typeTabPhoto')?.addEventListener('click', () => this.switchInlineType('photo'));
    $('#typeTabVideo')?.addEventListener('click', () => this.switchInlineType('video'));
    $('#inlineCancelBtn')?.addEventListener('click', () => this.closeInlineCreate());
    $('#inlineCancelTakeBtn')?.addEventListener('click', () => this.closeInlineCreate());

    // Inline Photo Form Handlers
    $('#inlineCatForm')?.addEventListener('submit', (e) => this.handleInlineCatSubmit(e));

    const inlineCatDropzone = $('#inlineCatPhotoDropzone');
    const inlineCatInput = $('#inlineCatPhotoInput');
    inlineCatDropzone?.addEventListener('click', (e) => {
      if (e.target === inlineCatInput) return;
      inlineCatInput?.click();
    });
    inlineCatInput?.addEventListener('change', () => {
      if (inlineCatInput.files?.[0]) this.handleCatPhotoUpload(inlineCatInput.files[0]);
    });
    inlineCatDropzone?.addEventListener('dragover', (e) => { e.preventDefault(); inlineCatDropzone.classList.add('dragover'); });
    inlineCatDropzone?.addEventListener('dragleave', () => inlineCatDropzone.classList.remove('dragover'));
    inlineCatDropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      inlineCatDropzone.classList.remove('dragover');
      if (e.dataTransfer.files?.[0]) this.handleCatPhotoUpload(e.dataTransfer.files[0]);
    });

    // Inline CatTake Form Handlers
    $('#inlineTakeForm')?.addEventListener('submit', (e) => this.handleInlineTakeSubmit(e));
    $('#inlineTabTakeUpload')?.addEventListener('click', () => this.switchTakeTab('upload'));
    $('#inlineTabTakeRecord')?.addEventListener('click', () => this.switchTakeTab('record'));
    $('#inlineStartRecordingBtn')?.addEventListener('click', () => this.startRecording());
    $('#inlineStopRecordingBtn')?.addEventListener('click', () => this.stopRecording());

    const inlineTakeDropzone = $('#inlineTakeVideoDropzone');
    const inlineTakeInput = $('#inlineTakeVideoInput');
    inlineTakeDropzone?.addEventListener('click', (e) => {
      if (e.target === inlineTakeInput) return;
      inlineTakeInput?.click();
    });
    inlineTakeInput?.addEventListener('change', () => {
      if (inlineTakeInput.files?.[0]) this.handleTakeVideoUpload(inlineTakeInput.files[0]);
    });
    inlineTakeDropzone?.addEventListener('dragover', (e) => { e.preventDefault(); inlineTakeDropzone.classList.add('dragover'); });
    inlineTakeDropzone?.addEventListener('dragleave', () => inlineTakeDropzone.classList.remove('dragover'));
    inlineTakeDropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      inlineTakeDropzone.classList.remove('dragover');
      if (e.dataTransfer.files?.[0]) this.handleTakeVideoUpload(e.dataTransfer.files[0]);
    });

    // Find Friends triggers
    $('#findFriendsBtn')?.addEventListener('click', () => this.openFindFriendsModal());
    $('#messengerBtn')?.addEventListener('click', () => this.switchFeed('friends'));
    $('#menuFriendsBtn')?.addEventListener('click', () => {
      $('#userDropdownMenu')?.classList.add('hidden');
      this.openFindFriendsModal();
    });
    $('#closeFindFriendsBtn')?.addEventListener('click', () => this.closeFindFriendsModal());
    $('#findFriendsSearchInput')?.addEventListener('input', (e) => {
      this.renderFindFriendsList(e.target.value.trim());
    });

    $('#findFriendsList')?.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('[data-friend-toggle]');
      if (toggleBtn) {
        this.toggleFriend(toggleBtn.dataset.friendToggle);
        this.renderFindFriendsList($('#findFriendsSearchInput')?.value.trim() || '');
        return;
      }
      const userEl = e.target.closest('[data-user]');
      if (userEl) {
        this.closeFindFriendsModal();
        this.openProfile(userEl.dataset.user);
      }
    });

    // Header dropdown
    $('#userAvatarBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      $('#userDropdownMenu')?.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.user-dropdown-container')) {
        $('#userDropdownMenu')?.classList.add('hidden');
      }
    });

    $('#menuProfileBtn')?.addEventListener('click', () => {
      $('#userDropdownMenu')?.classList.add('hidden');
      this.openProfile(Store.data.currentUser);
    });
    $('#menuSavedBtn')?.addEventListener('click', () => {
      $('#userDropdownMenu')?.classList.add('hidden');
      this.switchFeed('saved');
    });
    $('#menuSwitchBtn')?.addEventListener('click', () => {
      $('#userDropdownMenu')?.classList.add('hidden');
      this.logout();
    });
    $('#menuResetBtn')?.addEventListener('click', () => {
      $('#userDropdownMenu')?.classList.add('hidden');
      if (confirm('Reset all data? This will clear everything in CatVerse.')) {
        Store.reset();
        this.logout();
        showToast('All data has been reset', 'info');
      }
    });
    $('#menuLogoutBtn')?.addEventListener('click', () => {
      $('#userDropdownMenu')?.classList.add('hidden');
      this.logout();
    });

    $('#sidebarProfileLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.openProfile(Store.data.currentUser);
    });

    $('#profileFriendBtn')?.addEventListener('click', () => {
      if (this.viewingUser) this.toggleFriend(this.viewingUser);
    });

    $$('.profile-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.profileTab = tab.dataset.ptab;
        $$('.profile-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (this.viewingUser) this.renderProfileMedia(this.viewingUser);
      });
    });

    $$('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal && modal.id !== 'authModal') {
          modal.classList.add('hidden');
          document.body.classList.remove('no-scroll');
          if (modal.id === 'profileModal') this.viewingUser = null;
        }
      });
    });

    let searchTimeout;
    $('#searchInput')?.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => this.handleSearch(e.target.value.trim()), 250);
    });

    // Delegated feed interactions
    $('#fbFeedStream')?.addEventListener('click', (e) => {
      const target = e.target;

      const actionBtn = target.closest('[data-action]');
      if (actionBtn) {
        this.handlePostAction(actionBtn.dataset.action, actionBtn.dataset.postId);
        return;
      }

      const delComment = target.closest('.delete-comment-btn');
      if (delComment) {
        this.deleteComment(delComment.dataset.postId, delComment.dataset.commentId);
        return;
      }

      const viewMore = target.closest('.view-more-comments');
      if (viewMore) {
        this.viewAllComments(viewMore.dataset.postId);
        return;
      }

      const menuBtn = target.closest('.post-menu-btn');
      if (menuBtn) {
        if (confirm('Delete this post?')) {
          this.deletePost(menuBtn.dataset.postId);
        }
        return;
      }

      const userEl = target.closest('[data-user]');
      if (userEl) {
        this.openProfile(userEl.dataset.user);
        return;
      }
    });

    $('#fbFeedStream')?.addEventListener('submit', (e) => {
      if (e.target.classList.contains('comment-form')) {
        e.preventDefault();
        const input = e.target.querySelector('.comment-input');
        const text = input?.value.trim();
        if (text) {
          this.handleComment(e.target.dataset.postId, text);
          input.value = '';
        }
      }
    });

    // Delegated sidebar contacts interactions
    $('#contactsList')?.addEventListener('click', (e) => {
      const addBtn = e.target.closest('[data-add-friend]');
      if (addBtn) {
        this.toggleFriend(addBtn.dataset.addFriend);
        return;
      }
      const userEl = e.target.closest('[data-user]');
      if (userEl) {
        this.openProfile(userEl.dataset.user);
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!$('#expandedCreateArea')?.classList.contains('hidden')) this.closeInlineCreate();
        else if (!$('#profileModal')?.classList.contains('hidden')) this.closeProfile();
        else if (!$('#findFriendsModal')?.classList.contains('hidden')) this.closeFindFriendsModal();
      }
    });
  },
};

// ─── Boot Application ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
