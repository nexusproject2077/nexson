/* ============================================
   NexSon – API Module
   Invidious (YouTube, via proxy CORS) → Python local → Jamendo
   Aucune preview 30s — titres complets uniquement
   ============================================ */

const API = {
  _cache: {},

  /* ══════════════════════════════════════════
     HELPER : fetch JSON avec fallback CORS proxies
     Les instances publiques Invidious/Piped bloquent CORS
     depuis les domaines GitHub Pages. On passe par des
     proxies CORS publics (même pattern que _fetchJamendo).
  ══════════════════════════════════════════ */

  async _fetchJSON(url, timeout = 6000) {
    const enc = encodeURIComponent(url);
    const attempts = [
      url,
      `https://corsproxy.io/?url=${enc}`,
      `https://api.allorigins.win/raw?url=${enc}`,
    ];
    for (const u of attempts) {
      try {
        const resp = await fetch(u, { signal: AbortSignal.timeout(timeout) });
        if (!resp.ok) continue;
        return await resp.json();
      } catch (_) {}
    }
    return null;
  },

  /* ══════════════════════════════════════════
     API MUSICALE PERSONNALISÉE
     Schéma accepté (les alias courants sont normalisés) :
     id/trackId, title/trackName, artist/artistName,
     album/collectionName, artwork/image/cover,
     audioUrl/streamUrl/previewUrl/url, duration.
  ══════════════════════════════════════════ */

  _normalizeExternalTrack(t = {}) {
    const artistObj = typeof t.artist === 'object' && t.artist ? t.artist : null;
    const albumObj  = typeof t.album === 'object' && t.album ? t.album : null;

    const rawId = t.trackId ?? t.id ?? t.videoId ?? t.uuid ?? '';
    const title = t.trackName ?? t.title ?? t.name ?? 'Inconnu';
    const artist = t.artistName ?? artistObj?.name ?? t.artist ?? t.author ?? 'Artiste inconnu';
    const album = t.collectionName ?? albumObj?.name ?? t.albumName ?? (typeof t.album === 'string' ? t.album : '') ?? '';

    const artwork =
      t.artworkUrl ?? t.artwork ?? t.image ?? t.cover ??
      albumObj?.image ?? albumObj?.cover ?? '';

    const audio =
      t.previewUrl ?? t.audioUrl ?? t.streamUrl ?? t.audio ?? t.url ?? '';

    const durationRaw = t.duration ?? t.durationSeconds ?? t.lengthSeconds ?? 0;
    const duration = Number(durationRaw) || 0;

    return {
      ...t,
      trackId: rawId ? String(rawId) : `api_${encodeURIComponent(String(artist))}_${encodeURIComponent(String(title))}`,
      trackName: String(title),
      artistName: String(artist),
      collectionName: String(album || ''),
      collectionId: String(t.collectionId ?? albumObj?.id ?? t.albumId ?? ''),
      artworkUrl: String(artwork || ''),
      artworkSmall: String(t.artworkSmall ?? artwork ?? ''),
      previewUrl: String(audio || ''),
      duration,
      genre: String(t.genre ?? ''),
      releaseDate: String(t.releaseDate ?? t.releasedate ?? ''),
      trackNumber: Number(t.trackNumber ?? t.track_position ?? 1) || 1,
      artistId: String(t.artistId ?? artistObj?.id ?? ''),
      source: String(t.source ?? 'custom-api'),
      explicit: Boolean(t.explicit ?? false),
      lyrics: t.lyrics ?? null,
      streamEndpoint: t.streamEndpoint ?? '',
    };
  },

  async _customFetch(path, options = {}) {
    if (!CONFIG.CUSTOM_MUSIC_API_ENABLED || !CONFIG.CUSTOM_MUSIC_API) return null;

    const base = CONFIG.CUSTOM_MUSIC_API.replace(/\/$/, '');
    const url  = `${base}${path.startsWith('/') ? path : '/' + path}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 9000);

    try {
      const resp = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'Accept': 'application/json',
          ...(options.headers || {}),
        },
        signal: controller.signal,
      });

      if (!resp.ok) throw new Error(`Custom API HTTP ${resp.status}`);

      const type = resp.headers.get('content-type') || '';
      if (type.includes('application/json')) return await resp.json();

      return { url: resp.url };
    } finally {
      clearTimeout(timeout);
    }
  },

  async _searchCustom(term, limit = 25) {
    if (!CONFIG.CUSTOM_MUSIC_API_ENABLED || !CONFIG.CUSTOM_MUSIC_API) return [];

    const data = await this._customFetch(
      `/search?q=${encodeURIComponent(term)}&limit=${encodeURIComponent(limit)}`
    );

    const rows =
      Array.isArray(data) ? data :
      Array.isArray(data?.tracks) ? data.tracks :
      Array.isArray(data?.results) ? data.results :
      Array.isArray(data?.data) ? data.data :
      [];

    return rows.map(t => this._normalizeExternalTrack(t));
  },

  async getTrackById(trackId) {
    if (!trackId) return null;

    if (CONFIG.CUSTOM_MUSIC_API_ENABLED && CONFIG.CUSTOM_MUSIC_API) {
      try {
        const data = await this._customFetch(`/tracks/${encodeURIComponent(trackId)}`);
        const row = data?.track ?? data?.data ?? data;
        if (row && typeof row === 'object') return this._normalizeExternalTrack(row);
      } catch (e) {
        console.warn('[NexSon] Custom API track error:', e.message);
      }
    }

    return null;
  },

  async resolveTrackStream(track) {
    if (!track) throw new Error('Titre manquant');
    if (track.previewUrl) return track.previewUrl;

    if (track.invidiousId) {
      return this.resolveInvidiousStream(track.invidiousId, track.invidiousBase);
    }

    if (CONFIG.CUSTOM_MUSIC_API_ENABLED && CONFIG.CUSTOM_MUSIC_API && track.trackId) {
      const base = CONFIG.CUSTOM_MUSIC_API.replace(/\/$/, '');
      const endpoint = track.streamEndpoint || `/tracks/${encodeURIComponent(track.trackId)}/stream`;

      // A stream endpoint is consumed directly by <audio>; do not pre-fetch
      // the media body in JavaScript before giving it to the player.
      if (/^https?:\/\//i.test(endpoint)) return endpoint;
      return `${base}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    }

    throw new Error('Aucun flux audio disponible');
  },

  /* ══════════════════════════════════════════
     INVIDIOUS API — YouTube Music sans backend
     Docs : https://docs.invidious.io/api/
     Les instances publiques ont retiré CORS pour les sites
     externes → on passe par corsproxy.io (déjà utilisé
     pour Jamendo dans _fetchJamendo).
  ══════════════════════════════════════════ */

  INVIDIOUS_INSTANCES: [
    'https://yewtu.be',
    'https://invidious.snopyta.org',
    'https://inv.riverside.rocks',
    'https://invidious.tiekoetter.com',
    'https://invidious.privacyredirect.com',
  ],

  /* ── Search via Invidious + proxy CORS ── */
  async _searchInvidious(term, limit = 25) {
    const fields = 'videoId,title,author,lengthSeconds,videoThumbnails';

    for (const base of this.INVIDIOUS_INSTANCES) {
      const apiUrl = `${base}/api/v1/search?q=${encodeURIComponent(term)}&type=video&fields=${encodeURIComponent(fields)}`;
      try {
        const items = await this._fetchJSON(apiUrl);
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
      } catch (_) {}
    }
    return [];
  },

  /* ── Résoudre l'URL audio (appelé au Play) ──
     fetch() vers Invidious API via proxy CORS → JSON avec adaptiveFormats
     audio.src = url → <audio> ne nécessite pas CORS pour la lecture
  ── */
  async resolveInvidiousStream(videoId, preferredBase = '') {
    const order = preferredBase
      ? [preferredBase, ...this.INVIDIOUS_INSTANCES.filter(b => b !== preferredBase)]
      : this.INVIDIOUS_INSTANCES;

    for (const base of order) {
      const apiUrl = `${base}/api/v1/videos/${encodeURIComponent(videoId)}?fields=adaptiveFormats`;
      try {
        const data = await this._fetchJSON(apiUrl, 9000);
        if (!data) continue;
        const formats = (data.adaptiveFormats || []).filter(f => f.type?.startsWith('audio/'));
        if (!formats.length) continue;

        // Préférer les formats proxy (URL sur le domaine Invidious = pas d'IP binding)
        const hostname = new URL(base).hostname;
        const proxied  = formats.filter(f => f.url?.includes(hostname));
        const pool     = proxied.length > 0 ? proxied : formats;
        const best     = pool.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

        if (best?.url) {
          console.info(`[NexSon] stream: ${best.type} ${best.bitrate}bps [${proxied.length > 0 ? 'proxy ✓' : 'direct'}]`);
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

    // 0) API musicale personnalisée — si activée
    try {
      const custom = await this._searchCustom(term, limit);
      if (custom.length > 0) {
        this._cache[cacheKey] = custom;
        return custom;
      }
    } catch (e) {
      console.warn('[NexSon] Custom API indisponible:', e.message);
    }

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
