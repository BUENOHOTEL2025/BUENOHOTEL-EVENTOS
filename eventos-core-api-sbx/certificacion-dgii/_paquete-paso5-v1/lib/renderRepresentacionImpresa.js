function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'RD$0.00';
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n);
}

export function renderRepresentacionImpresaHtml({ slot, doc, qrDataUrl, qrUrl, codigoSeguridad }) {
  const lineas = (doc.items || [])
    .map(
      (ln) => `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #ddd;">${esc(ln.nombre)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right;">${esc(ln.cantidad)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right;">${money(ln.precio)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right;font-weight:600;">${money(ln.monto)}</td>
    </tr>`
    )
    .join('');

  const modificado =
    doc.ncfModificado && doc.tipoeCF === '34'
      ? `<div><strong>NCF modificado:</strong> ${esc(doc.ncfModificado)} (${esc(doc.fechaNcfModificado)})</div>`
      : doc.ncfModificado && doc.tipoeCF === '33'
        ? `<div><strong>NCF afectado:</strong> ${esc(doc.ncfModificado)}</div>`
        : '';

  return `<!DOCTYPE html>
<html lang="es-DO"><head><meta charset="utf-8"/>
<title>${esc(slot.tipoTitulo)} — ${esc(doc.encf)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #111; font-size: 12px; }
  h1 { font-size: 16px; margin: 0 0 4px; text-transform: uppercase; }
  .sub { color: #444; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  .box { border: 1px solid #ccc; padding: 10px; margin: 10px 0; }
  .totales { text-align: right; line-height: 1.8; }
  .qr { margin-top: 12px; }
  @media print { .no-print { display: none; } body { margin: 12px; } }
</style></head><body>
  <div class="no-print" style="margin-bottom:12px;">
    <button onclick="window.print()">Imprimir / Guardar PDF</button>
  </div>
  <h1>${esc(slot.tipoTitulo)}</h1>
  <div class="sub">${esc(slot.portalLabel)}</div>
  <div class="box">
    <strong>${esc(doc.nombreComercial || doc.razonSocialEmisor)}</strong><br/>
    ${esc(doc.direccionEmisor)}<br/>
    RNC: ${esc(doc.rncEmisor)}<br/>
    ${doc.telefonosEmisor?.length ? `Tel.: ${esc(doc.telefonosEmisor.join(' / '))}<br/>` : ''}
    ${doc.correoEmisor ? `${esc(doc.correoEmisor)}<br/>` : ''}
  </div>
  <table class="box" style="width:100%;">
    <tr>
      <td style="width:50%;vertical-align:top;">
        <strong>Cliente / Comprador</strong><br/>
        ${doc.razonSocialComprador ? esc(doc.razonSocialComprador) + '<br/>' : ''}
        ${doc.rncComprador ? `RNC: ${esc(doc.rncComprador)}<br/>` : ''}
        ${doc.direccionComprador ? esc(doc.direccionComprador) + '<br/>' : ''}
        ${doc.correoComprador ? esc(doc.correoComprador) : ''}
      </td>
      <td style="vertical-align:top;text-align:right;">
        <div><strong>e-NCF:</strong> ${esc(doc.encf)}</div>
        <div><strong>Fecha emisión:</strong> ${esc(doc.fechaEmision)}</div>
        ${modificado}
      </td>
    </tr>
  </table>
  <table>
    <thead>
      <tr style="background:#f0f0f0;">
        <th style="text-align:left;padding:8px;">Descripción</th>
        <th style="text-align:right;padding:8px;">Cant.</th>
        <th style="text-align:right;padding:8px;">Precio</th>
        <th style="text-align:right;padding:8px;">Monto</th>
      </tr>
    </thead>
    <tbody>${lineas}</tbody>
  </table>
  <div class="box totales">
    ${doc.montoGravado ? `<div>Monto gravado: ${money(doc.montoGravado)}</div>` : ''}
    ${doc.totalItbis ? `<div>ITBIS: ${money(doc.totalItbis)}</div>` : ''}
    <div style="font-size:14px;font-weight:bold;margin-top:6px;">TOTAL: ${money(doc.montoTotal)}</div>
  </div>
  <div class="box qr">
    <strong>Código de seguridad:</strong> ${esc(codigoSeguridad)}<br/>
    <strong>Fecha de firma digital:</strong> ${esc(doc.fechaHoraFirma)}<br/>
    ${qrDataUrl ? `<img src="${esc(qrDataUrl)}" alt="QR DGII" width="120" height="120" style="margin-top:8px;"/>` : ''}
    <div style="font-size:10px;color:#555;margin-top:6px;word-break:break-all;">${esc(qrUrl)}</div>
  </div>
  <div style="margin-top:16px;font-size:10px;color:#666;">
    Representación impresa — Simulación Paso 5 · ${esc(doc.encf)} · CerteCF
  </div>
</body></html>`;
}

export function renderPaso5IndexHtml(entries) {
  const rows = entries
    .map(
      (e) => `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${esc(e.portalLabel)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${esc(e.encf)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;"><a href="${esc(e.htmlName)}">${esc(e.htmlName)}</a></td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${esc(e.pdfName)}</td>
    </tr>`
    )
    .join('');
  return `<!DOCTYPE html>
<html lang="es-DO"><head><meta charset="utf-8"/><title>Paso 5 — Representaciones impresas</title></head>
<body style="font-family:Arial,sans-serif;margin:24px;">
<h1>Paso 5 — Representación impresa (11 archivos)</h1>
<p>Abra cada HTML → Imprimir → Guardar como PDF. Suba cada PDF al campo correspondiente en CerteCF.</p>
<p><strong>Límite DGII:</strong> todos los PDF juntos &lt; 10 MB.</p>
<table style="width:100%;border-collapse:collapse;">
  <thead><tr style="background:#eee;">
    <th style="text-align:left;padding:8px;">Campo portal</th>
    <th style="text-align:left;padding:8px;">e-NCF</th>
    <th style="text-align:left;padding:8px;">HTML</th>
    <th style="text-align:left;padding:8px;">PDF sugerido</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;
}
