(function (w) {
  var CORE = 'https://core-api.buenohotel.com.do';

  function base() {
    try {
      if (typeof w.getAuthApiBase === 'function') {
        var b = String(w.getAuthApiBase() || '').replace(/\/$/, '');
        if (b) return b;
      }
    } catch (_) {}
    return CORE;
  }

  function fmt(seg) {
    seg = Math.max(0, Math.ceil(Number(seg) || 0));
    var m = Math.floor(seg / 60);
    var s = seg % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function lockMsg(lock) {
    var min = Number(lock && lock.lockMinutos) || (Number(lock && lock.remainingSeg) > 300 ? 30 : 5);
    var custom = lock && lock.message ? String(lock.message) : '';
    if (custom && /inhabilit/i.test(custom)) return custom;
    return 'Login inhabilitado ' + min + ' minutos por 3 intentos fallidos.';
  }

  function parseLock(j, status) {
    j = j && typeof j === 'object' ? j : {};
    var remainingSeg = Math.max(
      0,
      Number(j.remainingSeg) || Math.ceil((Number(j.remainingMs) || 0) / 1000)
    );
    var locked = Boolean(j.locked) || Number(status) === 429 || remainingSeg > 0 && Number(status) >= 400;
    if (!locked && remainingSeg <= 0) return { locked: false, remainingSeg: 0 };
    if (!locked) return { locked: false, remainingSeg: 0 };
    var lockMinutos = Number(j.lockMinutos) || (remainingSeg > 300 ? 30 : 5);
    if (!remainingSeg) remainingSeg = lockMinutos * 60;
    return {
      locked: true,
      remainingSeg: remainingSeg,
      remainingMs: Number(j.remainingMs) || remainingSeg * 1000,
      lockMinutos: lockMinutos,
      message: lockMsg({ message: j.message, lockMinutos: lockMinutos, remainingSeg: remainingSeg })
    };
  }

  async function fetchTimeout(url, opts, ms) {
    var ctrl = new AbortController();
    var t = setTimeout(function () {
      try { ctrl.abort(); } catch (_) {}
    }, ms || 12000);
    try {
      return await fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal }));
    } finally {
      clearTimeout(t);
    }
  }

  async function check(email) {
    var em = String(email || '').trim().toLowerCase();
    if (!em) return { locked: false, remainingSeg: 0 };
    var q = encodeURIComponent(em);
    var urls = [
      base() + '/api/facturacion/auditoria/lock?email=' + q,
      base() + '/api/auth/lock?email=' + q
    ];
    for (var i = 0; i < urls.length; i++) {
      try {
        var res = await fetchTimeout(urls[i], { method: 'GET', headers: { Accept: 'application/json' } }, 8000);
        var j = await res.json().catch(function () { return {}; });
        var st = parseLock(j, res.status);
        if (st.locked) return st;
        if (res.ok) return { locked: false, remainingSeg: 0 };
      } catch (_) {}
    }
    return { locked: false, remainingSeg: 0 };
  }

  function attachUi(opts) {
    opts = opts || {};
    var errorEl = opts.errorEl;
    var btn = opts.btn;
    var idleLabel = opts.idleLabel || 'Iniciar Sesión';
    var timer = 0;
    var remaining = 0;

    function paint() {
      if (errorEl) {
        if (remaining > 0) {
          errorEl.classList.add('is-lock');
          errorEl.style.display = 'block';
          errorEl.textContent =
            lockMsg({ remainingSeg: remaining, lockMinutos: remaining > 300 ? 30 : 5 }) +
            ' Espera ' + fmt(remaining) + '.';
        }
      }
      if (btn) {
        if (remaining > 0) {
          btn.disabled = true;
          btn.textContent = 'Inhabilitado ' + fmt(remaining);
        }
      }
    }

    function clearLock() {
      remaining = 0;
      if (timer) {
        clearInterval(timer);
        timer = 0;
      }
      if (errorEl) {
        errorEl.classList.remove('is-lock');
      }
      if (btn) {
        btn.disabled = false;
        if (opts.useInnerHTML) btn.innerHTML = idleLabel;
        else btn.textContent = idleLabel;
      }
    }

    function start(lock) {
      var st = parseLock(lock, lock && (lock.locked || lock.remainingSeg) ? 429 : 200);
      if (!st.locked) {
        clearLock();
        return st;
      }
      remaining = st.remainingSeg;
      if (timer) clearInterval(timer);
      paint();
      timer = setInterval(function () {
        remaining -= 1;
        if (remaining <= 0) {
          clearLock();
          if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
          }
          return;
        }
        paint();
      }, 1000);
      return st;
    }

    return {
      start: start,
      clear: clearLock,
      remaining: function () { return remaining; }
    };
  }

  w.bhLoginLock = {
    check: check,
    parse: parseLock,
    fetchTimeout: fetchTimeout,
    fmt: fmt,
    message: lockMsg,
    attachUi: attachUi,
    core: CORE
  };
})(window);
