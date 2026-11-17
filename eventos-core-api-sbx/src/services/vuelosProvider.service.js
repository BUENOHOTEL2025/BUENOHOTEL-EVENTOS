/**
 * Adaptador de buscador de vuelos.
 * Claudia definirá el buscador; este archivo es el enchufe.
 *
 * Opciones ya existentes para copiar/adaptar (2026):
 * - Duffel Flights API: search → offer → order. Test mode gratis. Mejor para
 *   que BUENOHOTEL venda el boleto (no solo redirigir).
 * - Skyscanner Travel Widgets: formulario embebido, comisión si hay partnership.
 *   Más rápido de mostrar; el cliente termina en Skyscanner.
 * - Travelpayouts / Aviasales Data API: precios cacheados + links de afiliado.
 * - Amadeus Enterprise: GDS completo; ya no hay self-service. Pedir acceso comercial.
 *
 * Env: VUELOS_PROVIDER = none | duffel | skyscanner | travelpayouts
 */
const PROVIDER = String(process.env.VUELOS_PROVIDER || 'none').toLowerCase();

export function vuelosProviderName() {
  return PROVIDER || 'none';
}

export async function searchFlights(query) {
  const q = {
    origen: String(query.origen || '').trim().toUpperCase().slice(0, 8),
    destino: String(query.destino || '').trim().toUpperCase().slice(0, 8),
    ida: String(query.ida || '').trim().slice(0, 16),
    vuelta: String(query.vuelta || '').trim().slice(0, 16),
    adultos: Math.max(1, Math.min(9, Number(query.adultos) || 1)),
    ninos: Math.max(0, Math.min(8, Number(query.ninos) || 0)),
    clase: String(query.clase || 'economy').slice(0, 20)
  };
  if (!q.origen || !q.destino || !q.ida) {
    const err = new Error('Indica origen, destino y fecha de ida.');
    err.status = 400;
    throw err;
  }

  if (PROVIDER === 'none' || !PROVIDER) {
    return {
      provider: 'none',
      ready: false,
      query: q,
      results: [],
      message:
        'El buscador ya recibe la búsqueda. Falta enganchar el proveedor (Duffel, widget Skyscanner o Travelpayouts) cuando Claudia lo confirme.'
    };
  }

  return {
    provider: PROVIDER,
    ready: false,
    query: q,
    results: [],
    message: `Proveedor ${PROVIDER} configurado en nombre. Aún no hay credenciales de producción.`
  };
}
