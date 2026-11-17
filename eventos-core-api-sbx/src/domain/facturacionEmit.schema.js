/**
 * Contrato JSON para POST /api/facturacion/emitir
 * Acepta registroId (Eventos) o payload directo (factura manual).
 *
 * GET /api/facturacion/validacion/:trackId  → estado DGII del comprobante (mismo trackId del POST emitir).
 * GET /api/facturacion/estado/:id            → registro local; ?consultarDgii=1 refresca con el trackId.
 */

export const TIPO_ECF = Object.freeze({
  CREDITO_FISCAL: 31,
  CONSUMO: 32
});

/**
 * @typedef {object} FacturacionEmitPayload
 * @property {string} [registroId]
 * @property {number} [tipoeCF] 31 | 32 (si no, se infiere por RNC comprador)
 * @property {boolean} [force] reemitir aunque ya exista ncfElectronico
 * @property {boolean} [dryRun] override de DGII_ECF_DRY_RUN
 * @property {object} [emisor]
 * @property {object} [comprador]
 * @property {object[]} [lineas]
 * @property {object} [totales]
 * @property {object} [documento]
 * @property {object} [transaccion]
 */

export function digitsOnly(v) {
  return String(v ?? '').replace(/\D/g, '');
}

export function inferTipoeCF(comprador = {}) {
  const rnc = digitsOnly(comprador.rncCliente || comprador.rncComprador || comprador.rnc);
  if (rnc.length >= 9) return TIPO_ECF.CREDITO_FISCAL;
  return TIPO_ECF.CONSUMO;
}

export function normalizeTipoeCF(raw, comprador) {
  const n = Number(raw);
  if (n === 31 || n === 32) return n;
  return inferTipoeCF(comprador || {});
}

/**
 * Valida payload mínimo cuando no hay registroId (factura directa).
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateDirectEmitPayload(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requerido' };
  const comprador = body.comprador || {};
  const lineas = body.lineas;
  const totales = body.totales || {};
  if (!Array.isArray(lineas) || !lineas.length) {
    return { ok: false, error: 'lineas[] requerido cuando no hay registroId' };
  }
  const nombre = String(comprador.nombreRazon || comprador.razonSocialComprador || '').trim();
  if (!nombre) return { ok: false, error: 'comprador.nombreRazon requerido (razón social de la empresa)' };
  const rnc = digitsOnly(comprador.rncCliente || comprador.rncComprador || comprador.rnc);
  if (rnc.length < 9 || rnc.length > 11) {
    return { ok: false, error: 'comprador.rnc de la empresa requerido (9–11 dígitos)' };
  }
  const email = String(comprador.email || comprador.correo || comprador.emailFiscal || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'comprador.email de la empresa requerido' };
  }
  const tel = digitsOnly(comprador.telefono || comprador.telefonoFiscal || '');
  if (tel.length !== 10 || !/^8(09|29|49)/.test(tel)) {
    return { ok: false, error: 'comprador.telefono: 10 dígitos que empiecen por 809, 829 o 849' };
  }
  const dir = String(comprador.direccion || comprador.direccionFiscal || '').trim();
  if (!dir) return { ok: false, error: 'comprador.direccion de la empresa requerida' };
  for (let i = 0; i < lineas.length; i += 1) {
    const desc = String(lineas[i]?.descripcion || lineas[i]?.NombreItem || '').trim();
    if (!desc) return { ok: false, error: `lineas[${i}].descripcion requerida` };
  }
  const total = Number(totales.totalRD ?? totales.MontoTotal ?? totales.montoTotal);
  if (!Number.isFinite(total) || total <= 0) {
    return { ok: false, error: 'totales.totalRD / MontoTotal inválido' };
  }
  return { ok: true };
}

/** Misma regla para panel, Booking, Eventos o cualquier otro origen. */
export function validateDraftEmit(draft) {
  return validateDirectEmitPayload({
    comprador: draft?.comprador || {},
    lineas: Array.isArray(draft?.lineas) ? draft.lineas : [],
    totales: draft?.totales || {}
  });
}

export function isDryRunDefault() {
  const v = String(process.env.DGII_ECF_DRY_RUN ?? 'true').trim().toLowerCase();
  return !(v === 'false' || v === '0' || v === 'no');
}

export function resolveDgiiEnvironment() {
  const raw = String(process.env.DGII_ECF_ENVIRONMENT || 'CERT').trim().toUpperCase();
  if (raw === 'PROD' || raw === 'ECF') return 'PROD';
  if (raw === 'DEV' || raw === 'TESTECF') return 'DEV';
  return 'CERT';
}
