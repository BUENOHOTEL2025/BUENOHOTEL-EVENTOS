function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Sitio público Eventos — mismo logo que `js/navbar.js` (franja #FBB03B). */
const EVENTOS_PUBLIC_ORIGIN = 'https://eventos.buenohotel.com.do';
const BRAND_LOGO_WHITE_URL = `${EVENTOS_PUBLIC_ORIGIN}/assets/logo/logo-white.png`;

function formatDocMoney(n, moneda) {
  const x = Number(n);
  if (!Number.isFinite(x)) return moneda === 'USD' ? '$0.00' : 'RD$0.00';
  try {
    if (moneda === 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
    }
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
  } catch {
    const sym = moneda === 'USD' ? '$' : 'RD$';
    return `${sym}${x.toFixed(2)}`;
  }
}

function labelTotal(moneda) {
  return moneda === 'USD' ? 'TOTAL (USD)' : 'TOTAL (DOP)';
}

function formatQty(q) {
  const x = Number(q);
  if (!Number.isFinite(x)) return '—';
  return String(x);
}

function nz(s, fallback = '—') {
  const t = escapeHtml(String(s ?? '').trim());
  return t || fallback;
}

export function renderFacturaOperativaHtml(draft) {
  const e = draft.emisor || {};
  const doc = draft.documento || {};
  const t = draft.transaccion || {};
  const c = draft.comprador || {};
  const lineas = Array.isArray(draft.lineas) ? draft.lineas : [];
  const tot = draft.totales || {};
  const moneda = tot.moneda === 'USD' || doc.moneda === 'USD' ? 'USD' : 'DOP';
  const money = (v) => formatDocMoney(v, moneda);
  const v = draft.verificacion || {};
  const tarifaBase = tot.tarifaBase != null ? tot.tarifaBase : tot.subtotalGravado;
  const ley10 = tot.ley10 != null ? tot.ley10 : 0;
  const precioAPagarGravado =
    tot.precioAPagarGravado != null ? tot.precioAPagarGravado : tot.precioAPagar != null ? tot.precioAPagar : tot.totalRD;
  const totalFinal = tot.totalRD != null ? tot.totalRD : precioAPagarGravado;
  const descuentoMonto = Number(tot.descuento ?? 0);
  const descuentoPct = Number(tot.descuentoPct ?? 0);
  const tieneDescuento = Boolean(tot.tieneDescuento) || (descuentoPct > 0 && descuentoMonto > 0);
  const subTotalDoc =
    tot.subTotal != null
      ? tot.subTotal
      : tot.totalAntesDescuento != null
        ? tot.totalAntesDescuento
        : Number(tarifaBase) + Number(ley10) + Number(tot.itbis || 0) + Number(tot.subtotalExento || 0);

  const exentoMonto = Number(tot.subtotalExento || 0);
  const resumenTotalesHtml = `
        <div>SubTotal: ${money(subTotalDoc)}</div>
        ${tieneDescuento ? `<div>Descuento: ${money(descuentoMonto)}</div>` : ''}
        ${exentoMonto > 0 ? `<div>Otras Tasas Exentas: ${money(exentoMonto)}</div>` : ''}
        <div>Subt. Gravado: ${money(tot.subtotalGravado != null ? tot.subtotalGravado : tarifaBase)}</div>
        <div>ITBIS: ${money(tot.itbis)}</div>
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid #c5cdd8;font-size:14px;font-weight:600;color:#222;">
          ${escapeHtml(labelTotal(moneda))}: ${money(totalFinal)}
        </div>`;
  const qrImg = v.codigoQrDataUrl
    ? `<img src="${escapeHtml(v.codigoQrDataUrl)}" alt="Código QR DGII" width="110" height="110" style="width:110px;height:110px;display:block;margin:8px 0 4px;border:1px solid #e5e7eb;border-radius:6px;padding:4px;background:#fff;"/>`
    : '';
  const qrLink = v.codigoQrUrl
    ? `<div style="margin-top:4px;"><a href="${escapeHtml(v.codigoQrUrl)}" target="_blank" rel="noopener" style="font-size:10px;color:#1a365d;">Verificar en DGII</a></div>`
    : '';
  const qrBlock =
    !v.codigoSeguridad && !v.fechaFirmaDigital && !v.codigoQrDataUrl
      ? ''
      : `<div style="margin-top:10px;font-size:11px;border-top:1px solid #1a365d;padding-top:8px;color:#222;">
          <strong style="color:#1a365d;">Firma electrónica DGII</strong>
          <div style="display:flex;align-items:flex-start;gap:12px;margin-top:8px;flex-wrap:wrap;">
            ${qrImg ? `<div>${qrImg}${qrLink}</div>` : ''}
            <div style="line-height:1.55;">
              ${v.codigoSeguridad ? `<div>Código de seguridad: <strong>${escapeHtml(v.codigoSeguridad)}</strong></div>` : ''}
              ${v.fechaFirmaDigital ? `<div>Fecha de firma: ${escapeHtml(v.fechaFirmaDigital)}</div>` : ''}
              ${!qrImg ? '<div style="color:#991b1b;">QR no disponible</div>' : ''}
            </div>
          </div>
        </div>`;

  const tieneNcf = String(doc.ncf || '').trim().length > 0;
  const emisorDireccionHtml = escapeHtml(String(e.direccion || '')).replace(/\n/g, '<br/>');

  const lineasHtml = lineas
    .map((ln) => {
      const desc = escapeHtml(String(ln.descripcion || ''));
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e8e4df;vertical-align:top;color:#222;">${desc}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e8e4df;text-align:right;white-space:nowrap;">${formatQty(ln.cantidad)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e8e4df;text-align:center;">${nz(ln.unidad)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e8e4df;text-align:right;white-space:nowrap;">${money(ln.precioUnitario)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e8e4df;text-align:right;white-space:nowrap;">${ln.descuentoLinea != null ? money(ln.descuentoLinea) : '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e8e4df;text-align:right;white-space:nowrap;">${ln.itbisLinea != null ? money(ln.itbisLinea) : '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e8e4df;text-align:right;white-space:nowrap;color:#222;">${money(ln.importeLinea)}</td>
      </tr>`;
    })
    .join('');

  const docTitle = escapeHtml(String(doc.tipoTituloContrato || doc.tipo || 'DOCUMENTO DE COBRO'));

  return `<!DOCTYPE html>
<html lang="es-DO"><head><meta charset="utf-8"/>
<title>${escapeHtml(doc.tipoTituloContrato || 'Documento de cobro')}</title>
<style>
  :root {
    --bh-yellow: #FBB03B;
    --bh-yellow-dark: #E19A2E;
    --bh-ink: #222;
    --bh-navy: #1a365d;
    --bh-slate: #2d3748;
    --bh-blue: #1565c0;
    --bh-page: #f7f8fb;
    --bh-warm: #fff9f0;
    --bh-border-warm: #fde8c8;
  }
  body {
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    margin: 0;
    padding: 0;
    color: var(--bh-ink);
    background: var(--bh-page);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .bh-sheet {
    max-width: 920px;
    margin: 0 auto;
    background: #fff;
    box-shadow: 0 4px 24px rgba(0,0,0,0.07);
  }
  .bh-brand-bar {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 14px 24px;
    background: var(--bh-yellow);
    box-shadow: 0 2px 8px rgba(0,0,0,0.07);
  }
  .bh-brand-left {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }
  .bh-brand-tagline {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--bh-ink);
    line-height: 1.35;
    letter-spacing: 0.02em;
    max-width: 520px;
  }
  .bh-brand-bar img {
    height: 44px;
    width: auto;
    display: block;
  }
  .bh-brand-bar .bh-tag {
    margin-left: auto;
    margin-top: 2px;
    font-weight: 800;
    font-size: 0.95rem;
    letter-spacing: 0.04em;
    color: var(--bh-ink);
    text-transform: uppercase;
  }
  .bh-accent {
    height: 4px;
    background: linear-gradient(90deg, var(--bh-navy) 0%, var(--bh-slate) 100%);
  }
  .bh-content {
    padding: 22px 24px 28px;
  }
  .bh-actions {
    display:flex;
    justify-content:flex-end;
    gap:10px;
    margin: 0 0 12px 0;
    flex-wrap:wrap;
  }
  .bh-btn {
    appearance:none;
    border:1px solid #d9dde3;
    background:#fff;
    color:#111;
    padding:10px 14px;
    border-radius:10px;
    font-weight:900;
    cursor:pointer;
  }
  .bh-btn.primary{
    background: var(--bh-navy);
    border-color:#0f2744;
    color:#fff;
  }
  @media print {
    body { background: #fff; }
    .bh-sheet { box-shadow: none; max-width: none; }
    .bh-content { padding: 16px; }
    .bh-actions { display:none !important; }
  }
</style>
</head><body>
<div class="bh-sheet">
  <div class="bh-brand-bar">
    <div class="bh-brand-left">
      <img src="${escapeHtml(BRAND_LOGO_WHITE_URL)}" alt="BuenoHotel" width="180" height="44" />
      <div class="bh-brand-tagline">Agencia de Viajes y Tour Operador Receptivo-Emisivo</div>
    </div>
    <span class="bh-tag">Eventos</span>
  </div>
  <div class="bh-accent"></div>
  <div class="bh-content">
  <div class="bh-actions">
    <button class="bh-btn" type="button" onclick="window.print()">Imprimir</button>
    <button class="bh-btn primary" type="button" onclick="window.print()">Descargar PDF</button>
  </div>
  ${draft._meta?.avisoExentoAjustado ? `<p style="font-size:11px;background:#fff8e6;border:1px solid #f5d78e;border-left:4px solid #FBB03B;padding:10px 12px;margin:0 0 14px 0;border-radius:0 8px 8px 0;color:#4a3c28;">${escapeHtml(String(draft._meta.avisoExentoAjustado))}</p>` : ''}
  ${draft._meta?.avisoOperativoHtml ? `<p style="font-size:11px;background:var(--bh-warm);border:1px solid var(--bh-border-warm);border-left:4px solid var(--bh-yellow);padding:10px 12px;margin:0 0 14px 0;border-radius:0 8px 8px 0;color:#4a3c28;">${draft._meta.avisoOperativoHtml}</p>` : ''}
  ${draft._meta?.avisoEmisorCfg ? `<p style="font-size:11px;background:#fdecea;border:1px solid #e57373;padding:10px 12px;margin:0 0 14px 0;border-radius:8px;">${escapeHtml(draft._meta.avisoEmisorCfg)}</p>` : ''}

  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:16px;flex-wrap:wrap;">
    <div style="flex:1;min-width:220px;line-height:1.45;font-size:12px;">
      <div style="font-size:18px;font-weight:800;color:var(--bh-navy);margin-bottom:6px;">${nz(e.nombreComercial)}</div>
      <div style="color:#444;">${emisorDireccionHtml || ''}</div>
      ${e.telefono ? `<div style="color:#444;">Tel.: ${nz(e.telefono, '')}</div>` : ''}
      ${e.rnc ? `<div style="color:#444;"><strong>RNC:</strong> ${nz(e.rnc, '')}</div>` : ''}
      ${e.email ? `<div style="color:#444;">${nz(e.email, '')}</div>` : ''}
    </div>
    <div style="text-align:right;max-width:340px;line-height:1.5;font-size:12px;padding:12px 16px;background:var(--bh-warm);border-radius:10px;border:1px solid var(--bh-border-warm);border-left:4px solid var(--bh-yellow);">
      <div style="font-weight:800;text-transform:uppercase;font-size:14px;color:var(--bh-navy);letter-spacing:0.03em;">${docTitle}</div>
      ${tieneNcf ? `<div style="margin-top:6px;color:#222;"><strong>NCF</strong>: ${nz(doc.ncf)}</div>` : ''}
      ${doc.validaHastaLabel ? `<div style="color:#444;">${escapeHtml(String(doc.validaHastaLabel))}</div>` : ''}
      <div style="margin-top:6px;font-weight:700;color:var(--bh-ink);"><strong>Moneda:</strong> ${moneda}</div>
    </div>
  </div>

  <table style="width:100%;font-size:12px;margin:14px 0;border-collapse:separate;border-spacing:0;overflow:hidden;border-radius:10px;border:1px solid var(--bh-border-warm);">
    <tr>
      <td style="vertical-align:top;width:52%;padding:12px 14px;background:var(--bh-warm);border-right:1px solid var(--bh-border-warm);">
        <div style="font-weight:800;color:var(--bh-navy);margin-bottom:8px;font-size:13px;">Vendido a</div>
        ${c.rncCliente ? `<div style="margin-top:4px;color:#444;"><strong>RNC:</strong> ${nz(c.rncCliente)}</div>` : ''}
        ${c.nombreRazon ? `<div style="font-weight:600;">${nz(c.nombreRazon)}</div>` : ''}
        ${c.direccion ? `<div style="color:#444;">${nz(c.direccion)}</div>` : ''}
        ${c.email ? `<div style="color:#444;">${nz(c.email)}</div>` : ''}
        ${c.telefono ? `<div style="color:#444;">Tel.: ${nz(c.telefono)}</div>` : ''}
      </td>
      <td style="vertical-align:top;padding:12px 14px;background:#fafbfc;">
        <div style="font-weight:800;color:var(--bh-navy);margin-bottom:8px;font-size:13px;">Detalle del documento</div>
        ${t.fechaEmisionEtiqueta ? `<div><strong>Fecha:</strong> ${nz(t.fechaEmisionEtiqueta)}</div>` : ''}
        ${t.condicionPago ? `<div><strong>Cond.:</strong> ${nz(t.condicionPago)}</div>` : ''}
        ${t.fechaVencimientoEtiqueta ? `<div><strong>Vence:</strong> ${nz(t.fechaVencimientoEtiqueta)}</div>` : ''}
        ${t.numeroFacturaInterna ? `<div><strong>Ref.:</strong> ${nz(t.numeroFacturaInterna)}</div>` : ''}
        ${t.vendedor ? `<div><strong>Vendedor:</strong> ${nz(t.vendedor)}</div>` : ''}
        ${t.expediente ? `<div><strong>Expediente:</strong> ${nz(t.expediente)}</div>` : ''}
      </td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:12px;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(26,54,93,0.06);">
    <thead>
      <tr style="background:#f3f4f6;color:#222;border-bottom:1px solid #c5cdd8;">
        <th style="text-align:left;padding:10px 12px;width:42%;font-weight:700;color:#222;">Descripción</th>
        <th style="text-align:right;padding:10px 8px;font-weight:700;color:#222;">Cantidad</th>
        <th style="text-align:center;padding:10px 8px;font-weight:700;color:#222;">Und</th>
        <th style="text-align:right;padding:10px 8px;font-weight:700;color:#222;">Precio</th>
        <th style="text-align:right;padding:10px 8px;font-weight:700;color:#222;">Desc.</th>
        <th style="text-align:right;padding:10px 8px;font-weight:700;color:#222;">ITBIS</th>
        <th style="text-align:right;padding:10px 12px;font-weight:700;color:#222;">Importe</th>
      </tr>
    </thead>
    <tbody>${lineasHtml}</tbody>
  </table>

  <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:12px;border:1px solid #e8e4df;border-radius:10px;overflow:hidden;">
    <tr>
      <td style="vertical-align:top;padding:14px;line-height:1.65;background:#fafbfc;width:58%;">
        ${draft.observacionLegal ? `<div style="margin-bottom:8px;font-size:11px;color:#444;">${escapeHtml(String(draft.observacionLegal))}</div>` : ''}
        <div style="margin:10px 0 8px;font-size:11px;font-weight:700;color:#222;text-transform:uppercase;">Nota: una vez emitida la factura no se permitirán modificaciones ni cancelaciones.</div>
        ${qrBlock}
      </td>
      <td style="vertical-align:top;text-align:right;padding:14px 16px;white-space:nowrap;line-height:1.85;background:#fff;border-left:1px solid #e8e4df;font-size:12px;font-weight:400;color:#222;">
        ${resumenTotalesHtml}
      </td>
    </tr>
  </table>
  </div>
</div>
</body></html>`;
}
