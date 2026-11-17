// Configuración de la API (base configurable)
function getAuthApiBase() {
  try {
    const manual = localStorage.getItem('buenohotel_api_base');
    if (manual) return manual;
  } catch(_) {}
  try {
    const { origin, port, protocol, hostname } = window.location;
    // Producción: cuando el frontend está en eventos.buenohotel.com.do, usar el subdominio de API
    if (/(^|\.)eventos\.buenohotel\.com\.do$/i.test(hostname)) {
      // Unificar a core-api para evitar problemas de CORS y versiones cacheadas
      return 'https://core-api.buenohotel.com.do';
    }
    // Si estamos sirviendo el frontend con Live Server (5500) o desde file://, usar backend local 3000
    if (port === '5500' || protocol === 'file:') {
      return 'http://localhost:3000';
    }
    return new URL('/api', origin).origin;
  } catch(_) {}
  return 'http://localhost:3000';
}

function getBookingApiBase() {
  try {
    const manual = localStorage.getItem('buenohotel_booking_api_base');
    if (manual) return manual;
  } catch(_) {}
  return 'https://api-booking.buenohotel.com.do';
}

function fireAndForgetGet(url) {
  try {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.src = url;
    return true;
  } catch (_e) {
    return false;
  }
}

// ----- Recuperación de contraseña -----
async function requestPasswordReset(email) {
  try {
    const base = getAuthApiBase();
    const res = await fetch(`${base}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: (email || '').trim().toLowerCase() })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || 'No se pudo iniciar el restablecimiento');

    // Si el backend devuelve token/expiración, disparamos el envío por Booking (pasarela) para asegurar el correo.
    const token = data?.resetToken || data?.token || data?.data?.resetToken || data?.data?.token || '';
    const exp = data?.resetTokenExp || data?.exp || data?.data?.resetTokenExp || data?.data?.exp || '';
    if (token) {
      const bookingBase = getBookingApiBase();
      const name = (data?.name || data?.nombre || data?.data?.name || data?.data?.nombre || '').toString().trim();
      const url = `${bookingBase}/email?template=reset&recipientEmail=${encodeURIComponent((email || '').trim().toLowerCase())}`
        + `&email=${encodeURIComponent((email || '').trim().toLowerCase())}`
        + `&token=${encodeURIComponent(String(token))}`
        + (name ? `&name=${encodeURIComponent(name)}` : '')
        + (exp ? `&exp=${encodeURIComponent(String(exp))}` : '');
      fireAndForgetGet(url);
    }

    return { success: true, message: data?.message || 'Si el email existe, se ha enviado un enlace de restablecimiento' };
  } catch (e) {
    return { success: false, message: e.message || 'Error al solicitar restablecimiento' };
  }
}

async function completePasswordReset(email, token, newPassword) {
  try {
    const base = getAuthApiBase();
    const res = await fetch(`${base}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: (email || '').trim().toLowerCase(), token, newPassword })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || 'No se pudo restablecer la contraseña');
    return { success: true, message: data?.message || 'Contraseña restablecida' };
  } catch (e) {
    return { success: false, message: e.message || 'Error al restablecer la contraseña' };
  }
}

// Exponer helpers para páginas sueltas
try {
  window.requestPasswordReset = requestPasswordReset;
  window.completePasswordReset = completePasswordReset;
} catch (_) {}

// Almacenamiento local para el token de autenticación (idempotente si el script se carga 2 veces)
var AUTH_TOKEN_KEY = (window.AUTH_TOKEN_KEY || 'buenohotel_auth_token'); window.AUTH_TOKEN_KEY = AUTH_TOKEN_KEY;
var USER_DATA_KEY = (window.USER_DATA_KEY || 'buenohotel_user_data'); window.USER_DATA_KEY = USER_DATA_KEY;
var SESSION_START_KEY = (window.SESSION_START_KEY || 'buenohotel_session_start'); window.SESSION_START_KEY = SESSION_START_KEY;
var LOGOUT_REASON_KEY = (window.LOGOUT_REASON_KEY || 'buenohotel_logout_reason'); window.LOGOUT_REASON_KEY = LOGOUT_REASON_KEY;
var MAX_SESSION_MS = (window.MAX_SESSION_MS || (12 * 60 * 60 * 1000)); window.MAX_SESSION_MS = MAX_SESSION_MS; // 12 horas
var INACTIVITY_LIMIT_MS = (window.INACTIVITY_LIMIT_MS || (10 * 60 * 1000)); window.INACTIVITY_LIMIT_MS = INACTIVITY_LIMIT_MS; // 10 minutos
var INACTIVITY_PROMPT_TIMEOUT_MS = (window.INACTIVITY_PROMPT_TIMEOUT_MS || (60 * 1000)); window.INACTIVITY_PROMPT_TIMEOUT_MS = INACTIVITY_PROMPT_TIMEOUT_MS; // 1 minuto

