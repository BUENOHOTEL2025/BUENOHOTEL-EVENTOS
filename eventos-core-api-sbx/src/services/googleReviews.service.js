const CACHE_MS = 60 * 1000;
const MAPS_SEARCH =
  process.env.GOOGLE_MAPS_URL ||
  'https://www.google.com/maps/place/?q=place_id:ChIJtzx3knhhpY4R4jA9Z5BQycE';
const MAPS_PHOTOS =
  process.env.GOOGLE_MAPS_PHOTOS_URL ||
  'https://www.google.com/search?q=BUENOHOTEL&ludocid=13963780700776509666&hl=es#lkt=LocalPoiPhotos';
const SEARCH_QUERY =
  process.env.GOOGLE_PLACE_QUERY ||
  'BUENOHOTEL agencia de viajes C. Dario Concepcion 18 San Geronimo Santo Domingo';
const FIELD_MASK = [
  'id',
  'displayName',
  'rating',
  'userRatingCount',
  'reviews',
  'photos',
  'formattedAddress',
  'shortFormattedAddress',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'googleMapsUri',
  'regularOpeningHours',
  'primaryTypeDisplayName',
  'editorialSummary',
  'types'
].join(',');

const cache = new Map();
const CACHE_VER = 'v33-live';

function apiKey() {
  return String(process.env.GOOGLE_PLACES_API_KEY || '').trim();
}

function placeIdEnv() {
  return String(process.env.GOOGLE_PLACE_ID || 'ChIJtzx3knhhpY4R4jA9Z5BQycE').trim();
}

