/* ============================================
   NexSon – API Module
   x007 Workers API (full tracks) → Jamendo → iTunes (30s fallback)
   ============================================ */

const API = {
  _cache: {},

  /* ══════════════════════════════════════════
     x007 WORKERS API — Full Track Streams
     https://musicapi.x007.workers.dev/search
  ══════════════════════════════════════════ */

  /* ── Normalize x007 response → internal format ── */
  _normalizeX007(t, engine) {
    // Handle the various field names different engines return
    const audio   = t.url        || t.audio    || t.stream   || t.link
                 || t.download   || t.mp3      || t.media    || '';
    const artwork = t.thumbnail  || t.image    || t.cover    || t.artwork
                 || t.poster     || t.img      || '';
    const title   = t.title      || t.name     || t.song     || t.trackName || 'Inconnu';
    const artist  = t.artist     || t.singer   || t.artistName
                 || t.authors    || t.author   || 'Artiste inconnu';
    const id      = t.id         || t.trackId  || t.song_id  || t.songId || '';

    return {
      trackId:        `x_${engine}_${id || Math.random().toString(36).slice(2)}`,
      trackName:      title,
      artistName:     artist,
      collectionName: t.album || t.albumName || '',
      collectionId:   '',
      artworkUrl:     artwork,
      artworkSmall:   artwork,
      previewUrl:     audio,   // URL directe si disponible dans la réponse search
      x007Id:         id,      // ID pour /fetch si pas d'URL directe
      duration:       t.duration || t.length || 0,
      genre:          t.genre || '',
      releaseDate:    t.year || t.releaseDate || '',
      trackNumber:    1,
      artistId:       '',
      source:         'x007',  // pas de badge 30s
      explicit:       false,
    };
  },

  /* ── x007: resolve stream URL from song ID (called on play) ── */
  async resolveX007Stream(songId) {
    const url = `https://musicapi.x007.workers.dev/fetch?id=${encodeURIComponent(songId)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`x007 fetch HTTP ${resp.status}`);
    const data = await resp.json();
    const stream = data.url || data.stream || data.audio || data.link
                || data.mp3 || data.media || data.download || '';
    if (!stream) throw new Error('x007 /fetch: aucune URL dans la réponse');
    return stream;
  },

  /* ── x007: search across all engines until one returns results ── */
  async _searchX007(term, limit = 25) {
    const engines = ['gaama', 'seevn', 'hunjama', 'mtmusic', 'wunk'];
    for (const engine of engines) {
      try {
        const url = `https://musicapi.x007.workers.dev/search` +
          `?q=${encodeURIComponent(term)}&searchEngine=${engine}`;
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const raw = await resp.json();

        // Response can be an array or { results/data/songs/tracks: [] }
        const items = Array.isArray(raw)
          ? raw
          : (raw.results || raw.data || raw.songs || raw.tracks || raw.items || []);

        const results = items
          .slice(0, limit)
          .map(t => this._normalizeX007(t, engine))
          .filter(t => t.previewUrl || t.x007Id);  // URL directe OU ID à résoudre

        if (results.length > 0) {
          console.info(`[NexSon] x007/${engine}: ${results.length} titres pour "${term}"`);
          return results;
        }
      } catch (_) { /* engine failed, try next */ }
    }
    return [];
  },

  /* ══════════════════════════════════════════
     JAMENDO — Full Track Streams (Free Music)
  ══════════════════════════════════════════ */

  /* ── Normalize Jamendo track → internal format ── */
  _normalizeJamendo(t) {
    // Always build the stream URL from the track ID + registered app key.
    // Using the registered client_id (b6747d04) is required for full-length tracks.
    const streamUrl = `https://mp3l.jamendo.com/?trackid=${t.id}&format=mp32&from=app-b6747d04`;

    return {
      trackId:        'j_' + t.id,
      trackName:      t.name || 'Inconnu',
      artistName:     t.artist_name || 'Artiste inconnu',
      collectionName: t.album_name || '',
      collectionId:   t.album_id ? 'ja_' + t.album_id : '',
      artworkUrl:     t.album_image || t.image || '',
      artworkSmall:   t.image || t.album_image || '',
      previewUrl:     streamUrl,
      duration:       t.duration || 0,
      genre:          t.musicinfo?.tags?.genres?.[0] || '',
      releaseDate:    t.releasedate || '',
      trackNumber:    1,
      artistId:       t.artist_id ? 'j_' + t.artist_id : '',
      source:         'jamendo',
      explicit:       false,
    };
  },

  /* ── Fetch via JSONP — injects a <script> tag, bypasses CORS entirely ── */
  _fetchJSONP(jamendoUrl) {
    return new Promise((resolve, reject) => {
      const id = '_nx_' + Date.now() + '_' + (Math.random() * 1e5 | 0);
      // Replace format=json with format=jsonp + callback param
      const url = jamendoUrl.replace('format=json', `format=jsonp&jsonp=${id}`);
      const script = document.createElement('script');
      script.id = id; script.src = url;
      const timer = setTimeout(() => { cleanup(); reject(new Error('JSONP timeout')); }, 3000);
      const cleanup = () => {
        clearTimeout(timer);
        delete window[id];
        if (script.parentNode) script.remove();
      };
      window[id] = data => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error('JSONP script error')); };
      document.head.appendChild(script);
    });
  },

  /* ── Fetch Jamendo API — tries JSONP first, then CORS proxies as fallback ── */
  async _fetchJamendo(jamendoUrl) {
    // Strategy 1: JSONP — no proxy needed, works from any origin (Jamendo v3 supports it)
    try {
      const data = await this._fetchJSONP(jamendoUrl);
      if (data?.results) return data;
    } catch (_) { /* fall through to proxy */ }

    // Strategy 2: CORS proxies — tried in order
    const enc = encodeURIComponent(jamendoUrl);
    for (const proxy of [
      `https://corsproxy.io/?url=${enc}`,
      `https://api.allorigins.win/raw?url=${enc}`,
    ]) {
      try {
        const r = await fetch(proxy);
        if (!r.ok) continue;
        const d = await r.json();
        if (d?.results) return d;
      } catch (_) { /* try next */ }
    }
    throw new Error('Jamendo inaccessible — JSONP et proxies ont échoué');
  },

  /* ── Main search — x007 → Jamendo → iTunes (toujours des résultats) ── */
  async search(term, limit = 25) {
    const cacheKey = `jsearch_${term}_${limit}`;
    if (this._cache[cacheKey]) return this._cache[cacheKey];

    // 1) x007 Workers API — titres complets, multi-engine
    try {
      const x007 = await this._searchX007(term, limit);
      if (x007.length > 0) {
        this._cache[cacheKey] = x007;
        return x007;
      }
    } catch (_) {}

    // 2) Jamendo — titres complets CC (JSONP puis proxy)
    try {
      const jamendoUrl = `${CONFIG.JAMENDO_API}/tracks/?` +
        `client_id=${CONFIG.JAMENDO_KEY}&format=json` +
        `&search=${encodeURIComponent(term)}&limit=${limit}` +
        `&audioformat=mp32&include=musicinfo&order=popularity_total`;
      const data = await this._fetchJamendo(jamendoUrl);
      const results = (data.results || []).map(t => this._normalizeJamendo(t));
      if (results.length > 0) {
        console.info(`[NexSon] Jamendo: ${results.length} titres pour "${term}"`);
        this._cache[cacheKey] = results;
        return results;
      }
    } catch (e) {
      console.warn(`[NexSon] Jamendo indisponible (${e.message})`);
    }

    // 3) iTunes — filet de sécurité (30s previews)
    const itunes = await this._iTunesFallback(term, limit);
    console.info(`[NexSon] iTunes fallback: ${itunes.length} titres pour "${term}"`);
    if (itunes.length > 0) this._cache[cacheKey] = itunes;
    return itunes;
  },

  /* ── Jamendo: search by tag/genre ── */
  async searchByTag(tag, limit = 25) {
    const cacheKey = `jtag_${tag}_${limit}`;
    if (this._cache[cacheKey]) return this._cache[cacheKey];

    try {
      const jamendoUrl = `${CONFIG.JAMENDO_API}/tracks/?` +
        `client_id=${CONFIG.JAMENDO_KEY}&format=json` +
        `&tags=${encodeURIComponent(tag)}&limit=${limit}` +
        `&audioformat=mp32&include=musicinfo&order=popularity_total`;

      const data = await this._fetchJamendo(jamendoUrl);
      const results = (data.results || []).map(t => this._normalizeJamendo(t));
      if (results.length === 0) return this.search(tag, limit);
      this._cache[cacheKey] = results;
      return results;
    } catch (e) {
      console.error('[NexSon] Jamendo tag error:', e.message);
      return this.search(tag, limit);
    }
  },

  /* ── Jamendo: search artists ── */
  async searchArtists(term, limit = 10) {
    const cacheKey = `jartists_${term}`;
    if (this._cache[cacheKey]) return this._cache[cacheKey];
    try {
      const jamendoUrl = `${CONFIG.JAMENDO_API}/artists/?` +
        `client_id=${CONFIG.JAMENDO_KEY}&format=json` +
        `&namesearch=${encodeURIComponent(term)}&limit=${limit}` +
        `&include=musicinfo`;

      const data = await this._fetchJamendo(jamendoUrl);
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
      const jamendoUrl = `${CONFIG.JAMENDO_API}/tracks/?` +
        `client_id=${CONFIG.JAMENDO_KEY}&format=json` +
        `&artist_id=${jId}&limit=${limit}` +
        `&audioformat=mp32&include=musicinfo&order=popularity_total`;

      const data = await this._fetchJamendo(jamendoUrl);
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
      const jamendoUrl = `${CONFIG.JAMENDO_API}/tracks/?` +
        `client_id=${CONFIG.JAMENDO_KEY}&format=json` +
        `&album_id=${jId}&limit=50&audioformat=mp32&order=track_position`;

      const data = await this._fetchJamendo(jamendoUrl);
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
      const jamendoUrl = `${CONFIG.JAMENDO_API}/albums/?` +
        `client_id=${CONFIG.JAMENDO_KEY}&format=json` +
        `&namesearch=${encodeURIComponent(term)}&limit=${limit}`;

      const data = await this._fetchJamendo(jamendoUrl);
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
      const jamendoUrl = `${CONFIG.JAMENDO_API}/albums/?` +
        `client_id=${CONFIG.JAMENDO_KEY}&format=json` +
        `&artist_id=${jId}&limit=${limit}`;

      const data = await this._fetchJamendo(jamendoUrl);
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
