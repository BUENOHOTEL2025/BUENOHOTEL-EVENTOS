/**
 * Modelo de datos orientado al layout de Factura de Crédito Fiscal Electrónica (RD / DGII e-CF).
 * La referencia numérica coincide con la factura muestra OPERAHOTEL → BUENOHOTEL (marzo 2026).
 */

/** Tipos sugeridos para registros futuros cuando integren con DGII completo */
export const TIPO_COMPROBANTE = {
  FACTURA_CREDITO_FISCAL_ELECTRONICA: 'FACTURA DE CREDITO FISCAL ELECTRONICA'
};

/**
 * Claves opcionales en `registration.detalles` para alimentar el comprador,
 * texto de línea y datos comerciales. El front puede enviarlas desde el formulario de registro.
 *
 * comprador / fiscal:
 *   rncCliente, razonSocialCliente, direccionFiscalCliente,
 *   referenciaCliente (ej. BUENOHOTEL SRL - 716),
 * texto línea principal:
 *   descripcionServicioPrincipal, fechaDesde, fechaHasta, nombreParticipante / paxNombre, codigoProductoServicio,
 * opcional split ITBIS (si no viene, todo gravado con FACTURA_ITBIS_PCT_ENV):
 *   montoFacturaExento – monto de “otras tasas exentas”; montoFacturaExentoMoneda: DOP|USD (si falta, misma moneda que el evento)
 *   monto gravado antes de ITBIS se deriva como (base - exento) si viene explícito
 * valores comerciales:
 *   condicionPago (ej. CONTRA ENTREGA), vendedorNombre, expedienteResolucion, descuentoMonto / descuentoTotal
 * cuando integren e-CF real (después precertificación):
 *   ncfElectronico, codigoSeguridad, fechaFirmaDigital, fechaValidezNcf, numeroFacturaInterna (FT No), codigoQrDataUrl (data-uri imprimible)
 */
export const REGISTRATION_DETALLE_KEYS_FISCAL = Object.freeze([
  'rncCliente',
  'razonSocialCliente',
  'direccionFiscalCliente',
  'emailFiscalCliente',
  'telefonoFiscalCliente',
  'permite_ver_comprobante_cliente',
  'comprobanteGeneradoPorAdmin',
  'comprobanteGeneradoEn',
  'emailCliente',
  'referenciaCliente',
  'descripcionServicioPrincipal',
  'fechaDesde',
  'fechaHasta',
  'nombreParticipante',
  'paxNombre',
  'codigoProductoServicio',
  'unidadMedida',
  'montoFacturaExento',
  'montoFacturaExentoMoneda',
  'condicionPago',
  'vendedorNombre',
  'expedienteResolucion',
  'descuentoMonto',
  'ncfElectronico',
  'codigoSeguridad',
  'fechaFirmaDigital',
  'fechaValidezNcf',
  'numeroFacturaInterna',
  'codigoQrDataUrl',
  'monedaEvento',
  // alias frecuentes
  'rnc',
  'direccion',
  'direccionCliente'
]);

/**
 * Literal reconstruido desde la imagen proporcionada (referencia únicamente para pruebas y maquetación).
 */
export const SAMPLE_FACTURA_OPERAHOTEL = Object.freeze({
  emisor: {
    nombreComercial: 'OPERAHOTEL',
    direccion: 'CALLE DEL SOL #157, 2DA. PLANT',
    telefono: '809-241-5858',
    rnc: '102626294',
    email: 'info@operahotel.com.do',
    logotipoTextoMayorista: 'MAYORISTA TOUR OPERADOR'
  },
  documento: {
    tipo: TIPO_COMPROBANTE.FACTURA_CREDITO_FISCAL_ELECTRONICA,
    ncf: 'E310000002113',
    validaHastaLabel: 'Válida hasta 31/12/2026'
  },
  transaccion: {
    fechaEmisionEtiqueta: '30/Marzo/2026',
    condicionPago: 'CONTRA ENTREGA',
    fechaVencimientoEtiqueta: '30/Marzo/2026',
    numeroFacturaInterna: 'FARD00002222',
    vendedor: 'PILAR MENDEZ',
    expediente: 'RES 113630'
  },
  comprador: {
    rncCliente: '131631088',
    nombreRazon: 'BUENOHOTEL SRL - 716',
    direccion: 'AV. 27 DE FEBRERO NO. 395 PLAZA QUISQUEYA SUITE 404, SANTO DOMINGO, SANTO DOMINGO'
  },
  lineas: [
    {
      descripcion:
        'Estadía CATALONIA BAYAHIBE HABITACION TPL TI TZ4TW1 Desde 02/04/2026 hasta 05/04/2026 Pax JOSE ABREU',
      codigo: null,
      cantidad: 1,
      unidad: 'UND',
      precioUnitario: 109619.07,
      descuentoLinea: 20198.52,
      itbisLinea: 16095.69,
      importeLinea: 105516.24,
      gravadoItbis: true
    },
    {
      descripcion: 'Otras Tasas Exentas',
      codigo: null,
      cantidad: 1,
      unidad: 'UND',
      precioUnitario: 8942.06,
      descuentoLinea: null,
      itbisLinea: null,
      importeLinea: 8942.06,
      gravadoItbis: false
    }
  ],
  observacionLegal:
    'NOTA: UNA VEZ EMITIDA LA FACTURA NO SE PERMITIRAN MODIFICACIONES NI CANCELACIONES.',
  verificacion: {
    codigoSeguridad: 'dZzraU',
    fechaFirmaDigital: '31-03-2026 10:56:00',
    tieneCodigoQr: true
  },
  totales: {
    subTotal: 118561.13,
    descuento: 20198.52,
    subtotalExento: 8942.06,
    subtotalGravado: 89420.55,
    itbis: 16095.7,
    totalRD: 114458.31
  }
});

export function decimalRD(n, fractionDigits = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 10 ** fractionDigits) / 10 ** fractionDigits;
}
