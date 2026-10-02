import { enrichLineItems, totalesRepresentacion } from './representacionLineas.js';
import { RAZON_SOCIAL_EMISOR_RI } from './emisorRepresentacion.js';
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.00';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n);
}

function hasIsc(lineas) {
  return lineas.some((ln) => Number(ln.isce) || Number(ln.iscav) || ln.gradosAlcohol);
}

function buildDocHeaderRight(doc, slot) {
  const lines = [`<div class="doc-title">${esc(slot.tipoTitulo)}</div>`];
  lines.push(`<div><span class="lbl">e-NCF:</span> ${esc(doc.encf)}</div>`);
  if (doc.fechaVencimientoSecuencia && slot.modeloDgii !== '2.2') {
    lines.push(`<div><span class="lbl">Fecha Vencimiento:</span> ${esc(doc.fechaVencimientoSecuencia)}</div>`);
  }
  if (doc.ncfModificado && (slot.modeloDgii === '1.5' || slot.modeloDgii === '1.6')) {
    lines.push(`<div><span class="lbl">NCF Modificado:</span> ${esc(doc.ncfModificado)}</div>`);
    lines.push(`<div class="nota-ref">Corrige montos del NCF modificado</div>`);
  }
  return lines.join('\n');
}

function buildTableHead(lineas, modeloDgii) {
  if (hasIsc(lineas)) {
    return `<tr>
      <th>Cantidad</th><th>Descripción</th><th>Unidad de Medida</th>
      <th>Grados Alcohol en %</th><th>PVPci</th><th>Precio</th>
      <th>ISCe</th><th>ISCav</th><th>ITBIS</th><th>Valor</th>
    </tr>`;
  }
  return `<tr>
    <th>Cantidad</th><th>Descripción</th><th>Unidad de Medida</th>
    <th>Precio</th><th>ITBIS</th><th>Valor</th>
  </tr>`;
}

function buildTableRows(lineas) {
  return lineas
    .map((ln) => {
      if (hasIsc([ln])) {
        return `<tr>
          <td class="num">${esc(ln.cantidad)}</td>
          <td>${esc(ln.nombre)}</td>
          <td class="ctr">${esc(ln.unidadLabel)}</td>
          <td class="num">${ln.gradosAlcohol ? `${esc(ln.gradosAlcohol)}%` : ''}</td>
          <td class="num">${ln.precioUnitarioReferencia ? money(ln.precioUnitarioReferencia) : ''}</td>
          <td class="num">${money(ln.precio)}</td>
          <td class="num">${ln.isce ? money(ln.isce) : ''}</td>
          <td class="num">${ln.iscav ? money(ln.iscav) : ''}</td>
          <td class="num">${money(ln.itbis)}</td>
          <td class="num">${money(ln.valor)}</td>
        </tr>`;
      }
      return `<tr>
        <td class="num">${esc(ln.cantidad)}</td>
        <td>${esc(ln.nombre)}</td>
        <td class="ctr">${esc(ln.unidadLabel)}</td>
        <td class="num">${money(ln.precio)}</td>
        <td class="num">${money(ln.itbis)}</td>
        <td class="num">${money(ln.valor)}</td>
      </tr>`;
    })
    .join('');
}

function buildTotalsBox(tot, doc) {
  const rows = [];
  if (Number(doc.montoExento) > 0 && !Number(doc.montoGravado)) {
    rows.push(['Subtotal Exento', money(doc.montoExento)]);
  } else {
    rows.push(['Subtotal Gravado', money(tot.subtotalGravado)]);
  }
  if (Number(doc.totalIsc) > 0) rows.push(['Total ISC', money(doc.totalIsc)]);
  rows.push(['Total ITBIS', money(tot.totalItbis)]);
  rows.push(['Total', money(tot.total)]);
  return rows
    .map(
      ([label, value]) => `<div class="tot-row">
        <span class="tot-label">${esc(label)}</span>
        <span class="tot-value">${esc(value)}</span>
      </div>`
    )
    .join('');
}

