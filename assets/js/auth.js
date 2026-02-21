/* ============================================
   NexSon – Authentication Module
   MongoDB backend (with localStorage fallback)
   ============================================ */

const Auth = {
  _token: null,

  /* ── Show/hide forms ── */
  showLogin() {
    document.getElementById('login-form').classList.add('active');
    document.getElementById('register-form').classList.remove('active');
  },
  showRegister() {
    document.getElementById('register-form').classList.add('active');
    document.getElementById('login-form').classList.remove('active');
    const pwd = document.getElementById('register-password');
    if (pwd) pwd.addEventListener('input', () => Auth._checkStrength(pwd.value));
  },

  /* ── Login ── */
  async login() {
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-password').value;
    if (!email || !pass) return UI.toast('Remplis tous les champs', 'error');

    const btn = document.querySelector('#login-form .btn-auth');
    if (btn) { btn.disabled = true; btn.textContent = 'Connexion…'; }

    try {
      if (CONFIG.USE_BACKEND) {
        await this._loginBackend(email, pass);
      } else {
        this._loginLocal(email, pass);
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Se connecter'; }
    }
  },

  _loginLocal(email, pass) {
    const user = Store.findUser(email);
    if (!user) return UI.toast('Aucun compte trouvé pour cet email', 'error');
    if (user.password !== Auth._hashSimple(pass)) return UI.toast('Mot de passe incorrect', 'error');
    Auth._startSession(user);
  },

  async _loginBackend(email, pass) {
    try {
      const res = await fetch(`${CONFIG.API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) return UI.toast(data.message || 'Erreur de connexion', 'error');
      Auth._token = data.token;
      localStorage.setItem('nexson_token', data.token);
      Auth._startSession(data.user);
    } catch {
      UI.toast('Serveur indisponible. Connexion locale.', 'info');
      Auth._loginLocal(email, pass);
    }
  },

  /* ── Register ── */
  async register() {
    const name  = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const pass  = document.getElementById('register-password').value;

    if (!name || !email || !pass) return UI.toast('Remplis tous les champs', 'error');
    if (!Auth._validEmail(email)) return UI.toast('Email invalide', 'error');
    if (pass.length < 6) return UI.toast('Le mot de passe doit faire au moins 6 caractères', 'error');

    const btn = document.querySelector('#register-form .btn-auth');
    if (btn) { btn.disabled = true; btn.textContent = 'Création…'; }

    try {
      if (CONFIG.USE_BACKEND) {
        await this._registerBackend(name, email, pass);
      } else {
        this._registerLocal(name, email, pass);
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Créer mon compte'; }
    }
  },

  _registerLocal(name, email, pass) {
    if (Store.findUser(email)) return UI.toast('Un compte existe déjà avec cet email', 'error');
    const user = {
      id:       'u_' + Date.now(),
      name,
      email,
      password: Auth._hashSimple(pass),
      avatar:   null,
      joinedAt: Date.now(),
    };
    Store.saveUser(email, user);
    Auth._startSession(user);
    UI.toast(`Bienvenue sur NexSon, ${name} !`, 'success');
  },

  async _registerBackend(name, email, pass) {
    try {
      const res = await fetch(`${CONFIG.API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) return UI.toast(data.message || 'Erreur lors de la création', 'error');
      Auth._token = data.token;
      localStorage.setItem('nexson_token', data.token);
      Auth._startSession(data.user);
      UI.toast(`Bienvenue sur NexSon, ${name} !`, 'success');
    } catch {
      UI.toast('Serveur indisponible. Inscription locale.', 'info');
      Auth._registerLocal(name, email, pass);
    }
  },

  /* ── Demo login ── */
  loginDemo() {
    const demo = {
      id:       'demo_user',
      name:     'Demo User',
      email:    'demo@nexson.music',
      avatar:   null,
      joinedAt: Date.now(),
    };
    if (!Store.findUser(demo.email)) {
      Store.saveUser(demo.email, { ...demo, password: Auth._hashSimple('demo') });
    }
    Auth._startSession(demo);
  },

  /* ── Start session ── */
  _startSession(user) {
    const sessionUser = { id: user.id, name: user.name, email: user.email, avatar: user.avatar };
    Store.setUser(sessionUser);
    Auth._applyUserToUI(sessionUser);
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    Router.navigate('home');
    UI.toast(`Bienvenue, ${user.name} !`, 'success');
  },

  /* ── Logout ── */
  logout() {
    Store.clearUser();
    Auth._token = null;
    localStorage.removeItem('nexson_token');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    Auth.showLogin();
    document.getElementById('user-dropdown').classList.add('hidden');
    Player.stop();
    UI.toast('À bientôt !', 'info');
  },

  /* ── Apply user info to UI ── */
  _applyUserToUI(user) {
    const nameEl   = document.getElementById('user-display-name');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl) nameEl.textContent = user.name;
    if (avatarEl) {
      if (user.avatar) {
        avatarEl.innerHTML = `<img src="${user.avatar}" alt="${user.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      } else {
        avatarEl.textContent = user.name.charAt(0).toUpperCase();
      }
    }
  },

  /* ── Check existing session ── */
  async checkSession() {
    // Check JWT token first
    const token = localStorage.getItem('nexson_token');
    if (token && CONFIG.USE_BACKEND) {
      try {
        const res = await fetch(`${CONFIG.API_BASE}/api/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          Auth._token = token;
          Auth._startSession(data.user);
          return true;
        }
      } catch {}
    }

    // Fallback to localStorage session
    const user = Store.getUser();
    if (user) {
      Auth._applyUserToUI(user);
      document.getElementById('auth-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      return true;
    }
    return false;
  },

  /* ── Password strength ── */
  _checkStrength(pass) {
    const fill  = document.getElementById('strength-fill');
    const label = document.getElementById('strength-label');
    if (!fill || !label) return;
    let score = 0;
    if (pass.length >= 6)  score++;
    if (pass.length >= 10) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    const levels = [
      { pct: '20%', color: '#ef4444', text: 'Très faible' },
      { pct: '40%', color: '#f97316', text: 'Faible' },
      { pct: '60%', color: '#eab308', text: 'Moyen' },
      { pct: '80%', color: '#22c55e', text: 'Fort' },
      { pct: '100%', color: '#10b981', text: 'Excellent' },
    ];
    const lvl = levels[Math.min(score - 1, 4)] || { pct: '0%', color: '', text: 'Trop court' };
    fill.style.width = lvl.pct;
    fill.style.background = lvl.color;
    label.textContent = lvl.text;
    label.style.color = lvl.color;
  },

  /* ── Helpers ── */
  _validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); },

  _hashSimple(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return 'h_' + Math.abs(h).toString(36);
  },

  /* ── Update profile ── */
  updateProfile(updates) {
    const user = Store.getUser();
    if (!user) return;
    const updated = { ...user, ...updates };
    Store.setUser(updated);
    const storedUser = Store.findUser(user.email);
    if (storedUser) Store.saveUser(user.email, { ...storedUser, ...updates });
    Auth._applyUserToUI(updated);
    return updated;
  },
};
