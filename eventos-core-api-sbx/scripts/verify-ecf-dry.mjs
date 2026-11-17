/**
 * Prueba en seco: XML/preview/xlsx/Express sin reservar e-NCF ni llamar a DGII.
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import {
  assertXmlListoParaEmitir,
  iecfDocumentToXml,
  draftToIecfDocument
} from '../src/services/facturacionIecf.mapper.js';
import { previewFacturaHtml } from '../src/services/facturacionEmitir.service.js';
import { emitirFacturaElectronica } from '../src/services/facturacionEmitir.service.js';
import app from '../server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function fail(msg) {
  console.error('FAIL', msg);
  process.exitCode = 1;
}

const draft = {
  tipoeCF: 31,
  emisor: {},
  comprador: {
    nombreRazon: 'EMPRESA PRUEBA SRL',
    rncCliente: '101000001',
    email: 'prueba@example.com',
    telefono: '8095664292',
    direccion: 'Calle Prueba 18, Santo Domingo'
  },
  documento: {},
  transaccion: { fechaEmisionISO: new Date().toISOString() },
  lineas: [
    {
      descripcion: 'Servicio de evento (prueba seca)',
      cantidad: 1,
      precioUnitario: 10000,
      gravadoItbis: true
    }
  ],
  totales: { itbis: 1800, totalRD: 11800, subtotalGravado: 10000 }
};

const excelPath = path.join(ROOT, 'certificacion-dgii', 'datos', '131631088-paso4-simulacion-v2.xlsx');
const { readWorkbook } = await import('../certificacion-dgii/lib/xlsxIo.js');
const wb = readWorkbook(excelPath);
if (!wb.SheetNames.length) fail('xlsx sin hojas');
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
if (!rows.length) fail('xlsx sin filas');
const outWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(outWb, XLSX.utils.aoa_to_sheet([['eNCF', 'ok'], ['E310000000000', 'dry']]), 'test');
const roundtrip = XLSX.write(outWb, { type: 'buffer', bookType: 'xlsx' });
if (!Buffer.isBuffer(roundtrip) || roundtrip.length < 100) fail('xlsx write');
console.log('xlsx ok', wb.SheetNames[0], 'filas', rows.length, 'bytes', roundtrip.length);

const dummy = 'E310000000000';
const { document, encf } = draftToIecfDocument(draft, { encf: dummy, tipoeCF: 31 });
if (encf !== dummy) fail(`encf mapeado ${encf}`);
const xml = iecfDocumentToXml(document);
if (!xml.includes(dummy) || !xml.includes('<ECF')) fail('xml dummy');
const preflight = assertXmlListoParaEmitir(draft, 31);
if (!preflight.includes('E310000000000')) fail('preflight no usa dummy');
console.log('xml dummy ok', dummy, 'len', preflight.length);

const html = await previewFacturaHtml({
  tipoeCF: 31,
  comprador: draft.comprador,
  lineas: draft.lineas,
  totales: draft.totales
});
if (!/SIN e-NCF|DOCUMENTO|FACTURA/i.test(html)) fail('preview html');
if (/E31(?!0000000000)\d{10}/.test(html)) fail('preview parece tener serie real');
console.log('preview html ok', html.length);

try {
  await emitirFacturaElectronica({ dryRun: true, tipoeCF: 31, comprador: draft.comprador, lineas: draft.lineas, totales: draft.totales });
  fail('emitir no debió completar sin certificado (o sí, si hay cert local: revisar encf)');
} catch (e) {
  if (e?.code === 'DGII_FE_CERT_MISSING' || e?.status === 503) {
    console.log('emitir dry-run se detuvo antes de secuencia:', e.code);
  } else if (e?.code === 'DGII_XML_PREFLIGHT') {
    fail(`preflight xml: ${e.message}`);
  } else {
    console.log('emitir error esperado (sin quemar serie):', e.code || e.status, e.message);
  }
}

const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

async function req(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  return { status: res.status, text };
}

const health = await req('GET', '/api/facturacion/_health');
const deploy = await req('GET', '/api/_deploy-check');
const emitirNoAuth = await req('POST', '/api/facturacion/emitir', { dryRun: true, ...draft });
const preview = await req('POST', '/api/facturacion/preview', draft);
server.close();

if (health.status !== 200 || !health.text.includes('facturacionEmitir')) fail(`health ${health.status} ${health.text}`);
if (deploy.status !== 200 || !deploy.text.includes('"ok":true')) fail(`deploy ${deploy.status}`);
if (emitirNoAuth.status !== 401) fail(`emitir sin JWT debía ser 401, fue ${emitirNoAuth.status} ${emitirNoAuth.text}`);
if (preview.status !== 401) fail(`preview sin JWT debía ser 401, fue ${preview.status} ${preview.text}`);
console.log('express ok', { health: health.status, deploy: deploy.status, emitirNoAuth: emitirNoAuth.status, preview: preview.status });
console.log('LISTO: no se llamó allocateNextEncf; dummy E310000000000');
