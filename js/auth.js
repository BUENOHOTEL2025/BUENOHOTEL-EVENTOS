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
      return 'https://api.buenohotel.com.do';
    }
    // Si estamos sirviendo el frontend con Live Server (5500) o desde file://, usar backend local 3000
    if (port === '5500' || protocol === 'file:') {
      return 'http://localhost:3000';
    }
    return new URL('/api', origin).origin;
  } catch(_) {}
  return 'http://localhost:3000';
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

// Almacenamiento local para el token de autenticación
const AUTH_TOKEN_KEY = 'buenohotel_auth_token';
const USER_DATA_KEY = 'buenohotel_user_data';
const SESSION_START_KEY = 'buenohotel_session_start';
const LOGOUT_REASON_KEY = 'buenohotel_logout_reason';
const MAX_SESSION_MS = 12 * 60 * 60 * 1000; // 12 horas
const INACTIVITY_LIMIT_MS = 10 * 60 * 1000; // 10 minutos
const INACTIVITY_PROMPT_TIMEOUT_MS = 60 * 1000; // 1 minuto para responder

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
    cont.style.zIndex = '10000';
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
  function playSuccessSound() {
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

// Función para iniciar sesión
async function login(email, password) {
  try {
    const base = getAuthApiBase();
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Error al iniciar sesión');
    }

    // Guardar token y datos del usuario
    const token = data.token || data?.data?.token;
    const user = data.user || data?.data?.user;
    if (!token || !user) {
      throw new Error('Respuesta de autenticación inválida');
    }
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
    setSessionStart(Date.now());

    return { success: true, user };
  } catch (error) {
    console.error('Error en login:', error);
    return { success: false, message: error.message };
  }
}

// Función para cerrar sesión
function logout() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(USER_DATA_KEY);
  localStorage.removeItem(SESSION_START_KEY);
  // No tocar LOGOUT_REASON_KEY aquí; quien invoca logout puede setearlo antes
  ensureToast();
  showToast({ title: 'Sesión cerrada', message: 'Has salido correctamente', type: 'success', duration: 1200 });
  setTimeout(() => { window.location.href = 'login.html'; }, 900);
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
  if (!isAuthenticated() && !window.location.href.includes('login.html') && !window.location.href.includes('register.html')) {
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
    setTimeout(() => { window.location.href = 'login.html'; }, 900);
  }
}

// Función para redirigir si el usuario ya está autenticado
function redirectIfAuthenticated() {
  if (isAuthenticated() && (window.location.href.includes('login.html') || window.location.href.includes('register.html'))) {
    window.location.href = 'dashboard.html';
  }
}

// Inicializar la autenticación
function initAuth() {
  // Asegurar toasts disponibles en cualquier página
  try { ensureToast(); } catch(_) {}
  // Verificar autenticación en cada carga de página
  if (window.location.pathname.includes('dashboard.html') || 
      window.location.pathname.endsWith('/') && !window.location.href.includes('login.html') && 
      !window.location.href.includes('register.html')) {
    // Si la sesión está expirada, realizar logout inmediato y redirigir a login
    if (localStorage.getItem(AUTH_TOKEN_KEY) && hasSessionExpired()) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(USER_DATA_KEY);
      localStorage.removeItem(SESSION_START_KEY);
      localStorage.setItem(LOGOUT_REASON_KEY, 'session_expired');
      showToast({ title: 'Sesión expirada', message: 'Por seguridad, tu sesión se cerró automáticamente luego de 24 horas.', type: 'error', duration: 2200 });
      setTimeout(() => { window.location.href = 'login.html'; }, 900);
      return;
    }
    protectRoute();
  } else {
    redirectIfAuthenticated();
  }

  // Interceptor de enlaces que requieren auth
  document.addEventListener('click', function(e) {
    const anchor = e.target.closest('a[data-requires-auth]');
    if (!anchor) return;
    if (!isAuthenticated()) {
      e.preventDefault();
      ensureToast();
      showToast({ title: 'Inicia sesión', message: 'Necesitas iniciar sesión para acceder.', type: 'error', duration: 1600 });
      setTimeout(() => { window.location.href = 'login.html'; }, 900);
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
        setTimeout(() => { window.location.href = 'login.html'; }, 900);
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
              setTimeout(() => { window.location.href = 'login.html'; }, 900);
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
        window.location.href = 'login.html';
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
      window.location.href = 'login.html';
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
window.auth = {
  isAuthenticated,
  getAuthToken,
  getUserData,
  login,
  logout,
  register,
  protectRoute,
  redirectIfAuthenticated,
  initAuth
};
