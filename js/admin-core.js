/**
 * Admin Core - Configuración y funciones base del panel de administración
 * Este archivo contiene las constantes de API, funciones de utilidad y cache
 */

// ============ CONFIGURACIÓN DE API ============
const API_BASES = (function(){
  const arr = [];
  // 1) Producción oficial
  try { if (window.getAuthApiBase) { const b = window.getAuthApiBase(); if (b) arr.push(b); } } catch(_){ }
  try { const manual = localStorage.getItem('buenohotel_api_base'); if (manual) arr.push(manual); } catch(_){ }
  arr.push('https://core-api.buenohotel.com.do');
  try {
    const host = String(window.location.hostname || '');
    const isLocalHost = /localhost|127\.0\.0\.1/i.test(host);
    if (isLocalHost) {
      arr.push(new URL('/api', window.location.origin).origin);
      arr.push('http://localhost:3000');
    }
  } catch(_){ }
  return [...new Set(arr)];
})();

// Endpoint específico para administración de eventos (Lambda)
const ADMIN_EVENTOS_API_URL = 'https://h0q597no4j.execute-api.us-east-1.amazonaws.com/admin/eventos';
const ADMIN_EVENTOS_UPLOAD_URL = 'https://h0q597no4j.execute-api.us-east-1.amazonaws.com/admin/eventos/upload-imagen';

// ============ FUNCIONES DE UTILIDAD ============
function getQueryParam(name){
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get(name);
  } catch(_){
    return null;
  }
}

function buildAdminCandidates(){
  const arr = [];
  try {
    const qApi = getQueryParam('admin_eventos_api_url');
    if (qApi) arr.push(String(qApi));
  } catch(_){ }
  try {
    const qUpload = getQueryParam('admin_eventos_upload_url');
    if (qUpload) arr.push(String(qUpload));
  } catch(_){ }
  try {
    const manualApi = localStorage.getItem('buenohotel_admin_eventos_api_url');
    if (manualApi) arr.push(String(manualApi));
  } catch(_){ }
  try {
    const manualUpload = localStorage.getItem('buenohotel_admin_eventos_upload_url');
    if (manualUpload) arr.push(String(manualUpload));
  } catch(_){ }
  arr.push(ADMIN_EVENTOS_API_URL);
  arr.push(ADMIN_EVENTOS_UPLOAD_URL);
  API_BASES.forEach(base=>{
    try {
      const b = String(base||'').replace(/\/$/, '');
      if (!b) return;
      arr.push(b + '/admin/eventos');
      arr.push(b + '/admin/eventos/upload-imagen');
    } catch(_){ }
  });
  return [...new Set(arr)].filter(Boolean);
}

