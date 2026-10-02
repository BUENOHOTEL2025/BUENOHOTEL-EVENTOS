#!/usr/bin/env node
/**
 * Aplica correcciones DGII a XML ya generados (sin volver a leer el Excel).
 * Uso: node parchear-xml-sin-firmar.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildPaso4PatchSets,
  isPaso4Manifest
} from './lib/paso4EncfMap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ecfDir = path.join(__dirname, 'salida', 'ecf-sin-firmar');
const manifestPath = path.join(__dirname, 'salida', 'manifest.json');

const PASO2_RFCE_FC32 = new Set(['E320000000011', 'E320000000012', 'E320000000013', 'E320000000014']);

const PASO2_PRECIO_2DEC_ENCF = new Set([
  'E310000000004',
  'E330000000001',
  'E340000000015',
  'E410000000001',
  'E450000000001',
  'E320000000011',
  'E320000000012',
  'E320000000013',
  'E320000000014'
]);

const PASO2_DOCUMENT_DOR = {
  E310000000004: [
    { numeroLinea: 1, tipoAjuste: 'D', descripcion: 'N', monto: 200, indicadorFacturacion: 1 },
    { numeroLinea: 2, tipoAjuste: 'D', descripcion: 'D', monto: 50, indicadorFacturacion: 2 }
  ],
  E320000000004: [
    { numeroLinea: 1, tipoAjuste: 'R', descripcion: 'Pronto Pago', monto: 3500, indicadorFacturacion: 1 },
    { numeroLinea: 2, tipoAjuste: 'R', descripcion: 'Pronto Pago', monto: 2000, indicadorFacturacion: 2 }
  ]
};

function loadPatchConfig() {
  let manifest = null;
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }
  const paso4 = isPaso4Manifest(manifest);
  if (paso4 && manifest?.paso4Offset) {
    process.env.PASO4_OFFSET = String(manifest.paso4Offset);
  }
  const paso4Sets = paso4 ? buildPaso4PatchSets() : null;
  return {
    paso4,
    RFCE_FC32: paso4 ? paso4Sets.RFCE_FC32 : PASO2_RFCE_FC32,
    PRECIO_2DEC_ENCF: paso4 ? paso4Sets.PRECIO_2DEC_ENCF : PASO2_PRECIO_2DEC_ENCF,
    DOCUMENT_DOR: paso4 ? paso4Sets.DOCUMENT_DOR : PASO2_DOCUMENT_DOR,
    NOTAS_REENVIO: paso4 ? paso4Sets.NOTAS_REENVIO : []
  };
}

let PATCH = loadPatchConfig();

function format2(n) {
  return Number(n).toFixed(2);
}

function format4(n) {
  return Number(n).toFixed(4);
}

function extractEncf(xml) {
  const m = xml.match(/<eNCF>([^<]+)<\/eNCF>/);
  return m ? m[1].trim() : '';
}

function extractTipoeCF(xml) {
  const m = xml.match(/<TipoeCF>(\d+)<\/TipoeCF>/);
  return m ? m[1] : '';
}

function formatPrecio(n, tipoeCF, encf) {
  if (tipoeCF === '33' || tipoeCF === '43' || PATCH.PRECIO_2DEC_ENCF.has(encf)) return format2(n);
  return format4(n);
}

function buildTablaSubDescuento(amount) {
  return `<TablaSubDescuento><SubDescuento><TipoSubDescuento>$</TipoSubDescuento><MontoSubDescuento>${format2(amount)}</MontoSubDescuento></SubDescuento></TablaSubDescuento>`;
}

function cleanTablaXml(tablaXml) {
  return tablaXml.replace(/<SubDescuentoPorcentaje>0\.000<\/SubDescuentoPorcentaje>\s*/g, '');
}

