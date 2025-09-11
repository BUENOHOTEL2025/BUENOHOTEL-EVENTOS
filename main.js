async function cargarEventos() {
  // Cambia la ruta a tu bucket S3 si lo subes a producción
  const url = 'https://zp27hv7zkk.execute-api.us-east-1.amazonaws.com/prod/eventos'; // URL real de tu API Gateway
  const resp = await fetch(url);
  const data = await resp.json();
  // El body es un string JSON, así que hay que parsearlo
  const eventos = JSON.parse(data.body);
  console.log('EVENTOS:', eventos); // <-- Depuración
  const getTipo = ev => typeof ev.tipo === "string" ? ev.tipo : (ev.tipo && ev.tipo.S ? ev.tipo.S : "");
  // --- ORDENAR eventos proximos por fecha más próxima ---
  function extraerFecha(fechaTexto) {
    // 1. Rango con 'de' y coma: "23-25 de Junio, 2023"
    let match = fechaTexto.match(/(\d+)[\s\-]+(\d+)\s+de\s+([a-zA-ZñÑ]+),?\s*(\d{4})/i);
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
    const fechaA = extraerFecha(a.fecha || (a.fecha && a.fecha.S) || '');
    const fechaB = extraerFecha(b.fecha || (b.fecha && b.fecha.S) || '');
    return fechaA - fechaB;
  });
  let galeriaFiltrada = eventos.filter(ev => getTipo(ev) === 'galeria');
  galeriaFiltrada = galeriaFiltrada.sort((a, b) => {
    // Soporta tanto string como objeto tipo DynamoDB
    let fechaStrA = (a.fecha && typeof a.fecha === 'object' && a.fecha.S) ? a.fecha.S : (a.fecha || '');
    let fechaStrB = (b.fecha && typeof b.fecha === 'object' && b.fecha.S) ? b.fecha.S : (b.fecha || '');
    const fechaA = extraerFecha(fechaStrA);
    const fechaB = extraerFecha(fechaStrB);
    // Debug: muestra el año extraído
    console.log('Orden galeria:', {nombreA: a.nombre, fechaStrA, fechaA, nombreB: b.nombre, fechaStrB, fechaB});
    return fechaB - fechaA; // Descendente
  });
  const otros = eventos.filter(ev => getTipo(ev) === 'otros');
  eventosGlobal.proximos = proximos;
  eventosGlobal.galeria = galeriaFiltrada;
  eventosGlobal.otros = otros;
  console.log('GALERIA FILTRADA:', galeriaFiltrada);
  mostrarProximos(proximos); // Ya está ordenado por fecha más próxima
  mostrarGaleria(galeriaFiltrada);
  mostrarOtros(otros);
}

