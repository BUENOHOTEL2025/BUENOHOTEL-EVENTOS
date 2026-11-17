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
          '<a id="bh-perfil-link" href="dashboard.html#perfil" data-requires-auth style="display:block;padding:12px 16px;color:#222;text-decoration:none;font-weight:500;border-bottom:1px solid #eee;">Mi Perfil</a>' +
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
          if (drop && window.isAdmin && window.isAdmin()) {
            var itemCss = 'display:block;padding:12px 16px;color:#222;text-decoration:none;font-weight:500;border-bottom:1px solid #eee;';
            var reservasA = drop.querySelector('a[href="mis-reservas.html"]');
            function insertStaff(el) {
              if (reservasA) drop.insertBefore(el, reservasA);
              else drop.appendChild(el);
            }
            if (!document.getElementById('bh-admin-link')) {
              var adminA = document.createElement('a');
              adminA.id = 'bh-admin-link';
              adminA.href = 'admin.html';
              adminA.textContent = 'Admin';
              adminA.style.cssText = itemCss;
              insertStaff(adminA);
            }
            if (!document.getElementById('bh-comprobantes-link')) {
              var compA = document.createElement('a');
              compA.id = 'bh-comprobantes-link';
              compA.href = 'https://ecommerce.buenohotel.com.do/admin/comprobantes';
              compA.target = '_blank';
              compA.rel = 'noopener';
              compA.textContent = 'Comprobantes';
              compA.style.cssText = itemCss;
              insertStaff(compA);
            }
            if (!document.getElementById('bh-difusion-link')) {
              var difA = document.createElement('a');
              difA.id = 'bh-difusion-link';
              difA.href = 'https://buenohotel.com/admin/difusion';
              difA.target = '_blank';
              difA.rel = 'noopener';
              difA.textContent = 'Lista de difusión';
              difA.style.cssText = itemCss;
              insertStaff(difA);
            }
            if (!document.getElementById('bh-paquetes-admin-link')) {
              var pkgA = document.createElement('a');
              pkgA.id = 'bh-paquetes-admin-link';
              pkgA.href = 'https://buenohotel.com/admin/paquetes';
              pkgA.target = '_blank';
              pkgA.rel = 'noopener';
              pkgA.textContent = 'Paquetes turísticos';
              pkgA.style.cssText = itemCss;
              insertStaff(pkgA);
            }
            if (!document.getElementById('bh-galeria-link')) {
              var galA = document.createElement('a');
              galA.id = 'bh-galeria-link';
              galA.href = 'https://buenohotel.com/admin/fotos-eventos';
              galA.target = '_blank';
              galA.rel = 'noopener';
              galA.textContent = 'Galería';
              galA.style.cssText = itemCss;
              insertStaff(galA);
            }
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

    applyTasaFromCache();
    loadTasaCambio();
  }

  function parseTasaCambio(data) {
    var n = Number(
      data && (data.data && (data.data.tasaCambio || data.data.tasa)) ||
      (data && (data.tasaCambio || data.tasa || data.valor))
    );
    return isFinite(n) && n > 0 ? n : null;
  }

  function applyTasaDisplay(tasa) {
    var n = Number(tasa);
    if (!isFinite(n) || n <= 0) return;
    try {
      localStorage.setItem('tasaCambio', String(n));
      localStorage.setItem('buenohotel_tasa_cambio', String(n));
    } catch (_) {}
    var tasaDisplay = document.getElementById('tasa-display');
    var tasaValor = document.getElementById('tasa-valor');
    if (tasaValor) tasaValor.textContent = n.toFixed(2);
    if (tasaDisplay) tasaDisplay.style.display = 'inline-flex';
  }

  function applyTasaFromCache() {
    try {
      applyTasaDisplay(localStorage.getItem('tasaCambio') || localStorage.getItem('buenohotel_tasa_cambio'));
    } catch (_) {}
  }

  async function loadTasaCambio() {
    var urls = [
      'https://h0q597no4j.execute-api.us-east-1.amazonaws.com/admin/eventos/tasa-cambio'
    ];
    try {
      var API_BASE = window.getAuthApiBase ? window.getAuthApiBase() : 'https://core-api.buenohotel.com.do';
      if (API_BASE) urls.push(String(API_BASE).replace(/\/$/, '') + '/api/config/tasa-cambio');
    } catch (_) {}
    for (var i = 0; i < urls.length; i++) {
      try {
        var resp = await fetch(urls[i], { cache: 'no-store' });
        if (!resp.ok) continue;
        var data = await resp.json();
        var tasa = parseTasaCambio(data);
        if (tasa) {
          applyTasaDisplay(tasa);
          return;
        }
      } catch (_) {}
    }
  }

  window.BH_applyTasaCambio = applyTasaDisplay;
  window.addEventListener('bh-tasa-updated', function (ev) {
    applyTasaDisplay(ev && ev.detail);
  });

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
