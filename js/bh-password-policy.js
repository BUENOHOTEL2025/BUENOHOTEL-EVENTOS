(function (w) {
  var MIN = 8;
  var MSG_FORCE =
    'El cambio de contraseña es obligatorio para cumplir con los requerimientos de seguridad.';

  function checks(raw) {
    var p = String(raw || '');
    return {
      len: p.length >= MIN,
      upper: /[A-ZÁÉÍÓÚÜÑ]/.test(p),
      lower: /[a-záéíóúüñ]/.test(p)
    };
  }

  function ok(raw) {
    var c = checks(raw);
    return c.len && c.upper && c.lower;
  }

  function issue(raw) {
    var c = checks(raw);
    if (!c.len) return 'La contraseña debe tener al menos ' + MIN + ' caracteres.';
    if (!c.upper) return 'La contraseña debe incluir una letra mayúscula.';
    if (!c.lower) return 'La contraseña debe incluir una letra minúscula.';
    return '';
  }

  function reqsHtml() {
    return (
      '<ul class="bh-pwd-reqs" aria-live="polite">' +
        '<li data-req="len">Al menos 8 caracteres</li>' +
        '<li data-req="upper">Una letra mayúscula</li>' +
        '<li data-req="lower">Una letra minúscula</li>' +
      '</ul>'
    );
  }

  function ensureCss() {
    if (document.getElementById('bh-pwd-css')) return;
    var s = document.createElement('style');
    s.id = 'bh-pwd-css';
    s.textContent =
      '.bh-pwd-reqs{list-style:none;margin:8px 0 0;padding:0;font-size:.86rem;line-height:1.55}' +
      '.bh-pwd-reqs li{color:#6b7280;padding-left:1.2em;position:relative}' +
      '.bh-pwd-reqs li:before{content:"○";position:absolute;left:0;color:#9ca3af}' +
      '.bh-pwd-reqs li.ok{color:#166534;font-weight:700}' +
      '.bh-pwd-reqs li.ok:before{content:"●";color:#16a34a}' +
      '.bh-pwd-force{position:fixed;inset:0;z-index:200000;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:18px}' +
      '.bh-pwd-force-card{background:#fff;max-width:440px;width:100%;border-radius:18px;padding:24px 22px 20px;box-shadow:0 20px 50px rgba(0,0,0,.28);font-family:Roboto,Arial,sans-serif}' +
      '.bh-pwd-force-card h2{margin:0 0 8px;font-size:1.25rem;color:#111}' +
      '.bh-pwd-force-card .lead{margin:0 0 16px;color:#4b5563;font-size:.95rem;line-height:1.45}' +
      '.bh-pwd-force-card label{display:block;font-weight:700;font-size:.8rem;margin:12px 0 6px;color:#374151}' +
      '.bh-pwd-force-card input{width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #e5e7eb;border-radius:10px;font-size:1rem}' +
      '.bh-pwd-force-card .err{color:#b91c1c;font-size:.85rem;min-height:1.2em;margin:8px 0 0}' +
      '.bh-pwd-force-card button{margin-top:16px;width:100%;border:0;background:#FBB03B;color:#111;font-weight:800;padding:12px;border-radius:999px;cursor:pointer;font-size:1rem}' +
      '.bh-pwd-force-card button:disabled{opacity:.65;cursor:not-allowed}';
    document.head.appendChild(s);
  }

  function paintReqs(box, raw) {
    if (!box) return;
    var c = checks(raw);
    box.querySelectorAll('[data-req]').forEach(function (li) {
      var k = li.getAttribute('data-req');
      li.classList.toggle('ok', !!c[k]);
    });
  }

  function bindMeter(input, box) {
    if (!input || !box) return;
    ensureCss();
    if (!box.querySelector('.bh-pwd-reqs')) box.innerHTML = reqsHtml();
    var run = function () { paintReqs(box, input.value); };
    input.addEventListener('input', run);
    run();
  }

  function forceChange(opts) {
    opts = opts || {};
    ensureCss();
    return new Promise(function (resolve, reject) {
      var ov = document.createElement('div');
      ov.className = 'bh-pwd-force';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.innerHTML =
        '<div class="bh-pwd-force-card">' +
          '<h2>Actualiza tu contraseña</h2>' +
          '<p class="lead">' + MSG_FORCE + '</p>' +
          '<label for="bh-pwd-new">Nueva contraseña</label>' +
          '<input id="bh-pwd-new" type="password" autocomplete="new-password" maxlength="72">' +
          '<div id="bh-pwd-meter"></div>' +
          '<label for="bh-pwd-confirm">Confirmar contraseña</label>' +
          '<input id="bh-pwd-confirm" type="password" autocomplete="new-password" maxlength="72">' +
          '<p class="err" id="bh-pwd-err"></p>' +
          '<button type="button" id="bh-pwd-save">Guardar y continuar</button>' +
        '</div>';
      document.body.appendChild(ov);
      var neu = ov.querySelector('#bh-pwd-new');
      var conf = ov.querySelector('#bh-pwd-confirm');
      var err = ov.querySelector('#bh-pwd-err');
      var btn = ov.querySelector('#bh-pwd-save');
      bindMeter(neu, ov.querySelector('#bh-pwd-meter'));
      neu.focus();
      function setErr(t) { err.textContent = t || ''; }
      btn.addEventListener('click', function () {
        var n = neu.value;
        var c = conf.value;
        if (n !== c) { setErr('Las contraseñas no coinciden.'); return; }
        var bad = issue(n);
        if (bad) { setErr(bad); return; }
        if (opts.oldPassword && n === opts.oldPassword) {
          setErr('La nueva contraseña debe ser distinta a la actual.');
          return;
        }
        btn.disabled = true;
        setErr('');
        var base = String(opts.apiBase || '').replace(/\/$/, '');
        fetch(base + '/api/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: opts.email || '',
            changeToken: opts.changeToken || '',
            oldPassword: opts.oldPassword || '',
            newPassword: n,
            confirmNewPassword: c
          })
        })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (out) {
            if (!out.ok) throw new Error(out.j && out.j.message || 'No se pudo actualizar');
            var token = out.j.token || (out.j.data && out.j.data.token);
            var user = out.j.user || (out.j.data && out.j.data.user);
            ov.remove();
            resolve({ token: token, user: user, j: out.j });
          })
          .catch(function (e) {
            btn.disabled = false;
            setErr(e.message || 'No se pudo guardar.');
          });
      });
    });
  }

  async function afterLogin(data, ctx) {
    ctx = ctx || {};
    if (!data || !data.mustChangePassword) return data;
    var done = await forceChange({
      apiBase: ctx.apiBase,
      changeToken: data.changeToken,
      oldPassword: ctx.oldPassword || '',
      email: ctx.email || (data.user && data.user.email) || ''
    });
    return {
      token: done.token || (done.j && done.j.token),
      user: done.user || (done.j && done.j.user) || data.user,
      mustChangePassword: false
    };
  }

  w.BHPassword = {
    MIN: MIN,
    MSG_FORCE: MSG_FORCE,
    checks: checks,
    ok: ok,
    issue: issue,
    reqsHtml: reqsHtml,
    bindMeter: bindMeter,
    forceChange: forceChange,
    afterLogin: afterLogin
  };
})(window);