function fallback(lang) {
  const en = lang === 'en';
  return {
    source: 'fallback',
    name: 'BUENOHOTEL',
    primaryType: en ? 'Travel agency' : 'Agencia de viajes',
    editorial: en
      ? 'Travel agency and inbound-outbound tour operator in Santo Domingo.'
      : 'Agencia de viajes y tour operador receptivo-emisivo en Santo Domingo.',
    rating: 4.9,
    userRatingCount: 29,
    ratingBreakdown: { 5: 27, 4: 2, 3: 0, 2: 0, 1: 0 },
    address: 'C/ Darío Concepción No.18, San Gerónimo, Santo Domingo, D.N.',
    phone: '+1 809-566-4292',
    website: 'https://buenohotel.com/',
    mapsUrl: MAPS_SEARCH,
    photoUrl: 'https://buenohotel.com/assets/logo/icono-buenohotel.png',
    hours: en
      ? [
          'Monday: 9:00 AM – 6:00 PM',
          'Tuesday: 9:00 AM – 6:30 PM',
          'Wednesday: 9:00 AM – 6:00 PM',
          'Thursday: 9:00 AM – 6:00 PM',
          'Friday: 9:00 AM – 6:00 PM',
          'Saturday: 9:00 AM – 1:00 PM',
          'Sunday: Closed'
        ]
      : [
          'Lunes: 9:00 a. m. – 6:00 p. m.',
          'Martes: 9:00 a. m. – 6:30 p. m.',
          'Miércoles: 9:00 a. m. – 6:00 p. m.',
          'Jueves: 9:00 a. m. – 6:00 p. m.',
          'Viernes: 9:00 a. m. – 6:00 p. m.',
          'Sábado: 9:00 a. m. – 1:00 p. m.',
          'Domingo: Cerrado'
        ],
    openNow: null,
    reviews: [
      {
        author: 'Yanilsi Nuñez',
        rating: 5,
        relativeTime: en ? '22 hours ago' : 'Hace 22 horas',
        publishTime: '2026-11-06T21:50:00.000Z',
        text: 'Buena atención y responsabilidad',
        photoUrl: '',
        authorUrl: '',
        authorReviewCount: 1,
        authorPhotoCount: 1,
        photosUrl: MAPS_PHOTOS
      },
      {
        author: 'Graciela Ureña Rodriguez',
        rating: 5,
        relativeTime: en ? 'a day ago' : 'Hace 1 día',
        publishTime: '2026-11-06T19:10:00.000Z',
        text: '',
        photoUrl: '',
        authorUrl: '',
        authorReviewCount: 1,
        authorPhotoCount: 0
      },
      {
        author: 'Dylan Vargas',
        rating: 5,
        relativeTime: en ? 'a day ago' : 'Hace 1 día',
        publishTime: '2026-11-06T18:40:00.000Z',
        text: '',
        photoUrl: '',
        authorUrl: '',
        authorReviewCount: 1,
        authorPhotoCount: 1,
        photosUrl: MAPS_PHOTOS
      },
      {
        author: 'Ysabel Astacio',
        rating: 5,
        relativeTime: en ? 'a day ago' : 'Hace 1 día',
        publishTime: '2026-11-06T17:50:00.000Z',
        text: 'Recomendable, confiables y serios se ocupan de que tu viaje sea placentero siempre pendiente de los detalles. Fue un grato placer viajar con ellos.',
        photoUrl: '',
        authorUrl: '',
        authorReviewCount: 1,
        authorPhotoCount: 0
      },
      {
        author: 'Maximo Valdez Offrer',
        rating: 5,
        relativeTime: en ? 'a day ago' : 'Hace 1 día',
        publishTime: '2026-11-06T17:20:00.000Z',
        text: 'Excelente experiencia en ese viaje a Brasil. Todo salió súper bien, desde la organización hasta cada detalle del viaje. ¡Gracias por hacer de esta experiencia un recuerdo inolvidable! Sin duda, una agencia y tour operador que recomendamos al 100%.',
        photoUrl: '',
        authorUrl: '',
        authorReviewCount: 1,
        authorPhotoCount: 2,
        photosUrl: MAPS_PHOTOS
      },
      {
        author: 'Albelt castillo segura',
        rating: 5,
        relativeTime: en ? 'a day ago' : 'Hace 1 día',
        publishTime: '2026-11-06T16:40:00.000Z',
        text: 'Me encantó el servicio de Claudia, siempre estuvo dispuesta a ayudarme en todo momento. Incluso hablamos hasta la madrugada porque necesitaba un boleto de avión de última hora y siempre estuvo dispuesta a ayudar y tomar las 18 llamadas que le hice jejej. Es extremadamente organizada y sumamente considerada con sus clientes',
        photoUrl: '',
        authorUrl: '',
        authorReviewCount: 8,
        authorPhotoCount: 2,
        photosUrl: MAPS_PHOTOS
      },
      {
        author: 'jazmin veloz ramirez',
        rating: 5,
        relativeTime: en ? 'a day ago' : 'Hace 1 día',
        publishTime: '2026-11-06T16:10:00.000Z',
        text: 'Muy buena',
        photoUrl: '',
        authorUrl: '',
        authorReviewCount: 1,
        authorPhotoCount: 0
      },
      {
        author: 'Jazmín Acosta',
        rating: 5,
        relativeTime: en ? '30 weeks ago' : 'Hace 30 semanas',
        publishTime: '2026-04-10T00:00:00.000Z',
        text: '',
        photoUrl: '',
        authorUrl: '',
        authorReviewCount: 1,
        authorPhotoCount: 0
      },
      {
        author: 'Jenny Bertre',
        rating: 5,
        relativeTime: en ? 'Jul 20, 2025' : '20 jul 2025',
        publishTime: '2025-07-20T00:00:00.000Z',
        text: 'Muy buena',
        photoUrl: '',
        authorUrl: '',
        authorReviewCount: 6,
        authorPhotoCount: 0
      },
      {
        author: 'Jc Polanco',
        rating: 5,
        relativeTime: en ? '2 years ago' : 'Hace 2 años',
        publishTime: '2024-11-06T00:00:00.000Z',
        text: 'Excelente estadía, lo recomiendo. Es el tesoro mejor oculto',
        photoUrl: 'https://buenohotel.com/assets/reviews/jc-polanco.png',
        authorUrl: '',
        authorReviewCount: 1,
        authorPhotoCount: 2,
        photosUrl: MAPS_PHOTOS
      },
      {
        author: 'yenifer luna',
        rating: 5,
        relativeTime: en ? '2 years ago' : 'Hace 2 años',
        publishTime: '2024-11-05T00:00:00.000Z',
        text: 'Excelente!!! Buenos precios y servicio 5 estrella!! Son muy amables, te buscan las mejores opciones y los lugares expectaculares!',
        photoUrl: 'https://buenohotel.com/assets/reviews/yenifer-luna.jpg',
        authorUrl: '',
        authorReviewCount: 10,
        authorPhotoCount: 0
      },
      {
        author: 'Luz del Alba Delmonte Comprés',
        rating: 5,
        relativeTime: en ? '2 years ago' : 'Hace 2 años',
        publishTime: '2024-11-04T00:00:00.000Z',
        text: 'Excelente servicio y muy buenas atenciones',
        photoUrl: 'https://buenohotel.com/assets/reviews/luz-delmonte.png',
        authorUrl: '',
        authorReviewCount: 5,
        authorPhotoCount: 0
      }
    ].sort((a, b) => (Date.parse(b.publishTime) || 0) - (Date.parse(a.publishTime) || 0))
  };
}

