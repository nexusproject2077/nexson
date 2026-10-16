/* ==========================================================================
   NexSon — Couche d'interaction « Obsidian »  (nexson-ui.js)
   Ajoute par-dessus l'existant, sans modifier les modules d'origine :
     • vue immersive « Lecture en cours » (façon Spotify / YouTube Music)
     • barre de navigation mobile
     • infobulle temporelle sur la barre de progression
     • bouton d'agrandissement depuis la barre de lecture
   ========================================================================== */

const NowPlaying = {
  _el: null,
  _open: false,
  _tab: 'queue',
  _built: false,
  _pct: 0,

  /* ── Ouverture / fermeture ─────────────────────────────────────────── */
  open() {
    if (!this._built) this._build();
    const track = Player.currentTrack();
    if (!track) { UI.toast('Lance un titre pour ouvrir la vue complète', 'info'); return; }
    this._open = true;
    this._el.classList.remove('hidden');
    document.body.classList.add('nx-np-open');
    this._render(Player.getState());
    this._tick();
    this._el.querySelector('.nx-np-close')?.focus();
  },

  close() {
    if (!this._built || !this._open) return;
    this._open = false;
    this._el.classList.add('hidden');
    document.body.classList.remove('nx-np-open');
  },

  toggle() { this._open ? this.close() : this.open(); },

  /* ── Construction du DOM ──────────────────────────────────────────── */
  _build() {
    const el = document.createElement('div');
    el.id = 'now-playing';
    el.className = 'nx-np hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Lecture en cours');

    el.innerHTML = `
      <div class="nx-np-bg" aria-hidden="true">
        <img class="nx-np-bg-img" alt="" data-np="bg">
        <div class="nx-np-bg-veil"></div>
      </div>

      <div class="nx-np-shell">
        <header class="nx-np-head">
          <button class="nx-np-icon-btn nx-np-close" data-np="close" title="Réduire" aria-label="Réduire">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="nx-np-head-label">
            <span class="nx-np-head-eyebrow">Lecture en cours</span>
            <span class="nx-np-head-source" data-np="source"></span>
          </div>
          <button class="nx-np-icon-btn" data-np="video" title="Clip vidéo" aria-label="Clip vidéo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2z"/></svg>
          </button>
        </header>

        <div class="nx-np-stage">
          <div class="nx-np-art">
            <img data-np="art" alt="" loading="eager">
            <div class="nx-np-art-fallback" data-np="artfallback">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
              </svg>
            </div>
          </div>

          <div class="nx-np-side">
            <div class="nx-np-meta">
              <h2 class="nx-np-title" data-np="title">—</h2>
              <button class="nx-np-artist" data-np="artist">—</button>
            </div>

            <div class="nx-np-scrub">
              <div class="nx-np-scrub-bar" data-np="scrub" role="slider" tabindex="0"
                   aria-label="Position dans le titre" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">
                <div class="nx-np-scrub-fill" data-np="fill"></div>
                <div class="nx-np-scrub-thumb" data-np="thumb"></div>
                <span class="nx-tip" data-np="tip">0:00</span>
              </div>
              <div class="nx-np-times">
                <span data-np="cur">0:00</span>
                <span data-np="dur">0:00</span>
              </div>
            </div>

            <div class="nx-np-controls">
              <button class="nx-np-ctl" data-np="shuffle" title="Aléatoire" aria-label="Aléatoire">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
              </button>
              <button class="nx-np-ctl nx-np-ctl-lg" data-np="prev" title="Précédent" aria-label="Précédent">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
              </button>
              <button class="nx-np-play" data-np="play" aria-label="Lecture / Pause">
                <svg data-np="playicon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                <svg data-np="pauseicon" viewBox="0 0 24 24" fill="currentColor" class="hidden"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              </button>
              <button class="nx-np-ctl nx-np-ctl-lg" data-np="next" title="Suivant" aria-label="Suivant">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/></svg>
              </button>
              <button class="nx-np-ctl" data-np="repeat" title="Répéter" aria-label="Répéter">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                <span class="nx-np-badge hidden" data-np="repeatbadge">1</span>
              </button>
            </div>

            <div class="nx-np-bottombar">
              <button class="nx-np-ctl nx-np-like" data-np="like" title="J'aime" aria-label="J'aime">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </button>
              <div class="nx-np-volume">
                <button class="nx-np-ctl" data-np="mute" title="Couper le son" aria-label="Couper le son">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                </button>
                <input type="range" class="nx-np-range" data-np="volume" min="0" max="100" value="80" aria-label="Volume">
              </div>
            </div>
          </div>
        </div>

        <div class="nx-np-panel">
          <div class="nx-np-tabs" role="tablist">
            <button class="nx-np-tab active" data-tab="queue" role="tab">File d'attente</button>
            <button class="nx-np-tab" data-tab="lyrics" role="tab">Paroles</button>
            <span class="nx-np-count" data-np="count"></span>
          </div>
          <div class="nx-np-tabbody" data-np="tabbody"></div>
        </div>
      </div>
    `;

    document.body.appendChild(el);
    this._el = el;
    this._built = true;
    this._wire();

    /* Le lecteur d'origine reste la source de vérité : on l'écoute. */
    Player.subscribe(state => { if (this._open) this._render(state); });
    Player.audio?.addEventListener('timeupdate', () => { if (this._open) this._tick(); });
  },

  /* ── Écouteurs ────────────────────────────────────────────────────── */
  _wire() {
    const q = sel => this._el.querySelector(sel);

    this._el.addEventListener('click', e => { if (e.target === this._el) this.close(); });
    q('[data-np="close"]').onclick = () => this.close();
    q('[data-np="play"]').onclick = () => Player.toggle();
    q('[data-np="next"]').onclick = () => Player.next();
    q('[data-np="prev"]').onclick = () => Player.prev();
    q('[data-np="shuffle"]').onclick = () => { Player.toggleShuffle(); this._render(Player.getState()); };
    q('[data-np="repeat"]').onclick = () => { Player.toggleRepeat(); this._render(Player.getState()); };
    q('[data-np="like"]').onclick = () => { Player.toggleLike(); this._render(Player.getState()); };
    q('[data-np="mute"]').onclick = () => { Player.toggleMute(); this._render(Player.getState()); };
    q('[data-np="video"]').onclick = () => { this.close(); Player.toggleVideo(); };
    q('[data-np="artist"]').onclick = () => {
      const t = Player.currentTrack();
      if (t) { this.close(); Router.navigate('artist', { id: t.artistId, name: t.artistName }); }
    };

    q('[data-np="volume"]').oninput = e => Player.setVolume(e.target.value);

    /* Défilement : glisser pour se positionner, avec aperçu du temps. */
    const bar = q('[data-np="scrub"]');
    const tip = q('[data-np="tip"]');
    const dur = () => Player._activeMedia()?.duration || 0;
    const fmt = s => Player._formatTime(Number.isFinite(s) ? s : 0);

    const pctOf = e => {
      const r = bar.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    };
    const paint = pct => {
      q('[data-np="fill"]').style.width = `${pct * 100}%`;
      q('[data-np="thumb"]').style.left = `${pct * 100}%`;
    };

    bar.addEventListener('pointerdown', e => {
      if (!dur()) return;
      bar.setPointerCapture(e.pointerId);
      this._dragging = true;
      this._pct = pctOf(e);
      paint(this._pct);
      q('[data-np="cur"]').textContent = fmt(this._pct * dur());
    });
    bar.addEventListener('pointermove', e => {
      const pct = pctOf(e);
      tip.style.left = `${pct * 100}%`;
      tip.textContent = fmt(pct * dur());
      tip.classList.add('show');
      if (this._dragging) { this._pct = pct; paint(pct); q('[data-np="cur"]').textContent = fmt(pct * dur()); }
    });
    bar.addEventListener('pointerleave', () => tip.classList.remove('show'));
    const release = e => {
      if (!this._dragging) return;
      this._dragging = false;
      const m = Player._activeMedia();
      if (m && dur()) m.currentTime = pctOf(e) * dur();
      bar.releasePointerCapture?.(e.pointerId);
    };
    bar.addEventListener('pointerup', release);
    bar.addEventListener('pointercancel', () => { this._dragging = false; });
    bar.addEventListener('keydown', e => {
      const m = Player._activeMedia();
      if (!m || !m.duration) return;
      const step = e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0;
      if (!step && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      m.currentTime = e.key === 'Home' ? 0 : e.key === 'End' ? m.duration
        : Math.max(0, Math.min(m.duration, m.currentTime + step));
      this._tick();
    });

    /* Onglets */
    this._el.querySelectorAll('.nx-np-tab').forEach(tab => {
      tab.onclick = () => {
        this._tab = tab.dataset.tab;
        this._el.querySelectorAll('.nx-np-tab').forEach(t => t.classList.toggle('active', t === tab));
        this._renderTab();
      };
    });

    /* Échap : fermer la vue, sinon laisser le comportement global */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this._open) { e.stopPropagation(); this.close(); }
    }, true);
  },

  /* ── Rendu de l'état ──────────────────────────────────────────────── */
  _render(state) {
    if (!this._built) return;
    const q = sel => this._el.querySelector(sel);
    const t = state.track;
    if (!t) return;

    q('[data-np="title"]').textContent = t.trackName || '—';
    q('[data-np="artist"]').textContent = t.artistName || '';

    const art = q('[data-np="art"]');
    const bg  = q('[data-np="bg"]');
    const fallback = q('[data-np="artfallback"]');
    if (t.artworkUrl) {
      const hi = t.artworkUrl.replace(/\/hqdefault\.jpg|\/mqdefault\.jpg|\/default\.jpg/, '/maxresdefault.jpg');
      art.src = hi;
      art.onerror = () => { art.src = t.artworkUrl; art.onerror = null; };
      bg.src = t.artworkUrl;
      art.classList.remove('hidden');
      fallback.classList.add('hidden');
    } else {
      art.removeAttribute('src');
      art.classList.add('hidden');
      fallback.classList.remove('hidden');
    }

    /* Source lisible : YouTube, iTunes, Jamendo… */
    const srcMap = { 'youtube-ytdlp': 'YouTube', youtube: 'YouTube', itunes: 'iTunes', jamendo: 'Jamendo', custom: 'NexSon' };
    q('[data-np="source"]').textContent = srcMap[t.source] || (t.source || '');

    q('[data-np="playicon"]').classList.toggle('hidden', state.playing);
    q('[data-np="pauseicon"]').classList.toggle('hidden', !state.playing);

    q('[data-np="shuffle"]').classList.toggle('active', state.shuffle);
    const rep = q('[data-np="repeat"]');
    rep.classList.toggle('active', state.repeat !== 'none');
    q('[data-np="repeatbadge"]').classList.toggle('hidden', state.repeat !== 'one');

    const liked = Store.isLiked(t.trackId);
    q('[data-np="like"]').classList.toggle('active', liked);
    q('[data-np="like"] svg').setAttribute('fill', liked ? 'currentColor' : 'none');

    const vol = q('[data-np="volume"]');
    if (document.activeElement !== vol) vol.value = state.volume;

    q('[data-np="dur"]').textContent = Player._formatTime(state.duration || t.duration || 0);
    q('[data-np="count"]').textContent = `${state.queue.length} titre${state.queue.length > 1 ? 's' : ''}`;

    this._tick();
    this._renderTab();
    this._trackKey = t.trackId;
  },

  /* ── Progression ──────────────────────────────────────────────────── */
  _tick() {
    if (!this._built || !this._open || this._dragging) return;
    const q = sel => this._el.querySelector(sel);
    const m = Player._activeMedia();
    if (!m || !Number.isFinite(m.duration) || !m.duration) return;
    const pct = m.currentTime / m.duration;
    this._pct = pct;
    q('[data-np="fill"]').style.width = `${pct * 100}%`;
    q('[data-np="thumb"]').style.left = `${pct * 100}%`;
    q('[data-np="cur"]').textContent = Player._formatTime(m.currentTime);
    q('[data-np="dur"]').textContent = Player._formatTime(m.duration);
    const bar = q('[data-np="scrub"]');
    bar.setAttribute('aria-valuenow', Math.round(m.currentTime));
    bar.setAttribute('aria-valuemax', Math.round(m.duration));
    if (this._tab === 'lyrics') this._syncLyrics(m.currentTime);
  },

  /* ── Onglets : file d'attente / paroles ───────────────────────────── */
  _renderTab() {
    const body = this._el.querySelector('[data-np="tabbody"]');
    if (this._tab === 'queue') {
      const { queue, queueIdx } = Player;
      body.innerHTML = queue.length
        ? queue.map((t, i) => `
            <button class="nx-np-row ${i === queueIdx ? 'current' : ''}" onclick="Player.playQueueAt(${i})">
              <span class="nx-np-row-num">${i === queueIdx
                ? '<span class="now-playing-bars"><span></span><span></span><span></span></span>'
                : i + 1}</span>
              <span class="nx-np-row-cover">${t.artworkSmall || t.artworkUrl
                ? `<img src="${t.artworkSmall || t.artworkUrl}" alt="" loading="lazy">` : ''}</span>
              <span class="nx-np-row-info">
                <span class="nx-np-row-name">${UI.escape(t.trackName)}</span>
                <span class="nx-np-row-artist">${UI.escape(t.artistName)}</span>
              </span>
              <span class="nx-np-row-dur">${Player._formatTime(t.duration || 0)}</span>
            </button>`).join('')
        : `<p class="nx-np-empty">La file d'attente est vide.</p>`;
      return;
    }
    this._loadLyrics();
  },

  async _loadLyrics() {
    const body = this._el.querySelector('[data-np="tabbody"]');
    const t = Player.currentTrack();
    if (!t) { body.innerHTML = `<p class="nx-np-empty">Aucun titre.</p>`; return; }
    if (this._lyricsKey === t.trackId && this._lines?.length) { this._paintLyrics(); return; }

    body.innerHTML = `<div class="nx-np-empty"><div class="spinner"></div> Chargement des paroles…</div>`;
    this._lyricsKey = t.trackId;
    this._lines = [];
    this._plain = '';

    const res = await API.getLyrics(t.artistName, t.trackName, t.collectionName, t.duration);
    if (this._tab !== 'lyrics') return;
    if (!res) {
      body.innerHTML = `<p class="nx-np-empty">Paroles indisponibles pour ce titre.</p>`;
      return;
    }
    this._plain = res.plain || '';
    this._lines = Lyrics._parseSyncedLyrics(res.synced || '');
    this._paintLyrics();
  },

  _paintLyrics() {
    const body = this._el.querySelector('[data-np="tabbody"]');
    body.innerHTML = this._lines.length
      ? `<div class="nx-np-lyrics">${this._lines.map((l, i) =>
          `<button class="nx-np-line" data-line="${i}" onclick="NowPlaying._seekLine(${i})">${UI.escape(l.text)}</button>`).join('')}</div>`
      : `<div class="nx-np-lyrics nx-np-lyrics-plain">${UI.escape(this._plain)}</div>`;
    this._syncLyrics(Player._activeMedia()?.currentTime || 0);
  },

  _syncLyrics(time) {
    if (!this._lines?.length) return;
    let idx = -1;
    for (let i = 0; i < this._lines.length; i++) {
      if (this._lines[i].time <= time) idx = i; else break;
    }
    const cur = this._el.querySelector('.nx-np-line.active');
    if (cur && Number(cur.dataset.line) === idx) return;
    this._el.querySelectorAll('.nx-np-line.active').forEach(n => n.classList.remove('active'));
    const next = this._el.querySelector(`.nx-np-line[data-line="${idx}"]`);
    if (next) {
      next.classList.add('active');
      next.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  },

  _seekLine(i) {
    const line = this._lines?.[i];
    const m = Player._activeMedia();
    if (line && m) { m.currentTime = line.time; this._tick(); }
  },
};

