import EmpresaFiscalModel from '../models/empresaFiscal.model.js';
import ComprobanteEcfModel from '../models/comprobanteEcf.model.js';

function digits(v) {
  return String(v || '').replace(/\D/g, '');
}

function parseSoapContribuyente(xml, rnc) {
  const raw = String(xml || '');
  const m = raw.match(/<GetContribuyentesResult[^>]*>([\s\S]*?)<\/GetContribuyentesResult>/i);
  const text = (m ? m[1] : raw)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
  if (!text || /403|acceso denegado/i.test(text)) return null;
  const line = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.includes(rnc) || /^\d+\|/.test(s));
  if (!line) return null;
  const parts = line.split('|').map((s) => s.trim());
  const idx = parts.findIndex((p) => digits(p) === rnc);
  const r = idx >= 0 ? idx : 1;
  const nombre = parts[r + 1] || parts[2] || '';
  if (!nombre) return null;
  return {
    rnc,
    nombreRazon: nombre,
    nombreComercial: parts[r + 2] || '',
    estado: parts[parts.length - 1] || '',
    fuente: 'dgii'
  };
}

async function consultarDgiiSoap(rnc) {
  const body =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><GetContribuyentes xmlns="http://dgii.gov.do/">` +
    `<value>${rnc}</value><patronBusqueda>0</patronBusqueda><inicioFilas>1</inicioFilas>` +
    `<filaFilas>1</filaFilas><IMEI>buenohotel-ecf</IMEI>` +
    `</GetContribuyentes></soap:Body></soap:Envelope>`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch('https://dgii.gov.do/wsMovilDGII/WSMovilDGII.asmx', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '"http://dgii.gov.do/GetContribuyentes"',
        'User-Agent': 'ksoap2-android/3.6.4'
      },
      body,
      signal: ctrl.signal
    });
    const xml = await resp.text();
    if (!resp.ok) return null;
    return parseSoapContribuyente(xml, rnc);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function consultarRncEmpresa(rncRaw) {
  const rnc = digits(rncRaw);
  if (rnc.length < 8 || rnc.length > 11) {
    const err = new Error('El RNC va en 9 a 11 dígitos.');
    err.status = 400;
    throw err;
  }

  const guardada = await EmpresaFiscalModel.get(rnc);
  if (guardada) {
    return {
      found: true,
      fuente: 'empresas',
      rnc,
      nombreRazon: guardada.nombreRazon,
      email: guardada.email,
      telefono: guardada.telefono,
      direccion: guardada.direccion,
      estado: '',
      mensaje: 'Coincide con una empresa ya guardada.'
    };
  }

  const rows = await ComprobanteEcfModel.listAll({ includeHeavy: false });
  const hit = rows.find((r) => digits(r.rncComprador) === rnc && String(r.razonSocial || r.clienteNombre || '').trim());
  if (hit) {
    return {
      found: true,
      fuente: 'comprobantes',
      rnc,
      nombreRazon: String(hit.razonSocial || hit.clienteNombre || '').trim(),
      email: String(hit.emailComprador || '').trim(),
      telefono: String(hit.telefonoComprador || '').replace(/\D/g, ''),
      direccion: String(hit.direccionComprador || '').trim(),
      estado: '',
      mensaje: 'Razón social tomada de un comprobante ya emitido.'
    };
  }

  const dgii = await consultarDgiiSoap(rnc);
  if (dgii) {
    return {
      found: true,
      ...dgii,
      email: '',
      telefono: '',
      direccion: '',
      mensaje: dgii.estado ? `DGII: ${dgii.nombreRazon} (${dgii.estado}).` : `DGII: ${dgii.nombreRazon}.`
    };
  }

  return {
    found: false,
    rnc,
    fuente: '',
    nombreRazon: '',
    mensaje:
      'No hay esa empresa en nuestros registros y DGII no dejó consultar el directorio desde el servidor. Escribe la razón social a mano.'
  };
}