async function googleJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `Places HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

async function photoUri(photoName, key) {
  if (!photoName || !key) return '';
  try {
    const url =
      `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=640&skipHttpRedirect=true`;
    const data = await googleJson(url, { headers: { 'X-Goog-Api-Key': key } });
    return String(data?.photoUri || '').trim();
  } catch {
    return '';
  }
}

function reviewKey(r) {
  return [
    String(r?.author || '').trim().toLowerCase(),
    String(r?.text || '').trim().toLowerCase().slice(0, 120),
    String(r?.publishTime || '').slice(0, 16)
  ].join('|');
}

function mergeReviews(primary, extra) {
  const map = new Map();
  for (const r of extra || []) {
    if (r && r.author) map.set(reviewKey(r), r);
  }
  for (const r of primary || []) {
    if (r && r.author) map.set(reviewKey(r), r);
  }
  return [...map.values()].sort((a, b) => (Date.parse(b.publishTime) || 0) - (Date.parse(a.publishTime) || 0));
}

function mapLegacy(result, lang) {
  const reviews = (Array.isArray(result?.reviews) ? result.reviews : []).map((r) => {
    const unix = Number(r?.time) || 0;
    return {
      author: String(r?.author_name || '').trim() || 'Usuario de Google',
      rating: Number(r?.rating) || 0,
      relativeTime: String(r?.relative_time_description || '').trim(),
      publishTime: unix ? new Date(unix * 1000).toISOString() : '',
      text: String(r?.text || '').trim(),
      photoUrl: String(r?.profile_photo_url || '').trim(),
      authorUrl: String(r?.author_url || '').trim(),
      authorReviewCount: 1,
      authorPhotoCount: 0,
      photosUrl: String(r?.author_url || '').trim()
    };
  });
  return {
    source: 'google',
    placeId: placeIdEnv(),
    name: String(result?.name || 'BUENOHOTEL').trim(),
    primaryType: lang === 'en' ? 'Travel agency' : 'Agencia de viajes',
    rating: Number(result?.rating) || 0,
    userRatingCount: Number(result?.user_ratings_total) || 0,
    address: String(result?.formatted_address || '').trim(),
    phone: String(result?.formatted_phone_number || '').trim(),
    website: String(result?.website || 'https://buenohotel.com/').trim(),
    mapsUrl: String(result?.url || '').trim() || MAPS_SEARCH,
    photoUrl: 'https://buenohotel.com/assets/logo/icono-buenohotel.png',
    hours: Array.isArray(result?.opening_hours?.weekday_text) ? result.opening_hours.weekday_text : [],
    openNow: typeof result?.opening_hours?.open_now === 'boolean' ? result.opening_hours.open_now : null,
    reviews,
    lang
  };
}

function mapPlace(place, photoUrl, lang) {
  const reviews = (Array.isArray(place?.reviews) ? place.reviews : [])
    .map((r) => ({
      author: String(r?.authorAttribution?.displayName || '').trim() || 'Usuario de Google',
      rating: Number(r?.rating) || 0,
      relativeTime: String(r?.relativePublishTimeDescription || '').trim(),
      publishTime: String(r?.publishTime || '').trim(),
      text: String(r?.text?.text || r?.originalText?.text || '').trim(),
      photoUrl: String(r?.authorAttribution?.photoUri || '').trim(),
      authorUrl: String(r?.authorAttribution?.uri || '').trim(),
      authorReviewCount: Math.max(1, Number(r?.authorAttribution?.reviewCount) || 1),
      authorPhotoCount: Number(r?.authorAttribution?.photoCount) || (Array.isArray(r?.photos) ? r.photos.length : 0),
      photosUrl: String(r?.authorAttribution?.uri || '').trim()
    }))
    .sort((a, b) => (Date.parse(b.publishTime) || 0) - (Date.parse(a.publishTime) || 0));
  const hours = Array.isArray(place?.regularOpeningHours?.weekdayDescriptions)
    ? place.regularOpeningHours.weekdayDescriptions
    : [];
  const mapsUrl = String(place?.googleMapsUri || '').trim() || MAPS_SEARCH;
  return {
    source: 'google',
    placeId: String(place?.id || '').trim(),
    name: String(place?.displayName?.text || 'BUENOHOTEL').trim(),
    primaryType: String(place?.primaryTypeDisplayName?.text || '').trim(),
    editorial: String(place?.editorialSummary?.text || '').trim(),
    rating: Number(place?.rating) || 0,
    userRatingCount: Number(place?.userRatingCount) || 0,
    address: String(place?.formattedAddress || place?.shortFormattedAddress || '').trim(),
    phone: String(place?.nationalPhoneNumber || place?.internationalPhoneNumber || '').trim(),
    website: String(place?.websiteUri || 'https://buenohotel.com/').trim(),
    mapsUrl,
    photoUrl: photoUrl || 'https://buenohotel.com/assets/logo/icono-buenohotel.png',
    hours,
    openNow:
      typeof place?.regularOpeningHours?.openNow === 'boolean'
        ? place.regularOpeningHours.openNow
        : null,
    reviews,
    lang
  };
}

async function fetchFromGoogle(lang) {
  const key = apiKey();
  if (!key) return null;
  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': key,
    'X-Goog-FieldMask': FIELD_MASK
  };
  let place = null;
  const knownId = placeIdEnv();
  if (knownId) {
    place = await googleJson(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(knownId)}?languageCode=${lang}`,
      { headers }
    );
  } else {
    const found = await googleJson('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        textQuery: SEARCH_QUERY,
        languageCode: lang,
        maxResultCount: 1
      })
    });
    place = Array.isArray(found?.places) ? found.places[0] : null;
  }
  if (!place) return null;
  const photoName = place?.photos?.[0]?.name || '';
  const photoUrl = await photoUri(photoName, key);
  return mapPlace(place, photoUrl, lang);
}

