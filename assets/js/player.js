/* ============================================
   VIBE – Audio Player Module
   ============================================ */

const Player = {
  audio:      null,
  queue:      [],
  queueIdx:   0,
  shuffle:    false,
  repeat:     'none',  // none | one | all
  isPlaying:  false,
  muted:      false,
  _shuffleOrder: [],
  _progressInterval: null,

  init() {
    this.audio    = document.getElementById('audio-player');
    this.shuffle  = Store.getShuffle();
    this.repeat   = Store.getRepeat();
    const vol     = Store.getVolume();

    // Restore volume
    this.audio.volume = vol / 100;
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

    // Audio event listeners
    this.audio.addEventListener('timeupdate', () => this._onTimeUpdate());
    this.audio.addEventListener('ended',      () => this._onEnded());
    this.audio.addEventListener('error',      () => this._onError());
    this.audio.addEventListener('loadstart',  () => this._onLoadStart());
    this.audio.addEventListener('canplay',    () => this._onCanPlay());
    this.audio.addEventListener('play',       () => { this.isPlaying = true; this._updatePlayUI(true); });
    this.audio.addEventListener('pause',      () => { this.isPlaying = false; this._updatePlayUI(false); });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this._handleKey(e));
  },

  /* ── Play a track ── */
  playTrack(track, queue = null, idx = 0) {
    if (!track) return;
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

    if (!track.previewUrl) {
      UI.toast('Audio non disponible pour ce titre', 'error');
      return;
    }

    console.info(`[NexSon] Lecture : ${track.trackName} | source: ${track.source || 'unknown'} | url: ${track.previewUrl}`);

    this.audio.src = track.previewUrl;
    this.audio.load();
    this.audio.play().catch(err => {
      console.error('[NexSon] Playback error:', err);
      UI.toast('Impossible de lire ce titre — essaie le suivant', 'error');
    });

    Store.addRecent(track);
    this._updatePlayerUI(track);
    UI.updateQueuePanel();
    Lyrics.loadForTrack(track);
    this._buildShuffleOrder();
  },

  /* ── Toggle play/pause ── */
  toggle() {
    if (!this.audio.src) return;
    if (this.isPlaying) this.audio.pause();
    else this.audio.play();
  },

  /* ── Stop ── */
  stop() {
    this.audio.pause();
    this.audio.src = '';
    this.isPlaying = false;
    this._updatePlayUI(false);
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
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
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

  /* ── Seek ── */
  seek(e) {
    const bar  = document.getElementById('progress-bar');
    if (!bar || !this.audio.duration) return;
    const rect = bar.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.audio.currentTime = pct * this.audio.duration;
  },

  /* ── Volume ── */
  setVolume(val) {
    const v = parseInt(val);
    this.audio.volume = v / 100;
    Store.setVolume(v);
    this.muted = v === 0;
    this._updateVolumeIcon(v);
  },

  toggleMute() {
    if (this.muted) {
      const v = Store.getVolume() || 80;
      this.audio.volume = v / 100;
      const slider = document.getElementById('volume-slider');
      if (slider) slider.value = v;
      this.muted = false;
      this._updateVolumeIcon(v);
    } else {
      this.audio.volume = 0;
      const slider = document.getElementById('volume-slider');
      if (slider) slider.value = 0;
      this.muted = true;
      this._updateVolumeIcon(0);
    }
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

  /* ── Private: Audio events ── */
  _onTimeUpdate() {
    const { currentTime, duration } = this.audio;
    if (!duration) return;
    const pct = (currentTime / duration) * 100;

    const fill  = document.getElementById('progress-fill');
    const thumb = document.getElementById('progress-thumb');
    const cur   = document.getElementById('current-time');
    if (fill)  fill.style.width  = pct + '%';
    if (thumb) thumb.style.left  = pct + '%';
    if (cur)   cur.textContent   = this._formatTime(currentTime);

    const total = document.getElementById('total-time');
    if (total && duration) total.textContent = this._formatTime(duration);
  },

  _onEnded() {
    if (this.repeat === 'one') {
      this.audio.currentTime = 0;
      this.audio.play();
    } else if (this.repeat === 'all' || this.queueIdx < this.queue.length - 1) {
      this.next();
    } else {
      this.isPlaying = false;
      this._updatePlayUI(false);
    }
  },

  _onError() {
    UI.toast('Erreur lors de la lecture', 'error');
    this._updatePlayUI(false);
  },

  _onLoadStart() {
    const btn = document.getElementById('play-pause-btn');
    if (btn) btn.style.opacity = '0.7';
  },

  _onCanPlay() {
    const btn = document.getElementById('play-pause-btn');
    if (btn) btn.style.opacity = '';
    const total = document.getElementById('total-time');
    if (total && this.audio.duration) total.textContent = this._formatTime(this.audio.duration);
  },

  /* ── Private: UI Updates ── */
  _updatePlayerUI(track) {
    if (!track) return;

    const nameEl   = document.getElementById('player-track-name');
    const artistEl = document.getElementById('player-track-artist');
    const coverEl  = document.getElementById('player-cover');
    const likeBtn  = document.getElementById('player-like-btn');

    if (nameEl)   nameEl.textContent   = track.trackName;
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
        else if (e.shiftKey) { e.preventDefault(); this.audio.currentTime = Math.min(this.audio.duration, this.audio.currentTime + 10); }
        break;
      case 'ArrowLeft':
        if (e.altKey) { e.preventDefault(); this.prev(); }
        else if (e.shiftKey) { e.preventDefault(); this.audio.currentTime = Math.max(0, this.audio.currentTime - 10); }
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
