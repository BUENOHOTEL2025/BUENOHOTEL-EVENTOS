#!/usr/bin/env node
/**
 * Validación rápida de tags DGII en XML sin firmar (Paso 2).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildPaso4PatchSets,
  isPaso4Manifest
} from './lib/paso4EncfMap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const salida = path.join(__dirname, 'salida');
const manifestPath = path.join(salida, 'manifest.json');

const FORBIDDEN_TAGS = ['<ENCF>', '</ENCF>', '<TipoECF>', '</TipoECF>'];

const REQUIRED_PER_ROOT = {
  ECF: ['<TipoeCF>', '<eNCF>', '<RNCEmisor>', '<FechaEmision>'],
  RFCE: ['<TipoeCF>', '<eNCF>', '<RNCEmisor>', '<MontoTotal>']
};

function listXml(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.xml')).map((f) => path.join(dir, f));
}

function rootTag(xml) {
  if (xml.includes('<RFCE>')) return 'RFCE';
  if (xml.includes('<ECF>')) return 'ECF';
  return '?';
}

const soloEcf = process.argv.includes('--solo-ecf');

const files = [
  ...listXml(path.join(salida, 'ecf-sin-firmar')),
  ...(soloEcf ? [] : listXml(path.join(salida, 'rfce-sin-firmar')))
];

const PASO2_PRECIO_4DEC = new Set(['E460000000010', 'E470000000010']);
const PASO2_PRECIO_2DEC = new Set([
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

let manifest = null;
if (fs.existsSync(manifestPath)) {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}
const paso4 = isPaso4Manifest(manifest);
if (paso4 && manifest?.paso4Offset) {
  process.env.PASO4_OFFSET = String(manifest.paso4Offset);
}
const paso4Sets = paso4 ? buildPaso4PatchSets() : null;
const PRECIO_4DEC_ENCF = paso4 ? paso4Sets.PRECIO_4DEC_ENCF : PASO2_PRECIO_4DEC;
const PRECIO_2DEC_ENCF = paso4 ? paso4Sets.PRECIO_2DEC_ENCF : PASO2_PRECIO_2DEC;

function extractEncf(xml) {
  const m = xml.match(/<eNCF>([^<]+)<\/eNCF>/);
  return m ? m[1].trim() : '';
}

function checkPrecios(base, xml) {
  const encf = extractEncf(xml);
  if (!encf) return;
  const precios = [...xml.matchAll(/<PrecioUnitarioItem>([^<]+)<\/PrecioUnitarioItem>/g)].map((m) => m[1]);
  for (const p of precios) {
    if (PRECIO_4DEC_ENCF.has(encf) && !/^\d+\.\d{4}$/.test(p)) {
      issues.push({
        file: base,
        issue: `${encf}: PrecioUnitarioItem debe tener 4 decimales (ej. 350.0000), tiene ${p}`
      });
    }
    if (PRECIO_2DEC_ENCF.has(encf) && !/^\d+\.\d{2}$/.test(p)) {
      issues.push({
        file: base,
        issue: `${encf}: PrecioUnitarioItem debe tener 2 decimales (ej. 30000.00), tiene ${p}`
      });
    }
  }
}

const issues = [];

for (const file of files) {
  const xml = fs.readFileSync(file, 'utf8');
  const base = path.basename(file);
  const root = rootTag(xml);

  for (const bad of FORBIDDEN_TAGS) {
    if (xml.includes(bad)) issues.push({ file: base, issue: `Tag prohibido: ${bad}` });
  }

  if (!xml.includes('<eNCF>')) {
    issues.push({ file: base, issue: 'Falta <eNCF>' });
  }

  const req = REQUIRED_PER_ROOT[root] || [];
  for (const tag of req) {
    if (!xml.includes(tag)) issues.push({ file: base, issue: `Falta ${tag}` });
  }

  if (root === 'RFCE' && xml.includes('<FechaHoraFirma>')) {
    issues.push({
      file: base,
      issue: 'RFCE no debe tener <FechaHoraFirma> — use npm run generar-rfce desde ECF firmados'
    });
  }

  if (root === 'RFCE' && !xml.includes('<CodigoSeguridadeCF>')) {
    issues.push({
      file: base,
      issue: 'RFCE requiere <CodigoSeguridadeCF> en Encabezado — use npm run generar-rfce'
    });
  }

  if (!xml.includes('<Version>')) {
    issues.push({ file: base, issue: 'Falta <Version>' });
  }

  const encabezadoIdx = xml.indexOf('<Encabezado>');
  const versionIdx = xml.indexOf('<Version>');
  const idDocIdx = xml.indexOf('<IdDoc>');
  if (encabezadoIdx >= 0 && versionIdx > idDocIdx && idDocIdx >= 0) {
    issues.push({ file: base, issue: 'Version debe ir antes de IdDoc en Encabezado' });
  }

  if (root === 'ECF') checkPrecios(base, xml);
}

const report = {
  revisadoEn: new Date().toISOString(),
  total: files.length,
  ecf: listXml(path.join(salida, 'ecf-sin-firmar')).length,
  rfce: listXml(path.join(salida, 'rfce-sin-firmar')).length,
  ok: issues.length === 0,
  issues
};

const outPath = path.join(salida, 'validacion-xml.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

if (report.ok) {
  console.log('OK —', report.total, 'XML validados (eNCF, estructura base).');
} else {
  console.log('ERRORES —', issues.length);
  for (const i of issues) console.log(' ', i.file, '-', i.issue);
  process.exit(1);
}