async function fetchFirstOk(urls, options){
  let lastErr = null;
  for (const u of (urls||[])){
    try {
      const resp = await fetch(u, options);
      return resp;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Failed to fetch');
}

function getAdminEventosCandidates(){
  const all = buildAdminCandidates();
  return all.filter(u=>/\/admin\/eventos\/?$/.test(String(u)));
}

function getAdminUploadCandidates(){
  const all = buildAdminCandidates();
  return all.filter(u=>/\/admin\/eventos\/upload-imagen\/?$/.test(String(u)));
}

const ENABLE_FALLBACK_DETAILS = false;

// Mapa id -> nombre de evento para mostrar etiquetas amigables
let EVENTS_NAME_MAP = {};
// Mapa id -> precio del evento
let EVENTS_PRICE_MAP = {};
const getEventLabel = (id) => {
  if (!id) return '-';
  return EVENTS_NAME_MAP[id] || id;
};
const getEventPrice = (id) => {
  if (!id) return 0;
  return Number(EVENTS_PRICE_MAP[id] || 0);
};

function eventMonedaOf(ev) {
  const m = String(
    ev?.precio_moneda || ev?.moneda || ev?.preciosPredefinidos?.moneda || ev?.precios_predefinidos?.moneda || 'DOP'
  ).trim().toUpperCase();
  return m === 'USD' ? 'USD' : 'DOP';
}

function normalizeEventoPricing(evRaw) {
  const ev = (evRaw && typeof evRaw === 'object' && typeof unwrapDynamoValue === 'function')
    ? unwrapDynamoValue(evRaw)
    : (evRaw || {});
  if (!ev || typeof ev !== 'object') {
    return { id: '', nombre: '', precio: 0, moneda: 'DOP', preciosPredefinidos: null };
  }
  const precio = Number(ev.precio || ev.precio_por_persona || ev.precioPorPersona || ev.precioBase || 0) || 0;
  let pp = ev.preciosPredefinidos || ev.precios_predefinidos || null;
  if (pp && typeof pp === 'object') {
    const list = Array.isArray(pp.precios) ? pp.precios : [];
    pp = {
      habilitado: pp.habilitado === true || pp.habilitado === 'true' || pp.habilitado === 'on',
      moneda: String(pp.moneda || 'DOP').toUpperCase() === 'USD' ? 'USD' : 'DOP',
      precios: list.map((p) => ({
        cantidad: Number(p?.cantidad || 0) || 0,
        precio: Number(p?.precio || 0) || 0
      })).filter((p) => p.cantidad > 0)
    };
  } else {
    pp = null;
  }
  const moneda = eventMonedaOf({ ...ev, preciosPredefinidos: pp });
  return {
    id: ev.id || '',
    nombre: ev.nombre || '',
    precio,
    moneda,
    preciosPredefinidos: pp
  };
}

function calcPrecioTotalEvento(eventoNorm, cantHuespedes, totalTours) {
  const cant = Math.max(1, Number(cantHuespedes) || 1);
  const tours = Number(totalTours) || 0;
  const precioUnit = Number(eventoNorm?.precio || 0) || 0;
  const usable = Array.isArray(eventoNorm?.preciosPredefinidos?.precios)
    ? eventoNorm.preciosPredefinidos.precios.filter((p) => Number(p.precio) > 0)
    : [];
  let base = 0;
  if (usable.length) {
    const match = usable.find((p) => Number(p.cantidad) === cant);
    if (match) {
      base = Number(match.precio) || 0;
    } else {
      const menores = usable
        .filter((p) => Number(p.cantidad) < cant)
        .sort((a, b) => Number(b.cantidad) - Number(a.cantidad));
      if (menores.length) {
        const b0 = menores[0];
        const unit = Number(usable.find((p) => Number(p.cantidad) === 1)?.precio) || precioUnit;
        base = Number(b0.precio || 0) + (cant - Number(b0.cantidad)) * unit;
      } else {
        base = precioUnit * cant;
      }
    }
  } else {
    base = precioUnit * cant;
  }
  return Number((Number(base) + tours).toFixed(2));
}

function pagoCubrePrecioTotal(aprobado, precioTotal) {
  const a = Math.round(Number(aprobado || 0) * 100);
  const t = Math.round(Number(precioTotal || 0) * 100);
  return t > 0 && a >= t;
}

const EVENT_PRICING_CACHE = {};
async function ensureEventoPricing(eventoId) {
  const id = String(eventoId || '').trim();
  if (!id) return { id: '', nombre: '', precio: 0, moneda: 'DOP', preciosPredefinidos: null };
  if (EVENT_PRICING_CACHE[id]) return EVENT_PRICING_CACHE[id];
  let merged = normalizeEventoPricing(window.EVENTS_FULL_MAP?.[id] || {});
  const hasPrice = (merged.precio > 0) || (merged.preciosPredefinidos?.precios || []).some((p) => Number(p.precio) > 0);
  if (!hasPrice) {
    const bases = [];
    try {
      if (window.getAuthApiBase) {
        const b = String(window.getAuthApiBase() || '').replace(/\/$/, '');
        if (b) bases.push(b);
      }
    } catch (_) {}
    bases.push('https://core-api.buenohotel.com.do');
    for (const base of bases) {
      try {
        const { resp, data } = await fetchJson(`${base}/api/eventos/${encodeURIComponent(id)}`, { headers: authHeaders() });
        if (resp.ok) {
          merged = { ...merged, ...normalizeEventoPricing(data?.data || data) };
          break;
        }
      } catch (_) {}
    }
  }
  if (!window.EVENTS_FULL_MAP) window.EVENTS_FULL_MAP = {};
  window.EVENTS_FULL_MAP[id] = { ...(window.EVENTS_FULL_MAP[id] || {}), ...merged };
  EVENTS_PRICE_MAP[id] = merged.precio || 0;
  EVENT_PRICING_CACHE[id] = merged;
  return merged;
}

function authHeaders(){
  const t = (window.auth && window.auth.getAuthToken) ? window.auth.getAuthToken() : null;
  return t ? { 'Authorization': `Bearer ${t}` } : {};
}

function normalizeObservaciones(v){
  const s = (v == null ? '' : String(v));
  return s.trim() ? s : 'N/A';
}

// ============ CACHE DE REGISTROS Y USUARIOS ============
const REG_CACHE = {};
const USER_CACHE = {};

async function fetchJson(url, options={}) {
  try {
    const resp = await fetch(url, {
      ...options,
      headers: { ...(options.headers||{}), 'Content-Type':'application/json' }
    });
    const data = await resp.json().catch(()=>({}));
    return { resp, data };
  } catch (error) {
    return { resp: { ok:false, status:0 }, data: { message: String(error) } };
  }
}

async function getUserProfileCached(userId){
  const key = String(userId || '').trim();
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(USER_CACHE, key)) return USER_CACHE[key];
  let lastErr = null;
  for (const base of API_BASES){
    try{
      const { resp, data } = await fetchJson(`${base}/api/usuarios/${encodeURIComponent(key)}`, { headers: authHeaders() });
      if (resp && resp.status === 404){
        USER_CACHE[key] = null;
        return null;
      }
      if (!resp.ok) throw new Error(data?.message || `HTTP ${resp.status}`);
      const u = data?.data || data;
      USER_CACHE[key] = u;
      return u;
    } catch(e){ lastErr = e; continue; }
  }
  console.warn('No se pudo cargar usuario', key, lastErr);
  return null;
}

function getUserForRow(it){
  const uid = String(it?.userId || it?.usuarioId || it?.usuario?.id || '').trim();
  return (uid && USER_CACHE[uid]) || null;
}

async function getRegistroDetailCached(registroIdOrCode, opts){
  if (!registroIdOrCode) return null;
  const key = String(registroIdOrCode).trim();
  if (!key) return null;
  const force = !!(opts && opts.force);
  if (!force && REG_CACHE[key]) return REG_CACHE[key];
  let lastErr = null;
  for (const base of API_BASES){
    try{
      const { resp, data } = await fetchJson(`${base}/api/reservas/${encodeURIComponent(key)}`, { headers: authHeaders() });
      if (!resp.ok) throw new Error(data?.message || `HTTP ${resp.status}`);
      const det = data?.data || data;
      REG_CACHE[key] = det;
      try {
        const rid = String(det?.id || det?.registroId || '').trim();
        if (rid) REG_CACHE[rid] = det;
      } catch(_){ }
      try {
        const cc = String(det?.codigoCorto || det?.codigo || '').trim();
        if (cc) REG_CACHE[cc] = det;
      } catch(_){ }
      return det;
    } catch(e){ lastErr = e; continue; }
  }
  console.warn('No se pudo cargar registro para export', key, lastErr);
  return null;
}

function invalidateRegistroCache(registroIdOrCode){
  const key = String(registroIdOrCode || '').trim();
  const seen = new Set();
  const drop = (k) => {
    const s = String(k || '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    const item = REG_CACHE[s];
    delete REG_CACHE[s];
    if (item && typeof item === 'object') {
      drop(item.id);
      drop(item.registroId);
      drop(item.codigoCorto);
      drop(item.codigo);
    }
  };
  drop(key);
}

function getDetailForRow(it){
  const rid = String(it?.registroId || '').trim();
  const cc = String(it?.codigoCorto || it?.codigo || '').trim();
  return (rid && REG_CACHE[rid]) || (cc && REG_CACHE[cc]) || null;
}

// ============ FUNCIONES DE CÁLCULO ============
function diffNoches(entrada, salida){
  const d1 = new Date(entrada); const d2 = new Date(salida);
  if (isNaN(d1) || isNaN(d2)) return '';
  const ms = d2 - d1; if (ms <= 0) return 0;
  return Math.round(ms / (1000*60*60*24));
}

function calcularEdad(fechaNac){
  if (!fechaNac) return '';
  const fn = new Date(fechaNac);
  if (isNaN(fn)) return '';
  const hoy = new Date();
  let edad = hoy.getFullYear() - fn.getFullYear();
  const m = hoy.getMonth() - fn.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) edad--;
  return edad;
}

// ============ HELPERS DE HTML ============
function escapeHtml(str){
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlight(str, q){
  const s = String(str || '');
  const query = String(q || '').trim();
  if (!query) return escapeHtml(s);
  try {
    const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return escapeHtml(s).replace(re, (m)=>`<mark>${escapeHtml(m)}</mark>`);
  } catch(_) {
    return escapeHtml(s);
  }
}

function downloadBlob(content, filename, type="text/plain;charset=utf-8"){ 
  try {
    const t = String(type || '').toLowerCase();
    const isText = t.startsWith('text/');
    const isCsvOrTxt = t.includes('text/csv') || t.includes('text/plain') || t.includes('application/vnd.ms-excel');
    if (isText && isCsvOrTxt && typeof content === 'string') {
      content = '\ufeff' + content;
    }
  } catch(_){ }
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
}

function uniqByRegistroId(rows){
  const seen = new Set();
  const out = [];
  (rows||[]).forEach(it=>{
    const key = String(it?.registroId || '');
    if (!key) { out.push(it); return; }
    if (seen.has(key)) return;
    seen.add(key);
    out.push(it);
  });
  return out;
}

// Unwrap DynamoDB AttributeValue format to plain JS
function unwrapDynamoValue(val) {
  if (val == null) return val;
  if (typeof val !== 'object') return val;
  if ('S' in val) return val.S;
  if ('N' in val) return Number(val.N);
  if ('BOOL' in val) return !!val.BOOL;
  if ('NULL' in val) return null;
  if ('M' in val) {
    const out = {};
    for (const k of Object.keys(val.M || {})) {
      out[k] = unwrapDynamoValue(val.M[k]);
    }
    return out;
  }
  if ('L' in val) {
    return (val.L || []).map(unwrapDynamoValue);
  }
  if (typeof val === 'object' && !Array.isArray(val)) {
    const out = {};
    for (const k of Object.keys(val)) {
      out[k] = unwrapDynamoValue(val[k]);
    }
    return out;
  }
  return val;
}

// Contador total/filtrado
function setCounts(total, filtered){
  const totalEl = document.getElementById('payments-total');
  const filtEl = document.getElementById('payments-filtered');
  if (totalEl) totalEl.textContent = String(total || 0);
  if (filtEl) filtEl.textContent = String(filtered || 0);
}

// Paginación de listas del admin (filtro completo → luego recorte de página)
const ADMIN_PAGE_SIZE_KEY = 'eventos_admin_page_size';
const ADMIN_PAGE_SIZE_OPTS = [5, 10, 15, 25, 'todas'];

function getAdminPageSize(){
  try {
    const v = String(localStorage.getItem(ADMIN_PAGE_SIZE_KEY) || '10');
    if (v === 'todas') return 'todas';
    const n = Number(v);
    if (ADMIN_PAGE_SIZE_OPTS.includes(n)) return n;
  } catch (_) {}
  return 10;
}

function setAdminPageSize(v){
  const raw = String(v);
  const ok = raw === 'todas' || ADMIN_PAGE_SIZE_OPTS.includes(Number(raw));
  try { localStorage.setItem(ADMIN_PAGE_SIZE_KEY, ok ? raw : '10'); } catch (_) {}
}

function fillAdminPageSizeSelect(el){
  if (!el) return;
  const cur = String(getAdminPageSize());
  el.innerHTML = [
    ['5', '5'],
    ['10', '10'],
    ['15', '15'],
    ['25', '25'],
    ['todas', 'Todas']
  ].map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('');
}

function syncAdminPageSizeSelects(){
  const cur = String(getAdminPageSize());
  ['pagos-page-size', 'users-page-size', 'events-page-size'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value !== cur) el.value = cur;
  });
}

