/* ============================================
   NexSon – Main Application Entry Point
   ============================================ */

/* ── Close menus on outside click ── */
document.addEventListener('click', (e) => {
  // Close user dropdown
  const dropdown = document.getElementById('user-dropdown');
  const userMenu = document.getElementById('user-menu');
  if (dropdown && userMenu && !userMenu.contains(e.target)) {
    dropdown.classList.add('hidden');
  }

  // Close context menu
  if (!document.getElementById('context-menu')?.contains(e.target)) {
    UI.closeContextMenu();
  }

  // Close sidebar on mobile if clicking outside
  const sidebar = document.getElementById('sidebar');
  const toggle  = document.getElementById('sidebar-toggle');
  if (window.innerWidth <= 900 && sidebar?.classList.contains('open')) {
    if (!sidebar.contains(e.target) && !toggle?.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  }

  // Close mobile search if clicking outside
  if (window.innerWidth <= 640 && Search._mobileSearchOpen) {
    const searchWrap = document.getElementById('topbar-search-wrap');
    const mobileBtn  = document.getElementById('mobile-search-btn');
    if (searchWrap && !searchWrap.contains(e.target) && !mobileBtn?.contains(e.target)) {
      Search._mobileSearchOpen = false;
      searchWrap.classList.remove('mobile-open');
      mobileBtn?.classList.remove('active');
    }
  }
});

/* ── Close modals on overlay click ── */
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    UI.closeAllModals();
  }
});

/* ── ESC key ── */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    UI.closeAllModals();
    UI.closeContextMenu();
    const userDropdown = document.getElementById('user-dropdown');
    if (userDropdown) userDropdown.classList.add('hidden');
    // Close mobile search
    if (Search._mobileSearchOpen) Search.toggleMobileSearch();
  }
});

/* ── Password strength for register form ── */
document.addEventListener('input', (e) => {
  if (e.target.id === 'register-password') {
    Auth._checkStrength(e.target.value);
  }
});

/* ── Enter key on auth forms ── */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const authScreen = document.getElementById('auth-screen');
  if (!authScreen || authScreen.classList.contains('hidden')) return;

  const loginForm    = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  if (loginForm?.classList.contains('active'))    Auth.login();
  if (registerForm?.classList.contains('active')) Auth.register();
});

/* ── Prevent context menu on images ── */
document.addEventListener('contextmenu', (e) => {
  if (e.target.tagName === 'IMG') e.preventDefault();
});

/* ── Initialize Application ── */
async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(error => {
      console.warn('[NexSon] Service worker unavailable:', error);
    });
  }

  // Init player
  Player.init();

  // Keep the header out of the way while content moves upward; it returns as
  // soon as the user scrolls back toward the top.
  const content = document.getElementById('page-content');
  const topbar = document.getElementById('topbar');
  if (content && topbar) {
    let lastTop = 0;
    content.addEventListener('scroll', () => {
      const currentTop = content.scrollTop;
      if (Math.abs(currentTop - lastTop) < 8) return;
      topbar.classList.toggle('topbar-hidden', currentTop > lastTop && currentTop > 24);
      if (currentTop <= 8) topbar.classList.remove('topbar-hidden');
      lastTop = currentTop;
    }, { passive: true });
  }

  // Check auth session (async — handles JWT token too)
  const isLoggedIn = await Auth.checkSession();
  if (isLoggedIn) {
    Router.navigate('home');
    UI.renderSidebarPlaylists();
  }
  // else: auth screen is shown by default

  // Ctrl+K / Cmd+K → focus search
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      Router.navigate('search');
      setTimeout(() => {
        const input = document.getElementById('main-search');
        if (input) {
          if (window.innerWidth <= 640) Search.toggleMobileSearch();
          else input.focus();
        }
      }, 100);
    }
  });

  // Desktop shortcuts, without stealing keys while the user is typing.
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (!(e.ctrlKey || e.metaKey)) return;

    if (e.key === 'ArrowLeft') { e.preventDefault(); Router.back(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); Router.forward(); }
    if (e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); UI.toggleLyricsPanel(); }
    if (e.shiftKey && e.key.toLowerCase() === 'j') { e.preventDefault(); UI.toggleQueue(); }
    if (e.shiftKey && e.key.toLowerCase() === 'v') { e.preventDefault(); Player.toggleVideo(); }
  });

  console.log(
    `%c NexSon v${CONFIG.VERSION} `,
    'background:linear-gradient(135deg,#8b5cf6,#ec4899);color:white;padding:4px 16px;border-radius:20px;font-weight:bold;font-size:13px'
  );
  console.log('%cPremium Music Streaming — NexSon VPS + YouTube Data API', 'color:#8b5cf6;font-size:12px');
}

window.addEventListener('DOMContentLoaded', init);
