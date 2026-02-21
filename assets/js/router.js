/* ============================================
   NexSon – Router (SPA Navigation)
   ============================================ */

const Router = {
  _history: [],
  _historyIdx: -1,

  /* ── Navigate to a view ── */
  navigate(route, params = {}) {
    UI.setActiveNav(route);
    UI.scrollTop();

    document.getElementById('user-dropdown')?.classList.add('hidden');
    UI.closeContextMenu();

    window._currentRoute = route;
    if (params.id && route === 'playlist') {
      window._currentRoute = `${route}_${params.id}`;
    }

    // Push to history
    const entry = { route, params };
    if (this._historyIdx < this._history.length - 1) {
      this._history = this._history.slice(0, this._historyIdx + 1);
    }
    this._history.push(entry);
    this._historyIdx = this._history.length - 1;
    this._updateNavBtns();

    // Render the view
    this._render(route, params);

    // Update sidebar playlists highlight
    UI.renderSidebarPlaylists();

    // On mobile, close the sidebar after navigation
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth <= 900) {
      sidebar.classList.remove('open');
    }
  },

  /* ── Go back ── */
  back() {
    if (this._historyIdx <= 0) return;
    this._historyIdx--;
    const { route, params } = this._history[this._historyIdx];
    window._currentRoute = route;
    UI.setActiveNav(route);
    UI.scrollTop();
    this._render(route, params);
    this._updateNavBtns();
    UI.renderSidebarPlaylists();
  },

  /* ── Go forward ── */
  forward() {
    if (this._historyIdx >= this._history.length - 1) return;
    this._historyIdx++;
    const { route, params } = this._history[this._historyIdx];
    window._currentRoute = route;
    UI.setActiveNav(route);
    UI.scrollTop();
    this._render(route, params);
    this._updateNavBtns();
    UI.renderSidebarPlaylists();
  },

  /* ── Render view by route ── */
  _render(route, params) {
    switch (route) {
      case 'home':     Views.renderHome();              break;
      case 'search':   Views.renderSearch();            break;
      case 'library':  Views.renderLibrary();           break;
      case 'liked':    Views.renderLiked();             break;
      case 'playlist': Views.renderPlaylist(params.id); break;
      case 'artist':   Views.renderArtist(params);      break;
      case 'album':    Views.renderAlbum(params);       break;
      case 'profile':  Views.renderProfile();           break;
      case 'settings': Views.renderSettings();          break;
      default:         Views.renderHome();
    }
  },

  /* ── Update back/forward buttons ── */
  _updateNavBtns() {
    const back = document.getElementById('btn-back');
    const fwd  = document.getElementById('btn-fwd');
    if (back) back.style.opacity = this._historyIdx <= 0 ? '0.3' : '';
    if (fwd)  fwd.style.opacity  = this._historyIdx >= this._history.length - 1 ? '0.3' : '';
  },
};
