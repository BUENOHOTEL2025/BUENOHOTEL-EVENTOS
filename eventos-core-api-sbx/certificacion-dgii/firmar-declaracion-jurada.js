#!/usr/bin/env node
/**
 * Firma Declaración Jurada (Paso 13). Autónomo: solo necesita dgii-ecf en node_modules.
 *
 * Requisitos en la misma carpeta (o padre):
 *   - node_modules/dgii-ecf
 *   - .env.cert con:
 *       DGII_FE_CERT_P12_PATH=C:\ruta\certificado.p12
 *       DGII_FE_CERT_PASSWORD=clave
 *
 * Uso:
 *   node firmar-declaracion-jurada.js 202607281949793.xml
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function loadEnvCert() {
  const candidates = [
    path.join(__dirname, '.env.cert'),
    path.join(process.cwd(), '.env.cert'),
    path.join(__dirname, '..', '.env.cert')
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[m[1]] == null || process.env[m[1]] === '') process.env[m[1]] = v;
    }
    console.log('env:', p);
    return;
  }
}

async function loadDgiiEcf() {
  const tries = [
    path.join(__dirname, 'node_modules', 'dgii-ecf'),
    path.join(process.cwd(), 'node_modules', 'dgii-ecf'),
    path.join(__dirname, '..', 'node_modules', 'dgii-ecf')
  ];
  for (const dir of tries) {
    const pkg = path.join(dir, 'package.json');
    if (!fs.existsSync(pkg)) continue;
    try {
      return await import(pathToFileURL(path.join(dir, 'index.js')).href);
    } catch {
      try {
        return require(dir);
      } catch {
        /* next */
      }
    }
  }
  throw new Error('No se encontró node_modules/dgii-ecf. Ejecuta esto dentro de la carpeta certificacion-dgii (o C:\\dgi con npm install).');
}

async function main() {
  loadEnvCert();
  const pass = String(process.env.DGII_FE_CERT_PASSWORD || '');
  const p12Path = String(process.env.DGII_FE_CERT_P12_PATH || '').trim();
  const b64 = String(process.env.DGII_FE_CERT_P12_BASE64 || '').trim();
  if (!pass || (!p12Path && !b64)) {
    console.error('Falta .env.cert con DGII_FE_CERT_PASSWORD y DGII_FE_CERT_P12_PATH');
    process.exit(1);
  }

  const srcArg = process.argv[2];
  if (!srcArg) {
    console.error('Uso: node firmar-declaracion-jurada.js <archivo.xml>');
    process.exit(1);
  }
  const src = path.resolve(process.cwd(), srcArg);
  if (!fs.existsSync(src)) {
    console.error('No existe:', src);
    process.exit(1);
  }

  let xml = fs.readFileSync(src, 'utf8');
  if (!/<DeclaracionJurada[\s>]/.test(xml)) {
    console.error('El XML no tiene raíz <DeclaracionJurada>');
    process.exit(1);
  }
  if (/<Signature[\s>]/.test(xml)) {
    console.error('El XML ya parece firmado');
    process.exit(1);
  }

  const { P12Reader, Signature } = await loadDgiiEcf();
  const reader = new P12Reader(pass);
  const keys = b64 ? reader.getKeyFromStringBase64(b64) : reader.getKeyFromFile(path.resolve(p12Path));
  const signer = new Signature(keys.key, keys.cert);
  const signed = signer.signXml(xml, 'DeclaracionJurada');
  if (!/<SignatureValue>/.test(signed)) {
    console.error('Firma incompleta (sin SignatureValue)');
    process.exit(1);
  }

  const dest = path.join(
    path.dirname(src),
    path.basename(src, path.extname(src)) + '-firmado.xml'
  );
  fs.writeFileSync(dest, signed, 'utf8');
  console.log('OK:', dest);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
