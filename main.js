async function cargarEventos() {
  // Cambia la ruta a tu bucket S3 si lo subes a producción
  const url = 'https://zp27hv7zkk.execute-api.us-east-1.amazonaws.com/prod/eventos'; // URL real de tu API Gateway
  const resp = await fetch(url);
  const data = await resp.json();
  // El body es un string JSON, así que hay que parsearlo
  const eventos = JSON.parse(data.body);
  console.log('EVENTOS:', eventos); // <-- Depuración
  const getTipo = ev => typeof ev.tipo === "string" ? ev.tipo : (ev.tipo && ev.tipo.S ? ev.tipo.S : "");
  const galeriaFiltrada = eventos.filter(ev => getTipo(ev) === 'galeria');
  console.log('GALERIA FILTRADA:', galeriaFiltrada);
  mostrarProximos(eventos.filter(ev => getTipo(ev) === 'proximos'));
  mostrarGaleria(galeriaFiltrada);
  mostrarOtros(eventos.filter(ev => getTipo(ev) === 'otros'));
}

function mostrarProximos(eventos) {
  const cont = document.getElementById('proximos-container');
  cont.innerHTML = '';
  eventos.forEach(ev => {
    cont.innerHTML += `
      <div class="event-card">
        <img src="${ev.imagenes[0] || ''}" alt="${ev.nombre}">
        <div class="event-info">
          <h3>${ev.nombre}</h3>
          <p><strong>Tipo:</strong> ${ev.tipo || ''}</p>
          <p><strong>Invita:</strong> ${ev.invita || ''}</p>
          <p><strong>Lugar:</strong> ${ev.lugar}</p>
          <p><strong>Fecha:</strong> ${ev.fecha}</p>
          ${ev.info_extra ? `<p>${ev.info_extra}</p>` : ''}
          ${ev.formulario_url ? `<a href="${ev.formulario_url}" target="_blank" class="btn-register">Registro</a>` : ''}
        </div>
      </div>
    `;
  });
}

function mostrarGaleria(eventos) {
  console.log('EVENTOS EN GALERIA:', eventos);
  const cont = document.getElementById('galeria-container');
  cont.innerHTML = '';
  cont.innerHTML = `<div class="gallery-grid">${eventos.map(ev => {
    // Normaliza el array de imágenes: acepta arrays de strings o de objetos {S: ...}
    const imagenes = (ev.imagenes || [])
      .map(img => typeof img === "string" ? img : (img && img.S ? img.S : ''))
      .filter(img => img.startsWith('assets/img/'));
    console.log('IMAGENES DEL EVENTO:', ev.nombre, imagenes);
    return `
      <div class="gallery-card">
        <div class="gallery-images">
          ${imagenes.filter(Boolean).map(img => `<img src="${img}" alt="${ev.nombre}">`).join('')}
        </div>
        <div class="gallery-info">
          <h4>${ev.nombre}</h4>
          <p><strong>Lugar:</strong> ${ev.lugar && ev.lugar.S ? ev.lugar.S : (ev.lugar || '')}</p>
          <p><strong>Fecha:</strong> ${ev.fecha && ev.fecha.S ? ev.fecha.S : (ev.fecha || '')}</p>
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

function mostrarOtros(eventos) {
  const cont = document.getElementById('otros-container');
  cont.innerHTML = '';
  eventos.forEach(ev => {
    cont.innerHTML += `
      <div class="other-event-card">
        <h4>${ev.nombre}</h4>
        <p><strong>Fecha:</strong> ${ev.fecha}</p>
        <div class="gallery-images">
          ${(ev.imagenes || []).map(img => `<img src="${img}" alt="${ev.nombre}">`).join('')}
        </div>
      </div>
    `;
  });
}

document.addEventListener('DOMContentLoaded', cargarEventos);
