/* ============================================
   NexSon – API Module
   Invidious (YouTube) → Python proxy local → Jamendo
   Aucune preview 30s — titres complets uniquement
   ============================================ */

const API = {
  _cache: {},

  /* ══════════════════════════════════════════
     INVIDIOUS API — YouTube sans backend
     CORS activé par défaut sur toutes les instances
     (contrairement à Piped qui a retiré CORS)
     Docs : https://docs.invidious.io/api/
  ══════════════════════════════════════════ */

  INVIDIOUS_INSTANCES: [
    'https://yewtu.be',
    'https://invidious.snopyta.org',
    'https://inv.riverside.rocks',
    'https://invidious.tiekoetter.com',
    'https://yt.artemislena.eu',
  ],

  /* ── Search via Invidious (retourne invidiousId pour résolution lazy) ── */
  async _searchInvidious(term, limit = 25) {
    const fields = 'videoId,title,author,lengthSeconds,videoThumbnails';
    for (const base of this.INVIDIOUS_INSTANCES) {
      try {
        const url = `${base}/api/v1/search?q=${encodeURIComponent(term)}&type=video&fields=${encodeURIComponent(fields)}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) continue;
        const items = await resp.json();
        if (!Array.isArray(items) || items.length === 0) continue;

        const tracks = items.slice(0, limit).map(t => ({
          trackId:        `iv_${t.videoId}`,
          trackName:      t.title || 'Inconnu',
          artistName:     t.author || 'Artiste inconnu',
          collectionName: '',
          collectionId:   '',
          artworkUrl:     t.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`,
          artworkSmall:   `https://i.ytimg.com/vi/${t.videoId}/default.jpg`,
          previewUrl:     '',      // résolu dans playTrack via resolveInvidiousStream
          invidiousId:    t.videoId,
          invidiousBase:  base,
          duration:       t.lengthSeconds || 0,
          genre:          '',
          releaseDate:    '',
          trackNumber:    1,
          artistId:       '',
          source:         'youtube',
          explicit:       false,
        }));

        if (tracks.length > 0) {
          console.info(`[NexSon] Invidious (${base}): ${tracks.length} titres pour "${term}"`);
          return tracks;
        }
      } catch (_) { /* instance KO, essai suivant */ }
    }
    return [];
  },

  /* ── Résoudre l'URL audio via Invidious /api/v1/videos (appelé au Play) ──
     Note : <audio src="url"> n'applique pas CORS — seul fetch() l'exige.
     Invidious fournit CORS sur ses API, et l'audio est joué via l'élément HTML.
  ── */
  async resolveInvidiousStream(videoId, preferredBase = '') {
    const order = preferredBase
      ? [preferredBase, ...this.INVIDIOUS_INSTANCES.filter(b => b !== preferredBase)]
      : this.INVIDIOUS_INSTANCES;

    for (const base of order) {
      try {
        const resp = await fetch(
          `${base}/api/v1/videos/${encodeURIComponent(videoId)}?fields=adaptiveFormats`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!resp.ok) continue;
        const data = await resp.json();
        const formats = (data.adaptiveFormats || []).filter(f => f.type?.startsWith('audio/'));
        if (!formats.length) continue;

        // Préférer les formats proxy (URL sur le domaine Invidious = pas d'IP binding)
        const hostname = new URL(base).hostname;
        const proxied = formats.filter(f => f.url?.includes(hostname));
        const pool    = proxied.length > 0 ? proxied : formats;
        const best    = pool.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

        if (best?.url) {
          console.info(`[NexSon] Invidious stream: ${best.type} ${best.bitrate}bps [${proxied.length > 0 ? 'proxié ✓' : 'direct'}]`);
          return best.url;
        }
      } catch (_) {}
    }
    throw new Error('Invidious: stream audio introuvable sur toutes les instances');
  },

  /* ══════════════════════════════════════════
     YOUTUBE MUSIC — via microservice Python local
     server/music_service.py  (port 5000)
     Utilisé en dev/localhost uniquement
  ══════════════════════════════════════════ */

  async _searchYouTube(term, limit = 25) {
    if (!CONFIG.MUSIC_API) return [];
    const url = `${CONFIG.MUSIC_API}/search?q=${encodeURIComponent(term)}&limit=${limit}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Music service HTTP ${resp.status}`);
    const tracks = await resp.json();
    if (!Array.isArray(tracks) || tracks.length === 0) return [];
    return tracks.map(t => ({
      ...t,
      previewUrl: t.ytVideoId ? `${CONFIG.MUSIC_API}/stream?id=${t.ytVideoId}` : '',
    })).filter(t => t.previewUrl);
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

  /* ── Main search — Invidious → Python local → Jamendo ── */
  async search(term, limit = 25) {
    const cacheKey = `jsearch_${term}_${limit}`;
    if (this._cache[cacheKey]) return this._cache[cacheKey];

    // 1) Invidious API — YouTube, CORS activé, GitHub Pages OK
    try {
      const inv = await this._searchInvidious(term, limit);
      if (inv.length > 0) {
        this._cache[cacheKey] = inv;
        return inv;
      }
    } catch (_) {}

    // 2) Python service local (localhost:5000, dev uniquement)
    try {
      const yt = await this._searchYouTube(term, limit);
      if (yt.length > 0) {
        this._cache[cacheKey] = yt;
        return yt;
      }
    } catch (_) {}

    // 3) Jamendo — titres complets CC (JSONP puis proxy)
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

    console.warn(`[NexSon] Aucun résultat pour "${term}" (Invidious + Jamendo épuisés)`);
    return [];
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
