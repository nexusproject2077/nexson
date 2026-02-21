/* ============================================
   NexSon – API Module
   Jamendo (full tracks) + iTunes (metadata fallback)
   ============================================ */

const API = {
  _cache: {},

  /* ══════════════════════════════════════════
     JAMENDO — Full Track Streams (Free Music)
  ══════════════════════════════════════════ */

  /* ── Normalize Jamendo track → internal format ── */
  _normalizeJamendo(t) {
    return {
      trackId:        'j_' + t.id,
      trackName:      t.name || 'Inconnu',
      artistName:     t.artist_name || 'Artiste inconnu',
      collectionName: t.album_name || '',
      collectionId:   t.album_id ? 'ja_' + t.album_id : '',
      artworkUrl:     t.album_image || t.image || '',
      artworkSmall:   t.image || t.album_image || '',
      previewUrl:     t.audio || null,   // ← FULL stream, not a preview!
      duration:       t.duration || 0,
      genre:          t.musicinfo?.tags?.genres?.[0] || '',
      releaseDate:    t.releasedate || '',
      trackNumber:    1,
      artistId:       t.artist_id ? 'j_' + t.artist_id : '',
      source:         'jamendo',
      explicit:       false,
    };
  },

  /* ── Jamendo: search tracks ── */
  async search(term, limit = 25) {
    const cacheKey = `jsearch_${term}_${limit}`;
    if (this._cache[cacheKey]) return this._cache[cacheKey];

    try {
      const url = `${CONFIG.JAMENDO_API}/tracks/?` +
        `client_id=${CONFIG.JAMENDO_KEY}&format=json` +
        `&search=${encodeURIComponent(term)}&limit=${limit}` +
        `&audioformat=mp32&include=musicinfo&order=popularity_total`;

      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Jamendo error');
      const data = await resp.json();
      const results = (data.results || []).map(t => this._normalizeJamendo(t));
      this._cache[cacheKey] = results;
      return results;
    } catch (e) {
      console.error('Jamendo search error:', e);
      return this._iTunesFallback(term, limit);
    }
  },

  /* ── Jamendo: search by tag/genre ── */
  async searchByTag(tag, limit = 25) {
    const cacheKey = `jtag_${tag}_${limit}`;
    if (this._cache[cacheKey]) return this._cache[cacheKey];

    try {
      const url = `${CONFIG.JAMENDO_API}/tracks/?` +
        `client_id=${CONFIG.JAMENDO_KEY}&format=json` +
        `&tags=${encodeURIComponent(tag)}&limit=${limit}` +
        `&audioformat=mp32&include=musicinfo&order=popularity_total`;

      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Jamendo tag error');
      const data = await resp.json();
      const results = (data.results || []).map(t => this._normalizeJamendo(t));
      if (results.length === 0) return this.search(tag, limit);
      this._cache[cacheKey] = results;
      return results;
    } catch (e) {
      return this.search(tag, limit);
    }
  },

  /* ── Jamendo: search artists ── */
  async searchArtists(term, limit = 10) {
    const cacheKey = `jartists_${term}`;
    if (this._cache[cacheKey]) return this._cache[cacheKey];
    try {
      const url = `${CONFIG.JAMENDO_API}/artists/?` +
        `client_id=${CONFIG.JAMENDO_KEY}&format=json` +
        `&namesearch=${encodeURIComponent(term)}&limit=${limit}` +
        `&include=musicinfo`;

      const resp = await fetch(url);
      const data = await resp.json();
      const results = (data.results || []).map(a => ({
        artistId:   'j_' + a.id,
        artistName: a.name,
        genre:      a.genre || '',
        artworkUrl: a.image || `https://picsum.photos/seed/${encodeURIComponent(a.name)}/300/300`,
        joindate:   a.joindate || '',
      }));
      this._cache[cacheKey] = results;
      return results;
    } catch (e) { return []; }
  },

  /* ── Jamendo: get artist tracks ── */
  async getArtistTopTracks(artistId, limit = 20) {
    const cacheKey = `jartist_top_${artistId}`;
    if (this._cache[cacheKey]) return this._cache[cacheKey];
    try {
      const jId = String(artistId).replace('j_', '');
      const url = `${CONFIG.JAMENDO_API}/tracks/?` +
        `client_id=${CONFIG.JAMENDO_KEY}&format=json` +
        `&artist_id=${jId}&limit=${limit}` +
        `&audioformat=mp32&include=musicinfo&order=popularity_total`;

      const resp = await fetch(url);
      const data = await resp.json();
      const results = (data.results || []).map(t => this._normalizeJamendo(t));
      this._cache[cacheKey] = results;
      return results;
    } catch (e) { return []; }
  },

  /* ── Jamendo: get album tracks ── */
  async getAlbumTracks(albumId) {
    const cacheKey = `jalbum_${albumId}`;
    if (this._cache[cacheKey]) return this._cache[cacheKey];
    try {
      const jId = String(albumId).replace('ja_', '');
      const url = `${CONFIG.JAMENDO_API}/tracks/?` +
        `client_id=${CONFIG.JAMENDO_KEY}&format=json` +
        `&album_id=${jId}&limit=50&audioformat=mp32&order=track_position`;

      const resp = await fetch(url);
      const data = await resp.json();
      const results = (data.results || []).map((t, i) => ({
        ...this._normalizeJamendo(t),
        trackNumber: i + 1,
      }));
      this._cache[cacheKey] = results;
      return results;
    } catch (e) { return []; }
  },

  /* ── Jamendo: search albums ── */
  async searchAlbums(term, limit = 10) {
    const cacheKey = `jalbums_${term}`;
    if (this._cache[cacheKey]) return this._cache[cacheKey];
    try {
      const url = `${CONFIG.JAMENDO_API}/albums/?` +
        `client_id=${CONFIG.JAMENDO_KEY}&format=json` +
        `&namesearch=${encodeURIComponent(term)}&limit=${limit}`;

      const resp = await fetch(url);
      const data = await resp.json();
      const results = (data.results || []).map(a => ({
        collectionId:   'ja_' + a.id,
        collectionName: a.name,
        artistName:     a.artist_name,
        artworkUrl:     a.image || '',
        artworkSmall:   a.image || '',
        trackCount:     a.tracks_count || 0,
        releaseDate:    a.releasedate || '',
        genre:          a.genre || '',
        artistId:       'j_' + a.artist_id,
      }));
      this._cache[cacheKey] = results;
      return results;
    } catch (e) { return []; }
  },

  /* ── Jamendo: get artist albums ── */
  async getArtistAlbums(artistId, limit = 10) {
    const cacheKey = `jartist_albums_${artistId}`;
    if (this._cache[cacheKey]) return this._cache[cacheKey];
    try {
      const jId = String(artistId).replace('j_', '');
      const url = `${CONFIG.JAMENDO_API}/albums/?` +
        `client_id=${CONFIG.JAMENDO_KEY}&format=json` +
        `&artist_id=${jId}&limit=${limit}`;

      const resp = await fetch(url);
      const data = await resp.json();
      const results = (data.results || []).map(a => ({
        collectionId:   'ja_' + a.id,
        collectionName: a.name,
        artistName:     a.artist_name,
        artworkUrl:     a.image || '',
        artworkSmall:   a.image || '',
        trackCount:     a.tracks_count || 0,
        releaseDate:    a.releasedate || '',
        genre:          a.genre || '',
        artistId:       'j_' + a.artist_id,
      }));
      this._cache[cacheKey] = results;
      return results;
    } catch (e) { return []; }
  },

  /* ══════════════════════════════════════════
     PUBLIC API — Called by views/search
  ══════════════════════════════════════════ */

  /* ── Main search (songs) ── */
  async searchSongs(term, limit = 25) {
    return this.search(term, limit);
  },

  /* ── Genre tracks ── */
  async getGenreTracks(genre, limit = 25) {
    return this.searchByTag(genre, limit);
  },

  /* ══════════════════════════════════════════
     ITUNES FALLBACK — Metadata only
  ══════════════════════════════════════════ */

  _normalizeITunes(t) {
    return {
      trackId:        t.trackId || ('i_' + t.trackCensoredName),
      trackName:      t.trackName || t.trackCensoredName || 'Inconnu',
      artistName:     t.artistName || 'Artiste inconnu',
      collectionName: t.collectionName || '',
      collectionId:   t.collectionId,
      artworkUrl:     (t.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
      artworkSmall:   t.artworkUrl100 || '',
      previewUrl:     t.previewUrl || null,
      duration:       t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : 30,
      genre:          t.primaryGenreName || '',
      releaseDate:    t.releaseDate || '',
      trackNumber:    t.trackNumber || 1,
      artistId:       t.artistId,
      source:         'itunes',
      explicit:       t.trackExplicitness === 'explicit',
    };
  },

  async _iTunesFallback(term, limit = 25) {
    const cacheKey = `itunesf_${term}_${limit}`;
    if (this._cache[cacheKey]) return this._cache[cacheKey];
    try {
      const url = `${CONFIG.ITUNES_API}?term=${encodeURIComponent(term)}&media=music&entity=song&limit=${limit}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('iTunes error');
      const data = await resp.json();
      const results = (data.results || []).map(t => this._normalizeITunes(t));
      this._cache[cacheKey] = results;
      return results;
    } catch (e) {
      console.error('iTunes fallback error:', e);
      return [];
    }
  },

  /* ══════════════════════════════════════════
     LYRICS
  ══════════════════════════════════════════ */

  async getLyrics(artist, title) {
    const cacheKey = `lyrics_${artist}_${title}`;
    if (this._cache[cacheKey] !== undefined) return this._cache[cacheKey];
    try {
      const url = `${CONFIG.LYRICS_API}/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
      const resp = await fetch(url);
      if (!resp.ok) { this._cache[cacheKey] = null; return null; }
      const data = await resp.json();
      const lyrics = data.lyrics || null;
      this._cache[cacheKey] = lyrics;
      return lyrics;
    } catch (e) { this._cache[cacheKey] = null; return null; }
  },

  /* ── Utilities ── */
  clearCache() { this._cache = {}; },

  formatDuration(seconds) {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = String(Math.floor(seconds % 60)).padStart(2, '0');
    return `${m}:${s}`;
  },
};
