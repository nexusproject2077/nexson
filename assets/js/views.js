/* ============================================
   VIBE – Views (Page Renderers)
   ============================================ */

const Views = {

  /* ══════════════════════════════ HOME ══════ */
  async renderHome() {
    const content = document.getElementById('page-content');
    const hour    = new Date().getHours();
    const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
    const user    = Store.getUser();

    content.innerHTML = `
      <div class="home-greeting">
        <h1>${greeting}${user ? ', ' + user.name.split(' ')[0] : ''} !</h1>
        <p>Découvrez de nouvelles musiques et retrouvez vos favoris</p>
      </div>

      <!-- Quick access: recently played -->
      <div id="quick-access-section"></div>

      <!-- Hero Banner -->
      <div class="hero-banner" onclick="Router.navigate('search')">
        <div class="hero-content">
          <div class="hero-tag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          Découverte
        </div>
          <h2 class="hero-title">Millions de titres,<br>100% gratuit</h2>
          <p class="hero-sub">Écoute, explore, partage.</p>
          <button class="btn-primary" style="display:inline-flex;align-items:center;gap:8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Explorer maintenant
          </button>
        </div>
      </div>

      <!-- Sections -->
      <div id="home-top-hits" class="section-block">
        <div class="section-header">
          <span class="section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            Top Hits
          </span>
          <span class="section-see-all" onclick="Search.quick('pop hits')">Voir tout</span>
        </div>
        <div class="loading-state"><div class="spinner"></div><span>Chargement…</span></div>
      </div>

      <div id="home-genres" class="section-block">
        <div class="section-header">
          <span class="section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            Parcourir les genres
          </span>
        </div>
        ${this._renderGenresGrid()}
      </div>

      <div id="home-chill" class="section-block">
        <div class="section-header">
          <span class="section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            Chill Vibes
          </span>
          <span class="section-see-all" onclick="Search.quick('chillout ambient')">Voir tout</span>
        </div>
        <div class="loading-state"><div class="spinner"></div></div>
      </div>

      <div id="home-recent" class="section-block" style="display:none">
        <div class="section-header">
          <span class="section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Récemment écouté
          </span>
        </div>
        <div id="home-recent-list"></div>
      </div>

      <div id="home-afro" class="section-block">
        <div class="section-header">
          <span class="section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-15 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(15 12 12)"/></svg>
            Afrobeats & RnB
          </span>
          <span class="section-see-all" onclick="Search.quick('afrobeats')">Voir tout</span>
        </div>
        <div class="loading-state"><div class="spinner"></div></div>
      </div>

      <div id="home-rap" class="section-block">
        <div class="section-header">
          <span class="section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            Rap & Hip-Hop
          </span>
          <span class="section-see-all" onclick="Search.quick('hip hop')">Voir tout</span>
        </div>
        <div class="loading-state"><div class="spinner"></div></div>
      </div>
    `;

    // Quick access (recent)
    this._renderQuickAccess();

    // Recent played
    this._renderHomeRecent();

    // Load music async
    this._loadHomeSection('home-top-hits', 'top hits', 8);
    this._loadHomeSection('home-chill', 'lofi chill', 8);
    this._loadHomeSection('home-afro', 'afrobeats', 8);
    this._loadHomeSection('home-rap', 'hip hop rap', 8);
  },

  _renderGenresGrid() {
    return `<div class="genres-grid">${
      GENRES.map(g => `
        <div class="genre-card" style="background:linear-gradient(135deg, ${g.color}dd, ${g.color}55)"
             onclick="Search.quick('${g.name}')">
          <span class="genre-card-name">${g.name}</span>
          <span class="genre-icon">${g.icon}</span>
        </div>
      `).join('')
    }</div>`;
  },

  async _loadHomeSection(sectionId, query, limit = 8) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    const tracks = await API.searchSongs(query, limit);
    const spinner = section.querySelector('.loading-state');
    if (spinner) spinner.remove();

    if (!tracks.length) {
      section.querySelector('.section-block, div:last-child').innerHTML =
        '<p style="color:var(--text-muted);padding:20px">Aucun résultat</p>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'cards-grid';
    grid.innerHTML = tracks.map((t, i) => this._renderTrackCard(t, tracks, i)).join('');
    section.appendChild(grid);
  },

  _renderQuickAccess() {
    const recent  = Store.getRecent().slice(0, 6);
    const section = document.getElementById('quick-access-section');
    if (!section || !recent.length) return;

    section.innerHTML = `
      <div class="quick-access" style="margin-bottom:40px">
        ${recent.map(t => `
          <div class="quick-item" onclick="Player.playTrack(${JSON.stringify(t).replace(/"/g, '&quot;')}, ${JSON.stringify(recent).replace(/"/g, '&quot;')}, ${recent.indexOf(t)})">
            <div class="quick-item-cover">
              ${t.artworkUrl
                ? `<img src="${t.artworkUrl}" alt="${UI.escape(t.trackName)}" loading="lazy">`
                : `<div class="quick-item-cover-gradient"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`
              }
            </div>
            <span class="quick-item-name">${UI.escape(t.trackName)}</span>
          </div>
        `).join('')}
      </div>
    `;
  },

  _renderHomeRecent() {
    const recent = Store.getRecent().slice(0, 8);
    const section = document.getElementById('home-recent');
    if (!section || !recent.length) return;
    section.style.display = '';
    const list = document.getElementById('home-recent-list');
    if (list) {
      list.className = 'cards-grid';
      list.innerHTML = recent.map((t, i) => this._renderTrackCard(t, recent, i)).join('');
    }
  },

  /* ══════════════════════════════ SEARCH ══ */
  renderSearch(query = '') {
    const content = document.getElementById('page-content');

    if (!query) {
      content.innerHTML = `
        <h2 style="font-size:28px;font-weight:800;margin-bottom:32px">Parcourir</h2>
        <div class="section-header" style="margin-bottom:16px">
          <span class="section-title" style="font-size:18px">Genres & ambiances</span>
        </div>
        ${this._renderGenresGrid()}
      `;
      return;
    }

    content.innerHTML = `
      <h2 style="font-size:24px;font-weight:800;margin-bottom:32px">
        Résultats pour <span style="color:var(--purple-400)">"${UI.escape(query)}"</span>
      </h2>
      <div id="search-results">
        <div class="loading-state"><div class="spinner"></div><span>Recherche en cours…</span></div>
      </div>
    `;

    this._loadSearchResults(query);
  },

  async _loadSearchResults(query) {
    const container = document.getElementById('search-results');
    if (!container) return;

    const [songs, artists, albums] = await Promise.all([
      API.searchSongs(query, 20),
      API.searchArtists(query, 5),
      API.searchAlbums(query, 6),
    ]);

    container.innerHTML = '';

    // Top result
    const topResult = songs[0] || null;
    if (topResult || artists[0]) {
      const top = artists[0] || null;
      container.innerHTML += `
        <div class="search-grid" style="margin-bottom:40px">
          <div>
            <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">Meilleur résultat</h3>
            ${topResult ? `
              <div class="top-result" onclick="Player.playTrack(${JSON.stringify(topResult).replace(/"/g, '&quot;')})">
                <div class="top-result-cover">
                  <img src="${topResult.artworkUrl}" alt="${UI.escape(topResult.trackName)}" loading="lazy">
                </div>
                <div class="top-result-name">${UI.escape(topResult.trackName)}</div>
                <div class="top-result-type">
                  ${UI.escape(topResult.artistName)} • ${UI.escape(topResult.collectionName)}
                </div>
                <div style="margin-top:16px">
                  <button class="btn-play-large" onclick="event.stopPropagation();Player.playTrack(${JSON.stringify(topResult).replace(/"/g, '&quot;')}, ${JSON.stringify(songs).replace(/"/g, '&quot;')}, 0)">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                </div>
              </div>
            ` : ''}
          </div>
          <div>
            <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">Titres</h3>
            <div class="track-list track-list-compact">
              ${songs.slice(0, 5).map((t, i) => this._renderTrackItem(t, songs, i, false)).join('')}
            </div>
          </div>
        </div>
      `;
    }

    // Artists
    if (artists.length) {
      container.innerHTML += `
        <div class="section-block">
          <h3 style="font-size:20px;font-weight:800;margin-bottom:20px">Artistes</h3>
          <div class="cards-grid">
            ${artists.map(a => `
              <div class="card card-artist" onclick="Router.navigate('artist', {id:${a.artistId}, name:'${UI.escape(a.artistName)}'})">
                <div class="card-cover">
                  <img src="${a.artworkUrl}" alt="${UI.escape(a.artistName)}" loading="lazy" onerror="this.style.display='none'">
                  <div class="card-play-btn" onclick="event.stopPropagation();Search.quick('${UI.escape(a.artistName)}')">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
                <div class="card-title">${UI.escape(a.artistName)}</div>
                <div class="card-subtitle">Artiste</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Albums
    if (albums.length) {
      container.innerHTML += `
        <div class="section-block">
          <h3 style="font-size:20px;font-weight:800;margin-bottom:20px">Albums</h3>
          <div class="cards-grid">
            ${albums.map(a => this._renderAlbumCard(a)).join('')}
          </div>
        </div>
      `;
    }

    // All songs
    if (songs.length > 5) {
      container.innerHTML += `
        <div class="section-block">
          <h3 style="font-size:20px;font-weight:800;margin-bottom:20px">Tous les titres</h3>
          <div class="track-list-header">
            <span>#</span><span>Titre</span><span>Album</span><span>Durée</span><span></span>
          </div>
          <div class="track-list">
            ${songs.map((t, i) => this._renderTrackItem(t, songs, i, true)).join('')}
          </div>
        </div>
      `;
    }

    if (!songs.length && !artists.length && !albums.length) {
      container.innerHTML = `
        <div class="search-empty">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <h3>Aucun résultat pour "${UI.escape(query)}"</h3>
          <p>Vérifie l'orthographe ou essaie d'autres termes</p>
        </div>
      `;
    }
  },

  /* ══════════════════════════════ LIBRARY ══ */
  renderLibrary(tab = 'playlists') {
    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
        <h1 style="font-size:32px;font-weight:900">Bibliothèque</h1>
        <button class="btn-primary" onclick="UI.showCreatePlaylist()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:6px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nouvelle playlist
        </button>
      </div>

      <div class="library-tabs">
        <button class="library-tab ${tab==='playlists'?'active':''}" onclick="Views.renderLibrary('playlists')">Playlists</button>
        <button class="library-tab ${tab==='liked'?'active':''}" onclick="Views.renderLiked()">Titres aimés</button>
        <button class="library-tab ${tab==='albums'?'active':''}" onclick="Views.renderLibrary('albums')">Albums sauvegardés</button>
        <button class="library-tab ${tab==='artists'?'active':''}" onclick="Views.renderLibrary('artists')">Artistes suivis</button>
      </div>

      <div id="library-content"></div>
    `;

    const container = document.getElementById('library-content');

    if (tab === 'playlists') {
      const playlists = Store.getPlaylists();
      if (!playlists.length) {
        container.innerHTML = `
          <div class="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9"/><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M9 3v6"/></svg>
            <h3>Aucune playlist</h3>
            <p>Crée ta première playlist et commence à collecter tes titres préférés</p>
            <button class="btn-primary" style="margin-top:8px" onclick="UI.showCreatePlaylist()">Créer une playlist</button>
          </div>`;
        return;
      }
      container.innerHTML = `
        <div class="cards-grid">
          ${playlists.map(pl => `
            <div class="card" onclick="Router.navigate('playlist', {id:'${pl.id}'})">
              <div class="card-cover" style="background:${Playlists.getGradient(pl)}">
                ${pl.tracks[0]?.artworkUrl
                  ? `<img src="${pl.tracks[0].artworkUrl}" alt="${UI.escape(pl.name)}" loading="lazy" style="mix-blend-mode:overlay">`
                  : `<div class="card-cover-gradient"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`
                }
                <div class="card-play-btn" onclick="event.stopPropagation();Views._playPlaylist('${pl.id}')">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
              <div class="card-title">${UI.escape(pl.name)}</div>
              <div class="card-subtitle">${pl.tracks.length} titre${pl.tracks.length !== 1 ? 's' : ''}</div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (tab === 'albums') {
      const albums = Store.getSavedAlbums();
      if (!albums.length) {
        container.innerHTML = `<div class="empty-state"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg><h3>Aucun album sauvegardé</h3><p>Sauvegarde tes albums préférés ici</p></div>`;
        return;
      }
      container.innerHTML = `<div class="cards-grid">${albums.map(a => this._renderAlbumCard(a)).join('')}</div>`;
    } else if (tab === 'artists') {
      const artists = Store.getFollowed();
      if (!artists.length) {
        container.innerHTML = `<div class="empty-state"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><h3>Aucun artiste suivi</h3><p>Suis tes artistes préférés pour les retrouver ici</p></div>`;
        return;
      }
      container.innerHTML = `
        <div class="cards-grid">
          ${artists.map(a => `
            <div class="card card-artist" onclick="Router.navigate('artist', {id:${a.artistId}, name:'${UI.escape(a.artistName)}'})">
              <div class="card-cover">
                <img src="${a.artworkUrl || `https://source.unsplash.com/200x200/?musician`}" alt="${UI.escape(a.artistName)}" loading="lazy" onerror="this.style.display='none'">
                <div class="card-play-btn" onclick="event.stopPropagation();Search.quick('${UI.escape(a.artistName)}')">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
              <div class="card-title">${UI.escape(a.artistName)}</div>
              <div class="card-subtitle">Artiste</div>
            </div>
          `).join('')}
        </div>`;
    }
  },

  /* ─── Liked Songs ─── */
  renderLiked() {
    window._currentRoute = 'liked';
    const content = document.getElementById('page-content');
    const liked   = Store.getLiked();

    content.innerHTML = `
      <div class="view-header">
        <div class="view-cover">
          <div class="view-cover-gradient" style="background:linear-gradient(135deg,#ec4899,#8b5cf6)">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="white"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </div>
        </div>
        <div class="view-meta">
          <div class="view-type">Playlist</div>
          <div class="view-title">Titres aimés</div>
          <div class="view-stats">${liked.length} titre${liked.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
      ${liked.length ? `
        <div class="view-actions">
          <button class="btn-play-large" onclick="Views._playPlaylistTracks(${JSON.stringify(liked).replace(/"/g, '&quot;')})">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="btn-outline" onclick="Views._shufflePlaylistTracks(${JSON.stringify(liked).replace(/"/g, '&quot;')})">
            <svg width="16" height="16" style="margin-right:6px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/></svg>
            Aléatoire
          </button>
        </div>
        <div class="track-list-header"><span>#</span><span>Titre</span><span>Album</span><span>Durée</span><span></span></div>
        <div class="track-list">
          ${liked.map((t, i) => this._renderTrackItem(t, liked, i, true)).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <h3>Aucun titre aimé</h3>
          <p>Clique sur le cœur sur n'importe quel titre pour l'ajouter ici</p>
        </div>
      `}
    `;
  },

  /* ══════════════════════════════ PLAYLIST ══ */
  async renderPlaylist(id) {
    window._currentRoute = `playlist_${id}`;
    const content  = document.getElementById('page-content');
    const playlist = Store.getPlaylist(id);
    if (!playlist) {
      content.innerHTML = `<div class="empty-state"><h3>Playlist introuvable</h3></div>`;
      return;
    }

    const gradient = Playlists.getGradient(playlist);
    const tracks   = playlist.tracks;

    content.innerHTML = `
      <div class="view-header" style="background:linear-gradient(to bottom,${gradient}22,transparent);margin:-32px -32px 32px;padding:48px 32px 24px">
        <div class="view-cover" style="background:${gradient}">
          ${tracks[0]?.artworkUrl ? `<img src="${tracks[0].artworkUrl}" alt="${UI.escape(playlist.name)}" style="mix-blend-mode:overlay">` : ''}
          <div class="view-cover-gradient" style="background:${gradient};${tracks[0]?.artworkUrl?'display:none':''}">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          </div>
        </div>
        <div class="view-meta">
          <div class="view-type">Playlist</div>
          <div class="view-title">${UI.escape(playlist.name)}</div>
          ${playlist.description ? `<div class="view-description">${UI.escape(playlist.description)}</div>` : ''}
          <div class="view-stats">
            ${tracks.length} titre${tracks.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div class="view-actions">
        ${tracks.length ? `
          <button class="btn-play-large" onclick="Views._playPlaylist('${id}')">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="btn-outline" onclick="Views._shufflePlaylistTracks(${JSON.stringify(tracks).replace(/"/g, '&quot;')})">
            <svg width="16" height="16" style="margin-right:6px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/></svg>
            Aléatoire
          </button>
        ` : ''}
        <button class="btn-outline" onclick="UI.showEditPlaylist('${id}')">Modifier</button>
        <button class="btn-outline" style="color:#f87171;border-color:#f8717155" onclick="Playlists.delete('${id}')">Supprimer</button>
      </div>

      ${tracks.length ? `
        <div class="track-list-header"><span>#</span><span>Titre</span><span>Album</span><span>Durée</span><span></span></div>
        <div class="track-list" id="playlist-track-list">
          ${tracks.map((t, i) => this._renderTrackItem(t, tracks, i, true, id)).join('')}
        </div>
      ` : `
        <div class="empty-state" style="padding:60px 20px">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <h3>Playlist vide</h3>
          <p>Cherche des titres et ajoute-les à cette playlist</p>
          <button class="btn-primary" style="margin-top:8px" onclick="Router.navigate('search')">Chercher de la musique</button>
        </div>
      `}
    `;
  },

  /* ══════════════════════════════ ARTIST ══ */
  async renderArtist(params = {}) {
    const content = document.getElementById('page-content');
    content.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>Chargement de l'artiste…</span></div>`;

    const { id, name } = params;
    const [topTracks, albums] = await Promise.all([
      id ? API.getArtistTopTracks(id) : API.searchSongs(name, 20),
      id ? API.getArtistAlbums(id)    : API.searchAlbums(name, 6),
    ]);

    const artistName    = name || topTracks[0]?.artistName || 'Artiste';
    const artworkUrl    = topTracks[0]?.artworkUrl || '';
    const isFollowing   = Store.isFollowing(id);
    const followedCount = Math.floor(Math.random() * 10000000) + 500000;
    const monthlyCount  = Math.floor(Math.random() * 5000000) + 100000;

    content.innerHTML = `
      <div style="position:relative;margin:-32px -32px 0;height:300px;overflow:hidden">
        <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(139,92,246,0.4),var(--bg-base));z-index:1"></div>
        ${artworkUrl ? `<img src="${artworkUrl}" style="width:100%;height:100%;object-fit:cover;object-position:top;filter:blur(30px) brightness(0.6)" alt="">` : ''}
      </div>
      <div style="margin-top:-180px;position:relative;z-index:2;padding:0 0 32px">
        <div class="view-header" style="padding:0;margin:0 0 32px">
          <div class="view-cover" style="border-radius:50%;overflow:hidden">
            ${artworkUrl
              ? `<img src="${artworkUrl}" alt="${UI.escape(artistName)}" style="border-radius:50%">`
              : `<div class="view-cover-gradient"><svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`
            }
          </div>
          <div class="view-meta">
            <div class="view-type">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="margin-right:4px;color:var(--purple-400)"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              Artiste vérifié
            </div>
            <div class="view-title">${UI.escape(artistName)}</div>
            <div class="view-stats">
              <strong>${(monthlyCount).toLocaleString('fr')}</strong> auditeurs mensuels
            </div>
          </div>
        </div>

        <div class="view-actions">
          <button class="btn-play-large" onclick="Views._playPlaylistTracks(${JSON.stringify(topTracks.slice(0,15)).replace(/"/g, '&quot;')})">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="btn-outline ${isFollowing ? 'following' : ''}" id="follow-btn"
                  onclick="Views._toggleFollow(${id}, '${UI.escape(artistName)}', '${artworkUrl}')">
            ${isFollowing ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px"><polyline points="20 6 9 17 4 12"/></svg> Suivi' : 'Suivre'}
          </button>
        </div>

        ${topTracks.length ? `
          <div class="section-block">
            <h3 style="font-size:20px;font-weight:800;margin-bottom:20px">Titres populaires</h3>
            <div class="track-list">
              ${topTracks.slice(0, 10).map((t, i) => this._renderTrackItem(t, topTracks, i, true)).join('')}
            </div>
          </div>
        ` : ''}

        ${albums.length ? `
          <div class="section-block">
            <h3 style="font-size:20px;font-weight:800;margin-bottom:20px">Albums</h3>
            <div class="cards-grid">
              ${albums.map(a => this._renderAlbumCard(a)).join('')}
            </div>
          </div>
        ` : ''}

        <div class="section-block" id="artist-related">
          <h3 style="font-size:20px;font-weight:800;margin-bottom:20px">Les fans écoutent aussi</h3>
          <div class="loading-state"><div class="spinner"></div></div>
        </div>
      </div>
    `;

    // Load related
    const related = await API.searchSongs(artistName.split(' ')[0], 8);
    const relatedSection = document.getElementById('artist-related');
    if (relatedSection) {
      const spinner = relatedSection.querySelector('.loading-state');
      if (spinner) spinner.remove();
      const grid = document.createElement('div');
      grid.className = 'cards-grid';
      grid.innerHTML = related.map((t, i) => this._renderTrackCard(t, related, i)).join('');
      relatedSection.appendChild(grid);
    }
  },

  _toggleFollow(artistId, artistName, artworkUrl) {
    const artist = { artistId, artistName, artworkUrl };
    const following = Store.toggleFollow(artist);
    const btn = document.getElementById('follow-btn');
    if (btn) {
      btn.innerHTML = following ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px"><polyline points="20 6 9 17 4 12"/></svg> Suivi' : 'Suivre';
      btn.classList.toggle('following', following);
    }
    UI.toast(following ? `Tu suis ${artistName}` : `Tu ne suis plus ${artistName}`, following ? 'success' : 'info');
  },

  /* ══════════════════════════════ ALBUM ══ */
  async renderAlbum(params = {}) {
    const content = document.getElementById('page-content');
    content.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>Chargement de l'album…</span></div>`;

    const { id, name, artist, artwork } = params;
    const tracks  = await API.getAlbumTracks(id);
    const albumInfo = {
      collectionId:   id,
      collectionName: name,
      artistName:     artist,
      artworkUrl:     artwork,
    };
    const isSaved     = Store.isAlbumSaved(id);
    const year        = tracks[0]?.releaseDate ? new Date(tracks[0].releaseDate).getFullYear() : '';
    const totalDur    = tracks.reduce((sum, t) => sum + (t.duration || 30), 0);
    const totalMin    = Math.floor(totalDur / 60);

    content.innerHTML = `
      <div class="view-header">
        <div class="view-cover">
          ${artwork
            ? `<img src="${artwork}" alt="${UI.escape(name)}">`
            : `<div class="view-cover-gradient"><svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></div>`
          }
        </div>
        <div class="view-meta">
          <div class="view-type">Album</div>
          <div class="view-title">${UI.escape(name)}</div>
          <div class="view-description">
            <a onclick="Router.navigate('artist',{id:${tracks[0]?.artistId||0},name:'${UI.escape(artist)}'})" style="font-weight:700;cursor:pointer">${UI.escape(artist)}</a>
            ${year ? ` • ${year}` : ''}
          </div>
          <div class="view-stats">${tracks.length} titres • ${totalMin} min</div>
        </div>
      </div>

      <div class="view-actions">
        ${tracks.length ? `
          <button class="btn-play-large" onclick="Views._playPlaylistTracks(${JSON.stringify(tracks).replace(/"/g, '&quot;')})">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
          </button>
        ` : ''}
        <button class="btn-outline" id="save-album-btn"
                onclick="Views._toggleSaveAlbum(${JSON.stringify(albumInfo).replace(/"/g, '&quot;')})">
          ${isSaved
            ? `<svg width="16" height="16" style="margin-right:6px" viewBox="0 0 24 24" fill="currentColor"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> Sauvegardé`
            : `<svg width="16" height="16" style="margin-right:6px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Sauvegarder`
          }
        </button>
      </div>

      ${tracks.length ? `
        <div class="track-list-header"><span>#</span><span>Titre</span><span>Album</span><span>Durée</span><span></span></div>
        <div class="track-list">
          ${tracks.map((t, i) => this._renderTrackItem(t, tracks, i, true)).join('')}
        </div>
      ` : `<div class="empty-state"><h3>Aucun titre trouvé</h3></div>`}
    `;
  },

  _toggleSaveAlbum(album) {
    const saved = Store.toggleSaveAlbum(album);
    const btn   = document.getElementById('save-album-btn');
    if (btn) {
      btn.innerHTML = saved
        ? `<svg width="16" height="16" style="margin-right:6px" viewBox="0 0 24 24" fill="currentColor"><path d="M9 11l3 3L22 4"/></svg> Sauvegardé`
        : `<svg width="16" height="16" style="margin-right:6px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/></svg> Sauvegarder`;
    }
    UI.toast(saved ? 'Album sauvegardé' : 'Album retiré de la bibliothèque', saved ? 'success' : 'info');
  },

  /* ══════════════════════════════ PROFILE ══ */
  renderProfile() {
    const content = document.getElementById('page-content');
    const user    = Store.getUser();
    if (!user) return;

    const liked    = Store.getLiked().length;
    const pls      = Store.getPlaylists().length;
    const followed = Store.getFollowed().length;
    const recent   = Store.getRecent().length;

    content.innerHTML = `
      <div class="profile-hero">
        <div class="profile-avatar" id="profile-avatar">
          ${user.avatar ? `<img src="${user.avatar}" alt="${UI.escape(user.name)}">` : user.name.charAt(0).toUpperCase()}
        </div>
        <div class="profile-info">
          <div class="profile-type">Profil</div>
          <div class="profile-name">${UI.escape(user.name)}</div>
          <div class="profile-stats">
            <div><strong>${pls}</strong> Playlists</div>
            <div><strong>${liked}</strong> Titres aimés</div>
            <div><strong>${followed}</strong> Artistes suivis</div>
            <div><strong>${recent}</strong> Écoutés</div>
          </div>
        </div>
      </div>

      ${Store.getRecent().length ? `
        <div class="section-block">
          <div class="section-header">
            <span class="section-title">Récemment écouté</span>
          </div>
          <div class="cards-grid">
            ${Store.getRecent().slice(0, 8).map((t, i, arr) => this._renderTrackCard(t, arr, i)).join('')}
          </div>
        </div>
      ` : ''}
    `;
  },

  /* ══════════════════════════════ SETTINGS ══ */
  renderSettings() {
    const content = document.getElementById('page-content');
    const user    = Store.getUser();

    content.innerHTML = `
      <h1 style="font-size:32px;font-weight:900;margin-bottom:32px">Paramètres</h1>

      <div class="settings-card">
        <div class="settings-card-header">Compte</div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Nom d'affichage</div>
            <div class="settings-desc">${UI.escape(user?.name || '')}</div>
          </div>
          <button class="btn-outline" onclick="Views._editProfileName()">Modifier</button>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Email</div>
            <div class="settings-desc">${UI.escape(user?.email || '')}</div>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Compte depuis</div>
            <div class="settings-desc">${user?.joinedAt ? new Date(user.joinedAt).toLocaleDateString('fr-FR', { year:'numeric', month:'long', day:'numeric' }) : 'N/A'}</div>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-header">Lecture</div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Lecture aléatoire</div>
            <div class="settings-desc">Mélanger les titres lors de la lecture</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${Player.shuffle ? 'checked' : ''} onchange="Player.toggleShuffle()">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Répétition</div>
            <div class="settings-desc">Mode actuel : ${{'none':'Désactivée','all':'Tout','one':'Ce titre'}[Player.repeat]}</div>
          </div>
          <button class="btn-outline" onclick="Player.toggleRepeat();Views.renderSettings()">Changer</button>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Qualité audio</div>
            <div class="settings-desc">Titres complets via Jamendo (Creative Commons)</div>
          </div>
          <span style="color:var(--purple-400);font-size:13px;font-weight:600">Standard</span>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-header">Confidentialité</div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Effacer l'historique</div>
            <div class="settings-desc">Supprimer tous les titres récemment écoutés</div>
          </div>
          <button class="btn-outline" style="color:#f87171;border-color:#f8717155" onclick="Views._clearHistory()">Effacer</button>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Réinitialiser les données</div>
            <div class="settings-desc">Supprimer playlists, likes et préférences</div>
          </div>
          <button class="btn-outline" style="color:#f87171;border-color:#f8717155" onclick="Views._resetData()">Réinitialiser</button>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-header">À propos</div>
        <div class="settings-row">
          <div>
            <div class="settings-label">NexSon</div>
            <div class="settings-desc">Version ${CONFIG.VERSION}</div>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Musique fournie par</div>
            <div class="settings-desc">Jamendo (titres complets), Lyrics.ovh</div>
          </div>
        </div>
      </div>

      <button class="btn-outline" style="color:#f87171;border-color:#f8717155;margin-top:8px;width:100%;justify-content:center" onclick="Auth.logout()">
        <svg width="16" height="16" style="margin-right:8px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Se déconnecter
      </button>
    `;
  },

  _editProfileName() {
    const name = prompt('Nouveau nom d\'affichage :', Store.getUser()?.name || '');
    if (name && name.trim()) {
      Auth.updateProfile({ name: name.trim() });
      Views.renderSettings();
      UI.toast('Profil mis à jour', 'success');
    }
  },
  _clearHistory() {
    if (confirm('Effacer tout l\'historique d\'écoute ?')) {
      localStorage.removeItem(Store.KEYS.RECENT);
      UI.toast('Historique effacé', 'info');
      Views.renderSettings();
    }
  },
  _resetData() {
    if (confirm('Réinitialiser toutes tes données ? (Playlists, likes, etc.)')) {
      [Store.KEYS.LIKED, Store.KEYS.PLAYLISTS, Store.KEYS.RECENT, Store.KEYS.SAVED_ALBUMS, Store.KEYS.FOLLOWED].forEach(k => localStorage.removeItem(k));
      UI.renderSidebarPlaylists();
      UI.toast('Données réinitialisées', 'info');
      Views.renderSettings();
    }
  },

  /* ══════════════════════════════ HELPERS ══ */
  _renderTrackCard(track, queue, idx) {
    const dur = API.formatDuration(track.duration);
    const liked = Store.isLiked(track.trackId);
    return `
      <div class="card" onclick="Player.playTrack(${JSON.stringify(track).replace(/"/g, '&quot;')}, ${JSON.stringify(queue).replace(/"/g, '&quot;')}, ${idx})" style="cursor:pointer">
        <div class="card-cover">
          ${track.artworkUrl
            ? `<img src="${track.artworkUrl}" alt="${UI.escape(track.trackName)}" loading="lazy">`
            : `<div class="card-cover-gradient"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`
          }
          <div class="card-play-btn" onclick="event.stopPropagation();Player.playTrack(${JSON.stringify(track).replace(/"/g, '&quot;')}, ${JSON.stringify(queue).replace(/"/g, '&quot;')}, ${idx})">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
        <div class="card-title">${UI.escape(track.trackName)}</div>
        <div class="card-subtitle">${UI.escape(track.artistName)}</div>
      </div>
    `;
  },

  _renderTrackItem(track, queue, idx, showAlbum = true, playlistId = null) {
    const dur   = API.formatDuration(track.duration);
    const liked = Store.isLiked(track.trackId);
    const curr  = Player.currentTrack()?.trackId === track.trackId;
    return `
      <div class="track-item ${curr ? 'playing' : ''}" id="ti-${track.trackId}"
           onclick="Player.playTrack(${JSON.stringify(track).replace(/"/g, '&quot;')}, ${JSON.stringify(queue).replace(/"/g, '&quot;')}, ${idx})"
           oncontextmenu="UI.showContextMenu(event, ${JSON.stringify(track).replace(/"/g, '&quot;')}, ${JSON.stringify(queue).replace(/"/g, '&quot;')}, ${idx}, '${playlistId||''}')">
        <div class="track-num">
          <span class="track-num-text">${curr ? '' : idx + 1}</span>
          ${curr ? `<div class="now-playing-bars"><span></span><span></span><span></span></div>` : ''}
          <div class="track-play-overlay">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
        <div class="track-info-cell">
          <div class="track-cover">
            ${track.artworkUrl
              ? `<img src="${track.artworkSmall || track.artworkUrl}" alt="${UI.escape(track.trackName)}" loading="lazy">`
              : `<div style="width:40px;height:40px;background:var(--bg-hover);border-radius:6px;display:flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><path d="M9 18V5l12-2v13"/></svg></div>`
            }
          </div>
          <div>
            <div class="track-title">${UI.escape(track.trackName)}</div>
            <div class="track-artist" onclick="event.stopPropagation();Router.navigate('artist',{id:${track.artistId||0},name:'${UI.escape(track.artistName)}'})">
              ${UI.escape(track.artistName)}
            </div>
          </div>
        </div>
        ${showAlbum ? `<div class="track-album" onclick="event.stopPropagation();Router.navigate('album',{id:${track.collectionId||0},name:'${UI.escape(track.collectionName)}',artist:'${UI.escape(track.artistName)}',artwork:'${track.artworkUrl}'})">
          ${UI.escape(track.collectionName || '')}
        </div>` : ''}
        <div class="track-duration">${dur}</div>
        <div class="track-actions">
          <button class="track-like-btn ${liked ? 'liked' : ''}" id="like-${track.trackId}"
                  onclick="event.stopPropagation();UI.quickLike(${JSON.stringify(track).replace(/"/g, '&quot;')})">
            <svg width="16" height="16" viewBox="0 0 24 24" ${liked?'fill="currentColor"':'fill="none" stroke="currentColor" stroke-width="2"'}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
          <button class="track-more-btn" onclick="event.stopPropagation();UI.showContextMenu(event, ${JSON.stringify(track).replace(/"/g, '&quot;')}, ${JSON.stringify(queue).replace(/"/g, '&quot;')}, ${idx}, '${playlistId||''}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
          </button>
        </div>
      </div>
    `;
  },

  _renderAlbumCard(album) {
    const year = album.releaseDate ? new Date(album.releaseDate).getFullYear() : '';
    return `
      <div class="card" onclick="Router.navigate('album',{id:${album.collectionId},name:'${UI.escape(album.collectionName)}',artist:'${UI.escape(album.artistName)}',artwork:'${album.artworkUrl}'})">
        <div class="card-cover">
          ${album.artworkUrl
            ? `<img src="${album.artworkUrl}" alt="${UI.escape(album.collectionName)}" loading="lazy">`
            : `<div class="card-cover-gradient"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></div>`
          }
          <div class="card-play-btn" onclick="event.stopPropagation();Router.navigate('album',{id:${album.collectionId},name:'${UI.escape(album.collectionName)}',artist:'${UI.escape(album.artistName)}',artwork:'${album.artworkUrl}'})">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
        <div class="card-title">${UI.escape(album.collectionName)}</div>
        <div class="card-subtitle">${year ? year + ' • ' : ''}${UI.escape(album.artistName)}</div>
      </div>
    `;
  },

  _playPlaylist(id) {
    const pl = Store.getPlaylist(id);
    if (!pl || !pl.tracks.length) return;
    Player.playTrack(pl.tracks[0], pl.tracks, 0);
  },

  _playPlaylistTracks(tracks) {
    if (!tracks || !tracks.length) return;
    Player.playTrack(tracks[0], tracks, 0);
  },

  _shufflePlaylistTracks(tracks) {
    if (!tracks || !tracks.length) return;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    Player.shuffle = true;
    Store.setShuffle(true);
    Player._updateShuffleUI();
    Player.playTrack(shuffled[0], shuffled, 0);
  },
};

/* ─── Lyrics Module ─── */
const Lyrics = {
  async loadForTrack(track) {
    const panel = document.getElementById('lyrics-content');
    if (!panel) return;

    panel.innerHTML = `
      <div class="lyrics-content">
        <div class="lyrics-track-info">
          <div class="lyrics-title">${UI.escape(track.trackName)}</div>
          <div class="lyrics-artist">${UI.escape(track.artistName)}</div>
        </div>
        <div class="lyrics-loading">
          <div class="spinner"></div>
          <span>Chargement des paroles…</span>
        </div>
      </div>
    `;

    const lyrics = await API.getLyrics(track.artistName, track.trackName);

    if (lyrics) {
      panel.innerHTML = `
        <div class="lyrics-content">
          <div class="lyrics-track-info">
            <div class="lyrics-title">${UI.escape(track.trackName)}</div>
            <div class="lyrics-artist">${UI.escape(track.artistName)}</div>
          </div>
          <div class="lyrics-text">${UI.escape(lyrics)}</div>
        </div>
      `;
    } else {
      panel.innerHTML = `
        <div class="lyrics-content">
          <div class="lyrics-track-info">
            <div class="lyrics-title">${UI.escape(track.trackName)}</div>
            <div class="lyrics-artist">${UI.escape(track.artistName)}</div>
          </div>
          <div class="lyrics-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <p>Paroles non disponibles pour ce titre</p>
          </div>
        </div>
      `;
    }
  },
};