function normalizeTablaSubDescuento(tablaXml, amount) {
  const monto = format2(amount);
  let tabla = cleanTablaXml(tablaXml);
  if (tabla.includes('<MontoSubDescuento>')) {
    return tabla.replace(
      /<MontoSubDescuento>[\d.]+<\/MontoSubDescuento>/,
      `<MontoSubDescuento>${monto}</MontoSubDescuento>`
    );
  }
  return buildTablaSubDescuento(amount);
}

function buildTablaSubRecargo(amount) {
  return `<TablaSubRecargo><SubRecargo><TipoSubRecargo>$</TipoSubRecargo><MontoSubRecargo>${format2(amount)}</MontoSubRecargo></SubRecargo></TablaSubRecargo>`;
}

/** XSD DGII: DescuentoMonto → TablaSubDescuento → RecargoMonto → TablaSubRecargo */
function fixItemLineBlock(itemXml) {
  let item = itemXml;

  const descTablas = [...item.matchAll(/<TablaSubDescuento>[\s\S]*?<\/TablaSubDescuento>/g)];
  for (const t of descTablas) item = item.replace(t[0], '');

  const recTablas = [...item.matchAll(/<TablaSubRecargo>[\s\S]*?<\/TablaSubRecargo>/g)];
  for (const t of recTablas) item = item.replace(t[0], '');

  const desc = item.match(/<DescuentoMonto>([\d.]+)<\/DescuentoMonto>/);
  if (desc) {
    const amount = desc[1];
    const tabla =
      descTablas.length > 0
        ? normalizeTablaSubDescuento(descTablas[0][0], amount)
        : buildTablaSubDescuento(amount);
    item = item.replace(/\s*<DescuentoMonto>[\d.]+<\/DescuentoMonto>\s*/g, '\n      ');
    item = item.replace(
      /(<PrecioUnitarioItem>[\d.]+<\/PrecioUnitarioItem>)/,
      `$1\n      <DescuentoMonto>${format2(amount)}</DescuentoMonto>\n      ${tabla}`
    );
  }

  const rec = item.match(/<RecargoMonto>([\d.]+)<\/RecargoMonto>/);
  if (rec) {
    const amount = rec[1];
    const tabla =
      recTablas.length > 0 ? recTablas[0][0] : buildTablaSubRecargo(amount);
    if (!item.includes('<TablaSubRecargo>')) {
      item = item.replace(
        /<RecargoMonto>[\d.]+<\/RecargoMonto>/,
        `<RecargoMonto>${format2(amount)}</RecargoMonto>\n      ${tabla}`
      );
    }
  }

  return item.trim();
}

function buildDescuentoORecargo({
  numeroLinea,
  tipoAjuste,
  descripcion,
  monto,
  indicadorFacturacion
}) {
  return `<DescuentoORecargo>
    <NumeroLinea>${numeroLinea}</NumeroLinea>
    <TipoAjuste>${tipoAjuste}</TipoAjuste>
    <DescripcionDescuentooRecargo>${descripcion}</DescripcionDescuentooRecargo>
    <TipoValor>$</TipoValor>
    <MontoDescuentooRecargo>${format2(monto)}</MontoDescuentooRecargo>
    <IndicadorFacturacionDescuentooRecargo>${indicadorFacturacion}</IndicadorFacturacionDescuentooRecargo>
  </DescuentoORecargo>`;
}

function injectDescuentosORecargos(xml, encf) {
  const rows = PATCH.DOCUMENT_DOR[encf];
  if (!rows) return xml;

  if (xml.includes('<DescuentosORecargos>')) {
    return xml.replace(
      /<DescuentosORecargos>[\s\S]*?<\/DescuentosORecargos>/,
      `<DescuentosORecargos>\n    ${rows.map(buildDescuentoORecargo).join('\n    ')}\n  </DescuentosORecargos>`
    );
  }

  const block = `<DescuentosORecargos>\n    ${rows.map(buildDescuentoORecargo).join('\n    ')}\n  </DescuentosORecargos>`;
  if (xml.includes('<InformacionReferencia>')) {
    return xml.replace('<InformacionReferencia>', `${block}\n  <InformacionReferencia>`);
  }
  return xml.replace('<FechaHoraFirma>', `${block}\n  <FechaHoraFirma>`);
}