window.NowPlaying = NowPlaying;

/* ==========================================================================
   Barre de navigation mobile + agrandissement depuis la barre de lecture
   ========================================================================== */
const NexSonChrome = {
  init() {
    this._mobileNav();
    this._expandButtons();
    this._progressTooltip();
    this._brandMark();
  },

  /* ── Navigation basse (mobile) ────────────────────────────────────── */
  _mobileNav() {
    if (document.querySelector('.nx-mobile-nav')) return;
    const nav = document.createElement('nav');
    nav.className = 'nx-mobile-nav';
    nav.setAttribute('aria-label', 'Navigation principale');
    nav.innerHTML = `
      <button data-route="home">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg><span>Accueil</span></button>
      <button data-route="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><span>Rechercher</span></button>
      <button data-route="library">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9"/><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M9 3v6"/></svg><span>Bibliothèque</span></button>
      <button data-route="liked">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span>J'aime</span></button>
      <button data-action="nowplaying">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><span>En lecture</span></button>
    `;
    nav.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        if (btn.dataset.action === 'nowplaying') NowPlaying.open();
        else {
          Router.navigate(btn.dataset.route);
          this.syncMobileNav(btn.dataset.route);
        }
      };
    });
    document.getElementById('app')?.appendChild(nav);
    this._nav = nav;
  },

  syncMobileNav(route) {
    this._nav?.querySelectorAll('button[data-route]').forEach(b =>
      b.classList.toggle('active', b.dataset.route === route));
  },

  /* ── Boutons d'agrandissement dans la barre de lecture ───────────── */
  _expandButtons() {
    const svg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="4 14 4 20 10 20"/><polyline points="20 10 20 4 14 4"/><line x1="4" y1="20" x2="11" y2="13"/><line x1="20" y1="4" x2="13" y2="11"/></svg>`;
    const make = extra => {
      const b = document.createElement('button');
      b.className = `player-btn nx-expand-btn ${extra}`;
      b.title = 'Ouvrir la vue complète';
      b.setAttribute('aria-label', 'Ouvrir la vue complète');
      b.innerHTML = svg;
      b.onclick = () => NowPlaying.open();
      return b;
    };
    const extraWrap = document.querySelector('.player-extra');
    if (extraWrap && !extraWrap.querySelector('.nx-expand-btn')) extraWrap.prepend(make(''));
    const btnWrap = document.querySelector('.player-btns');
    if (btnWrap && !btnWrap.querySelector('.nx-expand-mobile')) btnWrap.appendChild(make('nx-expand-mobile'));

    /* Le visuel et le titre du lecteur ouvrent aussi la vue complète. */
    document.getElementById('player-cover')?.addEventListener('click', () => NowPlaying.open());
    document.getElementById('player-track-name')?.addEventListener('click', () => NowPlaying.open());
  },

  /* ── Infobulle temporelle sur la barre de progression ────────────── */
  _progressTooltip() {
    const bar = document.getElementById('progress-bar');
    if (!bar || bar.querySelector('.nx-tip')) return;
    const tip = document.createElement('span');
    tip.className = 'nx-tip';
    bar.appendChild(tip);
    const dur = () => Player._activeMedia()?.duration || 0;
    bar.addEventListener('pointermove', e => {
      const d = dur();
      if (!d) return;
      const r = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      tip.style.left = `${pct * 100}%`;
      tip.textContent = Player._formatTime(pct * d);
      tip.classList.add('show');
    });
    bar.addEventListener('pointerleave', () => tip.classList.remove('show'));
  },

  /* ── Mark de marque : remplace le glyphe générique par un monogramme ─ */
  _brandMark() {
    document.querySelectorAll('.sidebar-brand svg, .auth-logo svg').forEach(svg => {
      if (svg.dataset.nxBrand) return;
      svg.dataset.nxBrand = '1';
      svg.innerHTML = `
        <defs>
          <linearGradient id="nxa${Math.random().toString(36).slice(2, 7)}" x1="0" y1="0" x2="1" y2="1"></linearGradient>
        </defs>`;
    });
  },
};

/* ── Démarrage : après l'init de l'application ───────────────────────── */
(function () {
  const boot = () => {
    NexSonChrome.init();
    /* Garde la nav mobile synchronisée avec le routeur. */
    const origNavigate = Router.navigate.bind(Router);
    Router.navigate = function (route, params) {
      const r = origNavigate(route, params);
      NexSonChrome.syncMobileNav(route);
      return r;
    };
    NexSonChrome.syncMobileNav(window._currentRoute || 'home');
  };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
