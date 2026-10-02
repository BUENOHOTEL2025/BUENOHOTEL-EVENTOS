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
    monto: tag(m[1], 'MontoItem'),
    indicadorFacturacion: tag(m[1], 'IndicadorFacturacion'),
    gradosAlcohol: tag(m[1], 'GradosAlcohol'),
    precioUnitarioReferencia: tag(m[1], 'PrecioUnitarioReferencia'),
    isce: tag(m[1], 'ISCe'),
    iscav: tag(m[1], 'ISCav')
  }));

  return {
    tipoeCF: tag(xml, 'TipoeCF'),
    encf: tag(xml, 'eNCF'),
    fechaVencimientoSecuencia: tag(xml, 'FechaVencimientoSecuencia'),
    rncEmisor: tag(xml, 'RNCEmisor'),
    razonSocialEmisor: tag(xml, 'RazonSocialEmisor'),
    nombreComercial: tag(xml, 'NombreComercial'),
    direccionEmisor: tag(xml, 'DireccionEmisor'),
    zonaVenta: tag(xml, 'ZonaVenta'),
    telefonosEmisor: tags(xml, 'TelefonoEmisor'),
    correoEmisor: tag(xml, 'CorreoEmisor'),
    fechaEmision: tag(xml, 'FechaEmision'),
    rncComprador: tag(xml, 'RNCComprador'),
    razonSocialComprador: tag(xml, 'RazonSocialComprador'),
    direccionComprador: tag(xml, 'DireccionComprador'),
    correoComprador: tag(xml, 'CorreoComprador'),
    ncfModificado: tag(xml, 'NCFModificado'),
    fechaNcfModificado: tag(xml, 'FechaNCFModificado'),
    codigoModificacion: tag(xml, 'CodigoModificacion'),
    montoTotal: tag(xml, 'MontoTotal'),
    montoGravado: tag(xml, 'MontoGravadoTotal'),
    montoExento: tag(xml, 'MontoExento'),
    totalItbis: tag(xml, 'TotalITBIS'),
    totalIsc: tag(xml, 'TotalISC'),
    itbis1: tag(xml, 'ITBIS1'),
    itbis2: tag(xml, 'ITBIS2'),
    itbis3: tag(xml, 'ITBIS3'),
    fechaHoraFirma: tag(xml, 'FechaHoraFirma'),
    items,
    signed: /<SignatureValue>/.test(xml)
  };
}
