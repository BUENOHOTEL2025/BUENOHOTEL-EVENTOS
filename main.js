async function cargarEventos() {
  // Cambia la ruta a tu bucket S3 si lo subes a producción
  const url = 'https://zp27hv7zkk.execute-api.us-east-1.amazonaws.com/prod/eventos'; // URL real de tu API Gateway
  const resp = await fetch(url);
  const data = await resp.json();
  // El body es un string JSON, así que hay que parsearlo
  const eventos = JSON.parse(data.body);
  console.log('EVENTOS:', eventos); // <-- Depuración
  const getTipo = ev => typeof ev.tipo === "string" ? ev.tipo : (ev.tipo && ev.tipo.S ? ev.tipo.S : "");
  const proximos = eventos.filter(ev => getTipo(ev) === 'proximos');
  const galeriaFiltrada = eventos.filter(ev => getTipo(ev) === 'galeria');
  const otros = eventos.filter(ev => getTipo(ev) === 'otros');
  eventosGlobal.proximos = proximos;
  eventosGlobal.galeria = galeriaFiltrada;
  eventosGlobal.otros = otros;
  console.log('GALERIA FILTRADA:', galeriaFiltrada);
  mostrarProximos(proximos);
  mostrarGaleria(galeriaFiltrada);
  mostrarOtros(otros);
}

function mostrarProximos(eventos) {
  const cont = document.getElementById('proximos-container');
  cont.innerHTML = '';
  eventos.forEach((ev, idx) => {
    const imagenes = ev.imagenes || [];
    const imgSrc = (imagenes.length > 0 && imagenes[0]) ? imagenes[0] : 'assets/img/default-event.jpg';
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
          ${ev.formulario_url ? `<a href=\"${ev.formulario_url}\" target=\"_blank\" class=\"btn-register\">Registro</a>` : ''}
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
      <p><strong>Invita:</strong> ${invita}</p>
      <p><strong>Lugar:</strong> ${lugar}</p>
      <p><strong>Fecha:</strong> ${fecha}</p>
      ${info_extra ? `<p>${info_extra}</p>` : ''}
      ${url ? `<a href="${url}" target="_blank" class="btn-register">Registro</a>` : ''}
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
