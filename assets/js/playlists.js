/* ============================================
   VIBE – Playlists Module
   ============================================ */

const Playlists = {
  _editingId: null,
  _pendingTrack: null,

  /* ── Save (create or update) ── */
  save() {
    const name       = document.getElementById('playlist-name-input').value.trim();
    const desc       = document.getElementById('playlist-desc-input').value.trim();
    const visibility = document.querySelector('input[name="playlist-visibility"]:checked')?.value || 'private';
    const folderId   = document.getElementById('playlist-folder-input')?.value || '';
    const btn        = document.querySelector('#playlist-modal .btn-primary');

    if (!name) return UI.toast('Donne un nom à ta playlist', 'error');

    if (this._editingId) {
      const editingId = this._editingId;
      Store.updatePlaylist(editingId, { name, description: desc, visibility, folderId });
      UI.toast('Playlist mise à jour', 'success');
      this._editingId = null;
      if (window._currentRoute === `playlist_${editingId}`) Views.renderPlaylist(editingId);
    } else {
      const pl = Store.createPlaylist(name, desc, visibility, folderId);
      UI.toast(`Playlist "${name}" créée !`, 'success');
      // If there's a pending track to add
      if (this._pendingTrack) {
        Store.addToPlaylist(pl.id, this._pendingTrack);
        UI.toast(`"${this._pendingTrack.trackName}" ajouté à "${name}"`, 'success');
        this._pendingTrack = null;
      }
    }

    UI.closeModal('playlist-modal');
    UI.renderSidebarPlaylists();

    // If on library page, refresh
    if (window._currentRoute === 'library') Views.renderLibrary();
  },

  /* ── Show add-to-playlist modal ── */
  showAddToPlaylist(track) {
    this._pendingTrack = track;
    const list = document.getElementById('add-to-playlist-list');
    const playlists = Store.getPlaylists();

    if (!list) return;
    list.innerHTML = playlists.map(pl => `
      <div class="playlist-option" onclick="Playlists.addTrackToPlaylist('${pl.id}')">
        <div class="playlist-option-cover pl-icon-gradient">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </div>
        <div>
          <div class="playlist-option-name">${UI.escape(pl.name)}</div>
          <div class="playlist-option-count">${pl.tracks.length} titre${pl.tracks.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
    `).join('');

    UI.openModal('add-to-playlist-modal');
  },

  /* ── Add track to playlist ── */
  addTrackToPlaylist(playlistId) {
    if (!this._pendingTrack) return;
    const pl = Store.getPlaylist(playlistId);
    if (!pl) return;

    const added = Store.addToPlaylist(playlistId, this._pendingTrack);
    UI.closeModal('add-to-playlist-modal');

    if (added) {
      UI.toast(`Ajouté à "${pl.name}"`, 'success');
    } else {
      UI.toast('Ce titre est déjà dans cette playlist', 'info');
    }
    this._pendingTrack = null;

    // Refresh if viewing that playlist
    if (window._currentRoute === `playlist_${playlistId}`) {
      Views.renderPlaylist(playlistId);
    }
  },

  /* ── Delete playlist ── */
  delete(id) {
    const pl = Store.getPlaylist(id);
    if (!pl) return;
    if (!confirm(`Supprimer la playlist "${pl.name}" ?`)) return;
    Store.deletePlaylist(id);
    UI.toast(`Playlist "${pl.name}" supprimée`, 'info');
    UI.renderSidebarPlaylists();
    if (window._currentRoute === `playlist_${id}`) Router.navigate('library');
    if (window._currentRoute === 'library') Views.renderLibrary();
  },

  /* ── Render gradient cover ── */
  renderCover(playlist, size = 48, className = '') {
    const colors = playlist.colors || PLAYLIST_COLORS[0];
    const gradient = `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
    const firstTrackArt = playlist.tracks[0]?.artworkUrl;

    if (firstTrackArt) {
      return `<img src="${firstTrackArt}" alt="${UI.escape(playlist.name)}" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:6px" class="${className}">`;
    }
    return `<div style="width:${size}px;height:${size}px;border-radius:6px;background:${gradient};display:flex;align-items:center;justify-content:center" class="${className}">
      <svg width="${Math.round(size*0.4)}" height="${Math.round(size*0.4)}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
    </div>`;
  },

  /* ── Get cover for a playlist (CSS gradient string) ── */
  getGradient(playlist) {
    const colors = playlist.colors || PLAYLIST_COLORS[0];
    return `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
  },
};
