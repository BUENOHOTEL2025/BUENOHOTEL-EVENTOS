/** Datos del emisor RNC 131631088 — deben coincidir en XML firmado, RI y QR DGII. */
export const RAZON_SOCIAL_EMISOR_RI = 'BUENOHOTEL, S.R.L.';
export const NOMBRE_COMERCIAL_EMISOR = 'BUENOHOTEL, S.R.L.';

/** Nombres de prueba DGII que deben reemplazarse antes de firmar/enviar. */
export const RAZON_SOCIAL_PRUEBA_DGII = [
  'DOCUMENTOS ELECTRONICOS DE 02',
  'DOCUMENTOS ELECTRONICOS PRUEBA FACTURA DE CONSUMO MENOR 250MIL'
];

/**
 * Sustituye RazonSocialEmisor / NombreComercial en XML sin firmar (ECF o RFCE).
 */
export function patchEmisorRazonSocial(xml) {
  let out = xml;
  if (out.includes('<RazonSocialEmisor>')) {
    out = out.replace(
      /<RazonSocialEmisor>[^<]*<\/RazonSocialEmisor>/g,
      `<RazonSocialEmisor>${RAZON_SOCIAL_EMISOR_RI}</RazonSocialEmisor>`
    );
  }
  if (out.includes('<NombreComercial>')) {
    out = out.replace(
      /<NombreComercial>[^<]*<\/NombreComercial>/g,
      `<NombreComercial>${NOMBRE_COMERCIAL_EMISOR}</NombreComercial>`
    );
  }
  return out;
}

export function emisorRazonSocialEsCorrecta(razonSocial) {
  return String(razonSocial || '').trim() === RAZON_SOCIAL_EMISOR_RI;
}