async function fetchLegacyNewest(lang) {
  const key = apiKey();
  const id = placeIdEnv();
  if (!key || !id) return null;
  const url =
    'https://maps.googleapis.com/maps/api/place/details/json' +
    `?place_id=${encodeURIComponent(id)}` +
    '&fields=name,rating,reviews,user_ratings_total,formatted_address,formatted_phone_number,opening_hours,url,website' +
    '&reviews_sort=newest' +
    `&language=${encodeURIComponent(lang)}` +
    `&key=${encodeURIComponent(key)}`;
  const data = await googleJson(url);
  if (data?.status && data.status !== 'OK') {
    throw new Error(data.error_message || data.status);
  }
  return mapLegacy(data?.result || {}, lang);
}

export async function getGoogleReviews(lang = 'es', { fresh = false } = {}) {
  const useLang = lang === 'en' ? 'en' : 'es';
  const hit = cache.get(CACHE_VER + useLang);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.payload;
  let payload = fallback(useLang);
  if (!apiKey()) {
    payload = { ...payload, warning: 'missing_api_key' };
    cache.set(CACHE_VER + useLang, { at: Date.now(), payload });
    return payload;
  }
  try {
    const [liveNew, liveOld] = await Promise.allSettled([
      fetchFromGoogle(useLang),
      fetchLegacyNewest(useLang)
    ]);
    const a = liveNew.status === 'fulfilled' ? liveNew.value : null;
    const b = liveOld.status === 'fulfilled' ? liveOld.value : null;
    if (a?.reviews?.length || b?.reviews?.length || a?.rating || b?.rating) {
      const base = a?.rating ? a : b || payload;
      payload = {
        ...payload,
        ...base,
        source: 'google',
        reviews: mergeReviews(a?.reviews || [], mergeReviews(b?.reviews || [], payload.reviews)),
        rating: Number(base.rating) || payload.rating,
        userRatingCount: Number(base.userRatingCount) || payload.userRatingCount
      };
    }
  } catch (err) {
    console.error('google-reviews:', err?.message || err);
    payload = { ...payload, source: 'fallback', warning: 'google_unavailable' };
  }
  cache.set(CACHE_VER + useLang, { at: Date.now(), payload });
  return payload;
}