// Toast helpers (inserta un sistema básico si no existe)
function ensureToast() {
  if (window.showToast) return;
  const containerId = 'toast-container';
  if (!document.getElementById(containerId)) {
    const cont = document.createElement('div');
    cont.id = containerId;
    cont.style.position = 'fixed';
    cont.style.top = '20px';
    cont.style.right = '20px';
    cont.style.zIndex = '12000';
    cont.style.display = 'flex';
    cont.style.flexDirection = 'column';
    cont.style.gap = '10px';
    document.body.appendChild(cont);
  }
  if (!document.getElementById('toast-style')) {
    const style = document.createElement('style');
    style.id = 'toast-style';
    style.innerHTML = `
      .toast { min-width: 300px; max-width: 380px; padding: 14px 16px; border-radius: 12px; color: #1a1a1a; background: #fff; box-shadow: 0 8px 24px rgba(0,0,0,0.12); display: flex; gap: 12px; align-items: flex-start; border-left: 6px solid; animation: slideIn .25s ease-out; }
      .toast-success { border-color: #22c55e; }
      .toast-error { border-color: #ef4444; }
      .toast-title { font-weight: 700; margin-bottom: 4px; }
      .toast-body { font-size: 14px; color: #333; }
      .toast-icon { font-size: 18px; line-height: 1; margin-top: 2px; }
      @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
    `;
    document.head.appendChild(style);
  }
  // Permitir audio solo tras gesto del usuario (evita warning de autoplay)
  if (typeof window.__canPlayAudio === 'undefined') {
    window.__canPlayAudio = false;
    const enableAudio = ()=>{ window.__canPlayAudio = true; window.removeEventListener('click', enableAudio); window.removeEventListener('keydown', enableAudio); };
    window.addEventListener('click', enableAudio, { once: true });
    window.addEventListener('keydown', enableAudio, { once: true });
  }
  function playSuccessSound() {
    if (!window.__canPlayAudio) return; // no intento crear AudioContext antes de gesto
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const g = ctx.createGain();
      o1.type = 'sine'; o2.type = 'sine';
      o1.frequency.setValueAtTime(880, ctx.currentTime);
      o2.frequency.setValueAtTime(1320, ctx.currentTime);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
      o1.connect(g); o2.connect(g); g.connect(ctx.destination);
      o1.start(); o2.start();
      o1.stop(ctx.currentTime + 0.92); o2.stop(ctx.currentTime + 0.92);
    } catch (e) {}
  }
  window.showToast = function({ title = 'Notificación', message = '', type = 'success', duration = 3000 } = {}){
    const cont = document.getElementById(containerId);
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✅' : '⚠️';
    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div>
        <div class="toast-title">${title}</div>
        <div class="toast-body">${message}</div>
      </div>
    `;
    cont.appendChild(toast);
    if (type === 'success') playSuccessSound();
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-6px)'; }, duration - 150);
    setTimeout(() => toast.remove(), duration);
  };
}

function pagePath() {
  return String(window.location.pathname || '').toLowerCase();
}

function isPage(name) {
  var p = pagePath();
  return p.endsWith('/' + name) || p.endsWith('/' + name + '.html');
}

function loginHref() {
  return pagePath().indexOf('.html') !== -1 ? 'login.html' : '/login';
}

function dashboardHref() {
  return pagePath().indexOf('.html') !== -1 ? 'dashboard.html' : '/dashboard';
}

function showAuthBusy(text) {
  var el = document.getElementById('bh-auth-busy');
  if (!el) {
    if (!document.getElementById('bh-auth-busy-style')) {
      var st = document.createElement('style');
      st.id = 'bh-auth-busy-style';
      st.textContent =
        '#bh-auth-busy{position:fixed;inset:0;z-index:120000;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;background:rgba(248,250,252,.92);backdrop-filter:blur(6px);text-align:center;padding:24px}' +
        '#bh-auth-busy .bh-auth-spin{width:36px;height:36px;border:3px solid #e5e7eb;border-top-color:#fbb03b;border-radius:50%;animation:bh-auth-spin .7s linear infinite}' +
        '#bh-auth-busy p{margin:0;font-weight:800;color:#1f2937;font-size:1rem}' +
        '#bh-auth-busy span{color:#6b7280;font-size:.9rem}' +
        '@keyframes bh-auth-spin{to{transform:rotate(360deg)}}';
      (document.head || document.documentElement).appendChild(st);
    }
    el = document.createElement('div');
    el.id = 'bh-auth-busy';
    el.setAttribute('role', 'status');
    el.innerHTML = '<div class="bh-auth-spin" aria-hidden="true"></div><p data-auth-wait-text></p><span>Un momento, por favor.</span>';
    (document.body || document.documentElement).appendChild(el);
  }
  var t = el.querySelector('[data-auth-wait-text]');
  if (t) t.textContent = text || 'Validando sesión…';
  el.hidden = false;
}

function hideAuthBusy() {
  var el = document.getElementById('bh-auth-busy');
  if (el) el.hidden = true;
}

// Función para verificar si el usuario está autenticado
function getSessionStart() {
  const v = localStorage.getItem(SESSION_START_KEY);
  return v ? Number(v) : null;
}

function setSessionStart(ts = Date.now()) {
  localStorage.setItem(SESSION_START_KEY, String(ts));
}

function hasSessionExpired() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) return true; // sin token no hay sesión
  let start = getSessionStart();
  if (!start) {
    // Si existe token pero no hay timestamp (sesiones antiguas), inicia contador desde ahora
    setSessionStart(Date.now());
    start = getSessionStart();
  }
  return (Date.now() - start) > MAX_SESSION_MS;
}

function isAuthenticated() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) return false;
  return !hasSessionExpired();
}

// Función para obtener el token de autenticación
function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

// Función para obtener los datos del usuario
function getUserData() {
  const userData = localStorage.getItem(USER_DATA_KEY);
  return userData ? JSON.parse(userData) : null;
}

// Rol helpers
function getUserRole(){
  try {
    const u = getUserData();
    const r = (u && (u.rol || u.role || u.tipo)) || '';
    return String(r).toLowerCase();
  } catch(_) { return ''; }
}
function isAdmin(){
  try {
    if (getUserRole() === 'admin') return true;
    const u = getUserData();
    const email = String(u?.email || '').toLowerCase();
    const allow = (localStorage.getItem('buenohotel_admin_emails')||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
    if (email && (allow.includes(email) || email.endsWith('@buenohotel.com.do'))) return true;
  } catch(_){ }
  return false;
}

// Enriquecer user desde backend si el login no trajo rol
async function enrichUserWithProfile(token, base){
  const candidates = [
    `${base}/api/auth/me`,
    `${base}/api/users/me`,
    `${base}/api/users/profile`
  ];
  for (const url of candidates){
    try {
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) continue;
      const user = data?.user || data?.data?.user || data?.data || data;
      if (user && (user.rol || user.role)) return user;
    } catch(_){}
  }
  return null;
}

// Función para iniciar sesión
async function login(email, password) {
  try {
    const base = getAuthApiBase();
    const lockApi = window.bhLoginLock;
    if (lockApi && lockApi.check) {
      const pre = await lockApi.check(email);
      if (pre && pre.locked) {
        return { success: false, locked: true, remainingSeg: pre.remainingSeg, message: pre.message };
      }
    }
    const fetchFn = lockApi && lockApi.fetchTimeout ? lockApi.fetchTimeout.bind(lockApi) : fetch;
    const response = await fetchFn(`${base}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    }, 15000);

    let data = await response.json().catch(() => ({}));
    if (response.status === 429 || data.locked) {
      const st = lockApi && lockApi.parse ? lockApi.parse(data, response.status) : data;
      return {
        success: false,
        locked: true,
        remainingSeg: st.remainingSeg || data.remainingSeg,
        message: st.message || data.message || 'Login inhabilitado por intentos fallidos.'
      };
    }

    if (!response.ok) {
      throw new Error(data.message || 'Error al iniciar sesión');
    }

    if (data.mustChangePassword && window.BHPassword) {
      const done = await window.BHPassword.afterLogin(data, { apiBase: base, oldPassword: password });
      data = { token: done.token, user: done.user };
    }

    // Guardar token y datos del usuario
    const token = data.token || data?.data?.token;
    const user = data.user || data?.data?.user;
    if (!token || !user) {
      throw new Error(data.mustChangePassword
        ? (data.message || 'Debes actualizar tu contraseña para continuar.')
        : 'Respuesta de autenticación inválida');
    }
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    // Enriquecer si no trae rol
    let finalUser = user;
    if (!finalUser.rol && !finalUser.role){
      try {
        const enriched = await enrichUserWithProfile(token, base);
        if (enriched) finalUser = { ...finalUser, ...enriched };
      } catch(_){}
    }
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(finalUser));
    setSessionStart(Date.now());
    syncCrossSiteAuthCookies(token, finalUser);
    try { window.dispatchEvent(new CustomEvent('auth:userUpdated')); } catch(_){}
    try { window.dispatchEvent(new CustomEvent('auth:userUpdated')); } catch(_){ }

    return { success: true, user };
  } catch (error) {
    console.error('Error en login:', error);
    return { success: false, message: error.message };
  }
}

