// Auth extras for the shared BUENOHOTEL chrome (header/footer come from buenohotel.com).
(function () {
  function attachAuthNav() {
    var nav = document.getElementById('primary-nav');
    if (!nav || document.getElementById('bh-auth-slot')) return;

    var slot = document.createElement('span');
    slot.id = 'bh-auth-slot';
    slot.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-left:8px;flex-wrap:wrap;';
    slot.innerHTML =
      '<span id="tasa-display" style="display:none;padding:6px 12px;font-weight:700;font-size:0.85rem;color:#4b5563;background:rgba(0,0,0,0.06);border-radius:20px;">' +
        '<span style="opacity:.7;">$</span> Tasa: <span id="tasa-valor">--</span>' +
      '</span>' +
      '<span id="user-menu" style="position:relative;display:none;">' +
        '<a href="#" id="user-menu-btn" style="color:#4b5563;font-weight:700;font-size:15px;text-decoration:none;display:inline-flex;align-items:center;gap:6px;padding:8px 10px;">' +
          '<span id="user-greeting">Mi Cuenta</span>' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
        '</a>' +
        '<div id="user-dropdown" style="display:none;position:absolute;right:0;top:100%;background:#fff;min-width:200px;box-shadow:0 4px 12px rgba(0,0,0,.12);border-radius:8px;overflow:hidden;z-index:1000;">' +
          '<a href="dashboard.html" data-requires-auth style="display:block;padding:12px 16px;color:#222;text-decoration:none;font-weight:500;border-bottom:1px solid #eee;">Mi Perfil</a>' +
          '<a href="mis-reservas.html" data-requires-auth style="display:block;padding:12px 16px;color:#222;text-decoration:none;font-weight:500;border-bottom:1px solid #eee;">Mis Reservas</a>' +
          '<a href="#" id="logout-btn" style="display:block;padding:12px 16px;color:#222;text-decoration:none;font-weight:500;">Cerrar Sesión</a>' +
        '</div>' +
      '</span>' +
      '<span id="login-menu" style="display:none;">' +
        '<a href="login.html" style="color:#111;background:rgba(0,0,0,.08);padding:8px 16px;border-radius:6px;font-weight:700;font-size:14px;text-decoration:none;">Iniciar Sesión</a>' +
      '</span>';
    nav.appendChild(slot);

    var userMenu = document.getElementById('user-menu');
    var loginMenu = document.getElementById('login-menu');
    var userGreeting = document.getElementById('user-greeting');
    var userDropdown = document.getElementById('user-dropdown');
    var logoutBtn = document.getElementById('logout-btn');
    var userAnchor = document.getElementById('user-menu-btn');

    if (userMenu && userDropdown && userAnchor) {
      userMenu.addEventListener('mouseenter', function () {
        if (window.matchMedia('(hover: hover)').matches) userDropdown.style.display = 'block';
      });
      userMenu.addEventListener('mouseleave', function () {
        if (window.matchMedia('(hover: hover)').matches) userDropdown.style.display = 'none';
      });
      userAnchor.addEventListener('click', function (e) {
        e.preventDefault();
        userDropdown.style.display = userDropdown.style.display === 'block' ? 'none' : 'block';
      });
      document.addEventListener('click', function (e) {
        if (!userMenu.contains(e.target)) userDropdown.style.display = 'none';
      });
    }

    function refreshAuth() {
      var logged = false;
      try {
        logged = !!(window.isAuthenticated && window.isAuthenticated());
      } catch (_) {}
      if (userMenu) userMenu.style.display = logged ? 'inline-flex' : 'none';
      if (loginMenu) loginMenu.style.display = logged ? 'none' : 'inline-flex';
      if (logged && userGreeting) {
        try {
          var u = (window.getUserData && window.getUserData()) || {};
          userGreeting.textContent = u.nombre || u.name || u.email || 'Mi Cuenta';
          var drop = document.getElementById('user-dropdown');
          if (drop && window.isAdmin && window.isAdmin() && !document.getElementById('bh-admin-link')) {
            var adminA = document.createElement('a');
            adminA.id = 'bh-admin-link';
            adminA.href = 'admin.html';
            adminA.textContent = 'Admin';
            adminA.style.cssText = 'display:block;padding:12px 16px;color:#222;text-decoration:none;font-weight:500;border-bottom:1px solid #eee;';
            drop.insertBefore(adminA, drop.firstChild);
          }
        } catch (_) {}
      }
    }
    refreshAuth();

    if (logoutBtn) {
      logoutBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (window.logout) window.logout();
        else {
          try { localStorage.clear(); } catch (_) {}
          location.href = 'index.html';
        }
      });
    }

    loadTasaCambio();
  }

  async function loadTasaCambio() {
    try {
      var tasaDisplay = document.getElementById('tasa-display');
      var tasaValor = document.getElementById('tasa-valor');
      if (!tasaDisplay || !tasaValor) return;
      var API_BASE = window.getAuthApiBase ? window.getAuthApiBase() : 'https://core-api.buenohotel.com.do';
      var resp = await fetch(API_BASE + '/api/config/tasa-cambio');
      if (!resp.ok) throw new Error('tasa');
      var data = await resp.json();
      var tasa = data && (data.tasa || (data.data && data.data.tasa) || data.valor);
      if (tasa && !isNaN(Number(tasa))) {
        tasaValor.textContent = Number(tasa).toFixed(2);
        tasaDisplay.style.display = 'inline-flex';
      }
    } catch (_) {}
  }

  function readyAuth() {
    attachAuthNav();
  }

  window.BH_onChromeReady = readyAuth;
  if (document.querySelector('header.site-header')) readyAuth();
  else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (document.querySelector('header.site-header')) readyAuth();
    });
  }
})();
