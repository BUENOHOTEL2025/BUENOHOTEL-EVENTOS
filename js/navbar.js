// Navbar shared component for index and dashboard
(function(){
  function renderHeader(){
    const container = document.getElementById('site-header') || (function(){
      const el = document.createElement('div');
      el.id = 'site-header';
      document.body.prepend(el);
      return el;
    })();

    container.innerHTML = `
      <header class="main-header" style="width: 100vw; background: #FBB03B; box-shadow: 0 2px 8px rgba(0,0,0,0.07); position: relative; z-index: 10;">
        <div style="max-width: 1400px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 0 32px; min-height: 64px;">
          <div class="logo-container" style="flex:0 0 auto; display:flex; align-items:center; justify-content:flex-start; padding-left: 4px;">
            <a href="index.html" data-requires-auth style="display:inline-flex; align-items:center;">
              <img src="assets/logo/logo-white.png" alt="Logo BuenoHotel" class="header-main-logo" style="height: 44px; width: auto; display: block;" />
            </a>
          </div>
          <nav class="main-nav" style="flex:1 1 auto; display:flex; justify-content:flex-end;">
            <ul style="display: flex; gap: 0; margin: 0; padding: 0; list-style: none; background: none; align-items: center;">
              <li><a href="index.html" data-requires-auth style="color: #222; background: transparent; padding: 12px 26px; border-radius: 0; font-weight: 700; font-size: 1.08rem;">Inicio</a></li>
              <li><a href="https://ecommerce.buenohotel.com.do/" style="color: #222; background: transparent; padding: 12px 26px; border-radius: 0; font-weight: 700; font-size: 1.08rem;">Ecommerce</a></li>
              <li><a href="https://tours.buenohotel.com.do/" style="color: #222; background: transparent; padding: 12px 26px; border-radius: 0; font-weight: 700; font-size: 1.08rem;">Tours</a></li>
              <li><a href="https://booking.buenohotel.com.do/" style="color: #222; background: transparent; padding: 12px 26px; border-radius: 0; font-weight: 700; font-size: 1.08rem;">Hoteles</a></li>
              <li><a href="https://www.buenohotel.com" style="color: #222; background: transparent; padding: 12px 26px; border-radius: 0; font-weight: 700; font-size: 1.08rem;">Conócenos</a></li>
              <li id="user-menu" style="position: relative; display: none;">
                <a href="#" style="color: #222; background: transparent; padding: 12px 26px; border-radius: 0; font-weight: 700; font-size: 1.08rem; display: flex; align-items: center; gap: 8px;">
                  <span id="user-greeting">Mi Cuenta</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </a>
                <div id="user-dropdown" style="display: none; position: absolute; right: 0; top: 100%; background: white; min-width: 200px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 4px; overflow: hidden; z-index: 1000;">
                  <a href="dashboard.html" data-requires-auth style="display: block; padding: 12px 16px; color: #222; text-decoration: none; font-weight: 500; border-bottom: 1px solid #eee;">Mi Perfil</a>
                  <a href="mis-reservas.html" data-requires-auth style="display: block; padding: 12px 16px; color: #222; text-decoration: none; font-weight: 500; border-bottom: 1px solid #eee;">Mis Reservas</a>
                  <a href="#" id="logout-btn" style="display: block; padding: 12px 16px; color: #222; text-decoration: none; font-weight: 500;">Cerrar Sesión</a>
                </div>
              </li>
              <li id="login-menu" style="display: none;">
                <a href="login.html" style="color: #222; background: rgba(0,0,0,0.1); padding: 8px 20px; border-radius: 20px; font-weight: 700; font-size: 1rem; margin-left: 15px;">Iniciar Sesión</a>
              </li>
            </ul>
          </nav>
        </div>
      </header>
    `;

    // Behavior using auth helpers
    const userMenu = document.getElementById('user-menu');
    const loginMenu = document.getElementById('login-menu');
    const userGreeting = document.getElementById('user-greeting');
    const userDropdown = document.getElementById('user-dropdown');
    const logoutBtn = document.getElementById('logout-btn');

    if (userMenu) {
      userMenu.addEventListener('mouseenter', function() { userDropdown.style.display = 'block'; });
      userMenu.addEventListener('mouseleave', function() { userDropdown.style.display = 'none'; });
    }

    const userData = (window.auth && window.auth.getUserData) ? window.auth.getUserData() : null;
    if (userData && userData.nombre) {
      if (userMenu) userMenu.style.display = 'block';
      if (loginMenu) loginMenu.style.display = 'none';
      if (userGreeting) userGreeting.textContent = `Hola, ${userData.nombre.split(' ')[0]}`;
      // If admin, inject Admin link
      try {
        const isAdmin = String(userData.rol || '').toLowerCase() === 'admin';
        if (isAdmin && userDropdown && !userDropdown.querySelector('#admin-link')){
          const a = document.createElement('a');
          a.id = 'admin-link';
          a.href = 'admin.html';
          a.setAttribute('data-requires-auth', '');
          a.style.display = 'block';
          a.style.padding = '12px 16px';
          a.style.color = '#222';
          a.style.textDecoration = 'none';
          a.style.fontWeight = '500';
          a.style.borderBottom = '1px solid #eee';
          a.textContent = 'Admin';
          userDropdown.insertBefore(a, userDropdown.firstChild);
        }
      } catch(_) {}
    } else {
      if (userMenu) userMenu.style.display = 'none';
      if (loginMenu) loginMenu.style.display = 'block';
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (window.auth && window.auth.logout) window.auth.logout();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderHeader);
  } else {
    renderHeader();
  }
})();
