let cache = { ts: 0, value: null };

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url) {
  // Lambda puede correr en Node sin fetch global; usar https como fallback.
  if (typeof fetch === 'function') {
    const resp = await fetch(url);
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
  }
  const { request } = await import('node:https');
  return await new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET' }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
        resolve({ ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300, status: res.statusCode || 0, data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Tasa USD -> DOP.
 * Fuente primaria: FACTURA_TASA_CAMBIO (env).
 * Fuente secundaria: admin-eventos lambda /admin/eventos/tasa-cambio (la misma que usa el panel admin).
 */
export async function getTasaCambio() {
  const envVal = num(process.env.FACTURA_TASA_CAMBIO || process.env.TASA_CAMBIO_USD_DOP);
  if (envVal && envVal > 0) return envVal;

  const fallback = num(process.env.FACTURA_TASA_CAMBIO_FALLBACK || 61) || 61;

  const ttlMs = 5 * 60 * 1000;
  const now = Date.now();
  if (cache.value && now - cache.ts < ttlMs) return cache.value;

  const url =
    process.env.ADMIN_EVENTOS_TASA_CAMBIO_URL ||
    'https://h0q597no4j.execute-api.us-east-1.amazonaws.com/admin/eventos/tasa-cambio';

  try {
    const { ok, status, data } = await fetchJson(url);
    if (!ok) throw new Error(`No se pudo obtener tasa (HTTP ${status})`);

    const tasa = num(data?.data?.tasaCambio ?? data?.tasaCambio ?? data?.tasa ?? data?.valor);
    if (!tasa || tasa <= 0) throw new Error('Tasa inválida');

    cache = { ts: now, value: tasa };
    return tasa;
  } catch (_e) {
    // Si falla la fuente remota, usar fallback para no tumbar el comprobante.
    cache = { ts: now, value: fallback };
    return fallback;
  }
}

