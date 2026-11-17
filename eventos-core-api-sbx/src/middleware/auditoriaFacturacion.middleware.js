import {
  writeAudit,
  userFromReq,
  clientIp,
  navegadorDe,
  sanitizeValue
} from '../services/auditoriaEcf.service.js';

function skipPath(req) {
  const p = String(req.originalUrl || req.path || req.url || '').split('?')[0];
  if (req.method === 'OPTIONS') return true;
  if (req.method === 'GET') return true;
  if (p.endsWith('/_health')) return true;
  if (req.method === 'GET' && /\/me\/?$/.test(p)) return true;
  if (req.method === 'GET' && /\/admins\/?$/.test(p)) return true;
  if ((req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') && /\/admins(\/|$)/.test(p)) return true;
  if (/\/admins\/invite/.test(p)) return true;
  if (/\/notificaciones/.test(p)) return true;
  if (/\/solicitar-permisos/.test(p)) return true;
  if (req.method === 'POST' && /\/auditoria\/sesion\/?$/.test(p)) return true;
  if (/\/auditoria\/(sesion|evento|lock)/.test(p)) return true;
  if (req.method === 'GET' && /\/auditoria\/?$/.test(p)) return true;
  return false;
}

function accionApi(req) {
  const m = String(req.method || '');
  const p = String(req.path || req.originalUrl || '').split('?')[0];
  if (m === 'POST' && /\/emitir\/?$/.test(p)) return 'Emitir e-CF';
  if (m === 'POST' && /\/preview\/?$/.test(p)) return 'Vista previa';
  if (m === 'PUT' && /\/borrador\/?$/.test(p)) return 'Guardar factura';
  if (m === 'POST' && /\/empresas\/?$/.test(p)) return 'Guardar empresa';
  if (m === 'DELETE' && /\/empresas\//.test(p)) return 'Eliminar empresa';
  if (m === 'POST' && /\/empresas\/[^/]+\/uso/.test(p)) return 'Usar empresa';
  if (m === 'PUT' && /\/empresas\/config/.test(p)) return 'Configurar empresas';
  if (m === 'POST' && /\/comprobantes\/refrescar/.test(p)) return 'Actualizar estados DGII';
  return `api_${m}_${p.replace(/[^\w/.-]/g, '').slice(0, 80)}`;
}

function compactPayload(req, captured, user) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const comprador = body.comprador && typeof body.comprador === 'object' ? body.comprador : {};
  const totales = body.totales && typeof body.totales === 'object' ? body.totales : {};
  const form = body.form && typeof body.form === 'object' ? body.form : {};
  const r = captured && typeof captured === 'object' && !Array.isArray(captured) ? captured : {};
  const quien = user.nombre || user.email || 'Usuario';
  const rnc = comprador.rnc || comprador.rncCliente || form.rnc || body.rnc || '';
  const nombreRazon = comprador.nombreRazon || form.nombreRazon || body.nombreRazon || body.razonSocial || '';
  const totalRD = totales.totalRD ?? form.totalRD ?? body.totalRD;
  const encf = r.encf || body.encf || '';
  const estado = r.estado || '';
  const accion = accionApi(req);
  const bits = [`${quien} ejecutó ${accion}`];
  if (nombreRazon || rnc) bits.push(nombreRazon ? `${nombreRazon}${rnc ? ` (RNC ${rnc})` : ''}` : `RNC ${rnc}`);
  if (totalRD != null && totalRD !== '') bits.push(`RD$ ${totalRD}`);
  if (encf) bits.push(String(encf));
  if (estado) bits.push(String(estado));
  return {
    resumen: bits.join(' · ') + '.',
    rnc,
    nombreRazon,
    totalRD,
    encf,
    trackId: r.trackId || body.trackId || '',
    estado,
    email: comprador.email || form.email || body.email || '',
    telefono: comprador.telefono || form.telefono || body.telefono || '',
    origen: body.origen || ''
  };
}

function resumenRespuesta(body, contentType) {
  if (body == null) return null;
  if (typeof body === 'string') {
    const ct = String(contentType || '');
    if (ct.includes('html') || body.trim().startsWith('<')) {
      return { tipo: 'html', bytes: body.length };
    }
    return { texto: body.slice(0, 400) };
  }
  if (typeof body !== 'object') return { valor: String(body).slice(0, 200) };
  const pick = {};
  for (const k of [
    'success',
    'message',
    'encf',
    'estado',
    'trackId',
    'codigo',
    'code',
    'rnc',
    'registroId'
  ]) {
    if (body[k] != null) pick[k] = body[k];
  }
  if (body.error) pick.error = sanitizeValue(body.error);
  if (Array.isArray(body.items)) pick.itemsCount = body.items.length;
  if (body.empresa) pick.empresa = sanitizeValue(body.empresa);
  return Object.keys(pick).length ? pick : sanitizeValue(body);
}

export function auditoriaFacturacion(req, res, next) {
  if (skipPath(req)) return next();
  const started = Date.now();
  const chunks = [];
  const origJson = res.json.bind(res);
  const origSend = res.send.bind(res);
  let captured = null;

  res.json = (body) => {
    captured = body;
    return origJson(body);
  };
  res.send = (body) => {
    if (captured == null) captured = body;
    if (body && typeof body !== 'string' && !Buffer.isBuffer(body)) captured = body;
    else if (typeof body === 'string') chunks.push(body);
    return origSend(body);
  };

  res.on('finish', () => {
    const user = userFromReq(req);
    const ua = String(req.headers['user-agent'] || '');
    const rawBody = captured != null ? captured : chunks.join('');
    const ok = res.statusCode < 400;
    void writeAudit({
      canal: 'api',
      accion: accionApi(req),
      resultado: ok ? 'ok' : res.statusCode === 400 ? 'validacion' : 'error',
      statusCode: res.statusCode,
      usuarioEmail: user.email,
      usuarioNombre: user.nombre,
      userId: user.userId,
      ip: clientIp(req),
      userAgent: ua,
      navegador: navegadorDe(ua),
      method: req.method,
      path: String(req.originalUrl || req.url || req.path || '').split('?')[0],
      query: req.query,
      payload: compactPayload(req, rawBody, user),
      respuesta: resumenRespuesta(rawBody, res.getHeader('content-type')),
      duracionMs: Date.now() - started,
      motivo: ok ? '' : String(rawBody?.message || rawBody?.error || res.statusMessage || '')
    }).catch((err) => console.error('auditoria api:', err?.message || err));
  });

  next();
}
