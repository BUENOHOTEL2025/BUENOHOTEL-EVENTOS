export const ECF_PERM_CATALOG = [
  { id: 'ver_lista', grupo: 'Comprobantes', label: 'Ver lista de comprobantes' },
  { id: 'emitir', grupo: 'Comprobantes', label: 'Nueva factura y emitir a DGII' },
  { id: 'guardar_borrador', grupo: 'Comprobantes', label: 'Guardar factura (borrador compartido)' },
  { id: 'preview', grupo: 'Comprobantes', label: 'Vista previa' },
  { id: 'ver_detalle', grupo: 'Comprobantes', label: 'Ver detalle DGII' },
  { id: 'consultar_dgii', grupo: 'Comprobantes', label: 'Volver a consultar DGII' },
  { id: 'ver_factura', grupo: 'Comprobantes', label: 'Ver factura' },
  { id: 'descargar', grupo: 'Comprobantes', label: 'Descargar factura' },
  { id: 'zip_masivo', grupo: 'Comprobantes', label: 'Descarga masiva XML / factura' },
  { id: 'exportar_excel', grupo: 'Comprobantes', label: 'Exportar lista a Excel' },
  { id: 'rellenar', grupo: 'Comprobantes', label: 'Rellenar campos desde un comprobante' },
  { id: 'empresas_ver', grupo: 'Empresas', label: 'Ver empresas' },
  { id: 'empresas_editar', grupo: 'Empresas', label: 'Crear, editar y borrar empresas' },
  { id: 'historial', grupo: 'Historial', label: 'Ver historial por empresa' },
  { id: 'auditoria', grupo: 'Auditoría', label: 'Ver campana y registro de logs' },
  { id: 'exportar_auditoria', grupo: 'Auditoría', label: 'Exportar logs a Excel' },
  { id: 'usuarios', grupo: 'Usuarios', label: 'Administrar usuarios admin y permisos' }
];

export const ECF_PERM_IDS = ECF_PERM_CATALOG.map((x) => x.id);

export const ECF_PERM_GATES = {
  ver_lista: [
    'emitir',
    'guardar_borrador',
    'preview',
    'ver_detalle',
    'consultar_dgii',
    'ver_factura',
    'descargar',
    'zip_masivo',
    'exportar_excel',
    'rellenar'
  ],
  empresas_ver: ['empresas_editar'],
  auditoria: ['exportar_auditoria']
};

export function defaultPermisosEcf() {
  const out = {};
  for (const id of ECF_PERM_IDS) out[id] = true;
  return out;
}

export function emptyPermisosEcf() {
  const out = {};
  for (const id of ECF_PERM_IDS) out[id] = false;
  return out;
}

export function tieneAlgunPermiso(permisos) {
  const p = normalizePermisosEcf(permisos);
  return ECF_PERM_IDS.some((id) => p[id] !== false);
}

export function normalizePermisosEcf(raw) {
  const base = defaultPermisosEcf();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base };
  for (const id of ECF_PERM_IDS) {
    if (raw[id] === false || raw[id] === 'false' || raw[id] === 0) out[id] = false;
    else if (raw[id] === true || raw[id] === 'true' || raw[id] === 1) out[id] = true;
  }
  for (const [gate, children] of Object.entries(ECF_PERM_GATES)) {
    if (children.some((c) => out[c] === true)) out[gate] = true;
    if (out[gate] === false) {
      for (const c of children) out[c] = false;
    }
  }
  return out;
}

export function hasPermiso(permisos, id) {
  const p = normalizePermisosEcf(permisos);
  return p[id] !== false;
}

export function resumenPermisos(permisos) {
  const p = normalizePermisosEcf(permisos);
  return {
    dados: ECF_PERM_CATALOG.filter((x) => p[x.id] !== false).map((x) => x.label),
    quitados: ECF_PERM_CATALOG.filter((x) => p[x.id] === false).map((x) => x.label)
  };
}

export function diffPermisosEcf(antes, despues) {
  const a = normalizePermisosEcf(antes);
  const b = normalizePermisosEcf(despues);
  const activados = [];
  const desactivados = [];
  for (const p of ECF_PERM_CATALOG) {
    const prev = a[p.id] !== false;
    const next = b[p.id] !== false;
    if (prev === next) continue;
    if (next) activados.push(p.label);
    else desactivados.push(p.label);
  }
  return { activados, desactivados };
}
