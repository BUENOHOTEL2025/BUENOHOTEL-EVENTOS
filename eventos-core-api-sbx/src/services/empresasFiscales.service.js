import EmpresaFiscalModel from '../models/empresaFiscal.model.js';
import ComprobanteEcfModel, { pickMontoFiscal } from '../models/comprobanteEcf.model.js';

function digits(v) {
  return String(v || '').replace(/\D/g, '');
}

export async function listarEmpresasFiscales() {
  const [empresas, cfg] = await Promise.all([
    EmpresaFiscalModel.listAll(),
    EmpresaFiscalModel.getCfg()
  ]);
  empresas.sort((a, b) => a.nombreRazon.localeCompare(b.nombreRazon, 'es'));
  return { empresas, tagCount: cfg.tagCount };
}

export async function guardarEmpresaFiscal(body) {
  return EmpresaFiscalModel.upsert(body || {});
}

export async function borrarEmpresaFiscal(rnc) {
  await EmpresaFiscalModel.remove(rnc);
}

export async function tocarUsoEmpresaFiscal(rnc) {
  return EmpresaFiscalModel.touchUso(rnc);
}

export async function guardarTagCountEmpresas(n) {
  return EmpresaFiscalModel.setTagCount(n);
}

export async function historialEmpresasFiscales() {
  const rows = await ComprobanteEcfModel.listAll({ includeHeavy: false });
  const by = new Map();
  for (const r of rows) {
    const rnc = digits(r.rncComprador);
    if (rnc.length < 8) continue;
    const emitidoAt = String(r.emitidoAt || r.fechaFirmaDigital || '');
    const rec = {
      rnc,
      nombreRazon: String(r.razonSocial || r.clienteNombre || '').trim(),
      encf: r.encf || '',
      monto: pickMontoFiscal(r.montoTotal),
      emitidoAt,
      estado: r.estado || '',
      codigoDgii: r.codigoDgii ?? null,
      mensajes: r.mensajes || [],
      count: 1
    };
    const prev = by.get(rnc);
    if (!prev) {
      by.set(rnc, rec);
      continue;
    }
    prev.count += 1;
    if (emitidoAt > String(prev.emitidoAt || '')) {
      prev.encf = rec.encf;
      prev.monto = rec.monto;
      prev.emitidoAt = emitidoAt;
      prev.estado = rec.estado;
      prev.codigoDgii = rec.codigoDgii;
      prev.mensajes = rec.mensajes;
      if (rec.nombreRazon) prev.nombreRazon = rec.nombreRazon;
    }
  }
  const items = [...by.values()].sort((a, b) => String(b.emitidoAt || '').localeCompare(String(a.emitidoAt || '')));
  return { items };
}

export async function historialEmpresaFiscal(rnc) {
  const key = digits(rnc);
  if (key.length < 8) {
    const err = new Error('RNC inválido');
    err.status = 400;
    throw err;
  }
  const rows = await ComprobanteEcfModel.listAll({ includeHeavy: false });
  const items = rows
    .filter((r) => digits(r.rncComprador) === key)
    .map((r) => ({
      encf: r.encf || '',
      origen: r.origen || '',
      nombreRazon: String(r.razonSocial || r.clienteNombre || '').trim(),
      rnc: key,
      monto: pickMontoFiscal(r.montoTotal),
      emitidoAt: r.emitidoAt || r.fechaFirmaDigital || '',
      estado: r.estado || '',
      codigoDgii: r.codigoDgii ?? null,
      mensajes: r.mensajes || [],
      registroId: r.registroId || null,
      tieneImpresion: Boolean(r.tieneImpresion)
    }))
    .sort((a, b) => String(b.emitidoAt || '').localeCompare(String(a.emitidoAt || '')));
  return { rnc: key, items };
}
