/* ============================================
   VIBE – UI Module
   ============================================ */

const UI = {
  _activeModals:  [],
  _toastQueue:    [],
  _contextTarget: null,

  /* ── Toast notifications ── */
  toast(msg, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
      success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      error:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${this.escape(msg)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /* ── Modals ── */
  openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove('hidden');
      this._activeModals.push(id);
    }
  },
  closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add('hidden');
      this._activeModals = this._activeModals.filter(m => m !== id);
    }
  },
  closeAllModals() {
    this._activeModals.forEach(id => this.closeModal(id));
  },

  /* ── Create Playlist ── */
  showCreatePlaylist() {
    Playlists._editingId = null;
    Playlists._pendingTrack = null;
    document.getElementById('playlist-modal-title').textContent = 'Créer une playlist';
    document.getElementById('playlist-name-input').value = '';
    document.getElementById('playlist-desc-input').value = '';
    document.querySelector('#playlist-modal .btn-primary').textContent = 'Créer';
    const vis = document.querySelector('input[name="playlist-visibility"][value="private"]');
    if (vis) vis.checked = true;
    this.openModal('playlist-modal');
    setTimeout(() => document.getElementById('playlist-name-input')?.focus(), 100);
  },

  showEditPlaylist(id) {
    const pl = Store.getPlaylist(id);
    if (!pl) return;
    Playlists._editingId = id;
    document.getElementById('playlist-modal-title').textContent = 'Modifier la playlist';
    document.getElementById('playlist-name-input').value = pl.name;
    document.getElementById('playlist-desc-input').value = pl.description || '';
    document.querySelector('#playlist-modal .btn-primary').textContent = 'Enregistrer';
    const vis = document.querySelector(`input[name="playlist-visibility"][value="${pl.visibility}"]`);
    if (vis) vis.checked = true;
    this.openModal('playlist-modal');
    setTimeout(() => document.getElementById('playlist-name-input')?.focus(), 100);
  },

  /* ── Context Menu ── */
  showContextMenu(e, track, queue, idx, playlistId = '') {
    e.preventDefault();
    e.stopPropagation();

    const menu    = document.getElementById('context-menu');
    const list    = document.getElementById('context-menu-list');
    const liked   = Store.isLiked(track.trackId);
    const isInPl  = !!playlistId;

    list.innerHTML = `
      <li><a onclick="UI.closeContextMenu();Player.playTrack(${JSON.stringify(track).replace(/"/g, '&quot;')}, ${JSON.stringify(queue).replace(/"/g, '&quot;')}, ${idx})">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Lire maintenant
      </a></li>
      <li><a onclick="UI.closeContextMenu();Player.addToQueue(${JSON.stringify(track).replace(/"/g, '&quot;')})">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/></svg> Ajouter à la file
      </a></li>
      <li class="context-menu-divider"></li>
      <li><a onclick="UI.closeContextMenu();UI.quickLike(${JSON.stringify(track).replace(/"/g, '&quot;')})">
        <svg width="16" height="16" viewBox="0 0 24 24" ${liked?'fill="#ec4899"':'fill="none" stroke="currentColor" stroke-width="2"'}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        ${liked ? 'Retirer des aimés' : 'Aimer ce titre'}
      </a></li>
      <li><a onclick="UI.closeContextMenu();Playlists.showAddToPlaylist(${JSON.stringify(track).replace(/"/g, '&quot;')})">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Ajouter à une playlist
      </a></li>
      <li class="context-menu-divider"></li>
      <li><a onclick="UI.closeContextMenu();Router.navigate('artist',{id:${track.artistId||0},name:'${UI.escape(track.artistName)}'})">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Voir l'artiste
      </a></li>
      <li><a onclick="UI.closeContextMenu();Router.navigate('album',{id:${track.collectionId||0},name:'${UI.escape(track.collectionName)}',artist:'${UI.escape(track.artistName)}',artwork:'${track.artworkUrl}'})">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg> Voir l'album
      </a></li>
      ${isInPl ? `
        <li class="context-menu-divider"></li>
        <li class="context-danger"><a onclick="UI.closeContextMenu();Store.removeFromPlaylist('${playlistId}','${track.trackId}');Views.renderPlaylist('${playlistId}');UI.toast('Titre retiré de la playlist','info')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          Retirer de la playlist
        </a></li>
      ` : ''}
    `;

    menu.style.display = '';
    menu.classList.remove('hidden');

    // Position
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 300);
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';

    // Close on outside click
    setTimeout(() => document.addEventListener('click', this._closeContextOnClick, { once: true }), 10);
  },

  _closeContextOnClick() { UI.closeContextMenu(); },

  closeContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) menu.classList.add('hidden');
  },

  /* ── Quick like ── */
  quickLike(track) {
    const liked = Store.toggleLike(track);
    const btns  = document.querySelectorAll(`#like-${track.trackId}`);
    btns.forEach(btn => {
      btn.classList.toggle('liked', liked);
      btn.querySelector('svg').setAttribute('fill', liked ? 'currentColor' : 'none');
      btn.querySelector('svg').setAttribute('stroke', liked ? 'none' : 'currentColor');
    });
    // Update player like button
    const playerLike = document.getElementById('player-like-btn');
    if (playerLike && Player.currentTrack()?.trackId === track.trackId) {
      playerLike.classList.toggle('liked', liked);
    }
    UI.toast(liked ? '❤️ Ajouté aux titres aimés' : 'Retiré des titres aimés', liked ? 'success' : 'info');
    if (window._currentRoute === 'liked') Views.renderLiked();
  },

  /* ── Update like buttons after toggle ── */
  updateLikeButtons(trackId, liked) {
    document.querySelectorAll(`#like-${trackId}`).forEach(btn => {
      btn.classList.toggle('liked', liked);
    });
  },

  /* ── Password toggle ── */
  togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  },

  /* ── User menu toggle ── */
  toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
  },

  /* ── Sidebar toggle (mobile) ── */
  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;
    const isOpen = sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active', isOpen);
  },

  /* ── Queue panel ── */
  toggleQueue() {
    const panel  = document.getElementById('queue-panel');
    const lyrics = document.getElementById('lyrics-panel');
    if (!panel) return;
    const isOpen = panel.classList.contains('open');
    // Close lyrics if open
    if (lyrics) lyrics.classList.remove('open');
    panel.classList.toggle('open', !isOpen);
    document.getElementById('queue-btn')?.classList.toggle('active', !isOpen);
    if (!isOpen) this.updateQueuePanel();
  },

  /* ── Lyrics panel ── */
  toggleLyricsPanel() {
    const panel = document.getElementById('lyrics-panel');
    const queue = document.getElementById('queue-panel');
    if (!panel) return;
    const isOpen = panel.classList.contains('open');
    // Close queue if open
    if (queue) queue.classList.remove('open');
    panel.classList.toggle('open', !isOpen);
    document.getElementById('lyrics-btn')?.classList.toggle('active', !isOpen);
    document.getElementById('lyrics-btn-player')?.classList.toggle('active', !isOpen);
  },

  /* ── Update queue display ── */
  updateQueuePanel() {
    const list = document.getElementById('queue-list');
    if (!list) return;
    const { queue, queueIdx } = Player;

    if (!queue.length) {
      list.innerHTML = `
        <div class="lyrics-placeholder">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/></svg>
          <p>La file est vide</p>
        </div>`;
      return;
    }

    list.innerHTML = queue.map((t, i) => `
      <div class="queue-item ${i === queueIdx ? 'current' : ''}" onclick="Player.playQueueAt(${i})">
        <span class="qi-num">
          ${i === queueIdx
            ? `<div class="now-playing-bars" style="justify-content:center"><span></span><span></span><span></span></div>`
            : i + 1
          }
        </span>
        <div class="qi-cover">
          ${t.artworkSmall || t.artworkUrl
            ? `<img src="${t.artworkSmall || t.artworkUrl}" alt="${UI.escape(t.trackName)}" loading="lazy">`
            : ''
          }
        </div>
        <div class="qi-info">
          <div class="qi-name">${UI.escape(t.trackName)}</div>
          <div class="qi-artist">${UI.escape(t.artistName)}</div>
        </div>
      </div>
    `).join('');
  },

  /* ── Render sidebar playlists ── */
  renderSidebarPlaylists() {
    const container = document.getElementById('sidebar-playlists');
    if (!container) return;
    const playlists = Store.getPlaylists();

    if (!playlists.length) {
      container.innerHTML = `
        <div style="padding:12px 14px;color:var(--text-muted);font-size:13px">
          Aucune playlist encore. Crée-en une !
        </div>`;
      return;
    }

    container.innerHTML = playlists.map(pl => `
      <div class="playlist-item-sidebar ${window._currentRoute === 'playlist_' + pl.id ? 'active' : ''}"
           onclick="Router.navigate('playlist',{id:'${pl.id}'})">
        <div class="pl-icon">
          <div style="width:36px;height:36px;border-radius:6px;background:${Playlists.getGradient(pl)};display:flex;align-items:center;justify-content:center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/></svg>
          </div>
        </div>
        <div class="pl-name">
          <div class="pl-name-text">${UI.escape(pl.name)}</div>
          <div class="pl-name-meta">${pl.tracks.length} titre${pl.tracks.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
    `).join('');
  },

  /* ── Toggle notifications (demo) ── */
  toggleNotifications() {
    this.toast('Aucune nouvelle notification', 'info');
  },

  /* ── Escape HTML ── */
  escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /* ── Active nav item ── */
  setActiveNav(route) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.route === route);
    });
  },

  /* ── Scroll to top ── */
  scrollTop() {
    const content = document.getElementById('page-content');
    if (content) content.scrollTop = 0;
  },
};
