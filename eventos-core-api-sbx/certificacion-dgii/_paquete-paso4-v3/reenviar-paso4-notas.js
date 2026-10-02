#!/usr/bin/env node
/**
 * Reenvío Paso 4 COMPLETO (25 API en un solo lote).
 * Corrige las 3 notas (error 634), refirma solo esas 3, reenvía los 25 juntos.
 * NO enviar solo los rechazados — DGII reinicia el progreso.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const NOTAS = [
  'salida/ecf-sin-firmar/131631088E330000000101.xml',
  'salida/ecf-sin-firmar/131631088E340000000102.xml',
  'salida/ecf-sin-firmar/131631088E340000000115.xml'
];

function run(cmd, args) {
  console.log('\n>', cmd, args.join(' '));
  const r = spawnSync(cmd, args, { cwd: __dirname, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status || 1);
}

console.log('=== PASO 4 — REENVÍO COMPLETO (25 comprobantes) ===');
console.log('DGII exige los 25 juntos. Los 22 ya OK saldrán secuenciaUtilizada.');
console.log('Solo se refirman las 3 notas corregidas.\n');

run('node', ['parchear-xml-sin-firmar.js']);
run('node', ['firmar-xml-p12.js', ...NOTAS]);
run(npm, ['run', 'enviar-api']);

console.log('\nSi 25/25 Aceptados → portal: subir 4 FC32 <250k desde ecf-firmados/');