function sliceAdminPage(items, page, pageSize){
  const arr = Array.isArray(items) ? items : [];
  const total = arr.length;
  if (pageSize === 'todas') {
    return { items: arr, page: 1, pages: 1, from: total ? 1 : 0, to: total, total };
  }
  const size = Number(pageSize) || 10;
  const pages = Math.max(1, Math.ceil(total / size) || 1);
  const p = Math.min(Math.max(1, Number(page) || 1), pages);
  const start = (p - 1) * size;
  const slice = arr.slice(start, start + size);
  return {
    items: slice,
    page: p,
    pages,
    from: total ? start + 1 : 0,
    to: start + slice.length,
    total
  };
}

function renderAdminPager(el, state, onPage){
  if (!el) return;
  const total = Number(state?.total || 0);
  const page = Number(state?.page || 1);
  const pages = Number(state?.pages || 1);
  const from = Number(state?.from || 0);
  const to = Number(state?.to || 0);
  if (!total) {
    el.innerHTML = '';
    el.hidden = true;
    return;
  }
  el.hidden = false;
  let nums = '';
  if (pages > 1) {
    const startN = Math.max(1, page - 2);
    const endN = Math.min(pages, page + 2);
    if (startN > 1) nums += `<button type="button" class="admin-page-btn" data-page="1">1</button>`;
    if (startN > 2) nums += `<span class="admin-page-ellipsis">…</span>`;
    for (let n = startN; n <= endN; n++) {
      nums += `<button type="button" class="admin-page-btn${n === page ? ' is-active' : ''}" data-page="${n}">${n}</button>`;
    }
    if (endN < pages - 1) nums += `<span class="admin-page-ellipsis">…</span>`;
    if (endN < pages) nums += `<button type="button" class="admin-page-btn" data-page="${pages}">${pages}</button>`;
  }
  const prevDis = page <= 1 ? ' disabled' : '';
  const nextDis = page >= pages ? ' disabled' : '';
  el.innerHTML = `
    <div class="admin-pager-info">Mostrando ${from}–${to} de ${total} · Página ${page} de ${pages}</div>
    ${pages > 1 ? `<div class="admin-pager-controls">
      <button type="button" class="admin-page-btn" data-page="${page - 1}"${prevDis}>Anterior</button>
      ${nums}
      <button type="button" class="admin-page-btn" data-page="${page + 1}"${nextDis}>Siguiente</button>
    </div>` : ''}`;
  el.querySelectorAll('.admin-page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const p = Number(btn.getAttribute('data-page'));
      if (!Number.isFinite(p) || p < 1) return;
      onPage(p);
    });
  });
}

function hideAdminWait() {
  try { document.getElementById('admin-wait-overlay')?.remove(); } catch (_) {}
}

function showAdminWait(message) {
  hideAdminWait();
  const overlay = document.createElement('div');
  overlay.id = 'admin-wait-overlay';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = `<div class="admin-wait-box">
    <div class="admin-wait-spin" aria-hidden="true"></div>
    <p class="admin-wait-msg">${String(message || 'Un momento, por favor…')}</p>
  </div>`;
  document.body.appendChild(overlay);
}

async function withAdminWait(message, fn) {
  showAdminWait(message);
  try {
    return await fn();
  } finally {
    hideAdminWait();
  }
}

console.log('[admin-core.js] Cargado correctamente');
