/* ============================================
   VIBE – Audio Player Module
   ============================================ */

const Player = {
  audio:      null,
  nextAudio:  null,
  video:      null,
  queue:      [],
  queueIdx:   0,
  shuffle:    false,
  repeat:     'none',  // none | one | all
  isPlaying:  false,
  muted:      false,
  _shuffleOrder: [],
  _progressInterval: null,
  _subscribers: new Set(),
  _isSeeking: false,
  _pendingSeek: 0,
  _videoMode: false,
  _audioWasPlayingBeforeVideo: false,
  crossfade: 0,
  _crossfadePrepared: null,
  _crossfadePreparing: false,
  _isCrossfading: false,
  _masterVolume: 0.8,
  audioQuality: 'very-high',
  _audioContext: null,
  _audioNodes: new Map(),
  _eqState: null,
  _spatialTimer: null,

  init() {
    this.audio    = document.getElementById('audio-player');
    this.nextAudio = document.getElementById('audio-crossfade');
    this.video    = document.getElementById('video-player');
    this.shuffle  = Store.getShuffle();
    this.repeat   = Store.getRepeat();
    const vol     = Store.getVolume();
    this.crossfade = this._normalizeCrossfade(Store.getCrossfade());
    this.audioQuality = ['low', 'normal', 'high', 'very-high'].includes(Store.getAudioQuality())
      ? Store.getAudioQuality() : 'very-high';
    this._eqState = Store.getEqualizer() || {
      enabled: true,
      preset: 'flat',
      bands: [0, 0, 0, 0, 0, 0],
      spatial: 'off',
    };
    this._masterVolume = vol / 100;

    // Restore volume
    this.audio.volume = vol / 100;
    if (this.nextAudio) this.nextAudio.volume = vol / 100;
    if (this.video) this.video.volume = vol / 100;
    const slider = document.getElementById('volume-slider');
    if (slider) slider.value = vol;

    // Restore queue
    const savedQ   = Store.getQueue();
    const savedIdx = Store.getQueueIdx();
    if (savedQ.length > 0) {
      this.queue    = savedQ;
      this.queueIdx = savedIdx;
      this._updatePlayerUI(this.queue[this.queueIdx]);
    }

    // Restore shuffle/repeat UI
    this._updateShuffleUI();
    this._updateRepeatUI();

    // Two audio elements let the next title begin before the current one ends.
    this._bindAudioElement(this.audio);
    if (this.nextAudio) this._bindAudioElement(this.nextAudio);

    if (this.video) {
      this.video.addEventListener('timeupdate', () => this._onTimeUpdate(this.video));
      this.video.addEventListener('ended', () => this._onVideoEnded());
      this.video.addEventListener('error', () => this._onError());
      this.video.addEventListener('loadstart', () => this._onLoadStart());
      this.video.addEventListener('canplay', () => this._onCanPlay(this.video));
      this.video.addEventListener('play', () => { this.isPlaying = true; this._updatePlayUI(true); });
      this.video.addEventListener('pause', () => { this.isPlaying = false; this._updatePlayUI(false); this._emitState('pause'); });
      this.video.addEventListener('playing', () => { this._setLoading(false); this._emitState('playing'); });
      this.video.addEventListener('waiting', () => this._setLoading(true));
      this.video.addEventListener('stalled', () => this._setLoading(true));
      this.video.addEventListener('durationchange', () => this._syncMediaPosition());
    }

    this._initMediaSession();

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this._handleKey(e));
  },

  _bindAudioElement(media) {
    const isActive = () => media === this.audio;
    media.addEventListener('timeupdate', () => { if (isActive()) this._onTimeUpdate(media); });
    media.addEventListener('ended', () => { if (isActive()) this._onEnded(); });
    media.addEventListener('error', () => { if (isActive()) this._onError(); });
    media.addEventListener('loadstart', () => { if (isActive()) this._onLoadStart(); });
    media.addEventListener('canplay', () => { if (isActive()) this._onCanPlay(media); });
    media.addEventListener('play', () => {
      if (isActive()) { this.isPlaying = true; this._updatePlayUI(true); }
    });
    media.addEventListener('pause', () => {
      if (isActive() && !this._isCrossfading) {
        this.isPlaying = false;
        this._updatePlayUI(false);
        this._emitState('pause');
      }
    });
    media.addEventListener('playing', () => {
      if (isActive()) { this._setLoading(false); this._emitState('playing'); }
    });
    media.addEventListener('waiting', () => { if (isActive()) this._setLoading(true); });
    media.addEventListener('stalled', () => { if (isActive()) this._setLoading(true); });
    media.addEventListener('durationchange', () => { if (isActive()) this._syncMediaPosition(); });
    media.addEventListener('volumechange', () => { if (isActive()) this._emitState('volumechange'); });
  },

  /* ── Play a track ── */
  async playTrack(track, queue = null, idx = 0) {
    if (!track) return;
    this._resumeAudioEffects();
    if (this._videoMode) this.closeVideo(false);
    this._cancelCrossfade();
    if (queue) {
      this.queue    = queue;
      this.queueIdx = idx;
      Store.setQueue(queue);
    } else if (!this.queue.length) {
      this.queue    = [track];
      this.queueIdx = 0;
      Store.setQueue([track]);
    }
    Store.setQueueIdx(this.queueIdx);

    // ── Résolution lazy du flux audio, quel que soit le fournisseur ──
    if (!track.previewUrl) {
      this._updatePlayerUI(track);
      this._setLoading(true);

      try {
        const streamUrl = await API.resolveTrackStream(track);
        track.previewUrl = streamUrl;

        const qi = this.queue.findIndex(t => t.trackId === track.trackId);
        if (qi >= 0) this.queue[qi].previewUrl = streamUrl;

        Store.setQueue(this.queue);
      } catch (e) {
        this._setLoading(false);
        console.error('[NexSon] Stream resolve failed:', e.message);
        UI.toast('Impossible de charger ce titre — essaie le suivant', 'error');
        return;
      }
    }

    console.info(`[NexSon] Lecture : ${track.trackName} | source: ${track.source} | url: ${track.previewUrl}`);

    this.audio.src = track.previewUrl;
    this.audio.load();
    this.audio.play().catch(err => {
      console.error('[NexSon] Playback error:', err);
      UI.toast('Impossible de lire ce titre — essaie le suivant', 'error');
    });

    Store.addRecent(track);
    this._updatePlayerUI(track);
    this._updateMediaSession(track);
    this._emitState('trackchange');
    UI.updateQueuePanel();
    Lyrics.loadForTrack(track);
    this._buildShuffleOrder();
  },

  /* ── Toggle play/pause ── */
  toggle() {
    const media = this._activeMedia();
    if (!media?.src) return;
    this._resumeAudioEffects();
    if (this.isPlaying) media.pause();
    else media.play();
  },

  /* ── Stop ── */
  stop() {
    if (this._videoMode) this.closeVideo(false);
    this.audio.pause();
    this.audio.src = '';
    this.isPlaying = false;
    this._updatePlayUI(false);
  },

  /* ── Clip vidéo ── */
  async toggleVideo() {
    if (this._videoMode) {
      this.closeVideo(true);
      return;
    }

    const track = this.currentTrack();
    if (!track || !this.video) {
      UI.toast('Lance un titre avant d’ouvrir son clip', 'info');
      return;
    }

    const overlay = document.getElementById('video-overlay');
    const title = document.getElementById('video-track-name');
    const artist = document.getElementById('video-track-artist');
    const startAt = this.audio.currentTime || 0;
    this._audioWasPlayingBeforeVideo = !this.audio.paused;
    this._videoMode = true;
    this.audio.pause();
    this.video.volume = this.audio.volume;
    if (title) title.textContent = track.trackName || 'Clip vidéo';
    if (artist) artist.textContent = track.artistName || '';
    if (overlay) overlay.classList.remove('hidden');
    this._updateVideoUI(true);
    this._setLoading(true);

    try {
      const videoUrl = await API.resolveTrackVideo(track);
      if (!this._videoMode) return;
      this.video.src = videoUrl;
      this.video.load();
      this.video.addEventListener('loadedmetadata', () => {
        if (!this._videoMode) return;
        this.video.currentTime = Math.min(startAt, Math.max(0, (this.video.duration || startAt) - 0.1));
        if (this._audioWasPlayingBeforeVideo) {
          this.video.play().catch(() => UI.toast('Le clip ne peut pas démarrer automatiquement', 'info'));
        }
      }, { once: true });
    } catch (e) {
      console.error('[NexSon] Video resolve failed:', e.message);
      this.closeVideo(true);
      UI.toast('Clip indisponible pour ce titre', 'error');
    }
  },

  closeVideo(resumeAudio = true) {
    if (!this._videoMode) return;
    const position = this.video?.currentTime || this.audio?.currentTime || 0;
    const shouldResume = resumeAudio && (this._audioWasPlayingBeforeVideo || !this.video?.paused);
    this._videoMode = false;
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }
    const overlay = document.getElementById('video-overlay');
    if (overlay) overlay.classList.add('hidden');
    this._updateVideoUI(false);
    if (this.audio) {
      this.audio.currentTime = position;
      if (shouldResume) this.audio.play().catch(() => {});
    }
  },

  _updateVideoUI(active) {
    document.querySelectorAll('[data-video-toggle]').forEach(button => {
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      button.title = active ? 'Revenir à l’audio' : 'Basculer vers le clip';
    });
  },

  _activeMedia() {
    return this._videoMode && this.video ? this.video : this.audio;
  },

  /* ── Audio quality and equalizer ── */
  async setAudioQuality(value) {
    if (!['low', 'normal', 'high', 'very-high'].includes(value)) return;
    this.audioQuality = value;
    Store.setAudioQuality(value);
    const label = document.getElementById('audio-quality-value');
    if (label) label.textContent = { low: 'Basse', normal: 'Normale', high: 'Élevée', 'very-high': 'Très élevée' }[value];

    const track = this.currentTrack();
    if (!track || !this.audio?.src || this._videoMode) return;
    const position = this.audio.currentTime || 0;
    const shouldPlay = !this.audio.paused;
    this._cancelCrossfade();
    try {
      const url = await API.resolveTrackStream(track, true);
      track.previewUrl = url;
      this.audio.src = url;
      this.audio.load();
      this.audio.addEventListener('loadedmetadata', () => {
        this.audio.currentTime = Math.min(position, Math.max(0, (this.audio.duration || position) - 0.1));
        if (shouldPlay) this.audio.play().catch(() => {});
      }, { once: true });
      UI.toast('Qualité audio actualisée', 'success');
    } catch (error) {
      UI.toast('Impossible de changer la qualité maintenant', 'error');
    }
  },

  _resumeAudioEffects() {
    this._ensureAudioEffects();
    if (this._audioContext?.state === 'suspended') this._audioContext.resume().catch(() => {});
  },

  _ensureAudioEffects() {
    if (this._audioContext) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    try {
      this._audioContext = new Context();
      [this.audio, this.nextAudio, this.video].filter(Boolean).forEach(media => this._connectMediaEffects(media));
      this._applyEqualizer();
    } catch (error) {
      console.warn('[NexSon] Equalizer unavailable:', error);
      this._audioContext = null;
    }
  },

  _connectMediaEffects(media) {
    if (!this._audioContext || this._audioNodes.has(media)) return;
    const context = this._audioContext;
    const source = context.createMediaElementSource(media);
    const definitions = [
      ['lowshelf', 60], ['peaking', 150], ['peaking', 400],
      ['peaking', 1000], ['peaking', 2400], ['highshelf', 15000],
    ];
    const filters = definitions.map(([type, frequency]) => {
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = 1;
      return filter;
    });
    const panner = context.createStereoPanner ? context.createStereoPanner() : context.createGain();
    let node = source;
    filters.forEach(filter => { node.connect(filter); node = filter; });
    node.connect(panner);
    panner.connect(context.destination);
    this._audioNodes.set(media, { filters, panner });
  },

  _applyEqualizer() {
    const state = this._eqState;
    if (!state) return;
    this._audioNodes.forEach(({ filters }) => filters.forEach((filter, index) => {
      filter.gain.value = state.enabled ? Number(state.bands[index] || 0) : 0;
    }));
    this._startSpatialEffect();
  },

  setEqualizerBand(index, value) {
    if (!this._eqState || index < 0 || index > 5) return;
    this._eqState.enabled = true;
    this._eqState.preset = 'custom';
    this._eqState.bands[index] = Math.max(-12, Math.min(12, Number(value) || 0));
    Store.setEqualizer(this._eqState);
    this._applyEqualizer();
    const output = document.getElementById(`eq-band-${index}-value`);
    if (output) output.textContent = `${this._eqState.bands[index] > 0 ? '+' : ''}${this._eqState.bands[index]} dB`;
  },

  setEqualizerPreset(preset) {
    const presets = {
      flat: [0, 0, 0, 0, 0, 0],
      bass: [7, 5, 2, 0, -1, -2],
      vocal: [-2, -1, 2, 5, 3, 1],
      rock: [5, 3, -1, 2, 4, 5],
      electronic: [6, 3, 0, 3, 5, 6],
      acoustic: [3, 2, 1, 3, 2, 4],
    };
    if (!presets[preset]) return;
    this._eqState = { ...this._eqState, enabled: true, preset, bands: [...presets[preset]] };
    Store.setEqualizer(this._eqState);
    this._applyEqualizer();
    document.querySelectorAll('[data-eq-band]').forEach(input => {
      const index = Number(input.dataset.eqBand);
      input.value = this._eqState.bands[index];
      const output = document.getElementById(`eq-band-${index}-value`);
      if (output) output.textContent = `${this._eqState.bands[index] > 0 ? '+' : ''}${this._eqState.bands[index]} dB`;
    });
  },

  setSpatialMode(mode) {
    if (!['off', '3d', '8d'].includes(mode)) return;
    this._eqState.spatial = mode;
    Store.setEqualizer(this._eqState);
    this._startSpatialEffect();
  },

  _startSpatialEffect() {
    clearInterval(this._spatialTimer);
    const mode = this._eqState?.spatial || 'off';
    const applyPan = value => this._audioNodes.forEach(({ panner }) => {
      if (panner.pan) panner.pan.value = value;
    });
    if (mode === 'off') return applyPan(0);
    const startedAt = performance.now();
    const speed = mode === '8d' ? 0.65 : 0.22;
    this._spatialTimer = setInterval(() => {
      applyPan(Math.sin((performance.now() - startedAt) / 1000 * Math.PI * 2 * speed));
    }, 40);
  },

  /* ── Next track ── */
  next() {
    if (!this.queue.length) return;
    if (this.shuffle) {
      const curPos = this._shuffleOrder.indexOf(this.queueIdx);
      const nextPos = (curPos + 1) % this._shuffleOrder.length;
      this.queueIdx = this._shuffleOrder[nextPos];
    } else {
      this.queueIdx = (this.queueIdx + 1) % this.queue.length;
    }
    Store.setQueueIdx(this.queueIdx);
    this.playTrack(this.queue[this.queueIdx]);
  },

  /* ── Previous track ── */
  prev() {
    if (!this.queue.length) return;
    // If more than 3 seconds in, restart current track
    const media = this._activeMedia();
    if (media.currentTime > 3) {
      media.currentTime = 0;
      return;
    }
    if (this.shuffle) {
      const curPos = this._shuffleOrder.indexOf(this.queueIdx);
      const prevPos = (curPos - 1 + this._shuffleOrder.length) % this._shuffleOrder.length;
      this.queueIdx = this._shuffleOrder[prevPos];
    } else {
      this.queueIdx = (this.queueIdx - 1 + this.queue.length) % this.queue.length;
    }
    Store.setQueueIdx(this.queueIdx);
    this.playTrack(this.queue[this.queueIdx]);
  },

  /* ── Toggle shuffle ── */
  toggleShuffle() {
    this.shuffle = !this.shuffle;
    Store.setShuffle(this.shuffle);
    this._buildShuffleOrder();
    this._updateShuffleUI();
    UI.toast(this.shuffle ? 'Lecture aléatoire activée' : 'Lecture aléatoire désactivée', 'info');
  },

  /* ── Toggle repeat ── */
  toggleRepeat() {
    const modes = ['none', 'all', 'one'];
    const idx   = modes.indexOf(this.repeat);
    this.repeat  = modes[(idx + 1) % modes.length];
    Store.setRepeat(this.repeat);
    this._updateRepeatUI();
    const labels = { none: 'Répétition désactivée', all: 'Répéter tout', one: 'Répéter ce titre' };
    UI.toast(labels[this.repeat], 'info');
  },

  /* ── Like current track ── */
  toggleLike() {
    const track = this.queue[this.queueIdx];
    if (!track) return;
    const liked = Store.toggleLike(track);
    const btn   = document.getElementById('player-like-btn');
    if (btn) btn.classList.toggle('liked', liked);
    UI.toast(liked ? 'Ajouté aux titres aimés' : 'Retiré des titres aimés', liked ? 'success' : 'info');
    // Also update in track list if visible
    UI.updateLikeButtons(track.trackId, liked);
    // Refresh sidebar playlists if on liked view
    if (window._currentRoute === 'liked') Views.renderLiked();
  },

  /* ── Seek — pointer, touch and keyboard accessible ── */
  _seekPercentFromPointer(e) {
    const bar  = document.getElementById('progress-bar');
    if (!bar || !this._activeMedia()?.duration) return null;
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  },

  _previewSeek(pct) {
    const fill = document.getElementById('progress-fill');
    const thumb = document.getElementById('progress-thumb');
    if (fill) fill.style.width = `${pct * 100}%`;
    if (thumb) thumb.style.left = `${pct * 100}%`;
  },

  beginSeek(e) {
    const pct = this._seekPercentFromPointer(e);
    if (pct === null) return;
    e.preventDefault();
    this._isSeeking = true;
    this._pendingSeek = pct;
    e.currentTarget?.setPointerCapture?.(e.pointerId);
    this._previewSeek(pct);
  },

  moveSeek(e) {
    if (!this._isSeeking) return;
    const pct = this._seekPercentFromPointer(e);
    if (pct === null) return;
    this._pendingSeek = pct;
    this._previewSeek(pct);
  },

  endSeek(e) {
    if (!this._isSeeking) return;
    const pct = this._seekPercentFromPointer(e);
    const finalPct = pct === null ? this._pendingSeek : pct;
    this._isSeeking = false;
    const media = this._activeMedia();
    media.currentTime = finalPct * media.duration;
    e.currentTarget?.releasePointerCapture?.(e.pointerId);
  },

  cancelSeek() {
    this._isSeeking = false;
  },

  seekWithKeyboard(e) {
    const media = this._activeMedia();
    if (!media?.duration) return;
    const direction = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 :
      e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!direction && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? media.duration :
      Math.max(0, Math.min(media.duration, media.currentTime + direction * 5));
    media.currentTime = next;
  },

  /* ── Volume ── */
  setVolume(val) {
    const v = parseInt(val);
    this._masterVolume = v / 100;
    this.audio.volume = this._masterVolume;
    if (this.nextAudio) this.nextAudio.volume = this._masterVolume;
    if (this.video) this.video.volume = v / 100;
    Store.setVolume(v);
    this.muted = v === 0;
    this._updateVolumeIcon(v);
  },

  toggleMute() {
    if (this.muted) {
      const v = Store.getVolume() || 80;
      this._masterVolume = v / 100;
      this.audio.volume = this._masterVolume;
      if (this.nextAudio) this.nextAudio.volume = this._masterVolume;
      if (this.video) this.video.volume = v / 100;
      const slider = document.getElementById('volume-slider');
      if (slider) slider.value = v;
      this.muted = false;
      this._updateVolumeIcon(v);
    } else {
      this._masterVolume = 0;
      this.audio.volume = 0;
      if (this.nextAudio) this.nextAudio.volume = 0;
      if (this.video) this.video.volume = 0;
      const slider = document.getElementById('volume-slider');
      if (slider) slider.value = 0;
      this.muted = true;
      this._updateVolumeIcon(0);
    }
  },

  /* ── Crossfade ── */
  _normalizeCrossfade(value) {
    return Math.max(0, Math.min(12, Number(value) || 0));
  },

  setCrossfade(value) {
    this.crossfade = this._normalizeCrossfade(value);
    Store.setCrossfade(this.crossfade);
    if (!this.crossfade) this._cancelCrossfade();
    const output = document.getElementById('crossfade-value');
    if (output) output.textContent = this.crossfade ? `${this.crossfade} s` : 'Désactivé';
  },

  _nextQueueIndex() {
    if (!this.queue.length || this.repeat === 'one') return null;
    if (this.shuffle) {
      const current = this._shuffleOrder.indexOf(this.queueIdx);
      if (current < 0 || !this._shuffleOrder.length) return null;
      const next = current + 1;
      if (next >= this._shuffleOrder.length && this.repeat !== 'all') return null;
      return this._shuffleOrder[next % this._shuffleOrder.length];
    }
    if (this.queueIdx < this.queue.length - 1) return this.queueIdx + 1;
    return this.repeat === 'all' ? 0 : null;
  },

  async _prepareCrossfade() {
    if (this._crossfadePrepared || this._crossfadePreparing || !this.crossfade || this._videoMode) return;
    const nextIdx = this._nextQueueIndex();
    if (nextIdx === null || !this.nextAudio) return;
    const source = this.audio;
    const sourceIdx = this.queueIdx;
    const track = this.queue[nextIdx];
    if (!track) return;

    this._crossfadePreparing = true;
    try {
      const url = track.previewUrl || await API.resolveTrackStream(track);
      if (source !== this.audio || sourceIdx !== this.queueIdx) return;
      track.previewUrl = url;
      this.nextAudio.pause();
      this.nextAudio.src = url;
      this.nextAudio.preload = 'auto';
      this.nextAudio.load();
      this._crossfadePrepared = { idx: nextIdx, track };
    } catch (e) {
      console.warn('[NexSon] Crossfade preload failed:', e.message);
    } finally {
      this._crossfadePreparing = false;
    }
  },

  _startCrossfade() {
    const prepared = this._crossfadePrepared;
    if (!prepared || this._isCrossfading || !this.nextAudio || this.nextAudio.readyState < 2) return;
    this._isCrossfading = true;
    this.nextAudio.currentTime = 0;
    this.nextAudio.volume = 0;
    this.nextAudio.play().catch(() => { this._isCrossfading = false; });
    this.queueIdx = prepared.idx;
    Store.setQueueIdx(this.queueIdx);
    Store.addRecent(prepared.track);
    this._updatePlayerUI(prepared.track);
    this._updateMediaSession(prepared.track);
    Lyrics.loadForTrack(prepared.track);
    UI.updateQueuePanel();
  },

  _updateCrossfade() {
    if (!this._isCrossfading || !this.nextAudio || !this.crossfade) return;
    const remaining = Math.max(0, (this.audio.duration || 0) - this.audio.currentTime);
    const progress = Math.max(0, Math.min(1, 1 - (remaining / this.crossfade)));
    this.audio.volume = this._masterVolume * (1 - progress);
    this.nextAudio.volume = this._masterVolume * progress;
    if (progress >= 0.999) this._finishCrossfade();
  },

  _finishCrossfade() {
    if (!this._isCrossfading || !this.nextAudio) return;
    const outgoing = this.audio;
    this.audio = this.nextAudio;
    this.nextAudio = outgoing;
    this._isCrossfading = false;
    this._crossfadePrepared = null;
    outgoing.pause();
    outgoing.removeAttribute('src');
    outgoing.load();
    this.audio.volume = this._masterVolume;
    this._onTimeUpdate(this.audio);
    this._emitState('trackchange');
  },

  _cancelCrossfade() {
    this._crossfadePrepared = null;
    this._crossfadePreparing = false;
    if (this.nextAudio) {
      this.nextAudio.pause();
      this.nextAudio.removeAttribute('src');
      this.nextAudio.load();
      this.nextAudio.volume = this._masterVolume;
    }
    if (this.audio) this.audio.volume = this._masterVolume;
    this._isCrossfading = false;
  },

  /* ── Play from queue at index ── */
  playQueueAt(idx) {
    this.queueIdx = idx;
    Store.setQueueIdx(idx);
    this.playTrack(this.queue[idx]);
  },

  /* ── Add to queue ── */
  addToQueue(track) {
    this.queue.push(track);
    Store.setQueue(this.queue);
    this._buildShuffleOrder();
    UI.updateQueuePanel();
    UI.toast(`"${track.trackName}" ajouté à la file`, 'success');
  },

  /* ── Remove from queue ── */
  removeFromQueue(idx) {
    if (idx === this.queueIdx) return;
    this.queue.splice(idx, 1);
    if (idx < this.queueIdx) this.queueIdx--;
    Store.setQueue(this.queue);
    Store.setQueueIdx(this.queueIdx);
    this._buildShuffleOrder();
    UI.updateQueuePanel();
  },

  /* ── Get current track ── */
  currentTrack() {
    return this.queue[this.queueIdx] || null;
  },

  /* ── Public player state — useful for any future API/UI integration ── */
  getState() {
    const media = this._activeMedia();
    return {
      track: this.currentTrack(),
      queue: [...this.queue],
      queueIndex: this.queueIdx,
      playing: this.isPlaying,
      loading: document.getElementById('play-pause-btn')?.classList.contains('loading') || false,
      currentTime: media?.currentTime || 0,
      duration: Number.isFinite(media?.duration) ? media.duration : 0,
      volume: media ? Math.round(media.volume * 100) : 0,
      muted: this.muted,
      videoMode: this._videoMode,
      shuffle: this.shuffle,
      repeat: this.repeat,
    };
  },

  subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    this._subscribers.add(callback);
    callback(this.getState(), 'subscribe');
    return () => this._subscribers.delete(callback);
  },

  _emitState(reason = 'change') {
    if (!this._subscribers.size) return;
    const state = this.getState();
    this._subscribers.forEach(fn => {
      try { fn(state, reason); } catch (e) { console.warn('[NexSon] Player subscriber error:', e); }
    });
  },

  _setLoading(loading) {
    const btn = document.getElementById('play-pause-btn');
    if (btn) btn.classList.toggle('loading', Boolean(loading));
  },

  _initMediaSession() {
    if (!('mediaSession' in navigator)) return;

    const safeSet = (action, handler) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) {}
    };

    safeSet('play', () => this._activeMedia()?.play());
    safeSet('pause', () => this._activeMedia()?.pause());
    safeSet('previoustrack', () => this.prev());
    safeSet('nexttrack', () => this.next());
    safeSet('seekbackward', details => {
      const media = this._activeMedia();
      if (!media) return;
      const step = details.seekOffset || 10;
      media.currentTime = Math.max(0, media.currentTime - step);
    });
    safeSet('seekforward', details => {
      const media = this._activeMedia();
      if (!media) return;
      const step = details.seekOffset || 10;
      const duration = Number.isFinite(media.duration) ? media.duration : Infinity;
      media.currentTime = Math.min(duration, media.currentTime + step);
    });
    safeSet('seekto', details => {
      const media = this._activeMedia();
      if (!media || typeof details.seekTime !== 'number') return;
      media.currentTime = details.seekTime;
    });
  },

  _updateMediaSession(track) {
    if (!('mediaSession' in navigator) || !track || !('MediaMetadata' in window)) return;

    const artwork = track.artworkUrl
      ? [{ src: track.artworkUrl, sizes: '512x512', type: 'image/jpeg' }]
      : [];

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.trackName || 'NexSon',
        artist: track.artistName || '',
        album: track.collectionName || '',
        artwork,
      });
      navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
    } catch (_) {}
  },

  _syncMediaPosition() {
    const media = this._activeMedia();
    if (!('mediaSession' in navigator) || !media) return;
    const duration = media.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;

    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: media.playbackRate || 1,
        position: Math.min(media.currentTime || 0, duration),
      });
    } catch (_) {}
  },

  /* ── Private: Audio events ── */
  _onTimeUpdate(media = this._activeMedia()) {
    if (!media) return;
    const { currentTime, duration } = media;
    if (!duration) return;
    if (media === this.audio && !this._videoMode && this.crossfade > 0) {
      const remaining = duration - currentTime;
      if (remaining <= this.crossfade + 8) this._prepareCrossfade();
      if (remaining <= this.crossfade) this._startCrossfade();
      this._updateCrossfade();
    }
    const pct = (currentTime / duration) * 100;

    const fill  = document.getElementById('progress-fill');
    const thumb = document.getElementById('progress-thumb');
    const cur   = document.getElementById('current-time');
    if (!this._isSeeking) {
      if (fill)  fill.style.width  = pct + '%';
      if (thumb) thumb.style.left  = pct + '%';
    }
    if (cur)   cur.textContent   = this._formatTime(currentTime);

    const total = document.getElementById('total-time');
    if (total && duration) total.textContent = this._formatTime(duration);
    const bar = document.getElementById('progress-bar');
    if (bar) {
      bar.setAttribute('aria-valuemax', String(Math.round(duration)));
      bar.setAttribute('aria-valuenow', String(Math.round(currentTime)));
      bar.setAttribute('aria-valuetext', `${this._formatTime(currentTime)} sur ${this._formatTime(duration)}`);
    }

    this._syncMediaPosition();
    Lyrics.sync(currentTime);
    this._emitState('timeupdate');
  },

  _onEnded() {
    if (this._isCrossfading) {
      this._finishCrossfade();
      return;
    }
    const media = this._activeMedia();
    if (this.repeat === 'one') {
      media.currentTime = 0;
      media.play();
    } else if (this.repeat === 'all' || this.queueIdx < this.queue.length - 1) {
      this.next();
    } else {
      this.isPlaying = false;
      this._updatePlayUI(false);
    }
  },

  _onVideoEnded() {
    this.closeVideo(false);
    this._onEnded();
  },

  _onError() {
    UI.toast('Erreur lors de la lecture', 'error');
    this._updatePlayUI(false);
  },

  _onLoadStart() {
    const btn = document.getElementById('play-pause-btn');
    if (btn) btn.style.opacity = '0.7';
    this._setLoading(true);
    this._emitState('loadstart');
  },

  _onCanPlay(media = this._activeMedia()) {
    const btn = document.getElementById('play-pause-btn');
    if (btn) btn.style.opacity = '';
    this._setLoading(false);
    const total = document.getElementById('total-time');
    if (total && media?.duration) total.textContent = this._formatTime(media.duration);
    this._syncMediaPosition();
    this._emitState('canplay');
  },

  /* ── Private: UI Updates ── */
  _updatePlayerUI(track) {
    if (!track) return;

    const nameEl   = document.getElementById('player-track-name');
    const artistEl = document.getElementById('player-track-artist');
    const coverEl  = document.getElementById('player-cover');
    const likeBtn  = document.getElementById('player-like-btn');

    if (nameEl) {
      // Show "30s" badge for iTunes preview tracks
      const badge = track.source === 'itunes'
        ? '<span style="font-size:10px;background:rgba(255,255,255,.15);border-radius:4px;padding:1px 5px;margin-left:6px;vertical-align:middle;">30s</span>'
        : '';
      const safeName = track.trackName.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      nameEl.innerHTML = safeName + badge;
    }
    if (artistEl) {
      artistEl.textContent = track.artistName;
      artistEl.onclick = () => Router.navigate('artist', { id: track.artistId, name: track.artistName });
    }
    if (coverEl) {
      if (track.artworkUrl) {
        coverEl.innerHTML = `<img src="${track.artworkUrl}" alt="${track.trackName}" loading="lazy">`;
      } else {
        coverEl.innerHTML = `<div class="cover-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`;
      }
    }

    // Like status
    if (likeBtn) likeBtn.classList.toggle('liked', Store.isLiked(track.trackId));

    // Update page title
    document.title = `${track.trackName} – ${track.artistName} | NexSon`;
  },

  _updatePlayUI(playing) {
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch (_) {}
    }

    const playIcon  = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');
    if (playIcon)  playIcon.classList.toggle('hidden', playing);
    if (pauseIcon) pauseIcon.classList.toggle('hidden', !playing);
  },

  _updateShuffleUI() {
    const btn = document.getElementById('shuffle-btn');
    if (btn) btn.classList.toggle('active', this.shuffle);
  },

  _updateRepeatUI() {
    const btn      = document.getElementById('repeat-btn');
    const iconNone = document.getElementById('repeat-icon-none');
    const iconOne  = document.getElementById('repeat-icon-one');
    if (btn) btn.classList.toggle('active', this.repeat !== 'none');
    if (iconNone) iconNone.classList.toggle('hidden', this.repeat === 'one');
    if (iconOne)  iconOne.classList.toggle('hidden', this.repeat !== 'one');
  },

  _updateVolumeIcon(val) {
    const high = document.getElementById('vol-high');
    const mute = document.getElementById('vol-mute');
    if (high) high.classList.toggle('hidden', val == 0);
    if (mute) mute.classList.toggle('hidden', val != 0);
  },

  /* ── Shuffle order ── */
  _buildShuffleOrder() {
    this._shuffleOrder = Array.from({ length: this.queue.length }, (_, i) => i);
    if (this.shuffle) {
      for (let i = this._shuffleOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this._shuffleOrder[i], this._shuffleOrder[j]] = [this._shuffleOrder[j], this._shuffleOrder[i]];
      }
    }
  },

  /* ── Format time ── */
  _formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = String(Math.floor(seconds % 60)).padStart(2, '0');
    return `${m}:${s}`;
  },

  /* ── Keyboard shortcuts ── */
  _handleKey(e) {
    // Skip if typing in an input
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.target.isContentEditable) return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        this.toggle();
        break;
      case 'ArrowRight':
        if (e.altKey) { e.preventDefault(); this.next(); }
        else if (e.shiftKey) {
          const media = this._activeMedia();
          if (media?.duration) { e.preventDefault(); media.currentTime = Math.min(media.duration, media.currentTime + 10); }
        }
        break;
      case 'ArrowLeft':
        if (e.altKey) { e.preventDefault(); this.prev(); }
        else if (e.shiftKey) {
          const media = this._activeMedia();
          if (media) { e.preventDefault(); media.currentTime = Math.max(0, media.currentTime - 10); }
        }
        break;
      case 'KeyM':
        e.preventDefault();
        this.toggleMute();
        break;
      case 'KeyS':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.toggleShuffle();
        }
        break;
    }
  },
};
