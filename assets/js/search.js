/* ============================================
   NexSon – Search Module
   ============================================ */

const Search = {
  _debounceTimer: null,
  _lastQuery: '',
  _mobileSearchOpen: false,

  /* ── Handle search input (debounced) ── */
  handleInput(value) {
    const clearBtn = document.getElementById('search-clear');
    if (clearBtn) clearBtn.classList.toggle('hidden', !value);

    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      if (value === this._lastQuery) return;
      this._lastQuery = value;
      if (window._currentRoute !== 'search') {
        Router.navigate('search');
      }
      Views.renderSearch(value.trim());
    }, 350);
  },

  /* ── Handle keyboard ── */
  handleKey(e) {
    if (e.key === 'Enter') {
      clearTimeout(this._debounceTimer);
      const value = e.target.value.trim();
      this._lastQuery = value;
      if (window._currentRoute !== 'search') Router.navigate('search');
      Views.renderSearch(value);
    }
    if (e.key === 'Escape') this.clear();
  },

  /* ── Handle focus (navigate to search view if not already there) ── */
  handleFocus() {
    if (window._currentRoute !== 'search') {
      Router.navigate('search');
    }
  },

  /* ── Clear search ── */
  clear() {
    const input    = document.getElementById('main-search');
    const clearBtn = document.getElementById('search-clear');
    if (input)    input.value = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    this._lastQuery = '';
    if (window._currentRoute === 'search') Views.renderSearch('');
  },

  /* ── Quick search (from genre cards etc.) ── */
  quick(query) {
    const input = document.getElementById('main-search');
    if (input) {
      input.value = query;
      input.focus();
    }
    const clearBtn = document.getElementById('search-clear');
    if (clearBtn) clearBtn.classList.remove('hidden');
    this._lastQuery = query;
    Router.navigate('search');
    Views.renderSearch(query);
  },

  /* ── Toggle mobile search ── */
  toggleMobileSearch() {
    this._mobileSearchOpen = !this._mobileSearchOpen;
    const wrap = document.getElementById('topbar-search-wrap');
    const btn  = document.getElementById('mobile-search-btn');
    if (wrap) {
      if (this._mobileSearchOpen) {
        wrap.classList.add('mobile-open');
        setTimeout(() => {
          const input = document.getElementById('main-search');
          if (input) input.focus();
        }, 100);
      } else {
        wrap.classList.remove('mobile-open');
      }
    }
    if (btn) btn.classList.toggle('active', this._mobileSearchOpen);
  },
};
