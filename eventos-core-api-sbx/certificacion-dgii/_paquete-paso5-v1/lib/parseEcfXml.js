function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1].trim() : '';
}

function tags(xml, name) {
  return [...xml.matchAll(new RegExp(`<${name}>([^<]*)</${name}>`, 'g'))].map((m) => m[1].trim());
}

export function parseEcfXml(xml) {
  const items = [...xml.matchAll(/<Item>([\s\S]*?)<\/Item>/g)].map((m) => ({
    numeroLinea: tag(m[1], 'NumeroLinea'),
    nombre: tag(m[1], 'NombreItem'),
    cantidad: tag(m[1], 'CantidadItem'),
    unidad: tag(m[1], 'UnidadMedida'),
    precio: tag(m[1], 'PrecioUnitarioItem'),
    monto: tag(m[1], 'MontoItem')
  }));

  return {
    tipoeCF: tag(xml, 'TipoeCF'),
    encf: tag(xml, 'eNCF'),
    rncEmisor: tag(xml, 'RNCEmisor'),
    razonSocialEmisor: tag(xml, 'RazonSocialEmisor'),
    nombreComercial: tag(xml, 'NombreComercial'),
    direccionEmisor: tag(xml, 'DireccionEmisor'),
    telefonosEmisor: tags(xml, 'TelefonoEmisor'),
    correoEmisor: tag(xml, 'CorreoEmisor'),
    fechaEmision: tag(xml, 'FechaEmision'),
    rncComprador: tag(xml, 'RNCComprador'),
    razonSocialComprador: tag(xml, 'RazonSocialComprador'),
    direccionComprador: tag(xml, 'DireccionComprador'),
    correoComprador: tag(xml, 'CorreoComprador'),
    ncfModificado: tag(xml, 'NCFModificado'),
    fechaNcfModificado: tag(xml, 'FechaNCFModificado'),
    montoTotal: tag(xml, 'MontoTotal'),
    montoGravado: tag(xml, 'MontoGravadoTotal'),
    totalItbis: tag(xml, 'TotalITBIS'),
    fechaHoraFirma: tag(xml, 'FechaHoraFirma'),
    items,
    signed: /<SignatureValue>/.test(xml)
  };
}