function patchXml(xml) {
  let out = xml;
  const tipoeCF = extractTipoeCF(out);
  const encf = extractEncf(out);

  out = out.replace(/<Comprador>\s*<\/Comprador>/g, '');
  out = out.replace(/<Comprador\s*\/>/g, '');
  out = out.replace(/\s*<IndicadorNorma1007>0<\/IndicadorNorma1007>\s*/g, '\n');

  out = out.replace(
    /<PrecioUnitarioItem>(-?\d+(?:\.\d+)?)<\/PrecioUnitarioItem>/g,
    (_, n) => `<PrecioUnitarioItem>${formatPrecio(n, tipoeCF, encf)}</PrecioUnitarioItem>`
  );
  out = out.replace(
    /<PrecioUnitarioReferencia>(-?\d+(?:\.\d+)?)<\/PrecioUnitarioReferencia>/g,
    (_, n) => `<PrecioUnitarioReferencia>${formatPrecio(n, tipoeCF, encf)}</PrecioUnitarioReferencia>`
  );
  out = out.replace(
    /<CantidadItem>(-?\d+(?:\.\d+)?)<\/CantidadItem>/g,
    (_, n) => `<CantidadItem>${format2(n)}</CantidadItem>`
  );
  out = out.replace(/<MontoItem>(-?\d+(?:\.\d+)?)<\/MontoItem>/g, (_, n) => `<MontoItem>${format2(n)}</MontoItem>`);
  out = out.replace(
    /<DescuentoMonto>(-?\d+(?:\.\d+)?)<\/DescuentoMonto>/g,
    (_, n) => `<DescuentoMonto>${format2(n)}</DescuentoMonto>`
  );

  out = out.replace(/<Item>[\s\S]*?<\/Item>/g, (item) => fixItemLineBlock(item));
  out = injectDescuentosORecargos(out, encf);

  out = out.replace(/\r\n/g, '\n');
  out = out.replace(/\n[ \t]+\n/g, '\n');
  out = out.replace(/<SubDescuentoPorcentaje>0\.000<\/SubDescuentoPorcentaje>\s*/g, '');

  return out;
}

function extractFechaEmision(xml) {
  const m = xml.match(/<FechaEmision>([^<]+)<\/FechaEmision>/);
  return m ? m[1].trim() : '';
}

function buildFechaEmisionMap(files) {
  const map = new Map();
  for (const f of files) {
    const xml = fs.readFileSync(path.join(ecfDir, f), 'utf8');
    const encf = extractEncf(xml);
    const fecha = extractFechaEmision(xml);
    if (encf && fecha) map.set(encf, fecha);
  }
  return map;
}

/** Error 634: FechaNCFModificado debe coincidir con FechaEmision del padre. */
function syncFechaNcfModificado(xml, fechaMap) {
  const ncfMod = extractNcfModificado(xml);
  if (!ncfMod) return xml;
  const parentFecha = fechaMap.get(ncfMod);
  if (!parentFecha) return xml;
  if (!xml.includes('<FechaNCFModificado>')) return xml;
  return xml.replace(
    /<FechaNCFModificado>[^<]*<\/FechaNCFModificado>/,
    `<FechaNCFModificado>${parentFecha}</FechaNCFModificado>`
  );
}

function sortEcfByNcfDependency(entries) {
  const byEncf = new Map(entries.map((e) => [e.encf, e]));
  const sorted = [];
  const done = new Set();

  function visit(entry) {
    if (!entry || done.has(entry.encf)) return;
    const dep = entry.ncfModificado;
    if (dep && byEncf.has(dep) && !done.has(dep)) visit(byEncf.get(dep));
    done.add(entry.encf);
    sorted.push(entry);
  }

  for (const entry of entries) visit(entry);
  return sorted;
}

