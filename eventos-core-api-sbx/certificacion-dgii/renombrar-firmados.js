#!/usr/bin/env node
/**
 * Quita el sufijo de hora que agrega la App de Firma DGII (_140615, etc.)
 * y renombra cada XML al nombre que espera npm run verificar / enviar.
 *
 * Ejemplos:
 *   131631088E310000000004_140615.xml  →  131631088E310000000004.xml
 *
 * Uso:
 *   npm run renombrar-firmados
 *   npm run renombrar-firmados -- --dry-run
 *   node renombrar-firmados.js --dir salida/ecf-firmados
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const salida = path.join(__dirname, 'salida');

function argFlag(name) {
  return process.argv.includes(name);
}

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const SUFFIX_RE = /_\d{6}$/;

function readEncfAndRnc(xml) {
  const encf =
    xml.match(/<eNCF>([^<]+)<\/eNCF>/i)?.[1]?.trim() ||
    xml.match(/<ENCF>([^<]+)<\/ENCF>/i)?.[1]?.trim() ||
    '';
  const rnc = xml.match(/<RNCEmisor>([^<]+)<\/RNCEmisor>/i)?.[1]?.trim() || '';
  return { encf, rnc };
}

function canonicalName(rnc, encf) {
  if (!rnc || !encf) return '';
  return `${rnc}${encf}.xml`;
}

function stripSignerSuffix(fileName) {
  const base = fileName.replace(/\.xml$/i, '');
  if (!SUFFIX_RE.test(base)) return fileName;
  return `${base.replace(SUFFIX_RE, '')}.xml`;
}

function listXmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.xml'))
    .map((f) => path.join(dir, f));
}

function resolveTargetDirs() {
  const custom = argValue('--dir', '');
  if (custom) {
    return [path.resolve(__dirname, custom)];
  }
  return [path.join(salida, 'ecf-firmados'), path.join(salida, 'rfce-firmados')];
}

function loadManifestNames() {
  const manifestPath = path.join(salida, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return new Set();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const names = new Set();
  for (const e of [...(manifest.ecf || []), ...(manifest.rfce || [])]) {
    if (e.archivo) names.add(e.archivo);
  }
  return names;
}

function processDir(dir, dryRun, manifestNames) {
  const results = { renamed: [], skipped: [], errors: [], conflicts: [] };

  for (const filePath of listXmlFiles(dir)) {
    const current = path.basename(filePath);
    let xml;
    try {
      xml = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      results.errors.push({ file: current, error: err.message });
      continue;
    }

    const { encf, rnc } = readEncfAndRnc(xml);
    let target = canonicalName(rnc, encf);

    if (!target) {
      const stripped = stripSignerSuffix(current);
      if (stripped !== current) {
        target = stripped;
      } else {
        results.errors.push({
          file: current,
          error: 'No se pudo leer <eNCF> ni <RNCEmisor> en el XML'
        });
        continue;
      }
    }

    if (manifestNames.size && !manifestNames.has(target) && manifestNames.has(stripSignerSuffix(current))) {
      target = stripSignerSuffix(current);
    }

    if (current === target) {
      results.skipped.push({ file: current, reason: 'ya tiene el nombre correcto' });
      continue;
    }

    const dest = path.join(dir, target);
    if (fs.existsSync(dest) && path.resolve(dest) !== path.resolve(filePath)) {
      results.conflicts.push({
        from: current,
        to: target,
        error: 'ya existe otro archivo con ese nombre'
      });
      continue;
    }

    if (dryRun) {
      results.renamed.push({ from: current, to: target, dryRun: true });
      continue;
    }

    fs.renameSync(filePath, dest);
    results.renamed.push({ from: current, to: target });
  }

  return results;
}

function main() {
  const dryRun = argFlag('--dry-run');
  const dirs = resolveTargetDirs();
  const manifestNames = loadManifestNames();

  console.log(dryRun ? 'DRY-RUN — no se renombrará nada\n' : 'Renombrando firmados...\n');

  let totalRenamed = 0;
  let totalErrors = 0;
  let totalConflicts = 0;

  for (const dir of dirs) {
    const label = path.relative(__dirname, dir) || dir;
    if (!fs.existsSync(dir)) {
      console.log(`[${label}] carpeta no existe — omitida`);
      continue;
    }

    const r = processDir(dir, dryRun, manifestNames);
    totalRenamed += r.renamed.length;
    totalErrors += r.errors.length;
    totalConflicts += r.conflicts.length;

    console.log(`[${label}]`);
    for (const row of r.renamed) {
      console.log(`  ${row.from}  →  ${row.to}${row.dryRun ? ' (simulado)' : ''}`);
    }
    for (const row of r.conflicts) {
      console.log(`  CONFLICTO: ${row.from} → ${row.to} (${row.error})`);
    }
    for (const row of r.errors) {
      console.log(`  ERROR: ${row.file} — ${row.error}`);
    }
    if (!r.renamed.length && !r.errors.length && !r.conflicts.length) {
      console.log(`  ${r.skipped.length} archivo(s) ya correctos`);
    }
    console.log('');
  }

  console.log(
    'Resumen:',
    totalRenamed,
    dryRun ? 'por renombrar' : 'renombrados',
    '|',
    totalConflicts,
    'conflictos |',
    totalErrors,
    'errores'
  );

  if (totalRenamed && dryRun) {
    console.log('\nEjecute sin --dry-run para aplicar los cambios.');
  }

  if (totalErrors || totalConflicts) {
    process.exit(1);
  }
}

main();
