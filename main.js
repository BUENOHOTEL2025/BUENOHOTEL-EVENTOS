// Cargar tasa de cambio desde el backend y guardar en localStorage
(async function cargarTasaCambioGlobal(){
  const FX_KEY = 'bh_fx_rate_usd';
  try {
    const resp = await fetch('https://h0q597no4j.execute-api.us-east-1.amazonaws.com/admin/eventos/tasa-cambio');
    if (resp.ok){
      const data = await resp.json();
      const tasa = data?.data?.tasaCambio || 61;
      localStorage.setItem(FX_KEY, tasa);
      localStorage.setItem('tasaCambio', tasa);
      localStorage.setItem('buenohotel_tasa_cambio', tasa);
    }
  } catch(e){
    console.warn('Error cargando tasa de cambio global:', e);
  }
})();

// Hero slider con imágenes de eventos
function initHeroSlider(eventos) {
  const slider = document.getElementById('hero-bg-slider');
  if (!slider) return;
  
  // Obtener imágenes de los eventos próximos
  const imagenes = [];
  (eventos || []).forEach(ev => {
    const imgs = (Array.isArray(ev?.imagenes) ? ev.imagenes : [])
      .map(x => typeof x === 'string' ? x : (x && x.S ? x.S : ''))
      .filter(Boolean)
      .map(url => {
        if (/^(https?:\/\/|data:)/i.test(url)) return url;
        return 'https://eventos.buenohotel.com.do/' + url.replace(/^\/+/, '');
      });
    if (imgs.length > 0) imagenes.push(imgs[0]);
  });
  
  if (imagenes.length === 0) return;
  
  // Crear slides
  slider.innerHTML = imagenes.map((img, idx) => `
    <div class="hero-bg-slide" style="position:absolute; inset:0; background:url('${img}') center/cover no-repeat; opacity:${idx === 0 ? 1 : 0}; transition:opacity 1s ease-in-out;"></div>
  `).join('');
  
  // Animar slides
  if (imagenes.length > 1) {
    let currentSlide = 0;
    const slides = slider.querySelectorAll('.hero-bg-slide');
    setInterval(() => {
      slides[currentSlide].style.opacity = '0';
      currentSlide = (currentSlide + 1) % slides.length;
      slides[currentSlide].style.opacity = '1';
    }, 5000);
  }
}


async function cargarEventos() {
  // Cambia la ruta a tu bucket S3 si lo subes a producción
  const url = 'https://zp27hv7zkk.execute-api.us-east-1.amazonaws.com/prod/eventos'; // URL real de tu API Gateway
  const resp = await fetch(url);
  const data = await resp.json();
  // El body es un string JSON, así que hay que parsearlo
  const eventos = JSON.parse(data.body);
  // console.log('EVENTOS:', eventos); // depuración deshabilitada
  const getTipo = ev => typeof ev.tipo === "string" ? ev.tipo : (ev.tipo && ev.tipo.S ? ev.tipo.S : "");
  // --- ORDENAR eventos proximos por fecha más próxima ---
  function extraerFecha(fechaTexto) {
    // 0. Formato ISO: "2026-04-16" o "2026-10-14"
    let match = fechaTexto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
    }
    // 1. Rango con 'de' y coma: "23-25 de Junio, 2023"
    match = fechaTexto.match(/(\d+)[\s\-]+(\d+)\s+de\s+([a-zA-ZñÑ]+),?\s*(\d{4})/i);
    if (match) {
      const dia = parseInt(match[2], 10);
      const mesNombre = match[3].toLowerCase();
      const anio = parseInt(match[4], 10);
      const meses = {
        enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
        julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
      };
      return new Date(anio, meses[mesNombre], dia);
    }
    // 2. Rango sin 'de': "21 al 23 junio 2024"
    match = fechaTexto.match(/(\d+)[\s\-]+(\d+)\s+([a-zA-ZñÑ]+),?\s*(\d{4})/i);
    if (match) {
      const dia = parseInt(match[2], 10);
      const mesNombre = match[3].toLowerCase();
      const anio = parseInt(match[4], 10);
      const meses = {
        enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
        julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
      };
      return new Date(anio, meses[mesNombre], dia);
    }
    // 3. Simple: "4 Diciembre, 2021", "4 Diciembre 2021"
    match = fechaTexto.match(/(\d+)\s+([a-zA-ZñÑ]+),?\s*(\d{4})/i);
    if (match) {
      const dia = parseInt(match[1], 10);
      const mesNombre = match[2].toLowerCase();
      const anio = parseInt(match[3], 10);
      const meses = {
        enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
        julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
      };
      return new Date(anio, meses[mesNombre], dia);
    }
    // 4. Rango con mes y año: "18-20 Octubre, 2019"
    match = fechaTexto.match(/(\d+)[\s\-]+(\d+)\s+([a-zA-ZñÑ]+),?\s*(\d{4})/i);
    if (match) {
      const dia = parseInt(match[2], 10);
      const mesNombre = match[3].toLowerCase();
      const anio = parseInt(match[4], 10);
      const meses = {
        enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
        julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
      };
      return new Date(anio, meses[mesNombre], dia);
    }
    // 5. Si solo hay año: "2023"
    match = fechaTexto.match(/(\d{4})/);
    if (match) {
      return new Date(parseInt(match[1], 10), 0, 1);
    }
    return new Date(2100, 0, 1); // Por defecto, una fecha lejana
  }
  let proximos = eventos.filter(ev => getTipo(ev) === 'proximos');
  proximos = proximos.sort((a, b) => {
    // Soporta tanto string como objeto tipo DynamoDB
    let fechaStrA = (a.fecha && typeof a.fecha === 'object' && a.fecha.S) ? a.fecha.S : (a.fecha || '');
    let fechaStrB = (b.fecha && typeof b.fecha === 'object' && b.fecha.S) ? b.fecha.S : (b.fecha || '');
    const fechaA = extraerFecha(fechaStrA);
    const fechaB = extraerFecha(fechaStrB);
    return fechaA - fechaB; // Ascendente: más temprano primero
  });
  let galeriaFiltrada = eventos.filter(ev => getTipo(ev) === 'galeria');
  galeriaFiltrada = galeriaFiltrada.sort((a, b) => {
    // Soporta tanto string como objeto tipo DynamoDB
    let fechaStrA = (a.fecha && typeof a.fecha === 'object' && a.fecha.S) ? a.fecha.S : (a.fecha || '');
    let fechaStrB = (b.fecha && typeof b.fecha === 'object' && b.fecha.S) ? b.fecha.S : (b.fecha || '');
    const fechaA = extraerFecha(fechaStrA);
    const fechaB = extraerFecha(fechaStrB);
    // Debug: muestra el año extraído
    // console.log('Orden galeria:', {nombreA: a.nombre, fechaStrA, fechaA, nombreB: b.nombre, fechaStrB, fechaB}); // depuración deshabilitada
    return fechaB - fechaA; // Descendente
  });
  const otros = eventos.filter(ev => getTipo(ev) === 'otros');
  eventosGlobal.proximos = proximos;
  eventosGlobal.galeria = galeriaFiltrada;
  eventosGlobal.otros = otros;
  // console.log('GALERIA FILTRADA:', galeriaFiltrada); // depuración deshabilitada
  mostrarProximos(proximos); // Ya está ordenado por fecha más próxima
  mostrarGaleria(galeriaFiltrada);
  
  // Inicializar hero con fondo dinámico usando imágenes de eventos próximos
  initHeroSlider(proximos);
  // Se elimina la sección "Otros eventos": no renderizar
  try {
    const params = new URLSearchParams(window.location.search || '');
    const abonoFlag = params.get('abono');
    const eventIdParam = params.get('eventId') || params.get('eventoId') || params.get('event');
    if (abonoFlag === '1' && eventIdParam) {
      const all = [
        ...(eventosGlobal.proximos || []),
        ...(eventosGlobal.galeria || []),
        ...(eventosGlobal.otros || [])
      ];
      const ev = all.find(evObj => {
        const evId = (evObj && typeof evObj.id === 'object' && evObj.id.S)
          ? evObj.id.S
          : (evObj && (evObj.id || evObj.eventoId || evObj.ID)) || '';
        return evId && String(evId) === String(eventIdParam);
      });
      if (ev) {
        const req = normalizeRequerimientos(ev.requerimientos);
        openRegistroModal(ev, req, { abonoOnly: true });
        // Evitar que se vuelva a abrir al refrescar: limpiar query params del deep-link
        try {
          const u = new URL(window.location.href);
          u.searchParams.delete('abono');
          u.searchParams.delete('eventId');
          u.searchParams.delete('eventoId');
          u.searchParams.delete('event');
          window.history.replaceState({}, document.title, u.toString());
        } catch(_){ }
      }
    }
  } catch(_) {}
}

async function mostrarProximos(eventos) {
  const cont = document.getElementById('proximos-container');
  cont.innerHTML = '';
  const mySet = await getMyEventIdsSet();
  eventos.forEach((ev, idx) => {
    const imagenes = ev.imagenes || [];
    const imgSrc = (imagenes.length > 0 && imagenes[0]) ? imagenes[0] : 'assets/img/default-event.jpg';
    // Si no hay formulario_url, asumimos registro interno aunque no haya requerimientos explícitos
    const hasReq = !!(ev.requerimientos || (ev.requerimientos && ev.requerimientos.M) || !ev.formulario_url);
    const evId = (ev && typeof ev.id === 'object' && ev.id.S) ? ev.id.S : (ev?.id || ev?.eventoId || ev?.ID || '');
    const already = !!(evId && mySet && mySet.has(evId));
    const reservaInfo = getReservaPagoInfoForEvent(evId);
    let hideAbonarCta = false;
    if (reservaInfo){
      const aprobado = Number(reservaInfo.aprobado||0);
      const montoTotalEv = Number(reservaInfo.montoTotal||0);
      if (montoTotalEv > 0 && aprobado >= montoTotalEv) {
        // Solo cuando los pagos APROBADOS alcanzan el total del evento
        hideAbonarCta = true;
      }
    }
    const tipoRaw = String(ev.tipo || '').toLowerCase();
    const isGaleriaTipo = tipoRaw.startsWith('gal');
    const badgeLabel = isGaleriaTipo ? 'En Galería' : 'Próximo';
    const badgeClass = isGaleriaTipo ? 'event-badge-galeria' : 'event-badge-proximo';

    const cta = (!hideAbonarCta && hasReq)
      ? `<button class="btn-register" data-idx="${idx}" data-seccion="proximos"${already?' data-abono-only="1"':''}>${already?'Abonar':'Registro'}</button>`
      : (!hideAbonarCta && ev.formulario_url 
          ? `<a href="${ev.formulario_url}" target="_blank" class="btn-register"${already?' data-abono-only="1"':''}>${already?'Abonar':'Registro'}</a>`
          : '');
    cont.innerHTML += `
      <div class="event-card">
        <img src="${imgSrc}" alt="${ev.nombre || 'Evento BuenoHotel'}" ${imagenes.length === 0 ? 'class="default-event"' : ''}>
        <div class="event-info">
          <div class="event-badge ${badgeClass}">${badgeLabel}</div>
          <h3>${ev.nombre}</h3>
          <div class="event-meta">
            ${ev.invita ? `<div class="event-meta-item"><span class="meta-icon">👤</span><span class="meta-text">${ev.invita}</span></div>` : ''}
            ${ev.lugar ? `<div class="event-meta-item"><span class="meta-icon">📍</span><span class="meta-text">${ev.lugar}</span></div>` : ''}
            ${ev.fecha ? `<div class="event-meta-item"><span class="meta-icon">📅</span><span class="meta-text">${ev.fecha}</span></div>` : ''}
          </div>
          <div class="event-buttons">
            ${cta}
            <button class="btn-ver-mas" data-idx="${idx}" data-seccion="proximos">Ver más</button>
          </div>
        </div>
      </div>
    `;
  });
}