export function renderRepresentacionImpresaHtml({ slot, doc, qrDataUrl, codigoSeguridad }) {
  const lineas = enrichLineItems(doc);
  const tot = totalesRepresentacion(doc, lineas);
  const razonSocial = doc.razonSocialEmisor || RAZON_SOCIAL_EMISOR_RI;
  const comercial = doc.nombreComercial || razonSocial;
  const sucursal = doc.zonaVenta ? `Sucursal ${doc.zonaVenta}` : '';

  return `<!DOCTYPE html>
<html lang="es-DO"><head><meta charset="utf-8"/>
<title>${esc(slot.tipoTitulo)} — ${esc(doc.encf)}</title>
<style>
  :root { --dgii-blue: #1f4f82; --dgii-line: #1f4f82; --hdr-bg: #d9d9d9; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    margin: 0;
    padding: 24px;
    color: #111;
    font-size: 11px;
    background: #fff;
  }
  .sheet { max-width: 820px; margin: 0 auto; }
  .top { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
  .emisor { flex: 1; line-height: 1.45; }
  .emisor .comercial { font-size: 18px; font-weight: 700; color: var(--dgii-blue); margin-bottom: 2px; }
  .doc { flex: 0 0 300px; text-align: left; line-height: 1.5; }
  .doc-title { font-size: 15px; font-weight: 700; color: var(--dgii-blue); margin-bottom: 6px; }
  .lbl { font-weight: 700; }
  .nota-ref { margin-top: 4px; font-style: italic; }
  .rule { border: 0; border-top: 2px solid var(--dgii-line); margin: 10px 0; }
  .cliente { line-height: 1.6; margin: 8px 0 12px; }
  .cliente strong { font-weight: 700; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.items th {
    background: var(--hdr-bg);
    font-weight: 700;
    padding: 6px 5px;
    border: 1px solid #bbb;
    text-align: center;
    font-size: 10px;
  }
  table.items td {
    padding: 5px;
    border: 1px solid #ccc;
    vertical-align: top;
  }
  table.items td.num, table.items th.num { text-align: right; }
  table.items td.ctr { text-align: center; }
  .footer { display: flex; justify-content: space-between; gap: 20px; margin-top: 14px; align-items: flex-end; }
  .qr-block { flex: 0 0 180px; line-height: 1.5; }
  .qr-block img { display: block; width: 110px; height: 110px; margin-bottom: 6px; }
  .totals { flex: 0 0 260px; }
  .tot-row { display: flex; justify-content: flex-end; align-items: stretch; margin-bottom: 4px; }
  .tot-label {
    border: 1px solid #999;
    padding: 5px 8px;
    font-weight: 700;
    min-width: 130px;
    text-align: right;
    background: #f7f7f7;
  }
  .tot-value {
    border: 1px solid #999;
    border-left: 0;
    padding: 5px 8px;
    min-width: 110px;
    text-align: right;
    font-weight: 700;
  }
  .modelo { margin-top: 10px; font-size: 9px; color: #666; }
  @media print {
    .no-print { display: none !important; }
    body { padding: 10px; }
  }
</style></head><body>
<div class="sheet">
  <div class="no-print" style="margin-bottom:10px;">
    <button onclick="window.print()">Imprimir / Guardar PDF</button>
    <span style="margin-left:8px;color:#666;">Modelo DGII ${esc(slot.modeloDgii)} · ${esc(doc.encf)}</span>
  </div>

  <div class="top">
    <div class="emisor">
      <div class="comercial">${esc(comercial)}</div>
      <div><strong>Razón Social Emisor:</strong> ${esc(razonSocial)}</div>
      ${sucursal ? `<div>${esc(sucursal)}</div>` : ''}
      <div><span class="lbl">RNC</span> ${esc(doc.rncEmisor)}</div>
      <div><span class="lbl">Dirección:</span> ${esc(doc.direccionEmisor)}</div>
      <div><span class="lbl">Fecha Emisión:</span> ${esc(doc.fechaEmision)}</div>
    </div>
    <div class="doc">
      ${buildDocHeaderRight(doc, slot)}
    </div>
  </div>

  <hr class="rule"/>

  <div class="cliente">
    <div><strong>Razón Social Cliente:</strong> ${esc(doc.razonSocialComprador)}</div>
    ${doc.rncComprador ? `<div><strong>RNC Cliente:</strong> ${esc(doc.rncComprador)}</div>` : ''}
  </div>

  <hr class="rule"/>

  <table class="items">
    <thead>${buildTableHead(lineas, slot.modeloDgii)}</thead>
    <tbody>${buildTableRows(lineas)}</tbody>
  </table>

  <div class="footer">
    <div class="qr-block">
      ${qrDataUrl ? `<img src="${esc(qrDataUrl)}" alt="QR"/>` : ''}
      <div><strong>Código de Seguridad:</strong> ${esc(codigoSeguridad)}</div>
      <div><strong>Fecha Firma:</strong> ${esc(doc.fechaHoraFirma)}</div>
    </div>
    <div class="totals">${buildTotalsBox(tot, doc)}</div>
  </div>

  <div class="modelo">Representación impresa — Modelo ilustrativo DGII ${esc(slot.modeloDgii)} · ${esc(doc.encf)}</div>
</div>
</body></html>`;
}

export function renderPaso5IndexHtml(entries) {
  const rows = entries
    .map(
      (e) => `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${esc(e.portalLabel)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${esc(e.modeloDgii)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${esc(e.encf)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;"><a href="${esc(e.htmlName)}">${esc(e.htmlName)}</a> · <a href="pdf/${esc(e.pdfName)}">${esc(e.pdfName)}</a></td>
    </tr>`
    )
    .join('');
  return `<!DOCTYPE html>
<html lang="es-DO"><head><meta charset="utf-8"/><title>Paso 5 — Representaciones impresas DGII</title></head>
<body style="font-family:Arial,sans-serif;margin:24px;max-width:960px;">
<h1>Paso 5 — Representación impresa (formato DGII)</h1>
<p>PDF automático: <code>npm run paso5</code> o doble clic en <code>ejecutar-paso5-pdf.bat</code>.</p>
<p>Manual: abra cada HTML → <strong>Ctrl+P</strong> → Guardar como PDF → subir al portal.</p>
<p><strong>Modelo 1.1:</strong> Valor = precio × cantidad (sin ITBIS en la columna Valor).</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead><tr style="background:#eee;">
    <th style="text-align:left;padding:8px;">Campo portal</th>
    <th style="text-align:left;padding:8px;">Modelo</th>
    <th style="text-align:left;padding:8px;">e-NCF</th>
    <th style="text-align:left;padding:8px;">HTML / PDF</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;
}
