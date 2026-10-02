(function () {
  let ECF_CACHE = [];

  function coreApiBases() {
    const arr = [];
    try {
      if (window.getAuthApiBase) {
        const b = window.getAuthApiBase();
        if (b) arr.push(String(b).replace(/\/$/, ''));
      }
    } catch (_) {}
    arr.push('https://core-api.buenohotel.com.do');
    return [...new Set(arr)];
  }

  function escapeEcf(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function badgeEstado(row) {
    const ok = row.aprobadoDgii;
    const est = String(row.estado || '');
    let label = 'Sin consultar';
    let bg = '#64748b';
    if (ok || /acept/i.test(est)) {
      label = 'Aceptado';
      bg = '#28a745';
    } else if (/rechaz/i.test(est)) {
      label = 'No aceptado';
      bg = '#dc2626';
    } else if (/proceso|enviado/i.test(est)) {
      label = 'En revisión';
      bg = '#d97706';
    } else if (est) {
      label = est;
    }
    return `<span style="display:inline-block;padding:3px 8px;border-radius:999px;background:${bg};color:#fff;font-weight:800;font-size:11px;">${escapeEcf(label)}</span>`;
  }

  function ambienteClaro(env) {
    const e = String(env || '').toUpperCase();
    if (e === 'PROD') return 'Producción (comprobantes reales)';
    if (e === 'CERT' || e === 'CerteCF') return 'Certificación (pruebas DGII)';
    if (e === 'DEV' || e === 'TEST') return 'Pruebas';
    return env || '—';
  }

  function mensajesDgiiHtml(mensajes) {
    const list = Array.isArray(mensajes)
      ? mensajes
          .map((x) => {
            const texto = String(x?.valor || x?.mensaje || '').replace(/\s+/g, ' ').trim();
            const codigo = x?.codigo != null && String(x.codigo).trim() !== '' ? String(x.codigo).trim() : '';
            return { texto, codigo };
          })
          .filter((x) => x.texto)
      : [];
    const seen = new Set();
    const unique = list.filter((x) => {
      const k = `${x.codigo}|${x.texto}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (!unique.length) {
      return '<p style="margin:0; line-height:1.45;">Impuestos Internos no dejó observaciones en esta consulta.</p>';
    }
    return `<ul style="margin:0; padding-left:1.15rem; line-height:1.5;">${unique.map((x) =>
      `<li>${x.codigo ? `<span class="muted" style="font-size:11px;">Código ${escapeEcf(x.codigo)} · </span>` : ''}${escapeEcf(x.texto)}</li>`
    ).join('')}</ul>`;
  }

  function prettyJson(v) {
    try {
      return JSON.stringify(v, null, 2);
    } catch (_) {
      return String(v);
    }
  }

  function paintEcf(items) {
    const q = String(document.getElementById('ecf-search')?.value || '').trim().toLowerCase();
    const filtered = !q ? items : items.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    const tbody = document.getElementById('ecf-tbody');
    const table = document.getElementById('ecf-table');
    const state = document.getElementById('ecf-state');
    if (!tbody || !table || !state) return;
    if (!filtered.length) {
      table.style.display = 'none';
      state.textContent = q ? 'No hay coincidencias.' : 'Todavía no hay comprobantes enviados.';
      return;
    }
    state.textContent = `${filtered.length} comprobante(s)`;
    table.style.display = 'table';
    tbody.innerHTML = filtered
      .map((r) => {
        const rid = escapeEcf(r.registroId || '');
        const encf = escapeEcf(r.encf || '');
        const comprador = `${escapeEcf(r.razonSocial || r.clienteNombre || '—')}<div class="muted" style="font-size:11px;">RNC ${escapeEcf(r.rncComprador || '—')}</div>`;
        const fecha = r.emitidoAt ? new Date(r.emitidoAt).toLocaleString('es-DO') : '—';
        const origen = r.origen === 'booking' ? 'Booking' : r.origen === 'eventos' ? 'Eventos' : (r.eventoNombre || r.codigoCorto || '');
        const canPdf = Boolean(r.tieneImpresion || r.registroId);
        return `<tr>
            <td style="padding:8px 10px;border-bottom:1px solid #eee;font-weight:800;">${encf || '—'}<div class="muted" style="font-size:11px;">${escapeEcf(origen)}</div></td>
            <td style="padding:8px 10px;border-bottom:1px solid #eee;">${comprador}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #eee;">${badgeEstado(r)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #eee;white-space:nowrap;">${escapeEcf(fecha)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #eee;white-space:nowrap;">
              <button type="button" class="btn ecf-ver" data-id="${rid}" data-track="${escapeEcf(r.trackId || '')}" data-encf="${encf}" style="padding:6px 12px;font-size:12px;background:#1a365d;color:#fff;border:1px solid #0f2744;">Ver detalle</button>
              ${canPdf
                ? `<button type="button" class="btn ecf-pdf" data-id="${rid}" data-encf="${encf}" style="padding:6px 12px;font-size:12px;background:#FBB03B;color:#222;border:1px solid #E19A2E;">Ver factura</button>`
                : `<button type="button" class="btn" disabled title="Esta emisión anterior no tiene el XML/datos guardados. Las nuevas de Booking sí se podrán abrir." style="padding:6px 12px;font-size:12px;opacity:.55;">Ver factura</button>`}
            </td>
          </tr>`;
      })
      .join('');
  }

  async function apiJson(path, options = {}) {
    let lastErr = null;
    for (const base of coreApiBases()) {
      try {
        const { resp, data } = await fetchJson(`${base}${path}`, {
          ...options,
          headers: { ...authHeaders(), ...(options.headers || {}) }
        });
        if (!resp.ok) throw new Error(data?.message || `HTTP ${resp.status}`);
        return data;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Sin respuesta de la API');
  }

  async function cargarComprobantesEcf() {
    const state = document.getElementById('ecf-state');
    if (state) state.textContent = 'Cargando comprobantes…';
    try {
      const data = await apiJson('/api/facturacion/comprobantes');
      ECF_CACHE = data.items || [];
      const envEl = document.getElementById('ecf-env-label');
      const urlEl = document.getElementById('ecf-consulta-url');
        if (envEl) envEl.textContent = ambienteClaro(data.environment);
        if (urlEl) urlEl.style.display = 'none';
      paintEcf(ECF_CACHE);
    } catch (e) {
      if (state) state.textContent = e?.message || 'No se pudieron cargar los comprobantes.';
    }
  }

  window.cargarComprobantesEcf = cargarComprobantesEcf;

  function fmtMoney(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '';
    try {
      return v.toLocaleString('es-DO', { style: 'currency', currency: 'DOP' });
    } catch (_) {
      return String(v);
    }
  }

  function tracksFromConsulta(data) {
    const raw = data.apis?.tracks?.data;
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.tracks)) return raw.tracks;
    return [];
  }

  function renderConsulta(data) {
    const cr = data.apis?.consultaResultado?.data || {};
    const pub = data.apis?.estadoPublico?.ok ? data.apis.estadoPublico.data : null;
    const local = data.local || {};
    const prev = data.previewComprador;
    const t0 = tracksFromConsulta(data)[0] || {};
    const estado = cr.estado || t0.estado || local.estado || '—';
    const mensajes = cr.mensajes || local.mensajes || [];
    const rechazado = /rechaz/i.test(String(estado));
    const aceptado = Boolean(local.aprobadoDgii) || /acept/i.test(String(estado));
    const usado = cr.secuenciaUtilizada === true || cr.secuenciaUtilizada === 'true';
    const quePaso = aceptado
      ? (/condicional/i.test(String(estado))
        ? 'Impuestos Internos aceptó este comprobante con observaciones. Ya puedes usarlo.'
        : 'Impuestos Internos aceptó este comprobante. Ya puedes usarlo.')
      : rechazado
        ? 'Impuestos Internos no aceptó este envío. El número de comprobante ya quedó usado: si reenvías, se tomará el siguiente número.'
        : 'Aún está en proceso. Vuelve a consultar en un momento.';
    const empresa = prev?.razonSocial || pub?.razonSocial || local.razonSocial || local.clienteNombre || '—';
    const rnc = prev?.rnc || pub?.rncComprador || local.rncComprador || '—';
    const monto = fmtMoney(pub?.montoTotal);
    const fechaRec = cr.fechaRecepcion || t0.fechaRecepcion || '';
    const canXml = Boolean(local.aprobadoDgii) && Boolean(data.registroId || local.tieneXml);
    const canReemit = rechazado && data.registroId;
    const canPdf = Boolean(data.registroId || local.tieneImpresion);
    const fueraDeEventos = !data.registroId && (aceptado || Boolean(t0.trackId || t0.estado));
    const avisoFuera = fueraDeEventos
      ? (canPdf
        ? '<p style="margin:0 0 14px; font-size:0.95rem; line-height:1.45; color:#334155;">Este comprobante no es de un evento: se emitió desde Booking (u otro sistema) y queda guardado en este panel para verlo y descargarlo.</p>'
        : '<p style="margin:0 0 14px; font-size:0.95rem; line-height:1.45; color:#334155;">Este número existe en Impuestos Internos. Las emisiones anteriores a este cambio no tienen la factura guardada; las nuevas de Booking sí se podrán abrir y descargar aquí.</p>')
      : '';
    return `
      <p style="margin:0 0 14px; font-size:1.02rem; line-height:1.45;">${escapeEcf(quePaso)}</p>
      ${avisoFuera}
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:16px;">
        <div><div class="muted" style="font-size:11px;">Número</div><div style="font-weight:800;">${escapeEcf(data.encf || '—')}</div></div>
        <div><div class="muted" style="font-size:11px;">Resultado</div><div>${badgeEstado({ estado, aprobadoDgii: aceptado })}</div></div>
        <div><div class="muted" style="font-size:11px;">Empresa</div><div style="font-weight:700;">${escapeEcf(empresa)}</div><div class="muted" style="font-size:12px;">RNC ${escapeEcf(rnc)}</div></div>
        ${monto ? `<div><div class="muted" style="font-size:11px;">Monto</div><div style="font-weight:800;">${escapeEcf(monto)}</div></div>` : ''}
        <div><div class="muted" style="font-size:11px;">Enviado el</div><div>${escapeEcf(fechaRec || (local.emitidoAt ? new Date(local.emitidoAt).toLocaleString('es-DO') : '—'))}</div></div>
        <div><div class="muted" style="font-size:11px;">Ambiente</div><div>${escapeEcf(ambienteClaro(data.environment))}</div></div>
      </div>
      <div style="margin-bottom:14px; padding:14px; background:${rechazado ? '#fef2f2' : aceptado ? '#f0fdf4' : '#fffbeb'}; border-radius:12px;">
        <div style="font-weight:800; margin-bottom:6px;">Mensajes de Impuestos Internos</div>
        ${mensajesDgiiHtml(mensajes)}
        ${usado && rechazado ? '<p style="margin:10px 0 0; font-size:0.92rem;">Este número ya no se puede volver a usar. El botón de reenviar pide el siguiente número de la secuencia.</p>' : ''}
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
        ${aceptado ? '' : `<button type="button" class="btn" id="ecf-modal-refresh" data-registro="${escapeEcf(data.registroId || '')}" data-track="${escapeEcf(data.trackId || '')}" data-encf="${escapeEcf(data.encf || '')}">Volver a consultar</button>`}
        ${canPdf ? `<button type="button" class="btn" id="ecf-modal-pdf" data-id="${escapeEcf(data.registroId || data.encf || '')}" data-encf="${escapeEcf(data.encf || '')}">Ver factura</button>` : ''}
        ${canReemit ? `<button type="button" class="btn" id="ecf-modal-reemit" data-id="${escapeEcf(data.registroId || '')}" style="background:#b45309;color:#fff;border:none;">Reenviar con un número nuevo</button>` : ''}
      </div>
      <details style="margin-top:8px;">
        <summary style="cursor:pointer; color:#64748b; font-size:13px;">Ver datos técnicos (soporte)</summary>
        ${canXml ? `<p style="margin:12px 0 0;"><button type="button" class="btn" id="ecf-modal-xml" data-id="${escapeEcf(data.registroId || data.encf || '')}" data-encf="${escapeEcf(data.encf || '')}" style="background:#1a365d;color:#fff;border:1px solid #0f2744;">Descargar XML</button></p>` : ''}
        <pre style="margin:10px 0 0;background:#0f172a;color:#e2e8f0;padding:12px;border-radius:10px;overflow:auto;font-size:11px;line-height:1.4;">${escapeEcf(prettyJson({ consulta: cr, tracks: data.apis?.tracks?.data, publico: pub }))}</pre>
      </details>
    `;
  }

  function closeConsultaModal() {
    const m = document.getElementById('ecf-consulta-modal');
    if (m) m.style.display = 'none';
  }

  async function abrirConsulta(opts) {
    const modal = document.getElementById('ecf-consulta-modal');
    const body = document.getElementById('ecf-modal-body');
    const sub = document.getElementById('ecf-modal-sub');
    if (!modal || !body) return;
    modal.style.display = 'flex';
    body.innerHTML = 'Consultando en Impuestos Internos…';
    if (sub) sub.textContent = 'Un momento, por favor';
    try {
      const q = new URLSearchParams();
      if (opts.registroId) q.set('registroId', opts.registroId);
      if (opts.trackId) q.set('trackId', opts.trackId);
      if (opts.encf) q.set('encf', opts.encf);
      const data = await apiJson(`/api/facturacion/consulta?${q.toString()}`);
      body.innerHTML = renderConsulta(data);
      if (sub) sub.textContent = data.encf ? `Comprobante ${data.encf}` : 'Estado del comprobante';
      await cargarComprobantesEcf();
    } catch (e) {
      body.innerHTML = `<div style="color:#b91c1c;">${escapeEcf(e?.message || String(e))}</div>`;
    }
  }

  async function consultarTodosDgii() {
    try {
      const data = await apiJson('/api/facturacion/comprobantes/refrescar', {
        method: 'POST',
        body: JSON.stringify({ max: 40 })
      });
      ECF_CACHE = data.items || [];
      paintEcf(ECF_CACHE);
      if (typeof showAdminAlert === 'function') {
        showAdminAlert(
          (data.refreshed || 0) > 0
            ? `Estado actualizado en Impuestos Internos: ${data.refreshed} consulta(s).`
            : 'No había comprobantes pendientes de consultar. Los ya aceptados no se vuelven a preguntar.',
          { type: 'success' }
        );
      }
    } catch (e) {
      if (typeof showAdminAlert === 'function') showAdminAlert(e?.message || 'No se pudo consultar DGII', { type: 'error' });
    }
  }

  async function descargarXml(registroId, encf) {
    const key = String(encf || registroId || '').trim();
    let lastErr = null;
    for (const base of coreApiBases()) {
      try {
        const resp = await fetch(`${base}/api/facturacion/comprobantes/${encodeURIComponent(key)}/xml`, {
          headers: authHeaders()
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          throw new Error(data.message || `HTTP ${resp.status}`);
        }
        const blob = await resp.blob();
        const dispo = resp.headers.get('Content-Disposition') || '';
        const m = /filename="?([^"]+)"?/i.exec(dispo);
        const name = (m && m[1]) || `ecf-${key}.xml`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    if (typeof showAdminAlert === 'function') showAdminAlert(lastErr?.message || 'No se pudo descargar el XML', { type: 'error' });
  }

  async function abrirPdf(registroId, encf) {
    const run = async () => {
      let base = '';
      try {
        if (window.getAuthApiBase) base = String(window.getAuthApiBase()).replace(/\/$/, '');
      } catch (_) {}
      if (!base) base = 'https://core-api.buenohotel.com.do';
      const key = String(encf || registroId || '').trim();
      const url = `${base}/api/facturacion/comprobantes/${encodeURIComponent(key)}/html`;
      const resp = await fetch(url, { headers: authHeaders() });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.message || 'No se pudo abrir el PDF/HTML');
      }
      if (typeof openFacturaPreviewModal === 'function') {
        openFacturaPreviewModal(await resp.text(), { registroId: registroId || encf });
      } else {
        const w = window.open('', '_blank');
        if (w) w.document.write(await resp.text());
      }
    };
    if (typeof withAdminWait === 'function') {
      await withAdminWait('Abriendo la factura… espera un momento.', run);
    } else {
      await run();
    }
  }

  async function reemitir(registroId) {
    const ok = window.confirm(
      'Impuestos Internos ya usó ese número. Se enviará un comprobante NUEVO (el siguiente de la secuencia) con el RNC y luego el nombre de la empresa.\n¿Reenviar ahora?'
    );
    if (!ok) return;
    const data = await apiJson('/api/facturacion/emitir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registroId, tipoeCF: 31, force: true })
    });
    if (typeof showAdminAlert === 'function') {
      showAdminAlert(
        `Reenviado: ${data.encf || '—'}\nEstado: ${data.estado || '—'}\nTrack: ${data.trackId || '—'}`,
        { type: 'success' }
      );
    }
    await abrirConsulta({ registroId, trackId: data.trackId, encf: data.encf });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('ecf-refresh-list')?.addEventListener('click', cargarComprobantesEcf);
    document.getElementById('ecf-refresh-dgii')?.addEventListener('click', consultarTodosDgii);
    document.getElementById('ecf-search')?.addEventListener('input', () => paintEcf(ECF_CACHE));
    document.getElementById('ecf-open-consulta')?.addEventListener('click', () => {
      abrirConsulta({
        trackId: document.getElementById('ecf-q-track')?.value.trim(),
        encf: document.getElementById('ecf-q-encf')?.value.trim()
      });
    });
    document.getElementById('ecf-modal-close')?.addEventListener('click', closeConsultaModal);
    document.getElementById('ecf-consulta-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'ecf-consulta-modal') closeConsultaModal();
    });
    document.getElementById('ecf-tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      try {
        if (btn.classList.contains('ecf-ver')) {
          await abrirConsulta({
            registroId: id,
            trackId: btn.getAttribute('data-track'),
            encf: btn.getAttribute('data-encf')
          });
        }
        if (btn.classList.contains('ecf-xml')) await descargarXml(id, btn.getAttribute('data-encf'));
        if (btn.classList.contains('ecf-pdf')) await abrirPdf(id, btn.getAttribute('data-encf'));
      } catch (err) {
        if (typeof showAdminAlert === 'function') showAdminAlert(err?.message || String(err), { type: 'error' });
      }
    });
    document.getElementById('ecf-modal-body')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      try {
        if (btn.id === 'ecf-modal-refresh') {
          await abrirConsulta({
            registroId: btn.getAttribute('data-registro'),
            trackId: btn.getAttribute('data-track'),
            encf: btn.getAttribute('data-encf')
          });
        }
        if (btn.id === 'ecf-modal-xml') await descargarXml(btn.getAttribute('data-id'), btn.getAttribute('data-encf'));
        if (btn.id === 'ecf-modal-pdf') await abrirPdf(btn.getAttribute('data-id'), btn.getAttribute('data-encf'));
        if (btn.id === 'ecf-modal-reemit') await reemitir(btn.getAttribute('data-id'));
      } catch (err) {
        if (typeof showAdminAlert === 'function') showAdminAlert(err?.message || String(err), { type: 'error' });
      }
    });
  });
})();