function mostrarProximos(eventos) {
  const cont = document.getElementById('proximos-container');
  cont.innerHTML = '';
  eventos.forEach((ev, idx) => {
    const imagenes = ev.imagenes || [];
    const imgSrc = (imagenes.length > 0 && imagenes[0]) ? imagenes[0] : 'assets/img/default-event.jpg';
    const hasReq = !!(ev.requerimientos || (ev.requerimientos && ev.requerimientos.M));
    cont.innerHTML += `
      <div class="event-card">
        <img src="${imgSrc}" alt="${ev.nombre || 'Evento BuenoHotel'}" ${imagenes.length === 0 ? 'class=\"default-event\"' : ''}>
        <div class="event-info">
          <h3>${ev.nombre}</h3>
          <p><strong>Tipo:</strong> ${ev.tipo || ''}</p>
          <p><strong>Invita:</strong> ${ev.invita || ''}</p>
          <p><strong>Lugar:</strong> ${ev.lugar}</p>
          <p><strong>Fecha:</strong> ${ev.fecha}</p>
          ${ev.info_extra ? `<p>${ev.info_extra}</p>` : ''}
          ${hasReq ? `<button class=\"btn-register\" data-idx=\"${idx}\" data-seccion=\"proximos\">Registro</button>` : (ev.formulario_url ? `<a href=\"${ev.formulario_url}\" target=\"_blank\" class=\"btn-register\">Registro</a>` : '')}
          <button class="btn-ver-mas" data-idx="${idx}" data-seccion="proximos">Ver más</button>
        </div>
      </div>
    `;
  });
}

function mostrarGaleria(eventos) {
  console.log('EVENTOS EN GALERIA:', eventos);
  const cont = document.getElementById('galeria-container');
  cont.innerHTML = '';
  cont.innerHTML = `<div class="gallery-grid">${eventos.map((ev, idx) => {
    // Normaliza el array de imágenes: acepta arrays de strings o de objetos {S: ...}
    // Prefijo de tu bucket S3 para imágenes de eventos
    const S3_BASE_URL = 'https://eventos-buenohotel-com-do-website-bucket.s3.us-east-1.amazonaws.com/';
    // En DynamoDB solo debes guardar la ruta relativa, ejemplo: "assets/img/Gran_Ventana_Beach_Resort_1.jpg"
    const imagenes = (ev.imagenes || [])
      .map(img => typeof img === "string" ? img : (img && img.S ? img.S : ''))
      .filter(img => !!img)
      .map(img => S3_BASE_URL + img);
    // Imagen por defecto si no hay imágenes
    const hasImages = imagenes.length > 0;
    const mainImg = hasImages ? `<img src="${imagenes[0]}" alt="${ev.nombre}">` : `<img src="assets/img/default-event.jpg" class="default-event" alt="${ev.nombre}">`;
    return `
      <div class="gallery-card">
        <img src="${hasImages ? imagenes[0] : 'assets/img/default-event.jpg'}" alt="${ev.nombre}" class="gallery-card-img">
        <div class="gallery-info">
          <h4>${ev.nombre}</h4>
          <p><strong>Lugar:</strong> ${ev.lugar && ev.lugar.S ? ev.lugar.S : (ev.lugar || '')}</p>
          <p><strong>Fecha:</strong> ${(ev.fecha && typeof ev.fecha === 'object' && ev.fecha.S) ? ev.fecha.S : (ev.fecha || '')}</p>
          <button class="btn-ver-mas" data-idx="${idx}" data-seccion="galeria">Ver más</button>
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

function openEventoModal(evento, imagenes) {
  // Helper para extraer string plano de DynamoDB o string
  const getVal = v => (v && typeof v === 'object' && v.S) ? v.S : (v || '');
  const nombre = getVal(evento.nombre);
  const tipo = getVal(evento.tipo);
  const invita = getVal(evento.invita);
  const lugar = getVal(evento.lugar);
  const fecha = getVal(evento.fecha);
  const info_extra = getVal(evento.info_extra);
  const url = getVal(evento.formulario_url);
  const hasReq = !!(evento.requerimientos || (evento.requerimientos && evento.requerimientos.M));

  const modal = document.getElementById('evento-modal');
  const body = modal.querySelector('.evento-modal-body');
  // Carrusel de imágenes
  let carrusel = '';
  if (imagenes.length > 0) {
    carrusel = `<div class="evento-carrusel">
      <img id="evento-carrusel-img" src="${imagenes.length>0?imagenes[0]:''}" alt="Imagen del evento" class="evento-carrusel-img evento-modal-img">
      <div class="evento-carrusel-indicadores">
        ${imagenes.map((_,i)=>`<span class="evento-carrusel-dot${i===0?' active':''}" data-idx="${i}"></span>`).join('')}
      </div>
      <button class="evento-carrusel-prev">&#8592;</button>
      <button class="evento-carrusel-next">&#8594;</button>
    </div>`;
  }
  body.innerHTML = `
    ${carrusel}
    <div class="evento-modal-info">
      <h2>${nombre}</h2>
      <p><strong>Tipo:</strong> ${tipo}</p>

      <p><strong>Lugar:</strong> ${lugar}</p>
      <p><strong>Fecha:</strong> ${fecha}</p>
      ${info_extra ? `<p>${info_extra}</p>` : ''}
      ${hasReq ? `<button class=\"btn-register\" data-modal=\"1\">Registro</button>` : (url ? `<a href=\"${url}\" target=\"_blank\" class=\"btn-register\">Registro</a>` : '')}
    </div>
  `;
  modal.style.display = 'flex';
  // Carrusel funcionalidad
  let idx = 0;
  const img = modal.querySelector('#evento-carrusel-img');
  const dots = modal.querySelectorAll('.evento-carrusel-dot');
  function showImg(i) {
    idx = i;
    img.src = imagenes[idx];
    img.classList.add('evento-modal-img'); // Asegura que siempre tenga la clase para el zoom
    dots.forEach((d,di)=>d.classList.toggle('active',di===idx));
  }
  modal.querySelector('.evento-carrusel-prev')?.addEventListener('click',()=>showImg((idx-1+imagenes.length)%imagenes.length));
  modal.querySelector('.evento-carrusel-next')?.addEventListener('click',()=>showImg((idx+1)%imagenes.length));
  dots.forEach((d,i)=>d.addEventListener('click',()=>showImg(i)));
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
  // Cerrar al hacer clic fuera del contenido o en la X
  zoomModal.addEventListener('click', function(e) {
    if (e.target === zoomModal || e.target.classList.contains('evento-zoom-close')) {
      zoomModal.remove();
    }
  });
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') {
      zoomModal.remove();
      document.removeEventListener('keydown', handler);
    }
  });
}

document.body.addEventListener('click',function(e){
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
      // Verificar autenticación
      if (!(window.auth && window.auth.isAuthenticated && window.auth.isAuthenticated())){
        if (window.showToast) window.showToast({ title: 'Acceso restringido', message: 'Necesitas iniciar sesión para registrarte', type: 'error', duration: 2400 });
        setTimeout(()=>{ window.location.href = 'login.html'; }, 900);
        return;
      }

      // Determinar evento origen
      let evento = null;
      if (e.target.hasAttribute('data-modal')){
        // Cuando viene del modal, intenta resolver por título (fallback al último abierto si lo guardamos)
        const titulo = document.querySelector('.evento-modal .evento-modal-info h2')?.textContent || '';
        // Buscar en todas las colecciones
        const all = [...(eventosGlobal.proximos||[]), ...(eventosGlobal.galeria||[]), ...(eventosGlobal.otros||[])];
        evento = all.find(ev=>{
          const v = (ev && typeof ev.nombre==='object' && ev.nombre.S) ? ev.nombre.S : ev?.nombre;
          return (v||'') === titulo;
        }) || null;
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

      // Normalizar requerimientos de Dynamo a JS plano
      const req = normalizeRequerimientos(evento.requerimientos);
      openRegistroModal(evento, req);
    } catch(err){
      console.error('Error al iniciar registro:', err);
      if (window.showToast) window.showToast({ title: 'Error', message: 'No fue posible iniciar el registro', type: 'error' });
    }
  }
  if(e.target.classList.contains('evento-modal-close')||e.target.id==='evento-modal'){
    document.getElementById('evento-modal').style.display='none';
  }
});

document.addEventListener('DOMContentLoaded', function() {
  cargarEventos();
  // Cerrar modal al hacer click fuera del contenido
  document.getElementById('evento-modal').addEventListener('click',function(e){
    if(e.target===this) this.style.display='none';
  });
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
        .registro-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);z-index:10000;}
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
        .form-group label{display:block; font-weight:700; color:#222; margin:0 0 6px;}
        .form-control{width:100%; padding:10px 12px; border:1px solid #d9dde3; border-radius:8px; font-size:.98rem}
        .form-actions{display:flex; justify-content:flex-end; gap:10px; margin-top:16px}
        .btn-secondary{padding:10px 16px; background:#fff; border:1px solid #d9dde3; border-radius:8px; font-weight:600; cursor:pointer}
        .btn-primary{padding:10px 16px; background:#FBB03B; border:1px solid #E19A2E; border-radius:8px; font-weight:800; color:#222; cursor:pointer}
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
  }
  return modal;
}

function openRegistroModal(evento, req){
  const modal = ensureRegistroModal();
  const body = modal.querySelector('#registro-modal-body');
  const nombre = (evento && typeof evento.nombre==='object' && evento.nombre.S) ? evento.nombre.S : (evento?.nombre || 'Evento');
  modal.querySelector('#registro-modal-title').textContent = `Registro: ${nombre}`;
  try { console.debug('[Registro] Abriendo modal para evento:', { id: dGet(evento.id), nombre }); } catch(_){ }

  // Datos básicos del perfil
  let userData = null;
  try { userData = JSON.parse(localStorage.getItem('buenohotel_user_data')||'null'); } catch(_){ }
  // Oculta campos sensibles como password
  const basicSafe = (req.basicos_del_perfil||[]).filter(k=>String(k).toLowerCase() !== 'password');
  const basicList = basicSafe.map(k=>`<li><span class="registro-badge">${k}</span> ${userData && userData[k] ? `<strong>${userData[k]}</strong>` : '<em>del perfil</em>'}</li>`).join('');

  // Render campos adicionales (provenientes de requerimientos del evento)
  try { console.debug('[Registro] campos_adicionales:', Array.isArray(req.campos_adicionales)? req.campos_adicionales.map(c=>c.id): req.campos_adicionales); } catch(_){ }
  // Reglas específicas por hotel/evento
  const nombreEvtLC = String(dGet(evento?.nombre)||'').toLowerCase();
  const lugarEvtLC = String(dGet(evento?.lugar)||'').toLowerCase();
  const OVERRIDE_HOTEL = nombreEvtLC.includes('retiro de solteros') || lugarEvtLC.includes('gran ventana');
  const FIXED_CATEGORY = 'Superior Room';
  // Precompute event start date for fechaEntrada static rendering
  const __startRaw = dGet(evento.fecha_inicio) || dGet(evento.fechaInicio) || dGet(evento.fecha) || '';
  function __toDateOnly(v){ try{ const d=new Date(v); if(isNaN(d)) return ''; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }catch(_){return '';} }
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
  const __rangeText = __parseRangeFromTexto(dGet(evento.fecha));
  const __eventStartDate = __toDateOnly(__startRaw) || __rangeText.start;
  const __entradaDisplayHtml = (function(){
    if (!__eventStartDate) return '';
    let nice = '';
    try { const d=new Date(__eventStartDate+'T00:00:00'); nice = d.toLocaleDateString('es-DO',{year:'numeric',month:'long',day:'numeric'}); } catch(_){ nice = __eventStartDate; }
    return `
      <div class="registro-section registro-card-info">
        <h4>Fecha de entrada</h4>
        <div>${nice}</div>
      </div>`;
  })();

  const camposHtml = (req.campos_adicionales||[]).map(c=>{
    const id = c.id; const label = c.label || id; const type = (c.type||'text').toLowerCase();
    const required = !!c.required;
    // Quitar campos según override de hotel/evento
    if (OVERRIDE_HOTEL && (id === 'tipoHabitacion' || id === 'categoria')){
      return '';
    }
    if (type === 'select'){
      const opts = (c.options||[]).map(o=>{
        if (o && typeof o === 'object'){
          const val = ('value' in o) ? o.value : (('S' in o) ? o.S : (('N' in o) ? Number(o.N) : ''));
          const lab = ('label' in o) ? o.label : String(val);
          return `<option value="${String(val)}">${String(lab)}</option>`;
        } else {
          return `<option value="${String(o)}">${String(o)}</option>`;
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
      // Remove fechaEntrada as an editable field entirely
      if (id === 'fechaEntrada'){
        return '';
      }
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
          <small id=\"montoPago-helper\" style=\"display:block; color:#666; margin-top:6px;\">Ingresa tu abono en DOP. Mínimo RD$1,500.00. Ej: 3500</small>
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
  const precioEvento = Number(dGet(evento.precio_por_persona) || 0);
  const minAbono = 1500; // Mínimo fijo RD$1,500
  const diasLimite = (facilidad && typeof facilidad.fecha_limite_dias_antes !== 'undefined') ? Number(facilidad.fecha_limite_dias_antes) : 0;
  // Horario del evento (fechas/horas)
  const evFechaIniRaw = dGet(evento.fecha_inicio) || dGet(evento.fechaInicio) || dGet(evento.fecha) || '';
  const evHoraIni = dGet(evento.hora_inicio) || dGet(evento.horaInicio) || '';
  const evFechaFinRaw = dGet(evento.fecha_fin) || dGet(evento.fechaFin) || dGet(evento.fechaSalida) || '';
  const evHoraFin = dGet(evento.hora_fin) || dGet(evento.horaFin) || '';
  function fmtDate(d){ try{ const x=new Date(d); if(isNaN(x)) return ''; return x.toLocaleDateString('es-DO', { year:'numeric', month:'long', day:'numeric' }); }catch(_){ return ''; } }
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
  const horarioHtml = (evFechaIni || evFechaFin || evHoraIni || evHoraFin) ? `
    <div class="registro-section registro-card-info">
      <h4>Horario del evento</h4>
      ${evFechaIni ? `<div><strong>Inicio:</strong> ${evFechaIni}${evHoraIni?` · ${evHoraIni}`:''}</div>` : ''}
      ${evFechaFin ? `<div><strong>Finaliza:</strong> ${evFechaFin}${evHoraFin?` · ${evHoraFin}`:''}</div>` : ''}
    </div>` : '';
  const pagosHtml = facilidad ? `
    <div class="registro-section registro-card-info">
      <h4>Facilidad de pagos</h4>
      <p style="margin:6px 0 0; color:#334;">${facilidad.descripcion || ''}</p>
      ${facilidad && facilidad.descripcion ? `<small style="display:block; margin-top:6px; color:#556;">El resto puedes completarlo en abonos mensuales antes de la fecha límite.</small>` : ''}
      ${diasLimite>0 && !descHasDias ? `<p style="margin:6px 0 0; color:#334;">Pagos habilitados hasta <strong>${diasLimite}</strong> días antes de la fecha de entrada.</p>` : ''}
      <p style="margin:8px 0 0; color:#334;">Puedes abonar desde <strong>${formatCurrencyDOP(minAbono)}</strong>${precioEvento?` hasta <strong>${formatCurrencyDOP(precioEvento)}</strong>.`:'.'}</p>
    </div>` : '';

  // WhatsApp/Claudia constants (used in template below)
  const WA_NUMBER_RAW = window.WHATSAPP_NUMBER || '18093034991';
  const WA_DIGITS = String(WA_NUMBER_RAW).replace(/\D/g,'');
  const CLAUDIA_NAME = 'Claudia (Administradora de BuenoHotel)';
  const CLAUDIA_WHATSAPP_DISPLAY = WA_DIGITS ? `+${WA_DIGITS}` : '';

  try {
    console.debug('[Registro] Render secciones', {
      condiciones: condiciones.length,
      horario: !!(evFechaIni || evFechaFin || evHoraIni || evHoraFin),
      pagos: !!facilidad,
      campos: (req.campos_adicionales||[]).length
    });
    body.innerHTML = `
      ${condicionesHtml}
      ${horarioHtml}
      ${__entradaDisplayHtml}
      ${pagosHtml}
      <form id="registro-form-adicionales" class="registro-section">
        <div class="form-grid">${camposHtml}
          ${OVERRIDE_HOTEL ? `
            <div class="form-group" style="grid-column:1 / -1;">
              <label>Categoría</label>
              <div class="form-control" style="background:#f6f7fa; color:#222;">${FIXED_CATEGORY}</div>
              <input type="hidden" name="categoria" value="${FIXED_CATEGORY}">
            </div>
          `:''}
          <div class="form-group" style="grid-column:1 / -1;">
            <label for="observaciones">Observaciones</label>
            <textarea id="observaciones" name="observaciones" class="form-control" rows="3" maxlength="500" placeholder="Escriba aquí cualquier observación, solicitud o detalle adicional (opcional)"></textarea>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
              <small style="color:#556;">Máximo 500 caracteres.</small>
              <small id="obs-counter" style="color:#889;">0/500</small>
            </div>
          </div>
        </div>

        <div id="stay-notice" class="registro-alert" style="display:none; margin-top:6px;">
          Has elegido una fecha de salida posterior a la finalización del evento. Si desean durar más tiempo, el precio final puede variar; por favor consúltalo con ${CLAUDIA_NAME} al WhatsApp ${CLAUDIA_WHATSAPP_DISPLAY}.
        </div>

        <div class="registro-section" style="margin-top:10px;">
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
          </div>
          <div id="wa-helper" class="registro-card-info" style="display:none; margin-top:10px; background:#f4f6f9; border-color:#dfe6ef;">
            <p style="margin:0; color:#334; font-weight:600;">Transferencia o Depósito</p>
            <small style="display:block; margin-top:6px; color:#445;">Después de confirmar, te mostraremos una alerta y te redirigiremos automáticamente a WhatsApp para enviar tu comprobante.</small>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" id="registro-cancel" class="btn-secondary">Cancelar</button>
          <button type="submit" id="registro-submit" class="btn-primary">Confirmar Registro</button>
        </div>
      </form>
    `;
  } catch(err){
    console.error('[Registro] Error al renderizar modal:', err);
    if (window.showToast) window.showToast({ title:'Error', message:'Ocurrió un problema al preparar el formulario. Intenta de nuevo.', type:'error' });
    body.innerHTML = '<div class="registro-alert">Ocurrió un problema al preparar el formulario. Intenta de nuevo.</div>';
  }

  // Lógica required_if que soporta dependencia en campos del formulario o datos de perfil
  const requiredRules = (req.campos_adicionales||[])
    .filter(c=>c.required_if)
    .filter(c=> !(OVERRIDE_HOTEL && (c.id==='tipoHabitacion' || c.id==='categoria')))
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

  const form = body.querySelector('#registro-form-adicionales');
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
      ? ` Monto: ${formatCurrencyDOP(Number(monto))}`
      : '';
    const note = extraNote ? `\n${extraNote}` : '';
    const text = `Hola, envío comprobante de pago del evento: ${eventName}.${montoTxt}${note}`;
    // Usamos api.whatsapp.com por mayor compatibilidad en escritorio/móvil
    return `https://api.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(text)}`;
  }
  function getEffectiveMonto(){
    const valSel = body.querySelector('#montoPago')?.value;
    if (valSel === 'OTRO'){
      const otro = body.querySelector('#montoPagoOtro')?.value;
      return otro ? Number(otro) : '';
    }
    return valSel ? Number(valSel) : '';
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
      if (waHelper) waHelper.style.display = 'none';
      if (tarjetaHelper) tarjetaHelper.style.display = '';
      
      if (montoSelect) montoSelect.required = false;
      if (montoGroupSelect) montoGroupSelect.style.display = 'none';
      if (montoGroupOtro) montoGroupOtro.style.display = 'none';
    }
  }
  pagoRadios.forEach(r=> r.addEventListener('change', togglePagoHelper));
  togglePagoHelper();
  // ====== Alinear fechas de entrada/salida con el evento ======
  const fechaStartRaw = dGet(evento.fecha_inicio) || dGet(evento.fechaInicio) || dGet(evento.fecha) || '';
  const horaStartRaw = dGet(evento.hora_inicio) || dGet(evento.horaInicio) || '';
  const fechaEndRaw = dGet(evento.fecha_fin) || dGet(evento.fechaFin) || dGet(evento.fechaSalida) || fechaStartRaw || '';
  const horaEndRaw = dGet(evento.hora_fin) || dGet(evento.horaFin) || '';
  function toDateOnly(v){ try{ const d=new Date(v); if(isNaN(d)) return ''; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }catch(_){return '';} }
  const _rangeText = __parseRangeFromTexto(dGet(evento.fecha));
  const eventStartDate = toDateOnly(fechaStartRaw) || _rangeText.start;
  const eventEndDate = toDateOnly(fechaEndRaw) || _rangeText.end;
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
      small.style.color='#556';
      group.appendChild(small);
    }
    small.textContent = msg;
  }
  if (fechaEntradaEl && eventStartDate){
    try{
      if (!fechaEntradaEl.value) fechaEntradaEl.value = eventStartDate;
      // Bloquear cambios: min=max=fecha de inicio y readOnly
      fechaEntradaEl.min = eventStartDate;
      fechaEntradaEl.max = eventStartDate;
      fechaEntradaEl.readOnly = true;
      // Si algún navegador ignora readOnly en date, forzamos el valor
      const enforceEntrada = ()=>{ if (fechaEntradaEl.value !== eventStartDate) fechaEntradaEl.value = eventStartDate; };
      fechaEntradaEl.addEventListener('input', enforceEntrada);
      fechaEntradaEl.addEventListener('change', enforceEntrada);
    }catch(_){ }
    const msgIn = (horaStartRaw? `La hora de entrada está alineada con el inicio del evento (${horaStartRaw}).` : 'La entrada está alineada con el inicio del evento.');
    appendHelper(fechaEntradaEl, msgIn);
  }
  if (fechaSalidaEl && eventEndDate){
    try{ fechaSalidaEl.min = eventEndDate; }catch(_){ }
    let endNice = '';
    try { const d=new Date(eventEndDate+'T00:00:00'); endNice = d.toLocaleDateString('es-DO',{ year:'numeric', month:'long', day:'numeric' }); } catch(_){ endNice = eventEndDate; }
    const whenTxt = endNice ? (horaEndRaw ? `${endNice} · ${horaEndRaw}` : endNice) : (horaEndRaw || '');
    const msgOut = whenTxt
      ? `No puedes salir antes de la finalización del evento (${whenTxt}). Si desean durar más tiempo, el precio puede variar y deben consultarlo con ${CLAUDIA_NAME}${CLAUDIA_WHATSAPP_DISPLAY?` al WhatsApp ${CLAUDIA_WHATSAPP_DISPLAY}`:''}.`
      : `No puedes salir antes de la finalización del evento. Si desean durar más tiempo, el precio puede variar y deben consultarlo con ${CLAUDIA_NAME}${CLAUDIA_WHATSAPP_DISPLAY?` al WhatsApp ${CLAUDIA_WHATSAPP_DISPLAY}`:''}.`;
    appendHelper(fechaSalidaEl, msgOut);
  }
  let stayingLonger = false;
  function evaluateStay(){
    if (!fechaSalidaEl || !eventEndDate) { stayingLonger=false; return; }
    const sel = fechaSalidaEl.value;
    stayingLonger = !!(sel && sel > eventEndDate);
    // Mostrar advertencia resaltada cuando aplique
    const group = fechaSalidaEl.closest('.form-group');
    if (group){
      let warn = group.querySelector('[data-warn]');
      if (stayingLonger){
        if (!warn){ warn = document.createElement('div'); warn.setAttribute('data-warn',''); warn.style.marginTop='6px'; warn.style.background='#fff7e6'; warn.style.border='1px solid #ffe0a3'; warn.style.borderRadius='8px'; warn.style.padding='8px 10px'; warn.style.color='#5c3d00'; group.appendChild(warn); }
        warn.textContent = `Has seleccionado una salida posterior a la finalización del evento. Si desean durar más tiempo, el precio puede variar y deben consultarlo con ${CLAUDIA_NAME}${CLAUDIA_WHATSAPP_DISPLAY?` al WhatsApp ${CLAUDIA_WHATSAPP_DISPLAY}`:''}.`;
      } else if (warn){ warn.remove(); }
    }
    // Toggle aviso general debajo del formulario
    const stayNotice = body.querySelector('#stay-notice');
    if (stayNotice){ stayNotice.style.display = stayingLonger ? '' : 'none'; }
  }
  if (fechaSalidaEl){ fechaSalidaEl.addEventListener('change', evaluateStay); fechaSalidaEl.addEventListener('input', evaluateStay); setTimeout(evaluateStay,0); }
  // Si existe un campo de monto, actualizar el enlace al cambiar
  const montoInputEl = body.querySelector('#montoPago');
  if (montoInputEl){ montoInputEl.addEventListener('input', togglePagoHelper); montoInputEl.addEventListener('change', togglePagoHelper); }
  const montoOtroEl = body.querySelector('#montoPagoOtro');
  if (montoOtroEl){ montoOtroEl.addEventListener('input', togglePagoHelper); }
  // Observaciones live counter
  const obsEl = body.querySelector('#observaciones');
  const obsCounter = body.querySelector('#obs-counter');
  if (obsEl && obsCounter){
    const updateObs = ()=>{
      const len = (obsEl.value||'').length;
      obsCounter.textContent = `${len}/500`;
      obsCounter.style.color = len > 480 ? '#b35b00' : '#889';
    };
    obsEl.addEventListener('input', updateObs);
    updateObs();
  }
  const reevaluate = ()=>{
    const termsOk = termField ? termField.checked : true;
    submitBtn.disabled = !termsOk || !form.checkValidity();
  };
  if (termField){ termField.addEventListener('change', reevaluate); }
  form.addEventListener('input', reevaluate);
  setTimeout(reevaluate, 0);
  form.addEventListener('submit', async function(ev){
    ev.preventDefault();
    const fd = new FormData(form);
    const adicionales = {};
    for (const [k,v] of fd.entries()){ adicionales[k]=v; }
    // Checkbox true/false
    (req.campos_adicionales||[]).forEach(c=>{
      if (c.type==='checkbox') adicionales[c.id] = !!body.querySelector(`#${c.id}:checked`);
    });
    const metodoPago = body.querySelector('input[name="metodoPago"]:checked')?.value || 'tarjeta';

    // Validaciones mínimas en front: teléfono requerido para el endpoint
    const telefono = userData?.telefono || userData?.phone || '';
    if (!telefono) {
      if (window.showToast) window.showToast({ title: 'Falta información', message: 'Completa tu teléfono en tu perfil para continuar.', type: 'warning' });
      return;
    }

    // Construir payload para backend
    // monto efectivo
    const precioTotal = Number(dGet(evento?.precio_por_persona) || 0);
    const selectedMontoVal = (function(){
      const sel = adicionales.montoPago;
      if (String(sel) === 'OTRO') return Number(adicionales.montoPagoOtro || 0);
      return Number(sel || 0);
    })();
    // Validación temprana de mínimo RD$1,500
    if (isNaN(selectedMontoVal) || selectedMontoVal < 1500){
      if (window.showToast) window.showToast({ title:'Monto insuficiente', message:'El abono mínimo es RD$1,500.00.', type:'warning' });
      const montoEl = body.querySelector('#montoPago') || body.querySelector('#montoPagoOtro');
      const helper = body.querySelector('#montoPago-helper');
      if (helper){ helper.style.color = '#b30000'; helper.textContent = 'El abono mínimo es RD$1,500.00.'; }
      if (montoEl){ try{ montoEl.focus(); montoEl.scrollIntoView({behavior:'smooth', block:'center'}); }catch(_){ } }
      submitBtn.disabled = false; submitBtn.textContent = 'Confirmar Registro';
      return;
    }

    const payload = {
      eventoId: dGet(evento.id) || null,
      usuarioId: userData?.id || userData?.userId || null,
      nombre: userData?.nombre || userData?.firstName || '',
      apellido: userData?.apellido || userData?.lastName || '',
      email: userData?.email || '',
      telefono: telefono,
      iglesia: userData?.iglesia || '',
      // Campos condicionales si aplica
      otraIglesia: adicionales.otraIglesia || undefined,
      liderIglesia: adicionales.liderIglesia || undefined,
      contactoLider: adicionales.contactoLider || undefined,
      // Pago y aceptación
      montoPago: selectedMontoVal,
      aceptaTerminos: !!adicionales.aceptaTerminos,
      metodoPago: metodoPago,
      // Extra opcional
      detalles: {
        eventoNombre: dGet(evento.nombre) || null,
        documento: adicionales.documento || '',
        fechaNacimiento: adicionales.fechaNacimiento || '',
        edad: (function(){
          const v = adicionales.fechaNacimiento; if (!v) return '';
          const fn = new Date(v); if (isNaN(fn)) return '';
          const hoy = new Date(); let e = hoy.getFullYear()-fn.getFullYear();
          const m = hoy.getMonth()-fn.getMonth(); if (m<0 || (m===0 && hoy.getDate()<fn.getDate())) e--; return e;
        })(),
        tipoHabitacion: OVERRIDE_HOTEL ? '' : (adicionales.tipoHabitacion || ''),
        categoria: OVERRIDE_HOTEL ? FIXED_CATEGORY : (adicionales.categoria || ''),
        fechaEntrada: eventStartDate || __eventStartDate || '',
        fechaSalida: adicionales.fechaSalida || '',
        observaciones: (adicionales.observaciones || '').toString().slice(0,500)
      }
    };
    // Validación dinámica para monto OTRO si corresponde
    if (String(adicionales.montoPago) === 'OTRO'){
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
      const res = await fetch(`${API_BASE}/api/registrations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(()=>({}));
      if (!res.ok) {
        const msg = json?.errors?.map(e=>e.message).join(' | ') || json?.message || 'No se pudo completar el registro';
        throw new Error(msg);
      }
      if (window.showToast) window.showToast({ title: 'Registro enviado', message: 'Hemos recibido tu registro y primer abono.', type: 'success' });
      // Si eligió Transferencia/Depósito, mostrar banner neutral y auto-abrir WhatsApp luego de 10s
      if (metodoPago === 'transferencia'){
        const eventName = dGet(evento?.nombre) || 'Evento';
        const extraNote = stayingLonger ? `Nota: Deseo quedarme más tiempo (salida posterior al fin del evento). Entiendo que el precio puede variar. Por favor confirmar y coordinar con ${CLAUDIA_NAME}.` : '';
        const waUrl = buildWaUrl(eventName, payload.montoPago || '', extraNote);
        // Banner flotante minimalista
        const bar = document.createElement('div');
        bar.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:10001; background:#fff; border-left:6px solid #25D366; box-shadow:0 8px 24px rgba(0,0,0,.12); padding:14px 16px; border-radius:12px; max-width:360px;';
        bar.innerHTML = `
          <div style="display:flex; gap:12px; align-items:flex-start;">
            <div style="font-size:18px;">💬</div>
            <div>
              <div style="font-weight:700; margin-bottom:4px;">Enviar comprobante por WhatsApp</div>
              <div id="wa-bar-msg" style="font-size:14px; color:#333;">Serás redirigido automáticamente en <strong>10</strong> segundos…</div>
              <div style="margin-top:10px; display:flex; gap:10px;">
                <button id="wa-bar-close" class="btn-secondary" type="button">Cerrar</button>
              </div>
            </div>
          </div>`;
        document.body.appendChild(bar);
        let remaining = 10;
        const msgEl = bar.querySelector('#wa-bar-msg');
        const closeEl = bar.querySelector('#wa-bar-close');
        let clicked = false;
        closeEl.addEventListener('click', ()=>{ clicked = true; bar.remove(); });
        const interval = setInterval(()=>{
          remaining -= 1;
          if (remaining <= 0){ clearInterval(interval); }
          if (msgEl) msgEl.innerHTML = `Serás redirigido automáticamente en <strong>${Math.max(0,remaining)}</strong> segundos…`;
        }, 1000);
        setTimeout(()=>{
          if (!clicked){ window.open(waUrl, '_blank', 'noopener'); }
          setTimeout(()=>{ bar.remove(); }, 600);
        }, 10000);
      } else {
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
        const hotelImage = encodeURIComponent(toAbsImg(imgsArr[0] || ''));
        // Fecha del evento (checkIn)
        const checkInISO = (eventStartDate || __eventStartDate || '').split('T')[0];
        // Cantidad de personas (por ahora 1)
        const AdultsQty = 1;
        // Precio total a cobrar (en DOP)
        const TotalPrice = Number(selectedMontoVal||0);
        const Currency = 'DOP';
        // OrderNumber: usar id devuelto por backend (registroId/ id)
        const orderNumber = String(
          json?.data?.registroId || json?.data?.id || json?.id || json?.registroId || ''
        );
        // Fallback si falta: usar fecha+usuario para no romper, aunque lo ideal es id del registro
        const OrderNumber = encodeURIComponent(orderNumber || `${Date.now()}-${payload.usuarioId||'user'}`);
        const params = new URLSearchParams();
        params.set('EventName', eventName);
        params.set('Currency', Currency);
        if (hotelImage) params.set('hotelImage', hotelImage);
        if (checkInISO) params.set('checkIn', checkInISO);
        params.set('AdultsQty', String(AdultsQty));
        params.set('TotalPrice', String(TotalPrice));
        params.set('OrderNumber', OrderNumber);
        const redirectUrl = `${ecommerceBase}?${params.toString()}`;
        window.location.href = redirectUrl;
      }
      modal.remove();
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
    return `DOP $${Number(num).toFixed(2)}`;
  }
}