function mostrarGaleria(eventos) {
  // console.log('EVENTOS EN GALERIA:', eventos); // depuración deshabilitada
  const cont = document.getElementById('galeria-container');
  cont.innerHTML = '';
  const CDN_BASE = 'https://eventos.buenohotel.com.do/';
  function toUrl(v){
    const s = String(v||'').trim();
    if (!s) return '';
    if (/^(https?:\/\/|data:)/i.test(s)) return s; // ya absoluta
    return CDN_BASE + s.replace(/^\/+/, '');
  }
  cont.innerHTML = `<div class="gallery-grid">${eventos.map((ev, idx) => {
    const imagenes = (ev.imagenes || [])
      .map(img => typeof img === 'string' ? img : (img && img.S ? img.S : ''))
      .map(toUrl)
      .filter(Boolean);
    const hasImages = imagenes.length > 0;
    const src = hasImages ? imagenes[0] : 'assets/img/default-event.jpg';
    const lugar = (ev.lugar && ev.lugar.S) ? ev.lugar.S : (ev.lugar || '');
    const fecha = (ev.fecha && typeof ev.fecha === 'object' && ev.fecha.S) ? ev.fecha.S : (ev.fecha || '');
    const tipoRaw = String(ev.tipo || '').toLowerCase();
    const isGaleriaTipo = tipoRaw.startsWith('gal');
    const badgeLabel = isGaleriaTipo ? 'En Galería' : 'Próximo';
    const badgeClass = isGaleriaTipo ? 'event-badge-galeria' : 'event-badge-proximo';
    return `
      <div class="gallery-card">
        <img src="${src}" alt="${ev.nombre}" class="gallery-card-img">
        <div class="gallery-info">
          <div class="event-badge ${badgeClass}">${badgeLabel}</div>
          <h4>${ev.nombre}</h4>
          <div class="event-meta">
            ${lugar ? `<div class="event-meta-item"><span class="meta-icon">📍</span><span class="meta-text">${lugar}</span></div>` : ''}
            ${fecha ? `<div class="event-meta-item"><span class="meta-icon">📅</span><span class="meta-text">${fecha}</span></div>` : ''}
          </div>
          <div class="event-buttons">
            <button class="btn-ver-mas" data-idx="${idx}" data-seccion="galeria">Ver más</button>
          </div>
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

function mostrarOtros(eventos) {
  const cont = document.getElementById('otros-container');
  cont.innerHTML = '';
  eventos.forEach(ev => {
    const imagenes = ev.imagenes || [];
    const imgSrc = (imagenes.length > 0 && imagenes[0]) ? imagenes[0] : 'assets/img/default-event.jpg';
    cont.innerHTML += `
      <div class="other-event-card">
        <img src="${imgSrc}" alt="${ev.nombre || 'Evento BuenoHotel'}" ${imagenes.length === 0 ? 'class=\"default-event\"' : ''}>
        <div class="gallery-info">
          <h4>${ev.nombre}</h4>
          <p><strong>Fecha:</strong> ${ev.fecha}</p>
          <button class="btn-ver-mas" data-idx="${idx}" data-seccion="otros">Ver más</button>
        </div>
      </div>
    `;
  });
}

// --- MODAL GLOBAL Y EVENTOS ---
let eventosGlobal = { proximos: [], galeria: [], otros: [] };

let __myEventIdsSet = null; // cache Set de eventIds del usuario
let __myReservasByEvent = {}; // mapa eventId -> info de pagos (aprobado, pendiente, montoTotal, iglesia, registroId)

// Invalidar cache de registros para forzar recarga en próxima consulta
function invalidateMyRegistrosCache() {
  __myEventIdsSet = null;
  __myReservasByEvent = {};
}

function escapeHtml(str){
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Tras registrar/abonar: el comprobante en Mis reservas solo cuando administración lo configure y genere. */
function snippetMisReservasFacturaHintHtml() {
  return `
  <div class="registro-section" style="margin-top:14px;padding:12px 14px;background:#f0f7ff;border:1px solid #b3d4fc;border-radius:8px;">
    <p style="margin:0;color:#1a3a5c;font-size:13px;line-height:1.5;"><strong>Comprobante fiscal:</strong> cuando administración lo configure y genere, podrás abrirlo en <a href="mis-reservas.html" style="color:#1565c0;font-weight:700;">Mis reservas</a> (aunque no lo hayan enviado a DGII). Si pulsas <strong>Ver comprobante</strong> antes, te avisaremos que aún no está listo.</p>
  </div>`;
}

async function getMyEventIdsSet(){
  // Helper local para extraer valores de formato DynamoDB
  function dynGet(val){
    if (val && typeof val === 'object'){
      if ('S' in val) return val.S;
      if ('N' in val) return Number(val.N);
      if ('BOOL' in val) return !!val.BOOL;
      if ('M' in val) return val.M;
      if ('L' in val) return val.L;
    }
    return val;
  }
  try {
    if (!(window.auth && window.auth.isAuthenticated && window.auth.isAuthenticated())) return new Set();
    if (__myEventIdsSet) return __myEventIdsSet;
    const base = (window.getAuthApiBase ? window.getAuthApiBase() : '');
    const token = window.auth.getAuthToken();
    const candidates = [
      `${base}/api/reservas/mias`,
      `${base}/api/registrations/mias`,
      `${base}/api/registration/mias`
    ];
    let arr = [];
    for (const url of candidates){
      try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` }});
        const json = await res.json().catch(()=>({}));
        if (res.ok){ arr = json?.data || json?.reservas || json || []; break; }
      } catch(_) { continue; }
    }
    const flat = Array.isArray(arr) ? arr.map(dGet) : [];
    const map = {};
    flat.forEach(r => {
      const evId = r?.eventId || r?.eventoId || '';
      if (!evId) return;
      const pagos = Array.isArray(r?.pagos) ? r.pagos : [];
      const aprobado = pagos
        .filter(p => String(p?.estado||'').toLowerCase()==='aprobado')
        .reduce((s,p)=> s + (Number(p?.monto||0)), 0);
      const pendiente = pagos
        .filter(p => String(p?.estado||'').toLowerCase()==='pendiente')
        .reduce((s,p)=> s + (Number(p?.monto||0)), 0);
      const montoTotal = Number(
        r?.montoTotal ||
        r?.detalles?.precioTotal ||
        r?.detalles?.montoTotal ||
        r?.total || 0
      ) || 0;
      // Guardar iglesia del registro (puede estar en detalles o en raíz, con formato DynamoDB)
      // dynGet extrae el valor de formato DynamoDB { S: "valor" } o devuelve el valor directo
      const detallesObj = dynGet(r?.detalles) || r?.detalles || {};
      const iglesia = String(
        dynGet(r?.iglesia) || 
        dynGet(detallesObj?.iglesia) || 
        dynGet(r?.church) || 
        dynGet(detallesObj?.church) || 
        ''
      ).trim();
      const registroId = String(dynGet(r?.id) || dynGet(r?.registroId) || r?.id || r?.registroId || '').trim();
      map[evId] = { aprobado, pendiente, montoTotal, iglesia, registroId };
      // Debug: verificar extracción de iglesia
      console.debug('[getMyEventIdsSet] Registro:', { evId, iglesia, registroId, detallesObj, rawDetalles: r?.detalles });
    });
    __myReservasByEvent = map;
    const set = new Set(Object.keys(map));
    __myEventIdsSet = set;
    return set;
  } catch { return new Set(); }
}

function getReservaPagoInfoForEvent(evId){
  try {
    if (!evId) return null;
    return __myReservasByEvent && __myReservasByEvent[evId] || null;
  } catch { return null; }
}

function openEventoModal(evento, imagenes) {
  // Helper para extraer string plano de DynamoDB o string
  const getVal = v => (v && typeof v === 'object' && v.S) ? v.S : (v || '');
  const escapeHtml = (str) => String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function firstNonEmptyString(...vals){
    for (const v of vals){
      const s = String(v == null ? '' : v).trim();
      if (s) return s;
    }
    return '';
  }

  function normalizeLines(val){
    const v = dGet(val);
    if (Array.isArray(v)) return v.map(x=>String(x||'').trim()).filter(Boolean);
    if (typeof v === 'string') return v.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    return [];
  }
  // Normalizar URLs de imágenes a absolutas (prefijo CDN del sitio)
  const CDN_BASE = 'https://eventos.buenohotel.com.do/';
  function toImageUrl(val){
    const v = String(val||'').trim();
    if (!v) return '';
    if (/^(https?:\/\/|data:)/i.test(v)) return v; // ya absoluta
    return CDN_BASE + v.replace(/^\/+/, '');
  }
  const ABS_IMAGES = Array.isArray(imagenes) ? imagenes.map(toImageUrl) : [];
  const nombre = getVal(evento.nombre);
  const tipo = getVal(evento.tipo);
  const invita = getVal(evento.invita);
  const lugar = getVal(evento.lugar);
  const fecha = getVal(evento.fecha);
  const info_extra = getVal(evento.info_extra);
  const fecha_inicio = getVal(evento.fecha_inicio || evento.fechaInicio);
  const fecha_fin = getVal(evento.fecha_fin || evento.fechaFin);
  const url = getVal(evento.formulario_url);
  // Si no hay formulario_url, asumimos registro interno aunque no haya requerimientos explícitos
  const hasReq = !!(evento.requerimientos || (evento.requerimientos && evento.requerimientos.M) || !url);
  const evId = (evento && typeof evento.id === 'object' && evento.id.S) ? evento.id.S : (evento?.id || evento?.eventoId || evento?.ID || '');
  // Contenido rico dinámico si el evento trae campos de detalle
  const vis = (function(){ try { return dGet(evento.secciones_visibles) || {}; } catch(_) { return {}; } })();

  // Fallbacks de contenido: soportar estructura nueva y antigua
  const descripcion_hotel = firstNonEmptyString(
    getVal(evento.descripcion_hotel),
    getVal(evento.descripcionHotel),
    getVal(evento.descripcion),
    getVal(evento.info_extra)
  );
  const servicios_hotel = normalizeLines(evento.servicios_hotel || evento.serviciosHotel || evento.servicios);
  const incluye = normalizeLines(evento.incluye || evento.plan_incluye || evento.planIncluye);
  const condiciones_registro = normalizeLines(evento.condiciones_registro || evento.condiciones || evento.condicionesRegistro);
  const politica_cancelacion = normalizeLines(evento.politica_cancelacion || evento.politica || evento.politicaCancelacion);

  const llegada_salida = (function(){
    try {
      const ls = dGet(evento.llegada_salida) || {};
      if (ls && typeof ls === 'object' && (ls.check_in || ls.check_out_habitacion || ls.check_out_propiedad)) return ls;
    } catch(_) {}
    try {
      const h = dGet(evento.horarios) || {};
      if (h && typeof h === 'object') {
        return {
          check_in: h.check_in || h.checkIn || h.llegada || undefined,
          check_out_habitacion: h.check_out_habitacion || h.checkOutHabitacion || h.salida_habitacion || undefined,
          check_out_propiedad: h.check_out_propiedad || h.checkOutPropiedad || h.salida_propiedad || undefined,
        };
      }
    } catch(_) {}
    return {};
  })();

  const facilidad_pagos = (function(){
    try {
      const f = dGet(evento.facilidad_pagos) || {};
      if (f && typeof f === 'object' && (f.descripcion || f.fecha_limite_dias_antes || f.monto_minimo_inicial || f.monto_minimo_inicial_porcentaje || (Array.isArray(f.opciones_abono) && f.opciones_abono.length))) return f;
    } catch(_) {}
    try {
      const f2 = dGet(evento.facilidadPago) || dGet(evento.facilidad) || {};
      if (f2 && typeof f2 === 'object') return f2;
    } catch(_) {}
    return {};
  })();
  const __restaurantesNorm = (function(){ try { return dGet(evento.restaurantes) || []; } catch(_) { return []; } })();

  const anyDetailData = !!(
    (descripcion_hotel && descripcion_hotel.length) ||
    (Array.isArray(servicios_hotel) && servicios_hotel.length) ||
    (Array.isArray(__restaurantesNorm) && __restaurantesNorm.length) ||
    (Array.isArray(incluye) && incluye.length) ||
    (llegada_salida && (llegada_salida.check_in || llegada_salida.check_out_habitacion || llegada_salida.check_out_propiedad)) ||
    (Array.isArray(condiciones_registro) && condiciones_registro.length) ||
    (facilidad_pagos && (facilidad_pagos.descripcion || facilidad_pagos.fecha_limite_dias_antes || facilidad_pagos.monto_minimo_inicial || facilidad_pagos.monto_minimo_inicial_porcentaje || (Array.isArray(facilidad_pagos.opciones_abono) && facilidad_pagos.opciones_abono.length))) ||
    (Array.isArray(politica_cancelacion) && politica_cancelacion.length)
  );
  // No considerar "solo secciones_visibles" como suficiente para activar modo rich,
  // porque eso puede dejar el modal sin contenido si todas las secciones están vacías.
  const HAS_RICH = anyDetailData;

  const modal = document.getElementById('evento-modal');
  const body = modal.querySelector('.evento-modal-body');
  // Carrusel de imágenes
  let carrusel = '';
  if (ABS_IMAGES.length > 0) {
    carrusel = `<div class="evento-carrusel">
      <img id="evento-carrusel-img" src="${ABS_IMAGES.length>0?ABS_IMAGES[0]:''}" alt="Imagen del evento" class="evento-carrusel-img evento-modal-img">
      <div class="evento-carrusel-indicadores">
        ${ABS_IMAGES.map((_,i)=>`<span class="evento-carrusel-dot${i===0?' active':''}" data-idx="${i}"></span>`).join('')}
      </div>
      <button class="evento-carrusel-prev">&#8592;</button>
      <button class="evento-carrusel-next">&#8594;</button>
    </div>`;
  }
  // Restaurantes: render desde JSON si existe
  const __restaurantesHtml = (function(){
    if (Array.isArray(__restaurantesNorm) && __restaurantesNorm.length){
      function renderR(r){
        try {
          const n = escapeHtml((r && r.nombre) || '');
          const desc = escapeHtml((r && r.descripcion) || '');
          const notas = escapeHtml((r && r.notas) || '');
          const descLine = desc ? `<div style="margin-top:6px; white-space:pre-wrap; line-height:1.45;">${desc}</div>` : '';

          const horarios = (r && r.horarios) ? r.horarios : {};
          const parts = [];
          if (horarios.desayuno_completo) parts.push(`Desayuno completo: ${horarios.desayuno_completo}`);
          if (horarios.desayuno_continental) parts.push(`Desayuno continental: ${horarios.desayuno_continental}`);
          if (horarios.beach_club_snacks) parts.push(`Beach Club (Snacks): ${horarios.beach_club_snacks}`);
          if (horarios.almuerzo) parts.push(`Almuerzo: ${horarios.almuerzo}`);
          if (horarios.cena) parts.push(`Cena: ${horarios.cena}`);
          if (horarios.restaurante) parts.push(`Restaurante: ${horarios.restaurante}`);
          const horariosBlock = parts.length
            ? `<div style="margin-top:10px;">
                 <div style="font-weight:800;">Horarios</div>
                 <ul style="margin:6px 0 0; padding-left:18px;">${parts.map(p=>`<li>${escapeHtml(p)}</li>`).join('')}</ul>
               </div>`
            : '';

          const notasBlock = notas
            ? `<div style="margin-top:10px; border:1px solid #f59e0b; background:#fffbeb; border-radius:10px; padding:10px 12px;">
                 <div style="font-weight:900; color:#92400e; margin-bottom:6px;">Notas importantes</div>
                 <div style="white-space:pre-wrap; line-height:1.45;">${notas}</div>
               </div>`
            : '';

          return `<div style="border:1px solid rgba(0,0,0,.08); border-radius:12px; padding:12px; margin:10px 0; background:#fff;">
                    <div style="font-weight:900; font-size:1.02rem;">${n}</div>
                    ${descLine}
                    ${horariosBlock}
                    ${notasBlock}
                  </div>`;
        } catch(_){ return ''; }
      }
      return __restaurantesNorm.map(renderR).join('');
    }
    return '';
  })();

  function isVisible(key, defVal = true){
    try {
      if (!vis || typeof vis !== 'object') return !!defVal;
      if (vis[key] == null) return !!defVal;
      return !!vis[key];
    } catch(_) { return !!defVal; }
  }

  function renderLinesAsList(lines){
    const arr = Array.isArray(lines) ? lines : [];
    const clean = arr.map(v => String(v||'').trim()).filter(Boolean);
    if (!clean.length) return '';
    return `<ul class="registro-list" style="margin-top:6px;">${clean.map(v=>`<li>${escapeHtml(v)}</li>`).join('')}</ul>`;
  }

  const precioNum = (function(){
    try {
      const v = dGet(evento.precio_por_persona);
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    } catch(_) {
      const n = Number(getVal(evento.precio_por_persona));
      return Number.isFinite(n) ? n : null;
    }
  })();
  const precioMoneda = (function(){
    try {
      const m = String(dGet(evento.precio_moneda) || '').trim().toUpperCase();
      return (m === 'USD') ? 'USD' : (m === 'DOP' ? 'DOP' : 'DOP');
    } catch(_) {
      const m = String(getVal(evento.precio_moneda) || '').trim().toUpperCase();
      return (m === 'USD') ? 'USD' : 'DOP';
    }
  })();
  const precioTipo = String(getVal(evento.precio_tipo) || '').trim();
  const precioTipoLabel = (function(){
    const t = String(precioTipo || '').toLowerCase();
    if (t === 'persona') return 'por persona';
    if (t === 'pareja') return 'por pareja';
    if (t === 'familia') return 'por familia';
    return t ? escapeHtml(t) : '';
  })();
  const precioLabel = (precioNum!=null)
    ? `${precioNum.toLocaleString('es-DO',{style:'currency',currency:precioMoneda})}${precioTipoLabel?` <span style="color:#6b7280; font-weight:800;">${precioTipoLabel}</span>`:''}`
    : '';

  const horariosList = (function(){
    const fmtDT = (v)=>{
      const s = String(v || '').trim();
      if (!s) return '';
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
        try {
          const d = new Date(s);
          if (Number.isFinite(d.getTime())) {
            return d.toLocaleString('es-DO', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            });
          }
        } catch(_) {}
      }
      return s;
    };
    const items = [];
    if (llegada_salida && llegada_salida.check_in) items.push(`Check-in: ${fmtDT(llegada_salida.check_in)}`);
    if (llegada_salida && llegada_salida.check_out_habitacion) items.push(`Check-out habitación: ${fmtDT(llegada_salida.check_out_habitacion)}`);
    if (llegada_salida && llegada_salida.check_out_propiedad) items.push(`Salida de la propiedad: ${fmtDT(llegada_salida.check_out_propiedad)}`);
    return renderLinesAsList(items);
  })();

  const facilidadHtml = (function(){
    const desc = String((facilidad_pagos && facilidad_pagos.descripcion) || '').trim();
    const dias = facilidad_pagos && (facilidad_pagos.fecha_limite_dias_antes != null) ? String(facilidad_pagos.fecha_limite_dias_antes) : '';
    const minMontoRaw = facilidad_pagos && (facilidad_pagos.monto_minimo_inicial != null) ? Number(facilidad_pagos.monto_minimo_inicial) : null;
    const pct = facilidad_pagos && (facilidad_pagos.monto_minimo_inicial_porcentaje != null) ? Number(facilidad_pagos.monto_minimo_inicial_porcentaje) : null;
    const ops = (facilidad_pagos && Array.isArray(facilidad_pagos.opciones_abono)) ? facilidad_pagos.opciones_abono : [];
    const moneda = (function(){
      try {
        const m = String(dGet(evento.precio_moneda) || '').trim().toUpperCase();
        return (m === 'USD') ? 'USD' : 'DOP';
      } catch(_) { return 'DOP'; }
    })();

    const opsFmt = ops
      .map(n=>Number(n))
      .filter(n=>Number.isFinite(n) && n>0)
      .map(n=>n.toLocaleString('es-DO',{style:'currency',currency:moneda}));

    const precioBase = (function(){
      try {
        const n = Number(dGet(evento.precio_por_persona));
        return Number.isFinite(n) ? n : null;
      } catch(_) { return null; }
    })();

    const minMonto = (function(){
      if (minMontoRaw != null && Number.isFinite(minMontoRaw)) return minMontoRaw;
      if (pct != null && Number.isFinite(pct) && precioBase != null && precioBase > 0) {
        return Math.round((precioBase * pct) / 100);
      }
      return null;
    })();

    const minMontoLabel = (minMonto != null)
      ? `${minMonto.toLocaleString('es-DO',{style:'currency',currency:moneda})}`
      : '';
    const parts = [];
    if (desc) parts.push(`<div>${escapeHtml(desc)}</div>`);
    if (dias) parts.push(`<div><strong>Fecha límite:</strong> ${escapeHtml(dias)} día(s) antes</div>`);
    if (minMontoLabel) parts.push(`<div><strong>Inicial mínimo:</strong> ${minMontoLabel}</div>`);
    if (opsFmt.length) parts.push(`<div style="margin-top:6px;"><strong>Opciones de abono:</strong>${renderLinesAsList(opsFmt)}</div>`);
    return parts.length ? `<div class="small">${parts.join('')}</div>` : '';
  })();

  function accItem(title, bodyHtml, open = false){
    const has = String(bodyHtml||'').trim().length > 0;
    if (!has) return '';
    return `
      <div class="acc-item${open?' open':''}">
        <div class="acc-header"${open?' aria-expanded="true"':''}><div class="acc-title">${escapeHtml(title)}</div><div class="acc-toggle">▾</div></div>
        <div class="acc-body"${open?' style="display:block;"':''}>${bodyHtml}</div>
      </div>
    `;
  }

  const richAccordion = (function(){
    const items = [];
    if (isVisible('descripcion_hotel', true)) {
      const html = descripcion_hotel ? `<p>${escapeHtml(descripcion_hotel).replace(/\n/g,'<br/>')}</p>` : '';
      items.push(accItem('Descripción del hotel', html, true));
    }
    if (isVisible('servicios_hotel', true)) {
      items.push(accItem('Servicios del hotel', renderLinesAsList(servicios_hotel), true));
    }
    if (isVisible('restaurantes', true)) {
      const html = __restaurantesHtml ? `<div class="small">${__restaurantesHtml}</div>` : '';
      items.push(accItem('Restaurantes', html, true));
    }
    if (isVisible('precio_plan', true)) {
      const html = `${precioLabel ? `<div><strong>Precio:</strong> ${precioLabel}</div>` : ''}`
        + `${(Array.isArray(incluye) && incluye.length) ? `<div style="margin-top:6px;"><strong>Incluye:</strong>${renderLinesAsList(incluye)}</div>` : ''}`;
      items.push(accItem('Precio y plan', html, false));
    }
    if (isVisible('horarios', true)) {
      items.push(accItem('Horarios de entrada y salida', horariosList, false));
    }
    if (isVisible('condiciones_registro', true)) {
      items.push(accItem('Condiciones de registro', renderLinesAsList(condiciones_registro), false));
    }
    if (isVisible('facilidad_pagos', true)) {
      items.push(accItem('Facilidad de pagos', facilidadHtml, false));
    }
    if (isVisible('politica_cancelacion', true)) {
      items.push(accItem('Política de cancelación y no show', renderLinesAsList(politica_cancelacion), false));
    }
    return items.filter(Boolean).join('');
  })();

  // Si no hay ninguna sección visible con contenido, evitar render "rich" para no dejar el modal en blanco
  const HAS_RICH_RENDER = String(richAccordion || '').trim().length > 0;

  // Badge de tipo para el modal (usa mismo criterio que las tarjetas)
  const tipoRawForBadge = String(tipo || '').toLowerCase();
  const isGaleriaTipo = tipoRawForBadge.startsWith('gal');
  const badgeLabel = isGaleriaTipo ? 'En Galería' : 'Próximo';
  const badgeClass = isGaleriaTipo ? 'event-badge-galeria' : 'event-badge-proximo';

  const richHtml = `
    ${carrusel}
    <div class="evento-modal-sections">
      <div class="section-card">
        <div style="margin-bottom:6px;">
          <div class="event-badge ${badgeClass}">${badgeLabel}</div>
          <h2 style="margin:4px 0 6px 0;">${nombre}</h2>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
          ${invita?`<span class="pill">Invita: ${invita}</span>`:''}
        </div>
        <div class="small muted"><strong>Lugar:</strong> ${lugar}</div>
        <div class="small muted"><strong>Fecha:</strong> ${fecha}</div>
      </div>

      <div class="accordion section-card">
        ${richAccordion || ''}
      </div>

      <div class="modal-cta">
        ${!isGaleriaTipo && hasReq
          ? `<button class="btn-register" data-modal="1" data-event-id="${evId}">Registro</button>`
          : (!isGaleriaTipo && url ? `<a href="${url}" target="_blank" class="btn-register" data-modal="1" data-event-id="${evId}">Registro</a>` : '')}
      </div>
    </div>
  `;

  body.innerHTML = (HAS_RICH && HAS_RICH_RENDER) ? richHtml : `
    ${carrusel}
    <div class="evento-modal-sections">
      <div class="section-card">
        <div style="margin-bottom:6px;">
          <div class="event-badge ${badgeClass}">${badgeLabel}</div>
          <h2 style="margin:4px 0 6px 0;">${nombre}</h2>
        </div>
        ${invita?`<div class="small muted"><strong>Invita:</strong> ${invita}</div>`:''}
        <div class="small muted"><strong>Lugar:</strong> ${lugar}</div>
        <div class="small muted"><strong>Fecha:</strong> ${fecha}</div>
        ${(fecha_inicio || fecha_fin) ? `<div class="small muted" style="margin-top:6px;"><strong>Rango:</strong> ${(fecha_inicio||'').trim() || '-'} ${(fecha_fin||'').trim()?`→ ${(fecha_fin||'').trim()}`:''}</div>` : ''}
        ${(descripcion_hotel || info_extra) ? `<p style="margin-top:8px;">${escapeHtml(descripcion_hotel || info_extra).replace(/\n/g,'<br/>')}</p>` : ''}
        ${horariosList ? `<div style="margin-top:10px;">${horariosList}</div>` : ''}
        <div class="modal-cta">${!isGaleriaTipo && hasReq ? `<button class=\"btn-register\" data-modal=\"1\" data-event-id=\"${evId}\">Registro</button>` : (!isGaleriaTipo && url ? `<a href=\"${url}\" target=\"_blank\" class=\"btn-register\" data-modal=\"1\" data-event-id=\"${evId}\">Registro</a>` : '')}</div>
      </div>
    </div>
  `;
  // Guardar en memoria el evento actualmente mostrado en el modal
  try { window.__evento_abierto = evento; } catch(_) {}
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
  // Ajustar CTA según estado de pagos del usuario para este evento
  (async()=>{
    try {
      const evId = (evento && typeof evento.id === 'object' && evento.id.S) ? evento.id.S : (evento?.id || evento?.eventoId || '');
      const set = await getMyEventIdsSet();
      const info = getReservaPagoInfoForEvent(evId);
      let hideCta = false;
      let msgHtml = '';
      if (info){
        const aprobado = Number(info.aprobado||0);
        const montoTotalEv = Number(info.montoTotal||0);
        if (montoTotalEv > 0 && aprobado >= montoTotalEv){
          hideCta = true;
          msgHtml = '<p class="small muted">Ya tienes este evento <strong>Pagado<\/strong>. Para ver el detalle de tus abonos y estado, entra a <a href="mis-reservas.html">Mis reservas<\/a>.<\/p>';
        }
      }
      const ctaWrap = modal.querySelector('.modal-cta');
      const btn = modal.querySelector('.btn-register[data-modal="1"]');
      if (hideCta){
        if (ctaWrap) ctaWrap.innerHTML = msgHtml;
      } else if (evId && set && set.has(evId) && btn){
        btn.textContent = 'Abonar';
        btn.setAttribute('data-abono-only','1');
      }
    } catch(_) {}
  })();
  // Carrusel funcionalidad
  let idx = 0;
  const img = modal.querySelector('#evento-carrusel-img');
  const dots = modal.querySelectorAll('.evento-carrusel-dot');
  function showImg(i) {
    idx = i;
    img.src = ABS_IMAGES[idx];
    img.classList.add('evento-modal-img'); // Asegura que siempre tenga la clase para el zoom
    dots.forEach((d,di)=>d.classList.toggle('active',di===idx));
  }
  modal.querySelector('.evento-carrusel-prev')?.addEventListener('click',()=>showImg((idx-1+ABS_IMAGES.length)%ABS_IMAGES.length));
  modal.querySelector('.evento-carrusel-next')?.addEventListener('click',()=>showImg((idx+1)%ABS_IMAGES.length));
  dots.forEach((d,i)=>d.addEventListener('click',()=>showImg(i)));
  // Acordeones
  document.querySelectorAll('.accordion .acc-header').forEach(h=>{
    h.addEventListener('click',()=>{
      const item = h.closest('.acc-item');
      if (!item) return;
      item.classList.toggle('open');
    });
  });
}

document.addEventListener('click', function(e) {
  const modal = document.querySelector('.evento-modal');
  if (modal && modal.contains(e.target) && e.target.tagName === 'IMG' && e.target.classList.contains('evento-modal-img')) {
    mostrarZoomImagenModal(e.target.src);
  }
});

function mostrarZoomImagenModal(src) {
  // Si ya existe el modal de zoom, elimínalo primero
  let zoomModal = document.getElementById('evento-zoom-modal');
  if (zoomModal) zoomModal.remove();
  // Crea el modal de zoom
  zoomModal = document.createElement('div');
  zoomModal.id = 'evento-zoom-modal';
  zoomModal.className = 'evento-img-zoom-overlay';
  zoomModal.innerHTML = `
    <div class="evento-zoom-modal-content">
      <span class="evento-zoom-close" title="Cerrar">&times;</span>
      <img src="${src}" alt="Imagen ampliada del evento">
    </div>
  `;
  document.body.appendChild(zoomModal);
  zoomModal.querySelector('.evento-zoom-close')?.addEventListener('click', () => zoomModal.remove());
}

document.body.addEventListener('click',async function(e){
  if(e.target.classList.contains('btn-ver-mas')){
    const idx = parseInt(e.target.getAttribute('data-idx'));
    const seccion = e.target.getAttribute('data-seccion');
    const eventosArr = eventosGlobal[seccion] || [];
    const evento = eventosArr && eventosArr[idx];
    if (!evento) return;
    let imagenes = (evento.imagenes || []).map(img=>typeof img==="string"?img:(img&&img.S?img.S:''));
    if(imagenes.length===0) imagenes=["assets/img/default-event.jpg"];
    openEventoModal(evento,imagenes);
  }
  // Registro dinámico desde tarjeta o modal
  if(e.target.classList.contains('btn-register')){
    e.preventDefault();
    try {
      // Determinar evento origen PRIMERO (antes de verificar auth)
      let evento = null;
      if (e.target.hasAttribute('data-modal')){
        // Prioriza el evento guardado cuando se abrió el modal
        evento = window.__evento_abierto || null;
        if (!evento){
          // Fallback: intentar por título si existiera una estructura previa
          const titulo = document.querySelector('.evento-modal h2')?.textContent || '';
          const all = [...(eventosGlobal.proximos||[]), ...(eventosGlobal.galeria||[]), ...(eventosGlobal.otros||[])];
          evento = all.find(ev=>{
            const v = (ev && typeof ev.nombre==='object' && ev.nombre.S) ? ev.nombre.S : ev?.nombre;
            return (v||'') === titulo;
          }) || null;
        }
      } else {
        const idx = parseInt(e.target.getAttribute('data-idx'));
        const seccion = e.target.getAttribute('data-seccion');
        const arr = eventosGlobal[seccion] || [];
        evento = arr[idx];
      }
      if (!evento){
        if (window.showToast) window.showToast({ title: 'Error', message: 'No se encontró el evento', type: 'error' });
        return;
      }

      // Verificar si el evento permite registro sin login
      const permitirSinLogin = (function(){
        try {
          const v = evento.permitir_registro_sin_login;
          if (v === true || v === 'true') return true;
          if (v && typeof v === 'object' && v.BOOL === true) return true;
          return false;
        } catch(_) { return false; }
      })();

      // Verificar autenticación (solo si NO permite registro sin login)
      const isAuthenticated = window.auth && window.auth.isAuthenticated && window.auth.isAuthenticated();
      if (!permitirSinLogin && !isAuthenticated){
        if (window.showToast) window.showToast({ title: 'Acceso restringido', message: 'Necesitas iniciar sesión para registrarte', type: 'error', duration: 2400 });
        setTimeout(()=>{ window.location.href = 'login.html'; }, 900);
        return;
      }

      // Normalizar requerimientos de Dynamo a JS plano
      const req = normalizeRequerimientos(evento.requerimientos);
      // Determinar si debe abrir en modo "Abonar" (usuario ya registrado)
      let abonoOnly = false;
      try {
        const evId = (evento && typeof evento.id === 'object' && evento.id.S) ? evento.id.S : (evento?.id || evento?.eventoId || '');
        if (e.target.getAttribute('data-abono-only') === '1') abonoOnly = true;
        else {
          const set = await getMyEventIdsSet();
          abonoOnly = !!(evId && set && set.has(evId));
        }
      } catch(_) { abonoOnly = false; }
      openRegistroModal(evento, req, { abonoOnly });
    } catch(err){
      console.error('Error al iniciar registro:', err);
      if (window.showToast) window.showToast({ title: 'Error', message: 'No fue posible iniciar el registro', type: 'error' });
    }
  }
  if(e.target.classList.contains('evento-modal-close')){
    document.getElementById('evento-modal').style.display='none';
    document.body.classList.remove('modal-open');
  }
});

document.addEventListener('DOMContentLoaded', function() {
  cargarEventos();
});

// ========= Helpers de normalización Dynamo y modal de registro =========
function dGet(val){
  if (val && typeof val === 'object'){
    if ('S' in val) return val.S;
    if ('N' in val) return Number(val.N);
    if ('BOOL' in val) return !!val.BOOL;
    if ('L' in val) return val.L.map(dGet);
    if ('M' in val) {
      const out = {};
      for (const k in val.M){ out[k] = dGet(val.M[k]); }
      return out;
    }
  }
  return val;
}

function normalizeRequerimientos(reqRaw){
  const r = dGet(reqRaw) || {};
  // Espera estructura: { basicos_del_perfil: [..], campos_adicionales: [ { id,label,type,required,required_if,options } ], opciones_iglesia: [...] }
  r.basicos_del_perfil = Array.isArray(r.basicos_del_perfil) ? r.basicos_del_perfil : [];
  r.campos_adicionales = Array.isArray(r.campos_adicionales) ? r.campos_adicionales : [];
  // Flag opcional para activar/desactivar campos adicionales
  if (typeof r.habilitar_campos_adicionales === 'undefined') {
    r.habilitar_campos_adicionales = r.campos_adicionales.length > 0;
  } else {
    r.habilitar_campos_adicionales = !!r.habilitar_campos_adicionales;
  }
  return r;
}

function ensureRegistroModal(){
  let modal = document.getElementById('registro-modal');
  if (!modal){
    // Inyectar estilos una sola vez
    if (!document.getElementById('registro-modal-styles')){
      const style = document.createElement('style');
      style.id = 'registro-modal-styles';
      style.textContent = `
        .registro-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);z-index:11000;}
        html.bh-registro-open .wa-float{display:none!important;pointer-events:none!important;}
        #toast-container{z-index:12000!important;}
        .registro-card{background:#fff; width:min(760px,94vw); max-height:88vh; overflow:auto; border-radius:14px; box-shadow:0 10px 34px rgba(0,0,0,.25);}
        .registro-header{display:flex; align-items:center; justify-content:space-between; padding:16px 22px; border-bottom:1px solid #eee; position:sticky; top:0; background:#fff;}
        .registro-title{margin:0; font-size:1.25rem; font-weight:800; color:#222}
        .registro-close{border:none;background:transparent;font-size:28px;cursor:pointer; padding:6px; line-height:1; color:#333}
        .registro-close:hover{color:#000}
        .registro-body{padding:18px 22px 22px;}
        .registro-section{margin-bottom:18px;}
        .registro-section h4{margin:0 0 10px; font-size:1rem; color:#333}
        .registro-badge{display:inline-block; background:#FBB03B1A; color:#9a6b14; border:1px solid #f3c26a; padding:4px 8px; border-radius:999px; font-size:.78rem; font-weight:700;}
        .registro-list{margin:8px 0 0; padding-left:18px; color:#333}
        .registro-alert{background:#fff7e6; border:1px solid #ffe0a3; border-radius:10px; padding:12px 14px; color:#5c3d00}
        .registro-card-info{background:#f7f9fc; border:1px solid #e7eef6; border-radius:10px; padding:12px 14px;}
        .chips{display:flex; flex-wrap:wrap; gap:8px; margin-top:8px}
        .chip{background:#fff; border:1px solid #e1e5ea; border-radius:999px; padding:6px 10px; font-size:.85rem}
        .form-grid{display:grid; grid-template-columns:1fr 1fr; gap:12px;}
        @media (max-width:720px){ .form-grid{grid-template-columns:1fr;} }
        .form-group{min-width:0; overflow:hidden;}
        .form-group label{display:block; font-weight:700; color:#222; margin:0 0 6px; font-size:0.9em;}
        .form-control{width:100%; padding:10px 12px; border:1px solid #d9dde3; border-radius:8px; font-size:.98rem; box-sizing:border-box; max-width:100%;}
        .form-actions{display:flex; justify-content:flex-end; gap:10px; margin-top:16px; position:sticky; bottom:0; background:#fff; padding:12px 0 4px; z-index:3;}
        .btn-secondary{display:inline-flex;align-items:center;justify-content:center;padding:10px 22px;background:#fff;border:1px solid #d9dde3;border-radius:20px;font-weight:700;font-size:0.98rem;font-family:Arial,Helvetica,sans-serif;color:#222;cursor:pointer}
        .btn-primary{display:inline-flex;align-items:center;justify-content:center;padding:10px 22px;background:#fbb03b;border:0;border-radius:20px;font-weight:700;font-size:0.98rem;font-family:Arial,Helvetica,sans-serif;color:#222;cursor:pointer}
        .btn-primary:hover{background:#e19a2e;color:#222}
        .btn-primary[disabled]{opacity:.6; cursor:not-allowed}
      `;
      document.head.appendChild(style);
    }
    modal = document.createElement('div');
    modal.id = 'registro-modal';
    modal.className = 'registro-overlay';
    modal.innerHTML = `
      <div class="registro-card">
        <div class="registro-header">
          <h3 id="registro-modal-title" class="registro-title">Registro</h3>
          <button id="registro-modal-close" class="registro-close" aria-label="Cerrar">×</button>
        </div>
        <div id="registro-modal-body" class="registro-body"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#registro-modal-close').addEventListener('click', ()=> modal.remove());
    const origRemove = modal.remove.bind(modal);
    modal.remove = function(){
      document.documentElement.classList.remove('bh-registro-open');
      origRemove();
    };
  }
  return modal;
}

async function resolveChurchRequirement(evento){
  try {
    const evId = dGet(evento?.id) || dGet(evento?.eventoId) || dGet(evento?.ID) || '';
    // 1) Revisar flag directo en el objeto del evento
    const rcRaw = (evento && (evento.requireChurch ?? evento.require_church));
    const toBool = (v)=>{
      if (typeof v === 'boolean') return v;
      if (v && typeof v === 'object'){
        if ('BOOL' in v) return !!v.BOOL;
        if ('S' in v) return /^(true|1|si|sí)$/i.test(String(v.S));
        if ('N' in v) return Number(v.N) === 1;
      }
      if (typeof v === 'string') return /^(true|1|si|sí)$/i.test(v);
      if (typeof v === 'number') return v === 1;
      return false;
    };
    if (typeof rcRaw !== 'undefined') return toBool(rcRaw);
    // 2) Fallback a localStorage (preferencias guardadas por admin)
    try {
      const prefs = JSON.parse(localStorage.getItem('eventChurchPrefs')||'{}');
      if (evId && prefs && typeof prefs === 'object' && prefs[evId] && typeof prefs[evId].requireChurch !== 'undefined'){
        return !!prefs[evId].requireChurch;
      }
    } catch(_) {}
    // 3) Consultar backend
    const base = (window.getAuthApiBase ? window.getAuthApiBase() : '');
    const token = (window.auth && window.auth.getAuthToken) ? window.auth.getAuthToken() : '';
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const endpoints = [
      `${base}/api/eventos/${encodeURIComponent(evId)}`
    ];
    for (const url of endpoints){
      try {
        const res = await fetch(url, { headers });
        const data = await res.json().catch(()=>({}));
        if (!res.ok) continue;
        if (typeof data?.requireChurch !== 'undefined') return toBool(data.requireChurch);
        if (data?.data && typeof data.data.requireChurch !== 'undefined') return toBool(data.data.requireChurch);
        if (typeof data?.require_church !== 'undefined') return toBool(data.require_church);
        if (data?.data && typeof data.data.require_church !== 'undefined') return toBool(data.data.require_church);
      } catch(_) { continue; }
    }
    return false;
  } catch(_) { return false; }
}

async function openRegistroModal(evento, req, options={}){
  const DEBUG_REG = true; // habilita logs de depuracion del registro
  const modal = ensureRegistroModal();
  document.documentElement.classList.add('bh-registro-open');
  const body = modal.querySelector('#registro-modal-body');
  const nombre = (evento && typeof evento.nombre==='object' && evento.nombre.S) ? evento.nombre.S : (evento?.nombre || 'Evento');
  const ABONO_ONLY = options?.abonoOnly === true;
  modal.querySelector('#registro-modal-title').textContent = ABONO_ONLY ? `Abonar: ${nombre}` : `Registro: ${nombre}`;
  try { console.debug('[Registro] Abriendo modal para evento:', { id: dGet(evento.id), nombre }); } catch(_){ }

  // Verificar si es registro sin login
  const isAuthenticated = window.auth && window.auth.isAuthenticated && window.auth.isAuthenticated();
  const permitirSinLogin = (function(){
    try {
      const v = evento.permitir_registro_sin_login;
      if (v === true || v === 'true') return true;
      if (v && typeof v === 'object' && v.BOOL === true) return true;
      return false;
    } catch(_) { return false; }
  })();
  const REGISTRO_SIN_LOGIN = permitirSinLogin && !isAuthenticated;
  
  // Obtener campos configurados para registro sin login
  const camposSinLogin = (function(){
    try {
      const c = evento.campos_sin_login;
      if (Array.isArray(c)) return c;
      if (c && typeof c === 'object' && Array.isArray(c.L)) {
        return c.L.map(x => x.S || x);
      }
      // Campos por defecto si no hay configuración
      return ['nombre', 'apellido', 'email', 'telefono'];
    } catch(_) { return ['nombre', 'apellido', 'email', 'telefono']; }
  })();

  // Nunca permitir que el modal quede vacío por req malformado
  try {
    if (typeof normalizeRequerimientos === 'function') {
      req = normalizeRequerimientos(req);
    } else {
      req = req && typeof req === 'object' ? req : {};
      req.basicos_del_perfil = Array.isArray(req.basicos_del_perfil) ? req.basicos_del_perfil : [];
      req.campos_adicionales = Array.isArray(req.campos_adicionales) ? req.campos_adicionales : [];
      if (typeof req.habilitar_campos_adicionales === 'undefined') req.habilitar_campos_adicionales = req.campos_adicionales.length > 0;
    }
  } catch(_){
    req = { basicos_del_perfil: [], campos_adicionales: [], habilitar_campos_adicionales: false };
  }

  if (!body){
    console.error('[Registro] No se encontró #registro-modal-body.');
    return;
  }
  body.innerHTML = '<div class="registro-alert">Cargando formulario...</div>';

  async function hydrateEventoFromDynamoIfNeeded(ev){
    try {
      const id = dGet(ev?.id);
      if (!id) return ev;
      const hasStart = !!(dGet(ev.fecha_inicio) || dGet(ev.fechaInicio));
      const hasEnd = !!(dGet(ev.fecha_fin) || dGet(ev.fechaFin));
      if (hasStart || hasEnd) return ev;
      const base = (window.getAuthApiBase ? window.getAuthApiBase() : '');
      if (!base) return ev;
      const token = (window.auth && window.auth.getAuthToken) ? window.auth.getAuthToken() : '';
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const url = `${base}/api/eventos/${encodeURIComponent(id)}`;
      const res = await fetch(url, { headers });
      const data = await res.json().catch(()=> ({}));
      if (!res.ok) return ev;
      const fresh = data?.data || data;
      if (!fresh || typeof fresh !== 'object') return ev;
      return { ...ev, ...fresh };
    } catch(_){
      return ev;
    }
  }

  function normalizeIsoDateOnly(v){
    try{
      if (!v) return '';
      const s = String(v).trim();
      // Si ya viene en formato date-only, NO usar Date() (evita desfase por timezone)
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const d = new Date(s);
      if (isNaN(d)) return '';
      // Normalizar a ISO date-only en UTC para evitar doble conversión
      return d.toISOString().slice(0, 10);
    } catch(_){ return ''; }
  }

  function getCanonicalEventRange(ev){
    const startRaw = dGet(ev.fecha_inicio) || dGet(ev.fechaInicio) || dGet(ev.fecha) || '';
    const endRaw = dGet(ev.fecha_fin) || dGet(ev.fechaFin) || dGet(ev.fechaSalida) || '';
    let start = normalizeIsoDateOnly(startRaw);
    let end = normalizeIsoDateOnly(endRaw);
    if (!start && !end) return { start:'', end:'' };
    if (!start) start = end;
    if (!end) end = start;
    try{
      const ds = new Date(start+'T00:00:00');
      const de = new Date(end+'T00:00:00');
      if (!isNaN(ds) && !isNaN(de) && de < ds){
        const tmp = start; start = end; end = tmp;
      }
    } catch(_){ }
    return { start, end };
  }

  evento = await hydrateEventoFromDynamoIfNeeded(evento);

  /** Si el evento permite mostrar la opción opcional de solicitar NCF (por defecto sí). */
  const permiteOpcionFiscal = (function (ev) {
    try {
      const v = ev?.permite_solicitud_comprobante_fiscal;
      if (v === false || v === 'false') return false;
      if (v && typeof v === 'object' && v.BOOL === false) return false;
      return true;
    } catch (_) {
      return true;
    }
  })(evento);

  // Datos básicos del perfil
  let userData = null;
  try { userData = JSON.parse(localStorage.getItem('buenohotel_user_data')||'null'); } catch(_){ }
  // Derivar usuarioId directamente desde el JWT (sub)
  function getJwtSub(){
    try {
      const t = localStorage.getItem('buenohotel_auth_token')||'';
      if (!t || t.split('.').length<3) return '';
      const payload = t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      const json = JSON.parse(decodeURIComponent(escape(atob(payload))));
      return json && json.sub ? String(json.sub) : '';
    } catch(_){ return ''; }
  }
  // Oculta campos sensibles como password
  const basicSafe = (req.basicos_del_perfil||[]).filter(k=>String(k).toLowerCase() !== 'password');
  const basicList = basicSafe.map(k=>`<li><span class="registro-badge">${k}</span> ${userData && userData[k] ? `<strong>${userData[k]}</strong>` : '<em>del perfil</em>'}</li>`).join('');

  // Render campos adicionales (provenientes de requerimientos del evento)
  try { console.debug('[Registro] campos_adicionales:', Array.isArray(req.campos_adicionales)? req.campos_adicionales.map(c=>c.id): req.campos_adicionales); } catch(_){ }
  // Reglas específicas por hotel/evento
  const nombreEvtLC = String(dGet(evento?.nombre)||'').toLowerCase();
  const lugarEvtLC = String(dGet(evento?.lugar)||'').toLowerCase();
  const OVERRIDE_HOTEL = nombreEvtLC.includes('retiro de solteros') || lugarEvtLC.includes('gran ventana');
  // Precompute event start date for fechaEntrada static rendering
  const __canonicalRange = getCanonicalEventRange(evento);
  const __startRaw = __canonicalRange.start || (dGet(evento.fecha_inicio) || dGet(evento.fechaInicio) || dGet(evento.fecha) || '');
  function __toDateOnly(v){
    try{
      if (!v) return '';
      const s = String(v).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const d = new Date(s);
      if (isNaN(d)) return '';
      return d.toISOString().slice(0, 10);
    } catch(_){return '';} 
  }
  function __parseRangeFromTexto(txt){
    try{
      const s = String(txt||''); if (!s) return { start:'', end:'' };
      const meses = {enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,setiembre:8,octubre:9,noviembre:10,diciembre:11};
      // 5 al 7 de Junio, 2026  OR  5-7 de Junio, 2026
      let m = s.match(/(\d+)[\s\-]+(?:al\s+)?(\d+)\s+de\s+([A-Za-zñÑ]+),?\s*(\d{4})/i);
      if (m){
        const d1 = parseInt(m[1],10), d2 = parseInt(m[2],10);
        const mes = meses[m[3].toLowerCase()]; const anio = parseInt(m[4],10);
        if (mes!=null) return {
          start: `${anio}-${String(mes+1).padStart(2,'0')}-${String(d1).padStart(2,'0')}`,
          end:   `${anio}-${String(mes+1).padStart(2,'0')}-${String(d2).padStart(2,'0')}`
        };
      }
      // 21 al 23 junio 2024  OR 21-23 junio 2024 (sin 'de')
      m = s.match(/(\d+)[\s\-]+(?:al\s+)?(\d+)\s+([A-Za-zñÑ]+),?\s*(\d{4})/i);
      if (m){
        const d1 = parseInt(m[1],10), d2 = parseInt(m[2],10);
        const mes = meses[m[3].toLowerCase()]; const anio = parseInt(m[4],10);
        if (mes!=null) return {
          start: `${anio}-${String(mes+1).padStart(2,'0')}-${String(d1).padStart(2,'0')}`,
          end:   `${anio}-${String(mes+1).padStart(2,'0')}-${String(d2).padStart(2,'0')}`
        };
      }
      // 4 Diciembre, 2021 (fecha única)
      m = s.match(/(\d+)\s+([A-Za-zñÑ]+),?\s*(\d{4})/i);
      if (m){
        const d = parseInt(m[1],10); const mes = meses[m[2].toLowerCase()]; const anio = parseInt(m[3],10);
        if (mes!=null){
          const iso = `${anio}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          return { start: iso, end: iso };
        }
      }
      // Solo año -> 01-01 start y end
      m = s.match(/(\d{4})/);
      if (m){ const anio = parseInt(m[1],10); const iso = `${anio}-01-01`; return { start: iso, end: iso }; }
      return { start:'', end:'' };
    }catch(_){ return { start:'', end:'' }; }
  }
  const __fechaTexto = String(dGet(evento.fecha)||'');
  const __rangeText = __parseRangeFromTexto(__fechaTexto);
  const __eventStartDate = __canonicalRange.start || __toDateOnly(__startRaw) || __rangeText.start;
  const __eventEndDate = (function(){
    const fromCanon = __canonicalRange.end;
    if (fromCanon) return fromCanon;
    const isIso = /^\d{4}-\d{2}-\d{2}$/.test(__fechaTexto);
    // Si la fecha es un día único en formato ISO, usar la misma fecha para entrada y salida
    if (isIso && __eventStartDate) return __eventStartDate;
    // Solo usar el rango parseado cuando realmente hay un rango distinto
    if (!isIso && __rangeText.end && __rangeText.end !== __rangeText.start) return __rangeText.end;
    return __eventStartDate;
  })();
  const __entradaDisplayHtml = (function(){
    if (!__eventStartDate && !__eventEndDate) return '';
    function fmt(iso){
      if (!iso) return '';
      try {
        // Usar mediodía para evitar que el timezone mueva el día hacia atrás
        const d = /^\d{4}-\d{2}-\d{2}$/.test(String(iso))
          ? new Date(String(iso) + 'T12:00:00')
          : new Date(iso);
        if (isNaN(d)) return String(iso);
        return d.toLocaleDateString('es-DO',{year:'numeric',month:'long',day:'numeric'});
      } catch(_){ return iso; }
    }
    const inNice = fmt(__eventStartDate || __eventEndDate);
    const outNice = fmt(__eventEndDate);
    // Si existe un rango canónico (fecha_inicio/fecha_fin) lo mostramos en 'Horario del evento'.
    // Evitar duplicación: no renderizar también 'Fechas del evento'.
    const hasCanonical = !!(__canonicalRange.start || __canonicalRange.end);
    if (hasCanonical) return '';
    // Si hay entrada y salida distintas, mostrar ambas
    if (inNice && outNice && inNice !== outNice){
      return `
        <div class="registro-section registro-card-info">
          <h4>Fechas del evento</h4>
          <div><strong>Entrada:</strong> ${inNice}</div>
          <div><strong>Salida:</strong> ${outNice}</div>
        </div>`;
    }
    // Si solo tenemos una fecha, mantener formato anterior
    return `
      <div class="registro-section registro-card-info">
        <h4>Fecha de entrada</h4>
        <div>${inNice}</div>
      </div>`;
  })();

  // Verificar si el evento requiere iglesia
  const eventRequiresChurch = await resolveChurchRequirement(evento);
  
  // En modo Abono: verificar si el registro existente ya tiene iglesia
  let registroMissingChurch = false;
  let registroIdForUpdate = '';
  if (ABONO_ONLY && eventRequiresChurch) {
    const evId = (evento && typeof evento.id === 'object' && evento.id.S) ? evento.id.S : (evento?.id || evento?.eventoId || '');
    const reservaInfo = getReservaPagoInfoForEvent(evId);
    console.debug('[openRegistroModal] Verificando iglesia en abono:', { evId, eventRequiresChurch, reservaInfo });
    if (reservaInfo) {
      const iglesiaExistente = String(reservaInfo.iglesia || '').trim();
      registroMissingChurch = !iglesiaExistente;
      registroIdForUpdate = reservaInfo.registroId || '';
      console.debug('[openRegistroModal] Iglesia existente:', { iglesiaExistente, registroMissingChurch, registroIdForUpdate });
    }
  }
  
  // Mostrar campo iglesia si: (registro nuevo Y evento requiere) O (abono Y evento requiere Y registro no tiene iglesia)
  const REQUIRE_CHURCH = (!ABONO_ONLY && eventRequiresChurch) || (ABONO_ONLY && registroMissingChurch);

  // Pedir iglesia en registro inicial O en abono si falta
  let churchFieldsHtml = '';
  const showChurchFields = REQUIRE_CHURCH;
  if (showChurchFields) {
    // Mensaje especial si es modo Abono y falta iglesia
    const churchInfoMsg = (ABONO_ONLY && registroMissingChurch) ? `
      <div style="background:#fff7e6; border:1px solid #fbbf24; border-radius:8px; padding:12px 14px; margin-bottom:16px; color:#92400e;">
        <div style="display:flex; align-items:flex-start; gap:10px;">
          <span style="font-size:1.3em;">⛪</span>
          <div>
            <strong>Información requerida</strong>
            <div style="margin-top:4px; font-size:0.92em;">
              Este evento ahora requiere que indiques tu iglesia de procedencia. Por favor completa este campo para continuar con tu abono.
            </div>
          </div>
        </div>
      </div>` : '';
    churchFieldsHtml = `
      ${churchInfoMsg}
      <div class="form-group">
        <label>Iglesia de procedencia *</label>
        <div style="display: flex; flex-wrap: wrap; gap: 15px; margin-top: 10px;" id="iglesia-group">
          <label style="display: flex; align-items: center; gap: 5px;">
            <input type="radio" name="iglesia" value="La Romana" required> La Romana
          </label>
          <label style="display: flex; align-items: center; gap: 5px;">
            <input type="radio" name="iglesia" value="Santiago"> Santiago
          </label>
          <label style="display: flex; align-items: center; gap: 5px;">
            <input type="radio" name="iglesia" value="Zona Oriental"> Zona Oriental
          </label>
          <label style="display: flex; align-items: center; gap: 5px;">
            <input type="radio" name="iglesia" value="Central Miércoles"> Central Miércoles
          </label>
          <label style="display: flex; align-items: center; gap: 5px;">
            <input type="radio" name="iglesia" value="Región Jueves"> Región Jueves
          </label>
          <label style="display: flex; align-items: center; gap: 5px;">
            <input type="radio" name="iglesia" value="San Juan DLM"> San Juan DLM
          </label>
          <label style="display: flex; align-items: center; gap: 5px; width: 100%; margin-top: 10px;">
            <input type="radio" name="iglesia" id="otraIglesiaRadio" value="Otra"> Otra:
            <input type="text" id="otraIglesia" class="form-control" style="flex: 1; margin-left: 10px;" disabled>
          </label>
        </div>
        <div id="otraIglesiaExtra" style="display:none; width:100%;">
          <div style="background:#fff7e6; border:1px solid #ffe0a3; border-radius:8px; padding:8px 10px; color:#5c3d00; margin: 6px 0 10px; font-weight:500;">
            <strong>Información importante:</strong>
            <div style="margin-top:6px;">
              Si ustedes van a participar de otras iglesias de Cristo internacional, por favor facilitarnos la siguiente información: Nombre de su líder de iglesia o ministerio, Número de contacto o e-mail.
            </div>
          </div>
          <div id="otraIglesiaFlex" style="display:flex; flex-wrap:wrap; gap:12px; align-items:flex-start; width:100%;">
            <div class="form-group" style="display:flex; flex-direction:column; gap:6px; flex:1 1 320px; min-width:300px; box-sizing:border-box;">
              <label for="otraIglesiaLider" style="margin:0;">Nombre del líder *</label>
              <input type="text" id="otraIglesiaLider" class="form-control" placeholder="Ej. Juan Pérez" style="width:100%; min-height:38px; line-height:1.2; box-sizing:border-box;" disabled>
            </div>
            <div class="form-group" style="display:flex; flex-direction:column; gap:6px; flex:1 1 320px; min-width:300px; box-sizing:border-box;">
              <label for="otraIglesiaContacto" style="margin:0;">Número de contacto o e-mail *</label>
              <input type="text" id="otraIglesiaContacto" class="form-control" placeholder="Ej. 809-000-0000 o correo@example.com" style="width:100%; min-height:38px; line-height:1.2; box-sizing:border-box;" disabled>
            </div>
          </div>
        </div>
      </div>`;
  }

  const precioEvento = Number(dGet(evento.precio_por_persona) || 0);
  const precioMoneda = (function(){
    try {
      const m = String(dGet(evento.precio_moneda) || '').trim().toUpperCase();
      return (m === 'USD') ? 'USD' : 'DOP';
    } catch(_) { return 'DOP'; }
  })();

  // Campos que se moverán a sección separada después de tours
  const camposParaSeccionAparte = ['fechaEntrada', 'fechaSalida', 'montoPago', 'montoPagoOtro'];
  
  const camposHtml = (!req.habilitar_campos_adicionales ? [] : (req.campos_adicionales||[])).map(c=>{
    const id = c.id; const label = c.label || id; const type = (c.type||'text').toLowerCase();
    const required = !!c.required;
    const hasFixed = (c && Object.prototype.hasOwnProperty.call(c, 'fixed_value'));
    const fixedVal = hasFixed ? String(c.fixed_value ?? '').trim() : '';
    // Excluir campos que irán en sección separada (después de tours)
    if (camposParaSeccionAparte.includes(id)) return '';
    // En modo Abono: solo pedir monto (y opcionalmente montoPagoOtro). Ocultar resto (fechaSalida, aceptaTerminos, etc.)
    if (ABONO_ONLY) {
      const allow = id === 'montoPago' || id === 'montoPagoOtro';
      if (!allow) return '';
    }
    // Quitar campos según override de hotel/evento
    if (OVERRIDE_HOTEL && (id === 'tipoHabitacion' || id === 'categoria')){
      // ya no se omiten, se manejan desde el admin
    }

    // Campo con valor fijo (pre-llenado): mostrar como texto y enviar en hidden input
    if (hasFixed) {
      // Si es checkbox con valor fijo, normalizar a 1/0
      const fixedHiddenVal = (type === 'checkbox')
        ? ((/^(1|true|si|sí|yes|on)$/i.test(fixedVal) || fixedVal === '') ? '1' : '0')
        : fixedVal;
      return `
        <div class="form-group">
          <label>${label}</label>
          <div style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; background:#f9fafb; font-weight:700; color:#111;">${escapeHtml(fixedVal || '')}</div>
          <input type="hidden" id="${id}" name="${id}" value="${escapeHtml(fixedHiddenVal)}">
        </div>`;
    }

    if (type === 'select'){
      // Filtrar opciones del monto para respetar mínimo RD$1,500
      let baseOptions = (c.options||[]);
      if (id === 'montoPago'){
        function toNum(x){
          if (x == null) return NaN;
          if (typeof x === 'number') return x;
          const s = String(x);
          if (s.toUpperCase() === 'OTRO') return NaN; // mantener 'OTRO' como opción no numérica
          const m = s.replace(/[^\d.,]/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(/,/g,'');
          const n = Number(m);
          return isNaN(n) ? NaN : n;
        }
        baseOptions = baseOptions.filter(o=>{
          if (o && typeof o === 'object'){
            const val = ('value' in o) ? o.value : (('S' in o) ? o.S : (('N' in o) ? Number(o.N) : ''));
            const lab = ('label' in o) ? o.label : String(val);
            const num = toNum(val);
            if (isNaN(num)){
              // mantener opciones no numéricas como 'OTRO'
              return true;
            }
            return num >= 1500;
          } else {
            const num = toNum(o);
            if (isNaN(num)) return true;
            return num >= 1500;
          }
        });
      }
      const opts = baseOptions.map(o=>{
        if (o && typeof o === 'object'){
          let val = ('value' in o) ? o.value : (('S' in o) ? o.S : (('N' in o) ? Number(o.N) : ''));
          let lab = ('label' in o) ? o.label : String(val);
          // Ajustar dinámicamente la opción de Pago Completo al precio del evento
          if (id === 'montoPago' && precioEvento > 0 && /pago completo/i.test(String(lab||''))){
            val = precioEvento;
            lab = `${formatCurrency(precioEvento, precioMoneda)} (Pago completo)`;
          }
          return `<option value="${String(val)}">${String(lab)}</option>`;
        } else {
          let val = o;
          let lab = String(o);
          if (id === 'montoPago' && precioEvento > 0 && /pago completo/i.test(lab)){
            val = precioEvento;
            lab = `${formatCurrency(precioEvento, precioMoneda)} (Pago completo)`;
          }
          return `<option value="${String(val)}">${String(lab)}</option>`;
        }
      }).join('');
      return `
        <div class=\"form-group\"> 
          <label for=\"${id}\">${label}${required?' *':''}</label>
          <select id=\"${id}\" name=\"${id}\" class=\"form-control\" ${required?'required':''}>
            <option value=\"\">Seleccione...</option>
            ${opts}
          </select>
        </div>`;
    }
    if (type === 'checkbox'){
      return `
        <div class=\"form-group\" style=\"display:flex; align-items:center; gap:10px; padding-top:8px;\">
          <input type=\"checkbox\" id=\"${id}\" name=\"${id}\" ${required?'required':''}>
          <label for=\"${id}\">${label}${required?' *':''}</label>
        </div>`;
    }
    if (type === 'number'){
      const minAttr = (c.min!=null) ? `min=\"${c.min}\"` : '';
      const maxAttr = (c.max!=null) ? `max=\"${c.max}\"` : '';
      const placeholder = c.placeholder ? `placeholder=\"${c.placeholder}\"` : '';
      return `
        <div class=\"form-group\">
          <label for=\"${id}\">${label}${required?' *':''}</label>
          <input type=\"number\" id=\"${id}\" name=\"${id}\" class=\"form-control\" ${minAttr} ${maxAttr} ${placeholder} ${required?'required':''}>
        </div>`;
    }
    if (type === 'date'){
      // En abono simple no pedimos fechas
      if (ABONO_ONLY && (id === 'fechaSalida' || id === 'fechaEntrada')) return '';
      const minAttr = (c.min!=null) ? `min=\"${c.min}\"` : '';
      const maxAttr = (c.max!=null) ? `max=\"${c.max}\"` : '';
      return `
        <div class=\"form-group\">
          <label for=\"${id}\">${label}${required?' *':''}</label>
          <input type=\"date\" id=\"${id}\" name=\"${id}\" class=\"form-control\" ${minAttr} ${maxAttr} ${required?'required':''}>
        </div>`;
    }
    if (type === 'textarea'){
      const rows = c.rows ? Number(c.rows) : 3;
      const placeholder = c.placeholder ? `placeholder=\"${c.placeholder}\"` : 'placeholder=\"Escriba sus observaciones...\"';
      return `
        <div class=\"form-group\" style=\"grid-column:1 / -1;\">
          <label for=\"${id}\">${label}${required?' *':''}</label>
          <textarea id=\"${id}\" name=\"${id}\" class=\"form-control\" rows=\"${rows}\" ${placeholder} ${required?'required':''}></textarea>
        </div>`;
    }
    // Campo de texto (genérico). Si es montoPago, agregamos helper UX
    if (id === 'montoPago'){
      return `
        <div class=\"form-group\">
          <label for=\"${id}\">${label}${required?' *':''}</label>
          <input type=\"text\" id=\"${id}\" name=\"${id}\" class=\"form-control\" inputmode=\"decimal\" ${required?'required':''}>
          <small id=\"montoPago-helper\" style=\"display:block; color:#666; margin-top:6px;\">Ingresa tu abono.</small>
        </div>`;
    }
    return `
      <div class=\"form-group\">
        <label for=\"${id}\">${label}${required?' *':''}</label>
        <input type=\"text\" id=\"${id}\" name=\"${id}\" class=\"form-control\" ${required?'required':''}>
      </div>`;
  }).join('');

  // Secciones informativas
  const condiciones = (()=>{ try{ return dGet(evento.condiciones_registro) || []; }catch(_){ return []; } })();
  const facilidad = (()=>{ try{ return dGet(evento.facilidad_pagos) || null; }catch(_){ return null; } })();
  // Obtener abono mínimo configurado en el evento
  const abonoMinimoConfig = (()=>{ try{ return dGet(evento.abono_minimo) || null; }catch(_){ return null; } })();
  // Obtener precios predefinidos anticipadamente para calcular minAbono
  const __preciosPredefinidosTemp = (function(){
    try {
      const cfg = evento?.precios_predefinidos;
      if (!cfg || cfg.habilitado !== true) return null;
      return { precios: Array.isArray(cfg.precios) ? cfg.precios : [] };
    } catch(_) { return null; }
  })();
  const minAbono = (function(){
    if (abonoMinimoConfig) {
      if (abonoMinimoConfig.usar_precio_evento) {
        // Usar precio del evento (o precio de 1 persona si hay precios predefinidos)
        if (__preciosPredefinidosTemp?.precios?.length) {
          const precio1 = __preciosPredefinidosTemp.precios.find(p => p.cantidad === 1);
          return precio1 ? precio1.precio : precioEvento;
        }
        return precioEvento > 0 ? precioEvento : (precioMoneda === 'USD' ? 25 : 1500);
      }
      if (abonoMinimoConfig.monto && abonoMinimoConfig.monto > 0) {
        return abonoMinimoConfig.monto;
      }
    }
    // Default según moneda
    return precioMoneda === 'USD' ? 25 : 1500;
  })();
  const diasLimite = (facilidad && typeof facilidad.fecha_limite_dias_antes !== 'undefined') ? Number(facilidad.fecha_limite_dias_antes) : 0;
  // Horario del evento (fechas/horas)
  const evFechaIniRaw = __canonicalRange.start || dGet(evento.fecha_inicio) || dGet(evento.fechaInicio) || dGet(evento.fecha) || '';
  const evHoraIni = dGet(evento.hora_inicio) || dGet(evento.horaInicio) || '';
  const evFechaFinRaw = __canonicalRange.end || dGet(evento.fecha_fin) || dGet(evento.fechaFin) || dGet(evento.fechaSalida) || '';
  const evHoraFin = dGet(evento.hora_fin) || dGet(evento.horaFin) || '';
  function fmtDate(d){
    try{
      if (!d) return '';
      const s = String(d).trim();
      const x = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : new Date(s);
      if (isNaN(x)) return '';
      return x.toLocaleDateString('es-DO',{year:'numeric',month:'long',day:'numeric'});
    } catch(_){ return ''; }
  }
  const evFechaIni = fmtDate(evFechaIniRaw);
  const evFechaFin = fmtDate(evFechaFinRaw);
  // Evitar duplicidad del mensaje de días si ya viene en la descripción
  const descTxt = (facilidad && facilidad.descripcion) ? String(facilidad.descripcion) : '';
  const descHasDias = (function(){
    const l = descTxt.toLowerCase();
    if (!l) return false;
    if (diasLimite>0 && l.includes(String(diasLimite))) return true;
    return /(\b\d+\s*d[ií]as?\b|\bd[ií]as\b)/i.test(l);
  })();
  const condicionesHtml = condiciones.length ? `<div class="registro-section registro-alert"><h4>Condiciones de Registro</h4><ul class="registro-list">${condiciones.map(t=>`<li>${t}</li>`).join('')}</ul></div>` : '';
  // Reseña del evento (desde datos del evento)
  const resenaEvento = Array.isArray(evento?.resena) ? evento.resena : (evento?.resena ? [evento.resena] : []);
  const resenaHtml = resenaEvento.length ? `
    <div class="registro-section registro-card-info">
      <h4>Reseña</h4>
      ${resenaEvento.map(p => `<p>${p}</p>`).join('')}
    </div>
  ` : '';
  // Ocultar horario si está configurado en el evento
  const ocultarHorario = dGet(evento.ocultar_horario) === true || dGet(evento.ocultar_horario) === 'true';
  const horarioHtml = (!ocultarHorario && (evFechaIni || evFechaFin || evHoraIni || evHoraFin)) ? `
    <div class="registro-section registro-card-info">
      <h4>Horario del evento</h4>
      ${evFechaIni ? `<div><strong>Inicio:</strong> ${evFechaIni}${evHoraIni?` · ${evHoraIni}`:''}</div>` : ''}
      ${evFechaFin ? `<div><strong>Finaliza:</strong> ${evFechaFin}${evHoraFin?` · ${evHoraFin}`:''}</div>` : ''}
    </div>` : '';
  // Mostrar facilidad de pagos solo si tiene descripción
  const facilidadTieneContenido = facilidad && (facilidad.descripcion || facilidad.fecha_limite_dias_antes || facilidad.monto_minimo_inicial);
  // Mínimo de abono según moneda del evento
  const minAbonoMoneda = precioMoneda === 'USD' ? 25 : 1500;
  const pagosHtml = facilidadTieneContenido ? `
    <div class="registro-section registro-card-info">
      <h4>Facilidad de pagos</h4>
      <p style="margin:6px 0 0; color:#334;">${facilidad.descripcion || ''}</p>
      ${diasLimite>0 && !descHasDias ? `<p style="margin:6px 0 0; color:#334;">Pagos habilitados hasta <strong>${diasLimite}</strong> días antes de la fecha de entrada.</p>` : ''}
    </div>` : '';

  // WhatsApp/Claudia constants (used in template below)
  const WA_NUMBER_RAW = window.WHATSAPP_NUMBER || '18093034991';
  const WA_DIGITS = String(WA_NUMBER_RAW).replace(/\D/g,'');
  const CLAUDIA_NAME = 'Claudia (Administradora de BuenoHotel)';
  const CLAUDIA_WHATSAPP_DISPLAY = window.WHATSAPP_FORMATTED || (WA_DIGITS ? `+${WA_DIGITS}` : '');

  // ===== DATOS PERSONALES (para registro sin login) =====
  let datosPersonalesHtml = '';
  if (REGISTRO_SIN_LOGIN && !ABONO_ONLY) {
    const campoLabels = {
      nombre: { label: 'Nombre', type: 'text', required: true },
      apellido: { label: 'Apellido', type: 'text', required: false },
      email: { label: 'Correo electrónico', type: 'email', required: true },
      telefono: { label: 'Teléfono', type: 'tel', required: false },
      documento: { label: 'Cédula/Pasaporte', type: 'text', required: false },
      fechaNacimiento: { label: 'Fecha de nacimiento', type: 'date', required: false },
      paisCiudad: { label: 'País/Ciudad de origen', type: 'text', required: false }
    };
    
    const camposHtmlSinLogin = camposSinLogin.map(campo => {
      const config = campoLabels[campo];
      if (!config) return '';
      const reqAttr = config.required ? 'required' : '';
      const reqMark = config.required ? ' *' : '';
      return `
        <div class="form-group">
          <label for="sinlogin_${campo}">${config.label}${reqMark}</label>
          <input type="${config.type}" id="sinlogin_${campo}" name="sinlogin_${campo}" class="form-control" ${reqAttr}>
        </div>`;
    }).join('');

    datosPersonalesHtml = `
      <div class="registro-section" style="background:#eff6ff; border:1px solid #93c5fd; border-radius:10px; padding:16px; margin-bottom:16px;">
        <h4 style="margin:0 0 8px; color:#1e40af;">👤 Datos Personales</h4>
        <p style="margin:0 0 12px; font-size:0.9em; color:#3b82f6;">Como no tienes cuenta, necesitamos estos datos para tu registro.</p>
        <div class="form-grid">
          ${camposHtmlSinLogin}
        </div>
      </div>`;
  }

  // ===== ITINERARIO DE VUELO =====
  const itinerarioConfig = evento?.itinerario_vuelo || null;
  const itinerarioHabilitado = itinerarioConfig?.habilitado === true;
  let itinerarioHtml = '';
  if (itinerarioHabilitado && !ABONO_ONLY) {
    const llegada = itinerarioConfig.llegada || {};
    const retorno = itinerarioConfig.retorno || {};
    const camposPersonalizados = itinerarioConfig.camposPersonalizados || [];
    
    const campoLabels = {
      aeropuerto: 'Aeropuerto',
      lineaAerea: 'Línea Aérea',
      numeroVuelo: 'Número de Vuelo',
      fecha: 'Fecha',
      hora: 'Hora',
      cantidadPersonas: 'Cantidad de personas'
    };
    
    const renderCamposItinerario = (campos, obligatorios, prefix) => {
      const reqList = Array.isArray(obligatorios) ? obligatorios : [];
      return (campos || []).map(campo => {
        const id = `${prefix}_${campo}`;
        const label = campoLabels[campo] || campo;
        const type = (campo === 'fecha') ? 'date' : (campo === 'hora') ? 'time' : (campo === 'cantidadPersonas') ? 'number' : 'text';
        const isRequired = reqList.includes(campo);
        return `
          <div class="form-group">
            <label for="${id}">${label}${isRequired ? ' *' : ''}</label>
            <input type="${type}" id="${id}" name="${id}" class="form-control" ${campo === 'cantidadPersonas' ? 'min="1"' : ''} ${isRequired ? 'required' : ''}>
          </div>`;
      }).join('');
    };
    
    const llegadaHtml = llegada.habilitado ? `
      <div style="margin-bottom:16px;">
        <h5 style="margin:0 0 10px; color:#444; font-size:0.95em;">🛬 Destino-Llegada RD</h5>
        <div class="form-grid">${renderCamposItinerario(llegada.campos, llegada.obligatorios, 'llegada')}</div>
      </div>` : '';
    
    const retornoHtml = retorno.habilitado ? `
      <div style="margin-bottom:16px;">
        <h5 style="margin:0 0 10px; color:#444; font-size:0.95em;">🛫 Retorno desde RD</h5>
        <div class="form-grid">${renderCamposItinerario(retorno.campos, retorno.obligatorios, 'retorno')}</div>
      </div>` : '';
    
    const customHtml = camposPersonalizados.length ? `
      <div style="margin-bottom:16px;">
        <h5 style="margin:0 0 10px; color:#444; font-size:0.95em;">📝 Información adicional</h5>
        <div class="form-grid">
          ${camposPersonalizados.map(c => {
            const type = c.tipo === 'number' ? 'number' : c.tipo === 'date' ? 'date' : c.tipo === 'time' ? 'time' : 'text';
            return `
              <div class="form-group">
                <label for="itinerario_custom_${c.id}">${c.label}${c.requerido ? ' *' : ''}</label>
                <input type="${type}" id="itinerario_custom_${c.id}" name="itinerario_custom_${c.id}" class="form-control" ${c.requerido ? 'required' : ''}>
              </div>`;
          }).join('')}
        </div>
      </div>` : '';
    
    if (llegadaHtml || retornoHtml || customHtml) {
      itinerarioHtml = `
        <div class="registro-section" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px; margin-bottom:16px;">
          <h4 style="margin:0 0 12px; color:#1e293b;">✈️ Itinerario de Vuelo</h4>
          ${llegadaHtml}
          ${retornoHtml}
          ${customHtml}
        </div>`;
    }
  }

  // ===== TOURS OPCIONALES =====
  const toursConfig = evento?.tours_config || null;
  const toursHabilitado = toursConfig?.habilitado === true;
  const toursList = Array.isArray(toursConfig?.tours) ? toursConfig.tours : [];
  
  // Calcular máximo de personas para tours (igual al máximo de huéspedes)
  // Usar evento directamente ya que huespedesConfig y preciosPredefinidosConfig aún no están definidos aquí
  let maxPersonasTours = evento?.huespedes_config?.maximo || 10;
  const __ppCfgTemp = evento?.precios_predefinidos;
  const __ppHabilitado = __ppCfgTemp?.habilitado === true && Array.isArray(__ppCfgTemp?.precios) && __ppCfgTemp.precios.length > 0;
  if (__ppHabilitado) {
    const maxPrecioPredefinido = Math.max(...__ppCfgTemp.precios.map(p => p.cantidad || 0));
    if (maxPrecioPredefinido > 0) {
      maxPersonasTours = Math.min(maxPersonasTours, maxPrecioPredefinido);
    }
  }
  
  let toursHtml = '';
  if (toursHabilitado && toursList.length > 0 && !ABONO_ONLY) {
    const toursItems = toursList.map((tour, idx) => {
      const tourMoneda = tour.moneda || 'USD';
      const incluyeList = Array.isArray(tour.incluye) ? tour.incluye : [];
      return `
        <div class="tour-item" data-tour-idx="${idx}" style="background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:12px; margin-bottom:10px;">
          <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer;">
            <input type="checkbox" name="tour_${idx}" value="${tour.precio}" data-tour-moneda="${tourMoneda}" style="margin-top:4px;">
            <div style="flex:1;">
              <strong style="color:#1f2937; font-size:1em;">${tour.nombre || 'Tour'}</strong>
              ${tour.descripcion ? `<p style="margin:6px 0; font-size:0.9em; color:#4b5563;">${tour.descripcion}</p>` : ''}
              ${incluyeList.length ? `<p style="margin:6px 0; font-size:0.85em; color:#059669;"><strong>Incluye:</strong> ${incluyeList.join(' • ')}</p>` : ''}
              <p style="margin:6px 0 0; font-weight:700; color:#dc2626;">${formatCurrency(tour.precio, tourMoneda)} por persona</p>
            </div>
          </label>
          <div class="tour-cantidad" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #e5e7eb;">
            <div style="display:flex; align-items:center; gap:10px;">
              <label style="font-weight:600; font-size:0.9em;">Cantidad de personas:</label>
              <input type="number" name="tour_${idx}_cantidad" class="tour-cantidad-input" min="1" max="${maxPersonasTours}" value="1" style="width:80px; padding:6px; border:1px solid #ddd; border-radius:4px;">
              <span class="tour-subtotal" style="font-weight:700; color:#059669;"></span>
            </div>
          </div>
        </div>`;
    }).join('');

    toursHtml = `
      <div class="registro-section" id="tours-section" style="background:#ecfdf5; border:1px solid #6ee7b7; border-radius:10px; padding:16px; margin-bottom:16px;">
        <h4 style="margin:0 0 8px; color:#065f46;">🚌 Tours Opcionales</h4>
        <p style="margin:0 0 12px; font-size:0.9em; color:#047857;">Selecciona los tours que deseas agregar. El precio se multiplica por la cantidad de personas.</p>
        <div id="tours-container">
          ${toursItems}
        </div>
        <div id="tours-total" style="display:none; margin-top:12px; padding:10px; background:#d1fae5; border-radius:6px;">
          <strong>Total Tours:</strong> <span id="tours-total-valor">-</span>
        </div>
      </div>`;
  }

  // ===== MÚLTIPLES HUÉSPEDES =====
  const huespedesConfig = evento?.huespedes_config || null;
  const huespedesHabilitado = huespedesConfig?.habilitado === true;
  
  // Precios predefinidos por cantidad de personas
  const preciosPredefinidosConfig = (function(){
    try {
      const cfg = evento?.precios_predefinidos;
      if (!cfg || cfg.habilitado !== true) return null;
      return {
        habilitado: true,
        moneda: cfg.moneda || 'DOP',
        precios: Array.isArray(cfg.precios) ? cfg.precios : []
      };
    } catch(_) { return null; }
  })();
  const usarPreciosPredefinidos = preciosPredefinidosConfig?.habilitado === true && preciosPredefinidosConfig.precios.length > 0;

  // Función para obtener precio según cantidad de personas
  function getPrecioPorCantidad(cantidad) {
    if (!usarPreciosPredefinidos) {
      // Precio simple: multiplicar por cantidad
      return precioEvento * cantidad;
    }
    // Buscar precio predefinido para esta cantidad
    const precios = preciosPredefinidosConfig.precios;
    const match = precios.find(p => p.cantidad === cantidad);
    if (match) return match.precio;
    // Si no hay match exacto, usar el precio más cercano menor o el precio simple
    const menores = precios.filter(p => p.cantidad < cantidad).sort((a,b) => b.cantidad - a.cantidad);
    if (menores.length > 0) {
      // Usar el precio del más cercano y sumar diferencia con precio unitario
      const base = menores[0];
      const diff = cantidad - base.cantidad;
      const precioUnitario = precios.find(p => p.cantidad === 1)?.precio || precioEvento;
      return base.precio + (diff * precioUnitario);
    }
    // Fallback: precio simple
    return precioEvento * cantidad;
  }

  let huespedesHtml = '';
  if (huespedesHabilitado && !ABONO_ONLY) {
    const minHuespedes = huespedesConfig.minimo || 1;
    // Si hay precios predefinidos, limitar máximo de huéspedes a la cantidad máxima definida
    let maxHuespedes = huespedesConfig.maximo || 10;
    if (usarPreciosPredefinidos && preciosPredefinidosConfig?.precios?.length > 0) {
      const maxPrecioPredefinido = Math.max(...preciosPredefinidosConfig.precios.map(p => p.cantidad || 0));
      if (maxPrecioPredefinido > 0) {
        maxHuespedes = Math.min(maxHuespedes, maxPrecioPredefinido);
      }
    }
    const camposHuesped = huespedesConfig.campos || ['nombreCompleto'];
    
    const campoHuespedLabels = {
      nombreCompleto: 'Nombre completo',
      documento: 'Cédula/Pasaporte',
      fechaNacimiento: 'Fecha de nacimiento',
      telefono: 'Teléfono',
      email: 'Email',
      parentesco: 'Parentesco'
    };

    // Datos del huésped principal (del usuario logueado o registro sin login)
    const huesped1Nombre = REGISTRO_SIN_LOGIN 
      ? '' // Se llenará dinámicamente desde los campos de datos personales
      : `${userData?.nombre || ''} ${userData?.apellido || ''}`.trim();
    const huesped1Email = REGISTRO_SIN_LOGIN ? '' : (userData?.email || '');
    const huesped1Telefono = REGISTRO_SIN_LOGIN ? '' : (userData?.telefono || userData?.phone || '');
    const huesped1Documento = REGISTRO_SIN_LOGIN ? '' : (userData?.documento || userData?.cedula || '');

    // Generar campos del huésped #1 con valores prellenados (readonly para datos de cuenta)
    const huesped1CamposHtml = camposHuesped.map(campo => {
      const label = campoHuespedLabels[campo] || campo;
      const type = campo === 'fechaNacimiento' ? 'date' : campo === 'email' ? 'email' : 'text';
      let value = '';
      let readonly = '';
      let style = '';
      
      if (!REGISTRO_SIN_LOGIN) {
        // Usuario logueado: prellenar y hacer readonly
        if (campo === 'nombreCompleto') { value = huesped1Nombre; readonly = 'readonly'; style = 'background:#f3f4f6;'; }
        else if (campo === 'email') { value = huesped1Email; readonly = 'readonly'; style = 'background:#f3f4f6;'; }
        else if (campo === 'telefono') { value = huesped1Telefono; readonly = 'readonly'; style = 'background:#f3f4f6;'; }
        else if (campo === 'documento') { value = huesped1Documento; readonly = 'readonly'; style = 'background:#f3f4f6;'; }
      }
      // Para registro sin login, los campos se sincronizarán dinámicamente con JS
      
      return `
        <div class="form-group" style="flex:1 1 200px; min-width:0;">
          <label for="huesped_0_${campo}" style="display:block; font-size:0.85em; font-weight:600; color:#555; margin-bottom:4px;">${label}${campo === 'nombreCompleto' ? ' *' : ''}</label>
          <input type="${type}" id="huesped_0_${campo}" name="huesped_0_${campo}" class="form-control" value="${value}" ${readonly} style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #ddd; border-radius:6px; font-size:0.9em; ${style}" data-huesped1-campo="${campo}">
        </div>`;
    }).join('');
    
    // Mensaje de precio según modo
    const precioMensaje = usarPreciosPredefinidos 
      ? 'El precio varía según la cantidad de personas (precios especiales disponibles)'
      : 'El precio total se calculará: <strong>Precio por persona × Cantidad de huéspedes</strong>';

    huespedesHtml = `
      <div class="registro-section" id="huespedes-section" style="background:#fefce8; border:1px solid #fde047; border-radius:10px; padding:16px; margin-bottom:16px;">
        <h4 style="margin:0 0 8px; color:#854d0e;">👥 Huéspedes</h4>
        <p style="margin:0 0 12px; font-size:0.9em; color:#a16207;">${precioMensaje}</p>
        
        <div id="huespedes-container">
          <!-- Huésped principal (datos del usuario, no editable) -->
          <div class="huesped-item" data-huesped="0" style="background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:12px; margin-bottom:10px; overflow:hidden;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
              <strong style="color:#1f2937;">Huésped #1 (Principal)</strong>
              <span style="font-size:0.85em; color:#6b7280;">${REGISTRO_SIN_LOGIN ? 'Se usarán tus datos personales' : 'Datos de tu cuenta'}</span>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:10px;">
              ${huesped1CamposHtml}
            </div>
          </div>
        </div>
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
          <button type="button" id="agregar-huesped-btn" class="btn-secondary" style="background:#FBB03B; color:#222; border:1px solid #E19A2E;">
            + Agregar huésped
          </button>
          <div style="font-size:0.9em; color:#666;">
            <span id="huespedes-count">1</span> de ${maxHuespedes} huéspedes
          </div>
        </div>
        
        <div id="precio-total-huespedes" style="margin-top:12px; padding:10px; background:#fef3c7; border-radius:6px; display:none;">
          <strong>Precio total estimado:</strong> <span id="precio-total-valor">-</span>
        </div>
      </div>
      
      <script type="text/template" id="huesped-template">
        <div class="huesped-item" data-huesped="{{INDEX}}" style="background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:12px; margin-bottom:10px; overflow:hidden;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
            <strong style="color:#1f2937;">Huésped #{{NUM}}</strong>
            <button type="button" class="btn-remove-huesped" data-remove="{{INDEX}}" style="background:#ef4444; color:#fff; border:none; border-radius:4px; padding:4px 10px; cursor:pointer; font-size:0.85em;">Eliminar</button>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:10px;">
            ${camposHuesped.map(campo => {
              const label = campoHuespedLabels[campo] || campo;
              const type = campo === 'fechaNacimiento' ? 'date' : campo === 'email' ? 'email' : 'text';
              const req = campo === 'nombreCompleto' ? 'required' : '';
              return `
                <div class="form-group" style="flex:1 1 200px; min-width:0;">
                  <label for="huesped_{{INDEX}}_${campo}" style="display:block; font-size:0.85em; font-weight:600; color:#555; margin-bottom:4px;">${label}${campo === 'nombreCompleto' ? ' *' : ''}</label>
                  <input type="${type}" id="huesped_{{INDEX}}_${campo}" name="huesped_{{INDEX}}_${campo}" class="form-control" style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #ddd; border-radius:6px; font-size:0.9em;" ${req}>
                </div>`;
            }).join('')}
          </div>
        </div>
      </script>`;
  }

  try {
    console.debug('[Registro] Render secciones', {
      condiciones: condiciones.length,
      horario: !!(evFechaIni || evFechaFin || evHoraIni || evHoraFin),
      pagos: !!facilidad,
      campos: (req.campos_adicionales||[]).length
    });
    const fiscalBlockHtml = permiteOpcionFiscal
      ? `
        <div id="fiscal-solicitud-section" class="registro-section" style="margin-top:18px; padding:14px 16px; border:1px solid #e8e4df; border-radius:10px; background:#fffbf5; border-left:4px solid #FBB03B;">
          <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer; font-weight:600; color:#333;">
            <input type="checkbox" id="solicitaComprobanteFiscal" style="margin-top:4px;">
            <span>Solicito <strong>comprobante fiscal</strong> (NCF / factura) a nombre de mi <strong>empresa</strong>.</span>
          </label>
          <small style="display:block; margin:8px 0 0 28px; color:#666; line-height:1.35;">Si lo marcas, son obligatorios los datos de la <strong>empresa</strong> (primero el RNC y luego la razón social, correo, teléfonos y dirección). No se usa el nombre ni la cédula de quien se registra.</small>
          <div id="fiscal-rnc-wrap" style="display:none; margin-top:12px; max-width:520px;">
            <div class="form-group" style="margin-bottom:10px;">
              <label for="rncComprobanteFiscal">RNC de la empresa <span style="color:#b91c1c;">*</span></label>
              <input type="text" id="rncComprobanteFiscal" class="form-control" inputmode="numeric" autocomplete="off" placeholder="Ej. 1-24-03235-2 (8–11 dígitos)">
            </div>
            <div class="form-group" style="margin-bottom:10px;">
              <label for="razonSocialCliente">Nombre de la empresa / razón social <span style="color:#b91c1c;">*</span></label>
              <input type="text" id="razonSocialCliente" class="form-control" maxlength="150" autocomplete="organization" placeholder="Ej. Pujos Duarte y Asociados SRL">
            </div>
            <div class="form-group" style="margin-bottom:10px;">
              <label for="emailFiscalCliente">Correo de la empresa <span style="color:#b91c1c;">*</span></label>
              <input type="email" id="emailFiscalCliente" class="form-control" maxlength="80" autocomplete="email" placeholder="facturacion@empresa.com">
            </div>
            <div class="form-group" style="margin-bottom:10px;">
              <label for="telefonoFiscalCliente">Teléfono(s) de la empresa <span style="color:#b91c1c;">*</span></label>
              <input type="text" id="telefonoFiscalCliente" class="form-control" maxlength="40" autocomplete="tel" placeholder="Ej. 809-440-3252 / 809-539-8041">
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label for="direccionFiscalCliente">Dirección de la empresa <span style="color:#b91c1c;">*</span></label>
              <textarea id="direccionFiscalCliente" class="form-control" rows="2" maxlength="100" placeholder="Puede abreviar si es muy larga (máx. 100 caracteres)"></textarea>
            </div>
          </div>
        </div>`
      : '';
    body.innerHTML = `
      ${resenaHtml}
      ${condicionesHtml}
      ${horarioHtml}
      ${__entradaDisplayHtml}
      ${pagosHtml}
      <form id="registro-form-adicionales" class="registro-section">
        ${datosPersonalesHtml}
        <div class="form-grid">
          ${churchFieldsHtml}
          ${camposHtml}
        </div>
        ${huespedesHtml}
        ${toursHtml}

        <div id="fechas-section" class="registro-section" style="margin-top:20px;">
          <div class="form-grid" id="fechas-grid"></div>
        </div>

        ${itinerarioHtml}

        <div id="monto-section" class="registro-section" style="margin-top:20px;">
          <div class="form-grid" id="monto-grid"></div>
        </div>

        <div class="registro-section" style="margin-top:20px;">
          <h4>Método de pago</h4>
          <div class="form-group" style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
            <label style="display:flex; align-items:center; gap:8px;">
              <input type="radio" name="metodoPago" value="tarjeta" checked>
              Tarjeta de crédito/débito <span class="chip" title="Pago procesado por Ecommerce">AZUL</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px;">
              <input type="radio" name="metodoPago" value="transferencia">
              Transferencia o Depósito
            </label>
          </div>
          <div id="tarjeta-helper" class="registro-card-info" style="display:block; margin-top:10px;">
            <p style="margin:0; color:#334;">Serás redirigido a <strong>Ecommerce</strong> para completar el pago con <strong>AZUL</strong>.</p>
            <div class="payment-logos-inline" aria-label="American Express SafeKey">
              <button type="button" class="payment-badge payment-badge-zoom" data-logo-zoom="assets/img/amex-safekey.png" aria-label="Ver American Express SafeKey en grande">
                <img src="assets/img/amex-safekey.png" alt="American Express SafeKey" class="payment-logo payment-logo-safekey" width="160" height="40" loading="lazy" />
              </button>
            </div>
          </div>
          <div id="wa-helper" class="registro-card-info" style="display:none; margin-top:10px; background:#f4f6f9; border-color:#dfe6ef;">
            <p style="margin:0; color:#334; font-weight:600;">Transferencia o Depósito</p>
            <small style="display:block; margin-top:6px; color:#445;">Después de confirmar, te mostraremos una alerta y te redirigiremos automáticamente a WhatsApp para enviar tu comprobante.</small>
          </div>
          <div id="terminos-container" class="form-group" style="margin-top:16px; display:flex; gap:8px; align-items:flex-start;">
            <input type="checkbox" id="aceptaTerminos" name="aceptaTerminos" required style="margin-top:4px;">
            <label for="aceptaTerminos" style="margin:0; font-weight:500; color:#333;">
              Acepto los términos y condiciones del evento y autorizo el tratamiento de mis datos conforme a la política de privacidad.
            </label>
          </div>
        </div>

        ${fiscalBlockHtml}

        <div class="form-actions">
          <button type="button" id="registro-cancel" class="btn-secondary">Cancelar</button>
          <button type="submit" id="registro-submit" class="btn-primary">${ABONO_ONLY ? 'Confirmar Abono' : 'Confirmar Registro'}</button>
        </div>
      </form>
    `;
  } catch(err){
    console.error('[Registro] Error al renderizar modal:', err);
    if (window.showToast) window.showToast({ title:'Error', message:'Ocurrió un problema al preparar el formulario. Intenta de nuevo.', type:'error' });
    body.innerHTML = '<div class="registro-alert">Ocurrió un problema al preparar el formulario. Intenta de nuevo.</div>';
  }

  // Insertar campos de Fechas (entre Tours e Itinerario)
  const fechasGrid = body.querySelector('#fechas-grid');
  const monedaLabelForHelper = precioMoneda === 'USD' ? 'USD' : 'RD';
  
  if (fechasGrid && !ABONO_ONLY) {
    // Fecha de entrada
    fechasGrid.insertAdjacentHTML('beforeend', `
      <div class="form-group">
        <label for="fechaEntrada">Fecha de entrada *</label>
        <input type="date" id="fechaEntrada" name="fechaEntrada" class="form-control" required>
      </div>`);
    // Fecha de salida requerida
    fechasGrid.insertAdjacentHTML('beforeend', `
      <div class="form-group">
        <label for="fechaSalida">Fecha de salida *</label>
        <input type="date" id="fechaSalida" name="fechaSalida" class="form-control" required>
      </div>`);
  }
  
  // Insertar Monto (después de Itinerario, antes de Método de pago)
  // Si "usar precio del evento como mínimo" está marcado, mostrar precio total fijo (modo tienda)
  // Si no, mostrar campo de abonar normal
  const usarPrecioComoMinimoConfig = abonoMinimoConfig?.usar_precio_evento === true;
  const montoGrid = body.querySelector('#monto-grid');
  if (montoGrid) {
    if (usarPrecioComoMinimoConfig) {
      // Modo tienda: mostrar precio total calculado (se actualizará dinámicamente)
      montoGrid.insertAdjacentHTML('beforeend', `
        <div class="form-group" id="precio-total-pagar-container">
          <label style="font-weight:700; color:#1f2937;">Total a pagar</label>
          <div id="precio-total-pagar" style="font-size:1.5em; font-weight:900; color:#059669; padding:12px 16px; background:#ecfdf5; border:2px solid #10b981; border-radius:8px; text-align:center;">
            ${formatCurrency(precioEvento, precioMoneda)}
          </div>
          <small style="display:block; color:#666; margin-top:6px;">Este es el monto total según tu selección.</small>
          <input type="hidden" id="montoPago" name="montoPago" value="${precioEvento}">
        </div>`);
    } else {
      // Modo abono: campo para ingresar monto
      montoGrid.insertAdjacentHTML('beforeend', `
        <div class="form-group">
          <label for="montoPago">Monto a registrarse en el evento *</label>
          <input type="text" id="montoPago" name="montoPago" class="form-control" inputmode="decimal" required>
          <small id="montoPago-helper" style="display:block; color:#666; margin-top:6px;">Ingresa tu abono en ${monedaLabelForHelper}.</small>
        </div>`);
    }
  }

  // Lógica required_if que soporta dependencia en campos del formulario o datos de perfil
  const requiredRules = (!req.habilitar_campos_adicionales ? [] : (req.campos_adicionales||[]))
    .filter(c=>c.required_if)
    .filter(c=> !(c && Object.prototype.hasOwnProperty.call(c, 'fixed_value')))
    .map(c=>({ id:c.id, expr:String(c.required_if), baseRequired:!!c.required }));
  function evalRequiredRules(){
    requiredRules.forEach(rule=>{
      const [depField, depVal] = rule.expr.split('==');
      if (!depField) return;
      const depEl = body.querySelector(`[name="${depField}"]`);
      const currentVal = depEl ? String((depEl.value||'')) : String(userData && userData[depField] || '');
      const target = body.querySelector(`[name="${rule.id}"]`);
      if (!target) return;
      const needed = currentVal === depVal;
      target.required = needed || rule.baseRequired;
      const wrapper = target.closest('.form-group');
      if (wrapper) wrapper.style.display = needed ? '' : 'none';
    });
  }
  // Atar listeners a dependencias presentes en el form
  requiredRules.forEach(rule=>{
    const [depField] = rule.expr.split('==');
    const depEl = body.querySelector(`[name="${depField}"]`);
    if (depEl){ depEl.addEventListener('change', evalRequiredRules); depEl.addEventListener('input', evalRequiredRules); }
  });
  evalRequiredRules();

  body.querySelector('#registro-cancel')?.addEventListener('click', ()=>{
    modal.remove();
  });

  (function bindFiscalSolicitudUi() {
    const fiscalCb = body.querySelector('#solicitaComprobanteFiscal');
    const fiscalRncWrap = body.querySelector('#fiscal-rnc-wrap');
    const fiscalRncInput = body.querySelector('#rncComprobanteFiscal');
    const fiscalRazonInput = body.querySelector('#razonSocialCliente');
    const fiscalEmailInput = body.querySelector('#emailFiscalCliente');
    const fiscalTelInput = body.querySelector('#telefonoFiscalCliente');
    const fiscalDirInput = body.querySelector('#direccionFiscalCliente');
    function syncFiscalFields() {
      if (!fiscalCb || !fiscalRncWrap || !fiscalRncInput) return;
      const on = fiscalCb.checked;
      fiscalRncWrap.style.display = on ? 'block' : 'none';
      fiscalRncInput.required = on;
      if (fiscalRazonInput) fiscalRazonInput.required = on;
      if (fiscalEmailInput) fiscalEmailInput.required = on;
      if (fiscalTelInput) fiscalTelInput.required = on;
      if (fiscalDirInput) fiscalDirInput.required = on;
      if (!on) {
        fiscalRncInput.value = '';
        if (fiscalRazonInput) fiscalRazonInput.value = '';
        if (fiscalEmailInput) fiscalEmailInput.value = '';
        if (fiscalTelInput) fiscalTelInput.value = '';
        if (fiscalDirInput) fiscalDirInput.value = '';
      }
    }
    if (fiscalCb) {
      fiscalCb.addEventListener('change', syncFiscalFields);
      syncFiscalFields();
    }
  })();

  // ===== LÓGICA DE MÚLTIPLES HUÉSPEDES =====
  if (huespedesHabilitado && !ABONO_ONLY) {
    // Si hay precios predefinidos, limitar máximo de huéspedes a la cantidad máxima definida
    let maxHuespedes = huespedesConfig?.maximo || 10;
    if (usarPreciosPredefinidos && preciosPredefinidosConfig?.precios?.length > 0) {
      const maxPrecioPredefinido = Math.max(...preciosPredefinidosConfig.precios.map(p => p.cantidad || 0));
      if (maxPrecioPredefinido > 0) {
        maxHuespedes = Math.min(maxHuespedes, maxPrecioPredefinido);
      }
    }
    const camposHuesped = huespedesConfig?.campos || ['nombreCompleto'];
    let huespedCount = 1;
    
    const container = body.querySelector('#huespedes-container');
    const template = body.querySelector('#huesped-template');
    const countEl = body.querySelector('#huespedes-count');
    const addBtn = body.querySelector('#agregar-huesped-btn');
    const precioTotalDiv = body.querySelector('#precio-total-huespedes');
    const precioTotalValor = body.querySelector('#precio-total-valor');
    
    function updateHuespedCount() {
      const items = container?.querySelectorAll('.huesped-item') || [];
      huespedCount = items.length;
      if (countEl) countEl.textContent = huespedCount;
      if (addBtn) addBtn.style.display = huespedCount >= maxHuespedes ? 'none' : '';
      
      // Actualizar precio total con moneda correcta (usando precios predefinidos si aplica)
      if ((precioEvento > 0 || usarPreciosPredefinidos) && precioTotalDiv && precioTotalValor) {
        const total = getPrecioPorCantidad(huespedCount);
        const monedaTotal = usarPreciosPredefinidos ? preciosPredefinidosConfig.moneda : precioMoneda;
        precioTotalValor.textContent = formatCurrency(total, monedaTotal);
        precioTotalDiv.style.display = 'block';
      }
      
      // Actualizar precio total a pagar (modo tienda) si está habilitado
      if (usarPrecioComoMinimoConfig) {
        updatePrecioTotalPagar();
      }
      
      // Actualizar máximo de personas en tours al número actual de huéspedes
      const tourCantidadInputs = body.querySelectorAll('.tour-cantidad-input') || [];
      tourCantidadInputs.forEach(inp => {
        inp.max = huespedCount;
        // Si el valor actual excede el nuevo máximo, ajustarlo
        if (parseInt(inp.value) > huespedCount) {
          inp.value = huespedCount;
          // Disparar evento para recalcular totales
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      
      // Renumerar huéspedes
      items.forEach((item, idx) => {
        const label = item.querySelector('strong');
        if (label && idx > 0) {
          label.textContent = `Huésped #${idx + 1}`;
        }
      });
    }
    
    function addHuesped() {
      if (huespedCount >= maxHuespedes) return;
      const newIndex = huespedCount;
      const templateHtml = template?.innerHTML || '';
      const html = templateHtml
        .replace(/\{\{INDEX\}\}/g, String(newIndex))
        .replace(/\{\{NUM\}\}/g, String(newIndex + 1));
      container?.insertAdjacentHTML('beforeend', html);
      
      // Agregar listener de eliminar
      const newItem = container?.querySelector(`[data-huesped="${newIndex}"]`);
      const removeBtn = newItem?.querySelector('.btn-remove-huesped');
      removeBtn?.addEventListener('click', () => {
        newItem?.remove();
        updateHuespedCount();
      });
      
      updateHuespedCount();
    }
    
    addBtn?.addEventListener('click', addHuesped);
    updateHuespedCount();

    // Sincronizar huésped #1 con datos personales (para registro sin login)
    if (REGISTRO_SIN_LOGIN) {
      const syncHuesped1 = () => {
        const nombreEl = body.querySelector('#sinlogin_nombre');
        const apellidoEl = body.querySelector('#sinlogin_apellido');
        const emailEl = body.querySelector('#sinlogin_email');
        const telefonoEl = body.querySelector('#sinlogin_telefono');
        const documentoEl = body.querySelector('#sinlogin_documento');
        
        const h1Nombre = body.querySelector('#huesped_0_nombreCompleto');
        const h1Email = body.querySelector('#huesped_0_email');
        const h1Telefono = body.querySelector('#huesped_0_telefono');
        const h1Documento = body.querySelector('#huesped_0_documento');
        
        if (h1Nombre && nombreEl) {
          const fullName = `${nombreEl.value || ''} ${apellidoEl?.value || ''}`.trim();
          h1Nombre.value = fullName;
          h1Nombre.readOnly = true;
          h1Nombre.style.background = '#f3f4f6';
        }
        if (h1Email && emailEl) {
          h1Email.value = emailEl.value || '';
          h1Email.readOnly = true;
          h1Email.style.background = '#f3f4f6';
        }
        if (h1Telefono && telefonoEl) {
          h1Telefono.value = telefonoEl.value || '';
          h1Telefono.readOnly = true;
          h1Telefono.style.background = '#f3f4f6';
        }
        if (h1Documento && documentoEl) {
          h1Documento.value = documentoEl.value || '';
          h1Documento.readOnly = true;
          h1Documento.style.background = '#f3f4f6';
        }
      };
      
      // Escuchar cambios en los campos de datos personales
      ['sinlogin_nombre', 'sinlogin_apellido', 'sinlogin_email', 'sinlogin_telefono', 'sinlogin_documento'].forEach(id => {
        const el = body.querySelector(`#${id}`);
        if (el) {
          el.addEventListener('input', syncHuesped1);
          el.addEventListener('change', syncHuesped1);
        }
      });
      
      // Sincronizar al inicio
      setTimeout(syncHuesped1, 100);
    }
  }

  // ===== LÓGICA DE TOURS =====
  if (toursHabilitado && toursList.length > 0 && !ABONO_ONLY) {
    const toursContainer = body.querySelector('#tours-container');
    const toursTotalDiv = body.querySelector('#tours-total');
    const toursTotalValor = body.querySelector('#tours-total-valor');

    function updateToursTotal() {
      let totalUSD = 0;
      let totalDOP = 0;
      const tourItems = toursContainer?.querySelectorAll('.tour-item') || [];
      
      tourItems.forEach((item, idx) => {
        const checkbox = item.querySelector(`input[name="tour_${idx}"]`);
        const cantidadInput = item.querySelector(`input[name="tour_${idx}_cantidad"]`);
        const cantidadDiv = item.querySelector('.tour-cantidad');
        const subtotalSpan = item.querySelector('.tour-subtotal');
        
        if (checkbox?.checked) {
          cantidadDiv.style.display = 'block';
          const precio = parseFloat(checkbox.value) || 0;
          const cantidad = parseInt(cantidadInput?.value) || 1;
          const moneda = checkbox.dataset.tourMoneda || 'USD';
          const subtotal = precio * cantidad;
          
          if (moneda === 'USD') {
            totalUSD += subtotal;
            subtotalSpan.textContent = formatCurrencyUSD(subtotal);
          } else {
            totalDOP += subtotal;
            subtotalSpan.textContent = formatCurrencyDOP(subtotal);
          }
        } else {
          cantidadDiv.style.display = 'none';
        }
      });

      // Mostrar total
      if (totalUSD > 0 || totalDOP > 0) {
        let totalText = '';
        if (totalUSD > 0) totalText += formatCurrencyUSD(totalUSD);
        if (totalUSD > 0 && totalDOP > 0) totalText += ' + ';
        if (totalDOP > 0) totalText += formatCurrencyDOP(totalDOP);
        toursTotalValor.textContent = totalText;
        toursTotalDiv.style.display = 'block';
      } else {
        toursTotalDiv.style.display = 'none';
      }
    }

    // Event listeners para tours
    const tourCheckboxes = toursContainer?.querySelectorAll('input[type="checkbox"]') || [];
    const tourCantidades = toursContainer?.querySelectorAll('input[type="number"]') || [];
    
    tourCheckboxes.forEach(cb => cb.addEventListener('change', () => {
      updateToursTotal();
      if (usarPrecioComoMinimoConfig) updatePrecioTotalPagar();
    }));
    tourCantidades.forEach(inp => inp.addEventListener('input', () => {
      updateToursTotal();
      if (usarPrecioComoMinimoConfig) updatePrecioTotalPagar();
    }));
  }
  
  // Función para actualizar el precio total a pagar (modo tienda)
  function updatePrecioTotalPagar() {
    const precioTotalPagarEl = body.querySelector('#precio-total-pagar');
    const montoPagoHidden = body.querySelector('#montoPago');
    if (!precioTotalPagarEl) return;
    
    // Contar huéspedes
    const huespedesItems = body.querySelectorAll('.huesped-item') || [];
    const cantHuespedes = huespedesItems.length > 0 ? huespedesItems.length : 1;
    
    // Calcular precio base según huéspedes
    const precioBaseHuespedes = getPrecioPorCantidad(cantHuespedes);
    
    // Calcular total de tours seleccionados
    let toursTotalCalc = 0;
    const tourItemsCalc = body.querySelectorAll('.tour-item') || [];
    tourItemsCalc.forEach((item, idx) => {
      const checkbox = item.querySelector(`input[name="tour_${idx}"]`);
      const cantidadInput = item.querySelector(`input[name="tour_${idx}_cantidad"]`);
      if (checkbox?.checked) {
        const precio = parseFloat(checkbox.value) || 0;
        const cantidad = parseInt(cantidadInput?.value) || 1;
        toursTotalCalc += precio * cantidad;
      }
    });
    
    // Precio total = precio base huéspedes + tours
    const precioTotalCalculado = precioBaseHuespedes + toursTotalCalc;
    const monedaTotal = usarPreciosPredefinidos ? preciosPredefinidosConfig.moneda : precioMoneda;
    
    // Actualizar display
    precioTotalPagarEl.textContent = formatCurrency(precioTotalCalculado, monedaTotal);
    
    // Actualizar campo hidden
    if (montoPagoHidden) {
      montoPagoHidden.value = precioTotalCalculado;
    }
  }
  
  // Llamar inicialmente para establecer el precio correcto
  if (usarPrecioComoMinimoConfig) {
    updatePrecioTotalPagar();
  }

  const form = body.querySelector('#registro-form-adicionales');
  // Iglesia: habilitar input de "Otra" cuando corresponde y mostrar info extra
  try{
    const iglesiaRadios = Array.from(body.querySelectorAll('input[name="iglesia"]'));
    const otraRadio = body.querySelector('#otraIglesiaRadio');
    const otraInput = body.querySelector('#otraIglesia');
    const otraExtra = body.querySelector('#otraIglesiaExtra');
    const otraLider = body.querySelector('#otraIglesiaLider');
    const otraContacto = body.querySelector('#otraIglesiaContacto');
    function syncOtra(){
      if (!otraRadio || !otraInput) return;
      if (otraRadio.checked){
        otraInput.disabled = false;
        otraInput.required = !!showChurchFields;
        try { otraInput.focus(); } catch(_){ }
        if (otraExtra) otraExtra.style.display = 'block';
        if (otraLider) { otraLider.disabled = false; otraLider.required = !!showChurchFields; }
        if (otraContacto) { otraContacto.disabled = false; otraContacto.required = !!showChurchFields; }
      } else {
        otraInput.disabled = true;
        otraInput.required = false;
        // No limpiar el valor para permitir volver sin perder texto; si deseas, descomenta:
        // otraInput.value = '';
        if (otraExtra) otraExtra.style.display = 'none';
        if (otraLider) { otraLider.disabled = true; otraLider.required = false; }
        if (otraContacto) { otraContacto.disabled = true; otraContacto.required = false; }
      }
    }
    if (iglesiaRadios.length){ iglesiaRadios.forEach(radio => {
      radio.addEventListener('change', syncOtra);
      syncOtra();
    }); }

    // Si el evento requiere iglesia, exigir que se seleccione alguna opción
    if (showChurchFields && iglesiaRadios.length){
      try { iglesiaRadios[0].required = true; } catch(_){}
    }
  } catch(_){ }
  // Deshabilitar submit si existe checkbox de términos y no está marcado
  const submitBtn = body.querySelector('#registro-submit');
  const termField = form.querySelector('#aceptaTerminos');
  // Pago: radios y helper de WhatsApp
  const pagoRadios = body.querySelectorAll('input[name="metodoPago"]');
  const waHelper = body.querySelector('#wa-helper');
  const tarjetaHelper = body.querySelector('#tarjeta-helper');
  // Pre-submit helper no incluye botón ni countdown
  function buildWaUrl(eventName, monto, extraNote=''){
    const digits = String(WA_NUMBER_RAW).replace(/\D/g,'');
    const waNumber = digits; // Debe incluir código de país, sin '+' ni espacios
    const montoTxt = (typeof monto !== 'undefined' && monto !== null && String(monto).trim() !== '')
      ? ` Monto: ${formatCurrency(Number(monto), precioMoneda)}`
      : '';
    const note = extraNote ? `\n${extraNote}` : '';
    const text = `Hola, envío comprobante de pago del evento: ${eventName}.${montoTxt}${note}`;
    // Usamos api.whatsapp.com por mayor compatibilidad en escritorio/móvil
    return `https://api.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(text)}`;
  }
  function parseMontoInput(raw){
    if (raw == null) return NaN;
    if (typeof raw === 'number') return raw;
    const s = String(raw).trim();
    if (!s) return NaN;
    if (s.toUpperCase() === 'OTRO') return NaN;
    // Quitar símbolos de moneda y separadores de miles
    const m = s
      .replace(/[^\d.,]/g,'')              // deja solo dígitos, puntos, comas
      .replace(/\.(?=\d{3}(\D|$))/g,'')  // quita puntos usados como separador de miles
      .replace(/,/g,'');                    // quita comas
    const n = Number(m);
    return Number.isFinite(n) ? n : NaN;
  }

  function getEffectiveMonto(){
    const valSel = body.querySelector('#montoPago')?.value;
    if (valSel === 'OTRO'){
      const otro = body.querySelector('#montoPagoOtro')?.value;
      return otro ? parseMontoInput(otro) : '';
    }
    return valSel ? parseMontoInput(valSel) : '';
  }
  function showMontoError(targetEl, msg){
    try{
      if (!targetEl) return;
      targetEl.setAttribute('aria-invalid','true');
      targetEl.style.borderColor = '#b30000';
      targetEl.style.outlineColor = '#b30000';
      // Try to find existing helper near the control; if not present, create one
      let helper = null;
      const group = targetEl.closest('.form-group');
      if (group) {
        helper = group.querySelector('#montoPago-helper') || group.querySelector('[data-monto-error]');
        if (!helper){
          helper = document.createElement('small');
          helper.setAttribute('data-monto-error','');
          helper.style.display = 'block';
          helper.style.marginTop = '6px';
          helper.style.color = '#b30000';
          group.appendChild(helper);
        }
      }
      if (helper){
        const defaultMsg = precioMoneda === 'USD' ? 'El abono mínimo es $25.00.' : 'El abono mínimo es RD$1,500.00.';
        helper.textContent = msg || defaultMsg;
        helper.style.color = '#b30000';
      }
    } catch(_){}
  }
  function clearMontoErrorVisuals(){
    const fields = [ body.querySelector('#montoPago'), body.querySelector('#montoPagoOtro') ].filter(Boolean);
    fields.forEach(el=>{
      el.removeAttribute('aria-invalid');
      el.style.borderColor = '';
      el.style.outlineColor = '';
      const group = el.closest('.form-group');
      if (group){
        const helper = group.querySelector('#montoPago-helper') || group.querySelector('[data-monto-error]');
        if (helper){ helper.style.color = '#666'; }
      }
    });
  }
  function togglePagoHelper(){
    const selected = body.querySelector('input[name="metodoPago"]:checked')?.value;
    const montoSelect = body.querySelector('#montoPago');
    const montoOtro = body.querySelector('#montoPagoOtro');
    const montoGroupSelect = montoSelect ? montoSelect.closest('.form-group') : null;
    const montoGroupOtro = montoOtro ? montoOtro.closest('.form-group') : null;
    if (selected === 'transferencia'){
      // Solo mostrar aviso neutral, sin botón
      if (waHelper) waHelper.style.display = '';
      if (tarjetaHelper) tarjetaHelper.style.display = 'none';
      
      if (montoSelect) montoSelect.required = true;
      if (montoGroupSelect) montoGroupSelect.style.display = '';
      if (montoGroupOtro) montoGroupOtro.style.display = (montoSelect?.value === 'OTRO') ? '' : 'none';
    } else {
      // Tarjeta (AZUL): también permitir especificar abono como en transferencia
      if (waHelper) waHelper.style.display = 'none';
      if (tarjetaHelper) tarjetaHelper.style.display = '';

      // Mostrar campos de monto y requerir un valor válido
      if (montoSelect) montoSelect.required = true;
      if (montoGroupSelect) montoGroupSelect.style.display = '';
      if (montoGroupOtro) montoGroupOtro.style.display = (montoSelect?.value === 'OTRO') ? '' : 'none';
    }
    // Al cambiar método, limpiar estilos de error
    clearMontoErrorVisuals();
  }
  pagoRadios.forEach(r=> r.addEventListener('change', togglePagoHelper));
  togglePagoHelper();
  
  // ====== Actualizar helper del monto con la moneda del evento ======
  const montoHelper = body.querySelector('#montoPago-helper');
  if (montoHelper) {
    const monedaLabel = precioMoneda === 'USD' ? 'USD' : 'RD';
    montoHelper.textContent = `Ingresa tu abono en ${monedaLabel}.`;
  }
  
  // ====== Manejar campos de iglesia ======
  const otraIglesiaRadio = body.querySelector('#otraIglesiaRadio');
  const otraIglesiaInput = body.querySelector('#otraIglesia');
  const iglesiaRadios = body.querySelectorAll('input[name="iglesia"]');
  
  if (otraIglesiaRadio && otraIglesiaInput) {
    // Habilitar/deshabilitar campo de otra iglesia
    iglesiaRadios.forEach(radio => {
      radio.addEventListener('change', function() {
        const esOtra = this.value === 'Otra';
        otraIglesiaInput.disabled = !esOtra;
        otraIglesiaInput.required = esOtra;
        if (esOtra) otraIglesiaInput.focus();
      });
    });
  }

  // ====== Alinear fechas de entrada/salida con el evento ======
  const fechaStartRaw = __canonicalRange.start || dGet(evento.fecha_inicio) || dGet(evento.fechaInicio) || dGet(evento.fecha) || '';
  const horaStartRaw = dGet(evento.hora_inicio) || dGet(evento.horaInicio) || '';
  const fechaEndRaw = __canonicalRange.end || dGet(evento.fecha_fin) || dGet(evento.fechaFin) || dGet(evento.fechaSalida) || fechaStartRaw || '';
  const horaEndRaw = dGet(evento.hora_fin) || dGet(evento.horaFin) || '';
  function toDateOnly(v){
    try{
      if (!v) return '';
      const s = String(v).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const d = new Date(s);
      if (isNaN(d)) return '';
      return d.toISOString().slice(0, 10);
    } catch(_){return '';} 
  }
  function parseDateOnlyLocal(iso){
    try{
      const s = String(iso||'').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(s);
        return isNaN(d) ? null : d;
      }
      const [y,m,d] = s.split('-').map(Number);
      const dt = new Date(y, (m||1)-1, d||1, 12, 0, 0);
      return isNaN(dt) ? null : dt;
    } catch(_){ return null; }
  }
  let eventStartDate = toDateOnly(fechaStartRaw) || __rangeText.start;
  let eventEndDate = toDateOnly(fechaEndRaw) || __rangeText.end;
  if (!eventEndDate) eventEndDate = eventStartDate;
  try{
    const ds = parseDateOnlyLocal(eventStartDate);
    const de = parseDateOnlyLocal(eventEndDate);
    if (ds && de && de < ds){ const tmp = eventStartDate; eventStartDate = eventEndDate; eventEndDate = tmp; }
  } catch(_){ }
  const fechaEntradaEl = body.querySelector('#fechaEntrada');
  const fechaSalidaEl = body.querySelector('#fechaSalida');
  // Helper UI
  function appendHelper(el, msg){
    if (!el) return;
    const group = el.closest('.form-group');
    if (!group) return;
    let small = group.querySelector('[data-helper]');
    if (!small){
      small = document.createElement('small');
      small.setAttribute('data-helper','');
      small.style.display='block';
      small.style.marginTop='6px';
      small.style.color='556';
      group.appendChild(small);
    }
    small.textContent = msg;
  }
  // Obtener configuración de días de entrada/salida desde el evento
  const diasAntesEntrada = parseInt(dGet(evento.dias_antes_entrada) || '0');
  const diasDespuesSalida = parseInt(dGet(evento.dias_despues_salida) || '0');

  if (fechaEntradaEl && eventStartDate){
    try{
      // Calcular fecha mínima de entrada (días antes del evento)
      const startDate = parseDateOnlyLocal(eventStartDate);
      const minEntradaDate = new Date(startDate);
      minEntradaDate.setDate(minEntradaDate.getDate() - diasAntesEntrada);
      const minEntradaStr = minEntradaDate.toISOString().split('T')[0];
      
      if (!fechaEntradaEl.value) fechaEntradaEl.value = eventStartDate;
      
      if (diasAntesEntrada > 0) {
        // Permitir seleccionar fechas anteriores
        fechaEntradaEl.min = minEntradaStr;
        fechaEntradaEl.max = eventStartDate;
        fechaEntradaEl.readOnly = false;
      } else {
        // Bloquear cambios: min=max=fecha de inicio y readOnly
        fechaEntradaEl.min = eventStartDate;
        fechaEntradaEl.max = eventStartDate;
        fechaEntradaEl.readOnly = true;
        const enforceEntrada = ()=>{ if (fechaEntradaEl.value !== eventStartDate) fechaEntradaEl.value = eventStartDate; };
        fechaEntradaEl.addEventListener('input', enforceEntrada);
        fechaEntradaEl.addEventListener('change', enforceEntrada);
      }
    }catch(_){ }
    // Sin mensaje para fecha de entrada
  }
  if (fechaSalidaEl && eventEndDate){
    try{
      // Fecha mínima de salida: desde el mismo día que INICIA el evento
      // Fecha máxima de salida: días después del FIN del evento
      const endDate = parseDateOnlyLocal(eventEndDate);
      const maxSalidaDate = new Date(endDate);
      maxSalidaDate.setDate(maxSalidaDate.getDate() + diasDespuesSalida);
      const maxSalidaStr = maxSalidaDate.toISOString().split('T')[0];
      
      // Permitir salir desde el mismo día que inicia el evento
      fechaSalidaEl.min = eventStartDate;
      if (diasDespuesSalida > 0) {
        fechaSalidaEl.max = maxSalidaStr;
      }
    }catch(_){ }
    
    // Mensaje de salida - siempre el mismo (sin mencionar días)
    const msgOut = `Por favor, indique su fecha de salida si desea agregar noches adicionales.\nPara confirmar el precio de las noches extra, contáctenos:\n📧 info@buenohotel.com\n📱 WhatsApp: +1 809 303 4991`;
    
    // Add yellow background to the message
    const helper = document.createElement('div');
    helper.style.background = '#fff7e6';
    helper.style.border = '1px solid #ffe0a3';
    helper.style.borderRadius = '8px';
    helper.style.padding = '8px 10px';
    helper.style.color = '#5c3d00';
    helper.style.marginTop = '6px';
    helper.style.fontWeight = '500';
    helper.style.whiteSpace = 'pre-line';
    helper.textContent = msgOut;
    
    // Remove any existing messages
    const group = fechaSalidaEl?.closest('.form-group');
    if (group) {
      // Remove any existing helper messages
      const existingHelpers = group.querySelectorAll('[data-helper], .alert-message');
      existingHelpers.forEach(el => el.remove());
      
      // Add the new message
      helper.setAttribute('data-helper', 'true');
      group.appendChild(helper);
    }
  }
  let stayingLonger = false;

    // Eliminar cualquier manejador de eventos existente
    if (fechaSalidaEl) {
      const newFechaSalidaEl = fechaSalidaEl.cloneNode(true);
      fechaSalidaEl.parentNode.replaceChild(newFechaSalidaEl, fechaSalidaEl);
      
      // Actualizar la referencia al elemento clonado
      const updatedFechaSalidaEl = body.querySelector('#fechaSalida');
      if (updatedFechaSalidaEl && eventEndDate && !updatedFechaSalidaEl.value) {
        updatedFechaSalidaEl.value = eventEndDate;
      }
      
      // Mostrar mensaje solo cuando se seleccione una fecha posterior a la de finalización
      updatedFechaSalidaEl.addEventListener('change', function() {
        const selectedDate = parseDateOnlyLocal(this.value);
        const endDate = parseDateOnlyLocal(eventEndDate);
        if (!selectedDate || !endDate) return;
        
        // Resetear a la fecha de finalización si se selecciona una fecha anterior
        if (selectedDate < endDate) {
          this.value = eventEndDate;
          return;
        }
        
        // Solo mostrar mensaje si la fecha es posterior a la de finalización
        if (selectedDate > endDate) {
          // Mostrar el mensaje con fondo amarillo
          const helper = document.createElement('div');
          helper.style.background = '#fff7e6';
          helper.style.border = '1px solid #ffe0a3';
          helper.style.borderRadius = '8px';
          helper.style.padding = '8px 10px';
          helper.style.color = '#5c3d00';
          helper.style.marginTop = '6px';
          helper.style.fontWeight = '500';
          
          // Parse the date safely and add one day
          let endDateObj;
          try {
            // Try parsing from ISO string first (YYYY-MM-DD)
            endDateObj = parseDateOnlyLocal(eventEndDate);
            if (!endDateObj) throw new Error('invalid endDate');
            
            // Format the date in Spanish
            const options = { year: 'numeric', month: 'long', day: 'numeric' };
            const endNice = endDateObj.toLocaleDateString('es-DO', options);
            const whenTxt = horaEndRaw ? `${endNice} · ${horaEndRaw}` : endNice;
            
            helper.textContent = `Has seleccionado una salida posterior a la finalización del evento (${whenTxt}). Si desean durar más tiempo, el precio puede variar y deben consultarlo al WhatsApp ${window.WHATSAPP_FORMATTED || '+1(809) 303-4991'}.`;
          } catch (e) {
            // Fallback to just showing the raw date if parsing fails
            helper.textContent = `Has seleccionado una salida posterior a la finalización del evento. Si desean durar más tiempo, el precio puede variar y deben consultarlo al WhatsApp ${window.WHATSAPP_FORMATTED || '+1(809) 303-4991'}.`;
          }
          
          // Eliminar mensajes anteriores
          const group = updatedFechaSalidaEl.closest('.form-group');
          if (group) {
            const existingHelpers = group.querySelectorAll('[data-helper]');
            existingHelpers.forEach(el => el.remove());
            
            // Agregar el nuevo mensaje
            helper.setAttribute('data-helper', 'true');
            group.appendChild(helper);
          }
        } else {
          // Si la fecha es válida (no posterior), eliminar cualquier mensaje existente
          const group = updatedFechaSalidaEl.closest('.form-group');
          if (group) {
            const existingHelpers = group.querySelectorAll('[data-helper]');
            existingHelpers.forEach(el => el.remove());
          }
        }
      });
      
      // Forzar validación inicial
      updatedFechaSalidaEl.dispatchEvent(new Event('change'));
    }
  // Almacenar valor numérico real en data attribute
  function getMontoRealValue(el){
    return el ? (el.dataset.montoReal || el.value.replace(/[^0-9]/g, '') || '') : '';
  }
  // Limpiar input dejando solo números mientras escribe
  function cleanMontoInput(el){
    if (!el) return;
    const raw = el.value.replace(/[^0-9]/g, '');
    el.value = raw;
    el.dataset.montoReal = raw;
  }
  // Formatear monto con formato según la moneda del evento
  function formatMontoDisplay(el){
    if (!el) return;
    const raw = el.dataset.montoReal || el.value.replace(/[^0-9]/g, '');
    if (!raw) { el.value = ''; return; }
    const num = parseInt(raw, 10);
    if (isNaN(num) || num === 0) { el.value = ''; el.dataset.montoReal = ''; return; }
    el.dataset.montoReal = raw;
    // Usar la moneda del evento
    const prefix = precioMoneda === 'USD' ? '$' : 'RD$';
    el.value = prefix + num.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // Al enfocar, mostrar solo el número para editar
  function unfocusMontoDisplay(el){
    if (!el) return;
    const raw = el.dataset.montoReal || el.value.replace(/[^0-9]/g, '');
    el.value = raw;
  }
  // Bloquear entrada de caracteres no numéricos
  function blockNonNumeric(e){
    // Permitir: Backspace, Delete, Tab, Escape, Enter, flechas
    if ([8, 9, 27, 13, 46, 37, 38, 39, 40].includes(e.keyCode)) return;
    // Permitir Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    if ((e.ctrlKey || e.metaKey) && [65, 67, 86, 88].includes(e.keyCode)) return;
    // Bloquear si no es número
    if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
      e.preventDefault();
    }
  }
  // Si existe un campo de monto, configurar eventos
  const montoInputEl = body.querySelector('#montoPago');
  if (montoInputEl){
    montoInputEl.addEventListener('keydown', blockNonNumeric);
    montoInputEl.addEventListener('input', ()=>{ cleanMontoInput(montoInputEl); togglePagoHelper(); if (Number(getEffectiveMonto()) >= 1500) clearMontoErrorVisuals(); });
    montoInputEl.addEventListener('focus', ()=>{ unfocusMontoDisplay(montoInputEl); });
    montoInputEl.addEventListener('blur', ()=>{ formatMontoDisplay(montoInputEl); });
    montoInputEl.addEventListener('change', ()=>{ togglePagoHelper(); if (Number(getEffectiveMonto()) >= 1500) clearMontoErrorVisuals(); });
  }
  const montoOtroEl = body.querySelector('#montoPagoOtro');
  if (montoOtroEl){
    montoOtroEl.addEventListener('keydown', blockNonNumeric);
    montoOtroEl.addEventListener('input', ()=>{ cleanMontoInput(montoOtroEl); togglePagoHelper(); if (Number(getEffectiveMonto()) >= 1500) clearMontoErrorVisuals(); });
    montoOtroEl.addEventListener('focus', ()=>{ unfocusMontoDisplay(montoOtroEl); });
    montoOtroEl.addEventListener('blur', ()=>{ formatMontoDisplay(montoOtroEl); });
  }
  const reevaluate = ()=>{
    const termsOk = termField ? termField.checked : true;
    // No bloquear el click si faltan campos arriba: el submit debe poder
    // mostrar el error. Solo exigir términos (están junto al botón).
    submitBtn.disabled = !termsOk;
  };
  if (termField){ termField.addEventListener('change', reevaluate); }
  form.addEventListener('input', reevaluate);
  setTimeout(reevaluate, 0);
  form.addEventListener('submit', async function(ev){
    ev.preventDefault();
    if (!form.checkValidity()) {
      try { form.reportValidity(); } catch (_) {}
      const invalid = form.querySelector(':invalid');
      if (invalid) {
        try {
          invalid.focus();
          invalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (_) {}
      }
      if (window.showToast) {
        window.showToast({
          title: 'Faltan datos',
          message: 'Revisa los campos marcados (fechas, monto u otros requeridos) para confirmar el registro.',
          type: 'warning'
        });
      }
      return;
    }

    // Validación obligatoria de iglesia (solo si el evento lo requiere)
    if (showChurchFields) {
      const selected = body.querySelector('input[name="iglesia"]:checked');
      const val = selected ? String(selected.value || '').trim() : '';
      if (!val) {
        if (window.showToast) window.showToast({ title: 'Falta información', message: 'Selecciona tu iglesia para continuar.', type: 'warning' });
        try {
          const firstRadio = body.querySelector('input[name="iglesia"]');
          if (firstRadio){ firstRadio.focus(); firstRadio.scrollIntoView({behavior:'smooth', block:'center'}); }
        } catch(_){ }
        return;
      }
      if (val === 'Otra') {
        const otraTxt = (body.querySelector('#otraIglesia')?.value || '').toString().trim();
        if (!otraTxt) {
          if (window.showToast) window.showToast({ title: 'Falta información', message: 'Escribe el nombre de tu iglesia para continuar.', type: 'warning' });
          try {
            const otraI = body.querySelector('#otraIglesia');
            if (otraI){ otraI.focus(); otraI.scrollIntoView({behavior:'smooth', block:'center'}); }
          } catch(_){ }
          return;
        }
      }
    }

    const fd = new FormData(form);
    const adicionales = {};
    for (const [k,v] of fd.entries()){ adicionales[k]=v; }
    // Checkbox true/false (solo campos editables; los fijos se envían en hidden input)
    (!req.habilitar_campos_adicionales ? [] : (req.campos_adicionales||[])).forEach(c=>{
      if (!c || c.type!=='checkbox') return;
      if (Object.prototype.hasOwnProperty.call(c, 'fixed_value')) return;
      adicionales[c.id] = !!body.querySelector(`#${c.id}:checked`);
    });
    // Normalizar iglesia: si se eligió 'Otra', usar el texto + líder/contacto en un único campo
    try {
      if (adicionales.iglesia === 'Otra'){
        const otraTxt = (adicionales.otraIglesia || body.querySelector('#otraIglesia')?.value || '').toString().trim();
        const lider = (body.querySelector('#otraIglesiaLider')?.value || '').toString().trim();
        const contacto = (body.querySelector('#otraIglesiaContacto')?.value || '').toString().trim();
        let merged = otraTxt;
        const parts = [];
        if (lider) parts.push(`Líder: ${lider}`);
        if (contacto) parts.push(`Contacto: ${contacto}`);
        if (parts.length) merged = `${otraTxt} (${parts.join('; ')})`;
        if (merged) adicionales.iglesia = merged;
      }
    } catch(_){}

    let fiscalWhatsSuffix = '';
    if (permiteOpcionFiscal && body.querySelector('#solicitaComprobanteFiscal:checked')) {
      const razonCliente = (body.querySelector('#razonSocialCliente')?.value || '').trim();
      const rncDigits = (body.querySelector('#rncComprobanteFiscal')?.value || '').replace(/\D/g, '');
      const emailFiscal = (body.querySelector('#emailFiscalCliente')?.value || '').trim();
      const telFiscal = (body.querySelector('#telefonoFiscalCliente')?.value || '').trim();
      const dirFiscal = (body.querySelector('#direccionFiscalCliente')?.value || '').trim();
      const focusFiscal = (sel) => {
        try {
          const el = body.querySelector(sel);
          if (el) {
            el.focus();
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } catch (_) {}
      };
      if (rncDigits.length < 8 || rncDigits.length > 11) {
        if (window.showToast) {
          window.showToast({
            title: 'RNC de la empresa',
            message: 'Ingresa el RNC de la empresa: entre 8 y 11 dígitos (puedes omitir guiones).',
            type: 'warning'
          });
        }
        focusFiscal('#rncComprobanteFiscal');
        return;
      }
      if (!razonCliente) {
        if (window.showToast) {
          window.showToast({
            title: 'Nombre de la empresa',
            message: 'Indica el nombre de la empresa (razón social) para la factura. No uses el nombre de la persona.',
            type: 'warning'
          });
        }
        focusFiscal('#razonSocialCliente');
        return;
      }
      if (!emailFiscal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailFiscal)) {
        if (window.showToast) {
          window.showToast({
            title: 'Correo de la empresa',
            message: 'Indica el correo de facturación de la empresa.',
            type: 'warning'
          });
        }
        focusFiscal('#emailFiscalCliente');
        return;
      }
      if (!telFiscal) {
        if (window.showToast) {
          window.showToast({
            title: 'Teléfono de la empresa',
            message: 'Indica el teléfono (o teléfonos) de la empresa.',
            type: 'warning'
          });
        }
        focusFiscal('#telefonoFiscalCliente');
        return;
      }
      if (!dirFiscal) {
        if (window.showToast) {
          window.showToast({
            title: 'Dirección de la empresa',
            message: 'Indica la dirección de la empresa. Si es muy larga, puedes abreviarla.',
            type: 'warning'
          });
        }
        focusFiscal('#direccionFiscalCliente');
        return;
      }
      fiscalWhatsSuffix = `\n\nSolicitud comprobante fiscal: Sí\nEmpresa: ${razonCliente}\nRNC: ${rncDigits}\nCorreo empresa: ${emailFiscal}\nTel. empresa: ${telFiscal}\nDirección: ${dirFiscal}`;
      adicionales.solicitaComprobanteFiscal = true;
      adicionales.rncComprobanteFiscal = rncDigits;
      adicionales.rncCliente = rncDigits;
      adicionales.razonSocialCliente = razonCliente;
      adicionales.emailFiscalCliente = emailFiscal;
      adicionales.telefonoFiscalCliente = telFiscal;
      adicionales.direccionFiscalCliente = dirFiscal;
    }

    const metodoPago = body.querySelector('input[name="metodoPago"]:checked')?.value || 'tarjeta';

    // Validaciones mínimas en front: teléfono requerido para el endpoint
    // Buscar teléfono en userData O en el formulario (registro sin login)
    const telefonoFormEl = body.querySelector('#sinlogin_telefono');
    const telefono = userData?.telefono || userData?.phone || (telefonoFormEl?.value?.trim()) || '';
    // Solo validar teléfono si el usuario está logueado (no en registro sin login)
    if (!REGISTRO_SIN_LOGIN && !telefono) {
      if (window.showToast) window.showToast({ title: 'Falta información', message: 'Completa tu teléfono en tu perfil para continuar.', type: 'warning' });
      return;
    }

    // Church fields have been moved to event-specific forms
    // and are no longer validated here

    // Construir payload para backend
    // Calcular precio total real (precio predefinido según huéspedes + tours seleccionados)
    const huespedesItemsCount = (body.querySelectorAll('.huesped-item') || []).length || 1;
    const precioBaseHuespedes = getPrecioPorCantidad(huespedesItemsCount);
    
    // Calcular total de tours seleccionados
    let toursTotalCalc = 0;
    const tourItemsCalc = body.querySelectorAll('.tour-item') || [];
    tourItemsCalc.forEach((item, idx) => {
      const checkbox = item.querySelector(`input[name="tour_${idx}"]`);
      const cantidadInput = item.querySelector(`input[name="tour_${idx}_cantidad"]`);
      if (checkbox?.checked) {
        const precio = parseFloat(checkbox.value) || 0;
        const cantidad = parseInt(cantidadInput?.value) || 1;
        toursTotalCalc += precio * cantidad;
      }
    });
    
    // Precio total calculado = precio base (según huéspedes) + tours
    const precioTotalCalculado = precioBaseHuespedes + toursTotalCalc;
    const precioTotal = Number(dGet(evento?.precio_por_persona) || 0);
    
    let selectedMontoVal = (function(){
      const sel = adicionales.montoPago;
      if (String(sel) === 'OTRO'){
        const otro = adicionales.montoPagoOtro || 0;
        return otro ? parseMontoInput(otro) : '';
      }
      if (sel != null && sel !== '') return parseMontoInput(sel);
      return NaN; // sin campo
    })();
    // Si no hay campo de monto y el método es tarjeta, usar precio total calculado
    if (metodoPago === 'tarjeta' && (isNaN(selectedMontoVal) || selectedMontoVal <= 0)){
      selectedMontoVal = precioTotalCalculado || precioTotal || 0;
    }
    
    // Determinar monto mínimo: usar precio calculado si "usar precio del evento como mínimo" está habilitado
    const abonoMinimoConfig = evento?.abono_minimo || {};
    const usarPrecioComoMinimo = abonoMinimoConfig?.usar_precio_evento === true;
    let montoMinimoVal;
    let montoMinimoTxt;
    if (usarPrecioComoMinimo && precioTotalCalculado > 0) {
      // Usar el precio total calculado (precio predefinido + tours) como mínimo
      montoMinimoVal = precioTotalCalculado;
      montoMinimoTxt = formatCurrency(precioTotalCalculado, precioMoneda);
    } else if (abonoMinimoConfig?.monto > 0) {
      // Usar monto manual configurado
      montoMinimoVal = abonoMinimoConfig.monto;
      montoMinimoTxt = formatCurrency(abonoMinimoConfig.monto, abonoMinimoConfig.moneda || precioMoneda);
    } else {
      // Fallback: mínimo por defecto según moneda
      montoMinimoVal = precioMoneda === 'USD' ? 25 : 1500;
      montoMinimoTxt = precioMoneda === 'USD' ? '$25.00' : 'RD$1,500.00';
    }
    
    // Validar que el monto no exceda el precio total calculado
    const montoMaximoVal = precioTotalCalculado > 0 ? precioTotalCalculado : Number.MAX_SAFE_INTEGER;
    if (selectedMontoVal > montoMaximoVal) {
      const isOtro = String(adicionales.montoPago) === 'OTRO';
      const montoEl = isOtro ? (body.querySelector('#montoPagoOtro')) : (body.querySelector('#montoPago'));
      const maxTxt = formatCurrency(montoMaximoVal, precioMoneda);
      showMontoError(montoEl, `El monto no puede exceder ${maxTxt}.`);
      if (window.showToast) window.showToast({ title:'Monto excedido', message:`El monto máximo es ${maxTxt} según tu registro.`, type:'warning' });
      if (montoEl){ try{ montoEl.focus(); montoEl.scrollIntoView({behavior:'smooth', block:'center'}); }catch(_){ } }
      submitBtn.disabled = false; submitBtn.textContent = 'Confirmar Registro';
      return;
    }
    if (metodoPago === 'transferencia'){
      // Transferencia requiere abono mínimo
      if (isNaN(selectedMontoVal) || selectedMontoVal < montoMinimoVal){
        const isOtro = String(adicionales.montoPago) === 'OTRO';
        const montoEl = isOtro ? (body.querySelector('#montoPagoOtro')) : (body.querySelector('#montoPago'));
        showMontoError(montoEl, `El abono mínimo es ${montoMinimoTxt}.`);
        if (window.showToast) window.showToast({ title:'Monto insuficiente', message:`El abono mínimo es ${montoMinimoTxt} para transferencias.`, type:'warning' });
        if (montoEl){ try{ montoEl.focus(); montoEl.scrollIntoView({behavior:'smooth', block:'center'}); }catch(_){ } }
        submitBtn.disabled = false; submitBtn.textContent = 'Confirmar Registro';
        return;
      }
    } else {
      // Tarjeta (AZUL): exigir abono mínimo
      if (isNaN(selectedMontoVal) || selectedMontoVal < montoMinimoVal){
        const isOtro = String(adicionales.montoPago) === 'OTRO';
        const montoEl = isOtro ? (body.querySelector('#montoPagoOtro')) : (body.querySelector('#montoPago'));
        showMontoError(montoEl, `El abono mínimo es ${montoMinimoTxt}.`);
        if (window.showToast) window.showToast({ title:'Monto insuficiente', message:`El abono mínimo es ${montoMinimoTxt} para pagos con tarjeta.`, type:'warning' });
        if (montoEl){ try{ montoEl.focus(); montoEl.scrollIntoView({behavior:'smooth', block:'center'}); }catch(_){ } }
        submitBtn.disabled = false; submitBtn.textContent = 'Confirmar Registro';
        return;
      }
    }

    const jwtSub = getJwtSub();
    const eventoId = dGet(evento.id) || null;
    if (DEBUG_REG) { try { console.debug('[Registrations] Using IDs:', { eventoId, usuarioId: jwtSub || (userData?.id||userData?.userId||null) }); } catch(_){}}

    // Obtener datos de registro sin login si aplica
    const sinLoginData = {};
    if (REGISTRO_SIN_LOGIN) {
      ['nombre', 'apellido', 'email', 'telefono', 'documento', 'fechaNacimiento', 'paisCiudad'].forEach(campo => {
        const el = body.querySelector(`#sinlogin_${campo}`);
        if (el && el.value) sinLoginData[campo] = el.value.trim();
      });
    }
    // Construir el payload básico
    delete adicionales.montoPago;
    delete adicionales.montoPagoOtro;
    const payload = {
      // Datos básicos
      eventoId: dGet(evento.id) || dGet(evento.eventoId) || '',
      nombre: REGISTRO_SIN_LOGIN ? (sinLoginData.nombre || '') : (userData?.nombre || userData?.name || ''),
      apellido: REGISTRO_SIN_LOGIN ? (sinLoginData.apellido || '') : (userData?.apellido || userData?.lastName || ''),
      email: REGISTRO_SIN_LOGIN ? (sinLoginData.email || '') : (userData?.email || ''),
      telefono: REGISTRO_SIN_LOGIN ? (sinLoginData.telefono || telefono) : telefono,
      // Datos adicionales de registro sin login
      ...(REGISTRO_SIN_LOGIN ? {
        registroSinLogin: true,
        documento: sinLoginData.documento || '',
        fechaNacimiento: sinLoginData.fechaNacimiento || '',
        paisCiudad: sinLoginData.paisCiudad || ''
      } : {}),
      // Pago y aceptación
      montoPago: selectedMontoVal,
      metodoPago: metodoPago,
      monedaEvento: precioMoneda,
      precioTotal: (precioTotalCalculado > 0 ? precioTotalCalculado : (precioTotal > 0 ? precioTotal : undefined)),
      aceptaTerminos: (adicionales.aceptaTerminos === true || adicionales.aceptaTerminos === 'on' || adicionales.aceptaTerminos === 'true'),
      // Datos adicionales del formulario
      ...adicionales,
      // Calcular edad si se proporcionó fecha de nacimiento
      ...(adicionales.fechaNacimiento && { 
        edad: (() => {
          const fn = new Date(adicionales.fechaNacimiento);
          if (isNaN(fn)) return '';
          const hoy = new Date();
          let e = hoy.getFullYear() - fn.getFullYear();
          const m = hoy.getMonth() - fn.getMonth();
          if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) e--;
          return e;
        })()
      }),
      fechaEntrada: adicionales.fechaEntrada || eventStartDate || __eventStartDate || '',
      fechaSalida: adicionales.fechaSalida || '',
      observaciones: '',
      // Si es modo Abono y se está actualizando iglesia, incluir registroId para update
      ...(ABONO_ONLY && registroMissingChurch && registroIdForUpdate ? { 
        registroId: registroIdForUpdate,
        updateIglesia: true 
      } : {})
    };

    // Si es un evento que requiere iglesia, validar que se haya proporcionado
    if (showChurchFields && !payload.iglesia) {
      throw new Error('Se requiere seleccionar una iglesia para este evento');
    }
    // Validación dinámica para monto OTRO si corresponde
    if (metodoPago === 'transferencia' && String(adicionales.montoPago) === 'OTRO'){
      const minVal = 1500; // mínimo fijo RD$1,500
      const maxVal = precioTotal || Number.MAX_SAFE_INTEGER;
      if (!(selectedMontoVal >= minVal && selectedMontoVal <= maxVal)){
        throw new Error(`El abono debe ser al menos ${formatCurrencyDOP(minVal)}${isFinite(maxVal)?` y no mayor que ${formatCurrencyDOP(maxVal)}`:''}.`);
      }
    }

    // UX: deshabilitar botón mientras enviamos
    const prevText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';
    try {
      const token = localStorage.getItem('buenohotel_auth_token');
      const API_BASE = (window.getAuthApiBase ? window.getAuthApiBase() : '');
      const url = `${API_BASE}/api/registrations`;
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };
      if (DEBUG_REG) {
        try { console.debug('[Registrations] POST ->', { url, headers, payload }); } catch(_){}
      }
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      if (DEBUG_REG) {
        try { console.debug('[Registrations] HTTP status:', res.status, res.statusText); } catch(_){}
      }
      let json = {};
      try { json = await res.json(); }
      catch(_jsonErr){
        // Si no es JSON, intenta texto para ver el error del servidor
        try {
          const text = await res.text();
          if (DEBUG_REG) console.debug('[Registrations] Non-JSON response body:', text);
          json = { message: text };
        } catch(_) { json = {}; }
      }
      if (!res.ok) {
        const msg = json?.errors?.map(e=>e.message).join(' | ') || json?.message || 'No se pudo completar el registro';
        const composed = `(${res.status}) ${msg}`;
        if (DEBUG_REG) { try { console.debug('[Registrations] Error payload:', json); } catch(_){} }
        throw new Error(composed);
      }
      // Invalidar cache para que la próxima vez se obtengan datos actualizados (incluyendo iglesia)
      invalidateMyRegistrosCache();

      const registroIdCreado = String(
        json?.data?.registroId || json?.data?.id || json?.registroId || json?.id || ''
      ).trim();
      
      if (metodoPago === 'tarjeta') {
        // Tarjeta (AZUL) vía Ecommerce: construir URL /orden centralizada y redirigir
        const ecommerceBase = 'https://ecommerce.buenohotel.com.do/orden';
        // EventName
        const eventName = String(dGet(evento?.nombre)||'Evento');
        // Imagen representativa (primera)
        const imgsArr = (Array.isArray(evento?.imagenes)? evento.imagenes: (dGet(evento?.imagenes)||[]))
          .map(x=> typeof x==='string'? x : (x && x.S? x.S: ''))
          .filter(Boolean);
        function toAbsImg(u){
          try { const s=String(u||''); if (!s) return ''; if (/^https?:\/\//i.test(s)) return s; return new URL(s, 'https://eventos.buenohotel.com.do/').toString(); } catch(_){ return ''; }
        }
        // Importante: NO pre-encode; URLSearchParams hará el encoding una sola vez
        const hotelImage = toAbsImg(imgsArr[0] || '');
        // Fecha del evento (checkIn)
        const checkInISO = (eventStartDate || __eventStartDate || '').split('T')[0];
        // Cantidad de personas: contar huéspedes del formulario (incluye titular + adicionales)
        const huespedesItems = body.querySelectorAll('.huesped-item') || [];
        const AdultsQty = huespedesItems.length > 0 ? huespedesItems.length : (Number(adicionales.cantidadPersonas||1) || 1);
        // Obtener tasa de cambio
        const FX_KEY = 'bh_fx_rate_usd';
        let FX = 61; // default
        try { const st = localStorage.getItem(FX_KEY); if (st) FX = Number(st) || FX; } catch(_){ }
        
        // Calcular monto en DOP para la pasarela (siempre se envía en DOP)
        // Si el evento está en USD: multiplicar por tasa de cambio
        // Si el evento está en DOP: usar el monto tal cual
        const montoIngresado = Number(selectedMontoVal||0);
        let totalDOP;
        let totalUSD;
        if (precioMoneda === 'USD') {
          // Evento en USD: el usuario ingresó USD, convertir a DOP para la pasarela
          totalUSD = montoIngresado;
          totalDOP = Math.round(montoIngresado * FX * 100) / 100;
        } else {
          // Evento en DOP: el usuario ingresó DOP, usar tal cual
          totalDOP = montoIngresado;
          totalUSD = FX > 0 ? Math.round((montoIngresado / FX) * 100) / 100 : montoIngresado;
        }
        // Ecommerce recibe TotalPrice en USD pero la pasarela AZUL cobra en DOP
        // Enviamos ambos valores para que Ecommerce use el correcto
        const TotalPrice = totalUSD;
        const Currency = 'USD';
        // OrderNumber: usar el codigo corto (si existe) y NO el UUID completo
        const shortCode = String(
          json?.data?.codigo || json?.codigo || json?.data?.code || ''
        ).trim();
        const orderNumber = shortCode || String(
          json?.data?.registroId || json?.data?.id || json?.id || json?.registroId || ''
        );
        // Fallback si falta: usar fecha+usuario para no romper
        const OrderNumber = encodeURIComponent(orderNumber || `${Date.now()}-${payload.usuarioId||'user'}`);
        const params = new URLSearchParams();
        // Compatibilidad: mientras Ecommerce migra a EventName, mandamos ambos
        params.set('EventName', eventName);
        params.set('TourName', eventName);
        params.set('Currency', Currency);
        if (hotelImage) params.set('hotelImage', hotelImage);
        if (checkInISO) params.set('checkIn', checkInISO);
        params.set('AdultsQty', String(AdultsQty));
        params.set('TotalPrice', String(TotalPrice));
        // Abono explícito enviado a Ecommerce (DOP y USD)
        // AbonoDOP siempre en pesos dominicanos (convertido si el evento está en USD)
        params.set('AbonoDOP', String(totalDOP));
        params.set('AbonoUSD', String(totalUSD));
        params.set('OrderNumber', OrderNumber);
        // Identificador de registro para poder reconciliar en el retorno
        if (payload?.eventoId) params.set('eventoId', String(payload.eventoId));
        if (payload?.usuarioId) params.set('usuarioId', String(payload.usuarioId));
        const registroId = String(json?.data?.registroId || json?.id || json?.registroId || '');
        const registroIdForEcommerce = shortCode || registroId;
        if (registroIdForEcommerce) params.set('registroId', registroIdForEcommerce);
        // URLs de retorno/cancelación para confirmar/cancelar pago en Eventos
        const BASE_SITE = 'https://eventos.buenohotel.com.do/';
        const returnUrl = new URL('pago-resultado.html', BASE_SITE);
        const cancelUrl = new URL('pago-resultado.html', BASE_SITE);
        // Propaga datos mínimos para que la página de resultado los reenvíe a /api/pagos/azul/confirm
        if (registroId) returnUrl.searchParams.set('registroId', registroId);
        if (orderNumber) returnUrl.searchParams.set('orderNumber', orderNumber);
        returnUrl.searchParams.set('flow', 'success');
        if (registroId) cancelUrl.searchParams.set('registroId', registroId);
        if (orderNumber) cancelUrl.searchParams.set('orderNumber', orderNumber);
        cancelUrl.searchParams.set('flow', 'cancel');
        params.set('returnUrl', returnUrl.toString());
        params.set('cancelUrl', cancelUrl.toString());
        // Campos informativos opcionales
        const hotelName = String(dGet(evento?.lugar)||'');
        if (hotelName) params.set('hotelName', hotelName);
        const Location = '';
        if (Location) params.set('Location', Location);
        const redirectUrl = `${ecommerceBase}?${params.toString()}`;
        try { window.open(redirectUrl, '_blank', 'noopener'); } catch(_) { window.location.href = redirectUrl; }
        // Aviso en la misma página con acciones
        const whatsNumber = (window.WHATSAPP_LINK || 'https://wa.me/18093034991');
        const montoLineAzul = precioMoneda === 'USD'
          ? `Monto registro: ${formatCurrencyUSD(montoIngresado)} USD\nCobro pasarela (DOP): ${formatCurrencyDOP(totalDOP)}`
          : `Monto: ${formatCurrencyDOP(montoIngresado)} DOP\nReferencia USD (~): ${formatCurrencyUSD(totalUSD)}`;
        const whatsText = encodeURIComponent(
          `Hola, ya realicé el pago en la pasarela AZUL.\nEvento: ${eventName}\nOrden: ${orderNumber}\nFecha: ${checkInISO}\n${montoLineAzul}${fiscalWhatsSuffix}`
        );
        const whatsappUrl = `${whatsNumber}?text=${whatsText}`;
        body.innerHTML = `
          <div class="registro-section registro-alert">
            <h4 style="margin:0 0 8px;">Favor seguir los pasos en la pasarela de Azul</h4>
            <ol class="registro-list">
              <li>Se abrió una nueva pestaña con la pasarela de pago.</li>
              <li>Completa el pago y conserva el comprobante/factura.</li>
              <li>Regresa a esta ventana para finalizar.</li>
            </ol>
          </div>
          <div class="registro-section">
            <div class="form-actions">
              <button id="btn-ya-pague" class="btn-secondary">Ya pagué en la pasarela</button>
              <a id="btn-notificar-whatsapp" class="btn-primary" href="${whatsappUrl}" target="_blank" rel="noopener">Notificar por WhatsApp</a>
            </div>
          </div>
          ${snippetMisReservasFacturaHintHtml()}`;
        body.querySelector('#btn-ya-pague')?.addEventListener('click', ()=>{ try{ modal.remove(); } catch(_){ modal.style.display='none'; } });
        return; // mantenemos la página y el aviso
      } else if (metodoPago === 'transferencia') {
        // Abrir WhatsApp con datos del registro para enviar voucher
        const eventName = String(dGet(evento?.nombre)||'Evento');
        const registroId = String(
          json?.data?.registroId || json?.id || json?.registroId || ''
        );
        const codigo = String(json?.data?.codigo || '');
        const monto = Number(selectedMontoVal||0);
        const checkInISO = (eventStartDate || __eventStartDate || '').split('T')[0];
        const montoTxtTransfer = formatCurrency(monto, precioMoneda);
        const msg = `Hola, deseo enviar el comprobante de transferencia.\nEvento: ${eventName}\nRegistro: ${registroId}${codigo?`\nCódigo: ${codigo}`:''}\nFecha del evento: ${checkInISO}\nMonto abonado (${precioMoneda}): ${montoTxtTransfer}${fiscalWhatsSuffix}`;
        const whatsNumber = (window.WHATSAPP_LINK || 'https://wa.me/18093034991');
        const waUrl = `${whatsNumber}?text=${encodeURIComponent(msg)}`;
        try { window.open(waUrl, '_blank', 'noopener'); } catch(_) { window.location.href = waUrl; }
        // Mensaje de confirmación en el modal
        body.innerHTML = `
          <div class="registro-section registro-alert">
            <h4 style="margin:0 0 8px;">Abre WhatsApp y envíanos tu voucher</h4>
            <p style="margin:6px 0 14px;">Se abrió una pestaña de WhatsApp con los datos de tu registro. Adjunta el comprobante de la transferencia para procesar tu pago.</p>
            <div class="form-actions">
              <a class="btn-primary" href="${waUrl}" target="_blank" rel="noopener">Abrir WhatsApp nuevamente</a>
              <button id="btn-cerrar-transfer" class="btn-secondary">Cerrar</button>
            </div>
          </div>
          ${snippetMisReservasFacturaHintHtml()}`;
        body.querySelector('#btn-cerrar-transfer')?.addEventListener('click', ()=>{ try{ modal.remove(); } catch(_){ modal.style.display='none'; } });
        return;
      } else {
        if (registroIdCreado) {
          body.innerHTML = `
            <div class="registro-section registro-alert">
              <h4 style="margin:0 0 8px;">Registro enviado</h4>
              <p style="margin:6px 0 0;">Pronto nos pondremos en contacto contigo.</p>
            </div>
            ${snippetMisReservasFacturaHintHtml()}
            <div class="form-actions" style="margin-top:12px;">
              <button id="btn-cerrar-registro-ok" class="btn-secondary">Cerrar</button>
            </div>`;
          body.querySelector('#btn-cerrar-registro-ok')?.addEventListener('click', () => {
            try {
              modal.remove();
            } catch (_) {
              modal.style.display = 'none';
            }
          });
        } else {
          if (window.showToast) {
            window.showToast({
              title: 'Registro exitoso',
              message: 'Registro enviado correctamente. Pronto nos pondremos en contacto contigo.',
              type: 'success'
            });
          }
          modal.remove();
        }
      }
    } catch (err) {
      console.error('Error enviando registro:', err);
      if (window.showToast) window.showToast({ title: 'Error', message: String(err.message||err), type: 'error' });
      submitBtn.disabled = false;
      submitBtn.textContent = prevText;
    }
  });

  modal.style.display='flex';
}

function formatCurrencyDOP(num){
  if (isNaN(num)) return num;
  try{
    return new Intl.NumberFormat('es-DO', { style:'currency', currency:'DOP', maximumFractionDigits: 2 }).format(num);
  }catch(_){
    return `RD$${Number(num).toFixed(2)}`;
  }
}

function formatCurrencyUSD(num){
  if (isNaN(num)) return num;
  try{
    return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits: 2 }).format(num);
  }catch(_){
    return `US$${Number(num).toFixed(2)}`;
  }
}

function formatCurrency(num, moneda){
  if (moneda === 'USD') return formatCurrencyUSD(num);
  return formatCurrencyDOP(num);
}
