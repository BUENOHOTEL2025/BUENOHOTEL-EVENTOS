// payment.js - AZUL Hosted Payment integration helpers
(function(){
  function getApiBase(){
    try { if (window.getAuthApiBase) return window.getAuthApiBase(); } catch(_){}
    try { return new URL('/api', window.location.origin).origin; } catch(_){}
    return 'http://localhost:3000';
  }

  async function startAzulPayment({ eventoId, monto, eventoNombre }){
    if (!window.auth || !window.auth.isAuthenticated || !window.auth.isAuthenticated()){
      try { window.showToast && window.showToast({ title:'Inicia sesión', message:'Debes iniciar sesión para pagar.', type:'error' }); } catch(_){ }
      window.location.href = 'login.html';
      return;
    }
    const user = window.auth.getUserData && window.auth.getUserData();
    const email = user?.email || '';
    const token = window.auth.getAuthToken && window.auth.getAuthToken();
    const API_BASE = getApiBase();

    // UI: Toast bonito mientras conectamos
    function showAzulToast(){
      const id = 'azul-loading-toast';
      if (document.getElementById(id)) return;
      const el = document.createElement('div');
      el.id = id;
      el.style.cssText = 'position:fixed;top:20px;right:20px;z-index:12000;';
      el.innerHTML = `
        <div style="min-width:300px;max-width:380px;padding:14px 16px;border-radius:12px;background:#fff;box-shadow:0 8px 24px rgba(0,0,0,.12);display:flex;gap:12px;align-items:flex-start;border-left:6px solid #25A0D9;">
          <div class="spinner" style="width:18px;height:18px;border:3px solid #cfe9f6;border-top-color:#25A0D9;border-radius:50%;animation:spin 1s linear infinite;margin-top:2px;"></div>
          <div>
            <div style="font-weight:700;margin-bottom:4px;color:#0b2a3a;">Conectando con AZUL…</div>
            <div style="font-size:14px;color:#333;">Por favor espera unos segundos.</div>
          </div>
        </div>
        <style>@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}</style>
      `;
      document.body.appendChild(el);
    }
    function hideAzulToast(){
      const el = document.getElementById('azul-loading-toast');
      if (el) try{ el.remove(); }catch(_){ }
    }

    showAzulToast();

    // Pre-abrir nueva pestaña/ventana para evitar bloqueos del navegador
    const targetName = `azul_win_${Date.now()}`;
    let win = null;
    try { win = window.open('about:blank', targetName); } catch(_){ }

    try {
      const resp = await fetch(`${API_BASE}/api/pagos/azul/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ eventoId, monto, email, eventoNombre })
      });
      const data = await resp.json().catch(()=>({}));
      if (!resp.ok) throw new Error(data?.message || `HTTP ${resp.status}`);
      const { paymentPageUrl, payload } = data?.data || {};
      if (!paymentPageUrl || !payload) throw new Error('Respuesta inválida de la sesión de pago');

      // Crear form y postear a AZUL
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = paymentPageUrl;
      form.target = targetName;
      Object.keys(payload).forEach(k => {
        const input = document.createElement('input');
        input.type = 'hidden'; input.name = k; input.value = String(payload[k]);
        form.appendChild(input);
      });
      document.body.appendChild(form);
      if (win && !win.closed) { try { win.focus(); } catch(_){ } }
      form.submit();
      hideAzulToast();
    } catch (e) {
      console.error('startAzulPayment error', e);
      try { window.showToast && window.showToast({ title:'Error de pago', message:e.message || 'No se pudo iniciar el pago', type:'error' }); } catch(_){ }
      // Cerrar la ventana si la abrimos pero falló
      try { if (win && !win.closed) win.close(); } catch(_){ }
      hideAzulToast();
    }
  }

  // Expose globally
  window.startAzulPayment = startAzulPayment;
})();