function syncCrossSiteAuthCookies(token, user) {
  try {
    if (!/(^|\.)buenohotel\.com\.do$/i.test(String(location.hostname || ''))) return;
    const base = 'Domain=.buenohotel.com.do; Path=/; Secure; SameSite=Lax';
    if (token) {
      document.cookie = AUTH_TOKEN_KEY + '=' + encodeURIComponent(token) + '; ' + base + '; Max-Age=604800';
      if (user) {
        document.cookie = USER_DATA_KEY + '=' + encodeURIComponent(JSON.stringify(user)) + '; ' + base + '; Max-Age=604800';
      }
    } else {
      document.cookie = AUTH_TOKEN_KEY + '=; Domain=.buenohotel.com.do; Path=/; Max-Age=0; Secure; SameSite=Lax';
      document.cookie = USER_DATA_KEY + '=; Domain=.buenohotel.com.do; Path=/; Max-Age=0; Secure; SameSite=Lax';
    }
  } catch (_) {}
}

// Función para cerrar sesión
function logout() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(USER_DATA_KEY);
  localStorage.removeItem(SESSION_START_KEY);
  syncCrossSiteAuthCookies('', null);
  // No tocar LOGOUT_REASON_KEY aquí; quien invoca logout puede setearlo antes
  ensureToast();
  showToast({ title: 'Sesión cerrada', message: 'Has salido correctamente', type: 'success', duration: 1200 });
  showAuthBusy('Cerrando sesión…');
  setTimeout(() => { window.location.href = loginHref(); }, 900);
}

