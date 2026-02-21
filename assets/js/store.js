/* ============================================
   VIBE – Store (localStorage persistence)
   ============================================ */

const Store = {
  // Keys
  KEYS: {
    USER:           'nexson_user',
    USERS:          'nexson_users',
    LIKED:          'nexson_liked',
    PLAYLISTS:      'nexson_playlists',
    RECENT:         'nexson_recent',
    QUEUE:          'nexson_queue',
    QUEUE_IDX:      'nexson_queue_idx',
    SHUFFLE:        'nexson_shuffle',
    REPEAT:         'nexson_repeat',
    VOLUME:         'nexson_volume',
    THEME:          'nexson_theme',
    SAVED_ALBUMS:   'nexson_albums',
    FOLLOWED:       'nexson_followed',
  },

  _get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  _set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  },
  _del(key) { localStorage.removeItem(key); },

  /* ── Current User ── */
  getUser()   { return this._get(this.KEYS.USER); },
  setUser(u)  { this._set(this.KEYS.USER, u); },
  clearUser() { this._del(this.KEYS.USER); },

  /* ── All registered users ── */
  getUsers()          { return this._get(this.KEYS.USERS, {}); },
  saveUser(email, u)  {
    const users = this.getUsers();
    users[email.toLowerCase()] = u;
    this._set(this.KEYS.USERS, users);
  },
  findUser(email) {
    const users = this.getUsers();
    return users[email.toLowerCase()] || null;
  },

  /* ── Liked Songs ── */
  getLiked() { return this._get(this.KEYS.LIKED, []); },
  isLiked(trackId) {
    return this.getLiked().some(t => t.trackId === trackId);
  },
  toggleLike(track) {
    let liked = this.getLiked();
    const idx = liked.findIndex(t => t.trackId === track.trackId);
    if (idx === -1) {
      liked.unshift({ ...track, likedAt: Date.now() });
    } else {
      liked.splice(idx, 1);
    }
    this._set(this.KEYS.LIKED, liked);
    return idx === -1; // true if now liked
  },

  /* ── Playlists ── */
  getPlaylists()    { return this._get(this.KEYS.PLAYLISTS, []); },
  savePlaylists(p)  { this._set(this.KEYS.PLAYLISTS, p); },
  getPlaylist(id)   { return this.getPlaylists().find(p => p.id === id) || null; },
  createPlaylist(name, desc = '', visibility = 'private') {
    const playlists = this.getPlaylists();
    const colors = PLAYLIST_COLORS[Math.floor(Math.random() * PLAYLIST_COLORS.length)];
    const pl = {
      id:         'pl_' + Date.now(),
      name,
      description: desc,
      visibility,
      colors,
      tracks:     [],
      createdAt:  Date.now(),
      updatedAt:  Date.now(),
    };
    playlists.unshift(pl);
    this._set(this.KEYS.PLAYLISTS, playlists);
    return pl;
  },
  updatePlaylist(id, updates) {
    const playlists = this.getPlaylists();
    const idx = playlists.findIndex(p => p.id === id);
    if (idx !== -1) {
      playlists[idx] = { ...playlists[idx], ...updates, updatedAt: Date.now() };
      this._set(this.KEYS.PLAYLISTS, playlists);
      return playlists[idx];
    }
    return null;
  },
  deletePlaylist(id) {
    let playlists = this.getPlaylists();
    playlists = playlists.filter(p => p.id !== id);
    this._set(this.KEYS.PLAYLISTS, playlists);
  },
  addToPlaylist(playlistId, track) {
    const playlists = this.getPlaylists();
    const idx = playlists.findIndex(p => p.id === playlistId);
    if (idx === -1) return false;
    const alreadyIn = playlists[idx].tracks.some(t => t.trackId === track.trackId);
    if (!alreadyIn) {
      playlists[idx].tracks.push({ ...track, addedAt: Date.now() });
      playlists[idx].updatedAt = Date.now();
      this._set(this.KEYS.PLAYLISTS, playlists);
    }
    return !alreadyIn;
  },
  removeFromPlaylist(playlistId, trackId) {
    const playlists = this.getPlaylists();
    const idx = playlists.findIndex(p => p.id === playlistId);
    if (idx !== -1) {
      playlists[idx].tracks = playlists[idx].tracks.filter(t => t.trackId !== trackId);
      playlists[idx].updatedAt = Date.now();
      this._set(this.KEYS.PLAYLISTS, playlists);
    }
  },

  /* ── Recent Tracks ── */
  getRecent()          { return this._get(this.KEYS.RECENT, []); },
  addRecent(track) {
    let recent = this.getRecent();
    recent = recent.filter(t => t.trackId !== track.trackId);
    recent.unshift({ ...track, playedAt: Date.now() });
    if (recent.length > 50) recent = recent.slice(0, 50);
    this._set(this.KEYS.RECENT, recent);
  },

  /* ── Saved Albums ── */
  getSavedAlbums()     { return this._get(this.KEYS.SAVED_ALBUMS, []); },
  toggleSaveAlbum(album) {
    let albums = this.getSavedAlbums();
    const idx = albums.findIndex(a => a.collectionId === album.collectionId);
    if (idx === -1) albums.unshift({ ...album, savedAt: Date.now() });
    else albums.splice(idx, 1);
    this._set(this.KEYS.SAVED_ALBUMS, albums);
    return idx === -1;
  },
  isAlbumSaved(id) {
    return this.getSavedAlbums().some(a => a.collectionId === id);
  },

  /* ── Followed Artists ── */
  getFollowed()      { return this._get(this.KEYS.FOLLOWED, []); },
  toggleFollow(artist) {
    let followed = this.getFollowed();
    const idx = followed.findIndex(a => a.artistId === artist.artistId);
    if (idx === -1) followed.unshift({ ...artist, followedAt: Date.now() });
    else followed.splice(idx, 1);
    this._set(this.KEYS.FOLLOWED, followed);
    return idx === -1;
  },
  isFollowing(id) {
    return this.getFollowed().some(a => a.artistId === id);
  },

  /* ── Player Prefs ── */
  getVolume()    { return this._get(this.KEYS.VOLUME, 80); },
  setVolume(v)   { this._set(this.KEYS.VOLUME, v); },
  getShuffle()   { return this._get(this.KEYS.SHUFFLE, false); },
  setShuffle(v)  { this._set(this.KEYS.SHUFFLE, v); },
  getRepeat()    { return this._get(this.KEYS.REPEAT, 'none'); }, // none | one | all
  setRepeat(v)   { this._set(this.KEYS.REPEAT, v); },

  /* ── Queue ── */
  getQueue()     { return this._get(this.KEYS.QUEUE, []); },
  setQueue(q)    { this._set(this.KEYS.QUEUE, q); },
  getQueueIdx()  { return this._get(this.KEYS.QUEUE_IDX, 0); },
  setQueueIdx(i) { this._set(this.KEYS.QUEUE_IDX, i); },
};