function extractNcfModificado(xml) {
  const m = xml.match(/<NCFModificado>([^<]+)<\/NCFModificado>/);
  return m ? m[1].trim() : '';
}

function extractMontoTotal(xml) {
  const m = xml.match(/<MontoTotal>([^<]+)<\/MontoTotal>/);
  return m ? Number(m[1]) : 0;
}

function main() {
  PATCH = loadPatchConfig();
  const files = fs.readdirSync(ecfDir).filter((f) => f.endsWith('.xml'));
  const fechaMap = buildFechaEmisionMap(files);
  let patched = 0;
  let fechasSync = 0;

  for (const f of files) {
    const p = path.join(ecfDir, f);
    const before = fs.readFileSync(p, 'utf8');
    let work = syncFechaNcfModificado(before, fechaMap);
    if (work !== before) fechasSync++;
    const after = patchXml(work);
    if (after !== before) {
      fs.writeFileSync(p, after, 'utf8');
      patched++;
    }
  }

  if (fechasSync) {
    console.log('Fechas NCF modificado sincronizadas:', fechasSync);
  }

  if (!fs.existsSync(manifestPath)) {
    console.log('Parcheados', patched, 'XML. Sin manifest.json para actualizar orden.');
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const rfceOrden = (manifest.ordenEnvio || []).filter((e) => e.tipo === 'RFCE' || e.hoja === 'RFCE');
  let paso = rfceOrden.length;

  const ecfForOrden = [];
  for (const entry of manifest.ecf || []) {
    const xml = fs.readFileSync(path.join(ecfDir, entry.archivo), 'utf8');
    const encf = entry.encf || xml.match(/<eNCF>([^<]+)<\/eNCF>/)?.[1];
    const tipoeCF = entry.tipoeCF || extractTipoeCF(xml);
    const montoTotal = extractMontoTotal(xml);
    const ncfModificado = extractNcfModificado(xml);
    const row = { ...entry, encf, tipoeCF, montoTotal, ncfModificado };

    if (tipoeCF === '32' && PATCH.RFCE_FC32.has(encf) && montoTotal < 250000) {
      row.omitirEnvioApi = true;
      row.nota = 'No enviar ECF íntegro por API — solo RFCE (resumen B2C).';
    } else {
      ecfForOrden.push(row);
    }
  }

  const ecfOrden = sortEcfByNcfDependency(ecfForOrden);
  manifest.ordenEnvio = [
    ...rfceOrden.map((e, i) => ({ ...e, paso: i + 1 })),
    ...ecfOrden.map((e) => ({ ...e, paso: ++paso, tipo: 'ECF' }))
  ];
  manifest.omitidosEnvioApi = (manifest.ecf || []).filter((e) =>
    tipoeCF32(e, path.join(ecfDir, e.archivo))
  );
  manifest.pendientesReenvio = PATCH.paso4
    ? (PATCH.NOTAS_REENVIO || []).map((f) => f.match(/E\d{12}/)?.[0]).filter(Boolean)
    : ['E460000000009', 'E460000000010', 'E470000000010'];
  manifest.actualizadoEn = new Date().toISOString();

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('OK —', patched, 'XML parcheados en ecf-sin-firmar/');
  console.log('  Orden envío API:', manifest.ordenEnvio.length, 'comprobantes');
  console.log('  Omitidos FC32 B2C (solo RFCE):', manifest.omitidosEnvioApi?.length || 0);
  console.log('  Pendientes reenvío:', manifest.pendientesReenvio.join(', '));
}

function tipoeCF32(entry, filePath) {
  const xml = fs.readFileSync(filePath, 'utf8');
  const encf = entry.encf || xml.match(/<eNCF>([^<]+)<\/eNCF>/)?.[1];
  return (
    (entry.tipoeCF || extractTipoeCF(xml)) === '32' &&
    PATCH.RFCE_FC32.has(encf) &&
    extractMontoTotal(xml) < 250000
  );
}

main();