// Función para registrar un nuevo usuario
async function register(userData) {
  try {
    const base = getAuthApiBase();
    const response = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Error al registrar el usuario');
    }

    const user = data.user || data?.data?.user;
    const token = data.token || data?.data?.token;
    // Opcionalmente almacenar sesión al registrarse
    if (token && user) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
      setSessionStart(Date.now());
      syncCrossSiteAuthCookies(token, user);
    }
    // Si en el futuro devolvemos recoveryCodes, también podríamos pasarlos aquí
    const recoveryCodes = data.recoveryCodes || data?.data?.recoveryCodes || null;
    return { success: true, user, token, recoveryCodes };
  } catch (error) {
    console.error('Error en registro:', error);
    return { success: false, message: error.message };
  }
}

// Función para proteger rutas
function protectRoute() {
  if (!isAuthenticated() && !isPage('login') && !isPage('register')) {
    // Si hay token pero expiró, limpiamos y avisamos
    if (localStorage.getItem(AUTH_TOKEN_KEY) && hasSessionExpired()) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(USER_DATA_KEY);
      localStorage.removeItem(SESSION_START_KEY);
      localStorage.setItem(LOGOUT_REASON_KEY, 'session_expired');
      ensureToast();
      showToast({ title: 'Sesión expirada', message: 'Por seguridad, tu sesión se cerró automáticamente luego de 12 horas.', type: 'error', duration: 2200 });
    }
    ensureToast();
    showToast({ title: 'Acceso restringido', message: 'Debes iniciar sesión para continuar', type: 'error', duration: 1600 });
    showAuthBusy('Redirigiendo al inicio de sesión…');
    setTimeout(() => { window.location.href = loginHref(); }, 900);
  }
}

// Función para redirigir si el usuario ya está autenticado
function redirectIfAuthenticated() {
  if (isAuthenticated() && (isPage('login') || isPage('register'))) {
    showAuthBusy('Ya tienes sesión. Entrando…');
    window.location.href = dashboardHref();
  }
}

