async function cargarEventos() {
  // Cambia la ruta a tu bucket S3 si lo subes a producción
  const url = 'https://zp27hv7zkk.execute-api.us-east-1.amazonaws.com/prod/eventos'; // URL real de tu API Gateway
  const resp = await fetch(url);
  const data = await resp.json();
  // El body es un string JSON, así que hay que parsearlo
  const eventos = JSON.parse(data.body);
  console.log('EVENTOS:', eventos); // <-- Depuración
  mostrarProximos(eventos.filter(ev => ev.tipo === 'proximos'));
  mostrarGaleria(eventos.filter(ev => ev.tipo === 'galeria'));
  mostrarOtros(eventos.filter(ev => ev.tipo === 'otros'));
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
  const cont = document.getElementById('galeria-container');
  cont.innerHTML = '';
  cont.innerHTML = `<div class="gallery-grid">${eventos.map(ev => `
    <div class="gallery-card">
      <div class="gallery-images">
        ${(ev.imagenes || []).map(img => `<img src="${img}" alt="${ev.nombre}">`).join('')}
      </div>
      <div class="gallery-info">
        <h4>${ev.nombre}</h4>
        <p><strong>Lugar:</strong> ${ev.lugar || ''}</p>
        <p><strong>Fecha:</strong> ${ev.fecha}</p>
      </div>
    </div>
  `).join('')}</div>`;
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