// Inicializar la autenticación
function initAuth() {
  if (window.__bhAuthInit) return;
  window.__bhAuthInit = true;
  // Asegurar toasts disponibles en cualquier página
  try { ensureToast(); } catch(_) {}
  
  // Páginas públicas que NO requieren autenticación (eventos es público)
  const path = pagePath();
  const isPublicPage = path.endsWith('index.html') || path.endsWith('/') || path === '' || path.endsWith('/eventos') || path.endsWith('/eventos/');
  const isAuthPage = isPage('login') || isPage('register') || isPage('forgot') || isPage('reset');
  const isProtectedPage = isPage('dashboard') || isPage('mis-reservas') || path.includes('admin');
  
  // Si la sesión está expirada, limpiar datos (pero no redirigir si estamos en página pública)
  if (localStorage.getItem(AUTH_TOKEN_KEY) && hasSessionExpired()) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_DATA_KEY);
    localStorage.removeItem(SESSION_START_KEY);
    localStorage.setItem(LOGOUT_REASON_KEY, 'session_expired');
    if (isProtectedPage) {
      showToast({ title: 'Sesión expirada', message: 'Por seguridad, tu sesión se cerró automáticamente luego de 12 horas.', type: 'error', duration: 2200 });
      setTimeout(() => { window.location.href = loginHref(); }, 900);
      return;
    }
  }
  
  // Solo proteger rutas que realmente requieren autenticación
  if (isProtectedPage) {
    protectRoute();
  } else if (isAuthPage) {
    redirectIfAuthenticated();
  }
  // Páginas públicas (index.html, eventos): no hacer nada, permitir acceso libre

  // Si ya está autenticado pero el user guardado no tiene rol, intentar enriquecer en background
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const u = getUserData();
    if (token && u && !u.rol && !u.role){
      const base = getAuthApiBase();
      enrichUserWithProfile(token, base).then(enriched=>{
        if (enriched){
          const merged = { ...u, ...enriched };
          localStorage.setItem(USER_DATA_KEY, JSON.stringify(merged));
        }
      }).catch(()=>{});
    }
  } catch(_){}

  // Proteger rutas de admin (páginas que incluyen 'admin' en el nombre)
  try {
    const path = window.location.pathname.toLowerCase();
    if (/(^|\/)admin(\.html)?$/i.test(path) || path.includes('/admin/')){
      if (!isAuthenticated() || !isAdmin()){
        ensureToast();
        showToast({ title: 'Acceso restringido', message: 'Necesitas permisos de administrador', type: 'error', duration: 1800 });
        setTimeout(()=>{ window.location.href = dashboardHref(); }, 900);
        return;
      }
    }
  } catch(_) {}

  // Interceptor de enlaces que requieren auth
  document.addEventListener('click', function(e) {
    const anchor = e.target.closest('a[data-requires-auth]');
    if (!anchor) return;
    if (!isAuthenticated()) {
      e.preventDefault();
      ensureToast();
      showToast({ title: 'Inicia sesión', message: 'Necesitas iniciar sesión para acceder.', type: 'error', duration: 1600 });
      setTimeout(() => { window.location.href = loginHref(); }, 900);
    }
  }, true);

  // Programar auto-cierre para esta pestaña si la sesión aún está dentro del tiempo
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    const start = getSessionStart();
    if (start) {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, MAX_SESSION_MS - elapsed);
      if (remaining === 0) {
        // expirada justo ahora
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(USER_DATA_KEY);
        localStorage.removeItem(SESSION_START_KEY);
        localStorage.setItem(LOGOUT_REASON_KEY, 'session_expired');
        showToast({ title: 'Sesión expirada', message: 'Por seguridad, tu sesión se cerró automáticamente luego de 12 horas.', type: 'error', duration: 2200 });
        setTimeout(() => { window.location.href = loginHref(); }, 900);
      } else {
        // Programar logout automático en esta pestaña
        try {
          setTimeout(() => {
            if (localStorage.getItem(AUTH_TOKEN_KEY)) {
              localStorage.removeItem(AUTH_TOKEN_KEY);
              localStorage.removeItem(USER_DATA_KEY);
              localStorage.removeItem(SESSION_START_KEY);
              localStorage.setItem(LOGOUT_REASON_KEY, 'session_expired');
              showToast({ title: 'Sesión expirada', message: 'Por seguridad, tu sesión se cerró automáticamente luego de 12 horas.', type: 'error', duration: 2200 });
              setTimeout(() => { window.location.href = loginHref(); }, 900);
            }
          }, remaining);
        } catch(_) {}
      }
    }
  }

  // ========= Gestor de inactividad =========
  let inactivityTimer = null;
  let promptTimer = null;
  let promptEl = null;

  function clearInactivityTimers(){
    if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
    if (promptTimer) { clearTimeout(promptTimer); promptTimer = null; }
  }

  function resetInactivityTimer(){
    // Si hay un prompt visible, lo cerramos porque el usuario ya interactuó
    if (promptEl) {
      try { promptEl.remove(); } catch(_) {}
      promptEl = null;
    }
    if (!localStorage.getItem(AUTH_TOKEN_KEY)) return; // no hay sesión
    clearInactivityTimers();
    inactivityTimer = setTimeout(showInactivityPrompt, INACTIVITY_LIMIT_MS);
  }

  function showInactivityPrompt(){
    // Crear overlay modal
    promptEl = document.createElement('div');
    promptEl.id = 'inactivity-prompt';
    promptEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:100000;';
    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.18);width:min(560px,92vw);padding:20px 22px;';
    const inactMin = Math.round(INACTIVITY_LIMIT_MS / 60000);
    card.innerHTML = `
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <div style="font-size:22px;">⏳</div>
        <div style="flex:1;">
          <div style="font-weight:800;color:#111;font-size:1.05rem;">¿Sigues ahí?</div>
          <div style="margin-top:6px;color:#333;">Has estado inactivo por ${inactMin} minutos. Para tu seguridad, cerraremos tu sesión en <strong id="inactivity-count">60</strong> segundos si no respondes.</div>
          <div style="display:flex;gap:10px;margin-top:14px;justify-content:flex-end;">
            <button id="stay-btn" class="btn-primary" style="padding:10px 14px;border-radius:8px;border:1px solid #E19A2E;background:#FBB03B;font-weight:800;color:#222;cursor:pointer;">Sí, sigo aquí</button>
            <button id="logout-now-btn" class="btn-secondary" style="padding:10px 14px;border-radius:8px;border:1px solid #d9dde3;background:#fff;font-weight:700;cursor:pointer;">Cerrar sesión ahora</button>
          </div>
        </div>
      </div>`;
    promptEl.appendChild(card);
    document.body.appendChild(promptEl);

    // Countdown 60s
    let remaining = INACTIVITY_PROMPT_TIMEOUT_MS / 1000;
    const countEl = card.querySelector('#inactivity-count');
    promptTimer = setInterval(()=>{
      remaining -= 1;
      if (remaining <= 0){
        clearInterval(promptTimer); promptTimer = null;
        // Auto logout por inactividad
        localStorage.setItem(LOGOUT_REASON_KEY, 'inactivity_timeout');
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(USER_DATA_KEY);
        localStorage.removeItem(SESSION_START_KEY);
        window.location.href = loginHref();
      } else if (countEl) {
        countEl.textContent = String(remaining);
      }
    }, 1000);

    // Botones
    card.querySelector('#stay-btn').addEventListener('click', ()=>{
      // Usuario confirmó que sigue ahí: resetear tiempo y ocultar
      if (promptTimer) { clearInterval(promptTimer); promptTimer = null; }
      try { promptEl.remove(); } catch(_) {}
      promptEl = null;
      resetInactivityTimer();
    });
    card.querySelector('#logout-now-btn').addEventListener('click', ()=>{
      if (promptTimer) { clearInterval(promptTimer); promptTimer = null; }
      localStorage.setItem(LOGOUT_REASON_KEY, 'inactivity_timeout');
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(USER_DATA_KEY);
      localStorage.removeItem(SESSION_START_KEY);
      window.location.href = loginHref();
    });
  }

  // Eventos que cuentan como actividad del usuario
  ['click','keydown','mousemove','scroll','touchstart','focus'].forEach(evt=>{
    window.addEventListener(evt, resetInactivityTimer, { passive: true });
  });
  resetInactivityTimer();
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initAuth);

// Exportar funciones para uso global
window.showAuthBusy = showAuthBusy;
window.hideAuthBusy = hideAuthBusy;
window.getAuthApiBase = getAuthApiBase;
window.auth = {
  isAuthenticated,
  getAuthToken,
  getUserData,
  isAdmin,
  login,
  logout,
  register,
  protectRoute,
  redirectIfAuthenticated,
  initAuth,
  loginHref,
  dashboardHref,
  showAuthBusy,
  hideAuthBusy
};
