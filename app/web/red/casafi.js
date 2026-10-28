// ==========================================================================
// CasaFi: la bienvenida, el acceso y Ajustes → Aplicación (fase 3, 28-10-2026).
//
//  · Bienvenida: la primera vez (sin router configurado) tapa la app y pide la
//    dirección y la contraseña del router (las de LuCI) y una contraseña para
//    CasaFi; después ofrece preparar el router (lo del tráfico por aplicación).
//  · CF.entrar(): pide la contraseña de CasaFi cuando algo necesita sesión.
//  · CF.abrir(): la ventana de Ajustes → Aplicación: el router, las
//    integraciones opcionales (AdGuard Home, Tailscale, Telegram, Home
//    Assistant), la contraseña y el diagnóstico para mandar si algo falla.
// Todo habla con /api/app/… (casalab_red.py).
// ==========================================================================
(function () {
  var T = function (s) { return window.CL_TR ? CL_TR(s) : s; };
  var est = null;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function api(ruta, cuerpo) {
    return fetch(ruta, cuerpo === undefined ? { credentials: "include" } : { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-NX-Panel": "1" }, body: JSON.stringify(cuerpo) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) { var e = new Error(j.error || "sin respuesta"); e.cod = r.status; throw e; } return j; }); });
  }
  function leerEstado() { return api("/api/app/estado").then(function (e) { est = e; return e; }); }

  // ---- una ventana encima de todo
  function ventana(html, clase) {
    cerrar();
    var v = document.createElement("div");
    v.id = "cf-capa";
    v.className = clase || "";
    v.innerHTML = '<div class="cf-caja" role="dialog" aria-modal="true">' + html + "</div>";
    document.body.appendChild(v);
    v.addEventListener("click", function (e) { if (e.target === v && !v.classList.contains("fija")) cerrar(); });
    var i = v.querySelector("input");
    if (i) setTimeout(function () { i.focus(); }, 30);
    return v;
  }
  function cerrar() { var v = document.getElementById("cf-capa"); if (v) v.remove(); }
  function campo(id, rotulo, tipo, valor, ayuda, extra) {
    return '<label class="cf-campo"><span>' + rotulo + "</span><input id=\"" + id + '" type="' + (tipo || "text") + '" value="' + esc(valor || "") + '" autocomplete="off" spellcheck="false"' + (extra || "") + ">" +
      (ayuda ? "<small>" + ayuda + "</small>" : "") + "</label>";
  }
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; }
  function error(v, texto) { var e = v.querySelector(".cf-error"); if (e) { e.textContent = texto || ""; e.hidden = !texto; } }
  function ocupado(b, si, texto) { if (!b) return; b.disabled = si; if (texto) b.textContent = texto; }

  // ================================================================ bienvenida
  function bienvenida(e) {
    var v = ventana(
      '<div class="cf-logo"></div><h2>Bienvenido a CasaFi</h2>' +
      '<p class="cf-nota">La red de casa al estilo UniFi para tu router OpenWrt. Para empezar, CasaFi necesita entrar en el router con su usuario de administrador (el mismo de LuCI).</p>' +
      '<div class="cf-paso"><b>1</b><div><h3>Tu router</h3>' +
        campo("cf-ip", "Dirección del router", "text", e.router.ip || e.router_sugerido || "192.168.1.1", "Normalmente 192.168.1.1. Es la página donde abres LuCI.") +
        campo("cf-usr", "Usuario", "text", e.router.usuario || "root") +
        campo("cf-pw", "Contraseña del router", "password", "", "La de entrar en LuCI. Se guarda solo en este servidor.") +
      "</div></div>" +
      '<div class="cf-paso"><b>2</b><div><h3>Una contraseña para CasaFi</h3>' +
        campo("cf-app1", "Contraseña", "password", "", "Para hacer cambios desde CasaFi (en el router, nombres, iconos…). Mínimo 6 caracteres.") +
        campo("cf-app2", "Repítela", "password", "") +
      "</div></div>" +
      '<p class="cf-error" hidden></p><div class="cf-botones"><button type="button" class="cf-btn pri" id="cf-ir">Conectar</button></div>', "fija cf-bienvenida");
    v.querySelector("#cf-ir").addEventListener("click", function () {
      var b = this;
      error(v);
      if (!val("cf-pw")) return error(v, "Escribe la contraseña del router.");
      if (val("cf-app1").length < 6) return error(v, "La contraseña de CasaFi tiene que tener al menos 6 caracteres.");
      if (val("cf-app1") !== val("cf-app2")) return error(v, "Las dos contraseñas de CasaFi no coinciden.");
      ocupado(b, true, "Probando el router…");
      api("/api/app/bienvenida", { ip: val("cf-ip"), usuario: val("cf-usr"), clave: document.getElementById("cf-pw").value, clave_app: document.getElementById("cf-app1").value })
        .then(function (r) { preparar(r, true); })
        .catch(function (er) { ocupado(b, false, "Conectar"); error(v, er.message); });
    });
  }
  // paso 3: preparar el router (opcional, pero es lo que da el tráfico por aplicación)
  function preparar(info, enBienvenida) {
    var v = ventana(
      (enBienvenida ? '<div class="cf-ok">✓</div><h2>Conectado' + (info && info.modelo ? " a " + esc(info.modelo) : "") + "</h2>" +
        (info && info.version ? '<p class="cf-nota">' + esc(info.version) + "</p>" : "") : "<h2>Preparar el router</h2>") +
      '<div class="cf-paso"><b>' + (enBienvenida ? "3" : "·") + '</b><div><h3>Preparar el router <small>recomendado</small></h3>' +
        '<p class="cf-nota">Para ver qué aplicaciones y webs usa cada equipo, CasaFi instala en el router un pequeño script que solo lee sus conexiones, le da permiso para leerlo y enciende el contador de bytes. Entra por SSH con la misma contraseña. Si tu router no tiene <code>bridge</code> o <code>ethtool</code>, también los instala (necesita Internet).</p>' +
        '<ul class="cf-pasos" id="cf-pasos"></ul></div></div>' +
      '<p class="cf-error" hidden></p><div class="cf-botones">' +
        '<button type="button" class="cf-btn" id="cf-saltar">' + (enBienvenida ? "Ahora no" : "Cerrar") + '</button><button type="button" class="cf-btn pri" id="cf-prep">Preparar el router</button></div>', enBienvenida ? "fija cf-bienvenida" : "");
    v.querySelector("#cf-saltar").addEventListener("click", function () { if (enBienvenida) location.reload(); else abrir(); });
    v.querySelector("#cf-prep").addEventListener("click", function () {
      var b = this;
      error(v);
      ocupado(b, true, "Preparando…");
      api("/api/app/preparar", {}).then(function (r) {
        v.querySelector("#cf-pasos").innerHTML = r.pasos.map(function (p) { return '<li class="' + (p[1] ? "si" : "no") + '">' + (p[1] ? "✓ " : "✗ ") + esc(p[0]) + "</li>"; }).join("");
        ocupado(b, false, enBienvenida ? "Abrir CasaFi" : "Hecho");
        b.onclick = function () { if (enBienvenida) location.reload(); else abrir(); };
      }).catch(function (er) { ocupado(b, false, "Reintentar"); error(v, er.message); });
    });
  }

  // ================================================================ entrar
  // devuelve una promesa: true si ya hay sesión al terminar
  function entrar(para) {
    return new Promise(function (listo) {
      var v = ventana('<h2>Entrar en CasaFi</h2><p class="cf-nota">' + esc(para ? para + " pide" : "Hace falta") + " la contraseña de CasaFi.</p>" +
        campo("cf-clave", "Contraseña", "password", "") + '<p class="cf-error" hidden></p>' +
        '<div class="cf-botones"><button type="button" class="cf-btn" id="cf-no">Cancelar</button><button type="button" class="cf-btn pri" id="cf-si">Entrar</button></div>');
      function ir() {
        error(v);
        api("/api/app/entrar", { clave: document.getElementById("cf-clave").value })
          .then(function () { cerrar(); if (est) est.sesion = true; listo(true); })
          .catch(function (er) { error(v, er.message); });
      }
      v.querySelector("#cf-si").addEventListener("click", ir);
      v.querySelector("#cf-clave").addEventListener("keydown", function (e) { if (e.key === "Enter") ir(); });
      v.querySelector("#cf-no").addEventListener("click", function () { cerrar(); listo(false); });
    });
  }

  // ================================================================ Ajustes → Aplicación
  var INTEG = {
    adguard: ["AdGuard Home", "shield-check-outline", "El escudo DNS: consultas y bloqueos, y qué aplicación usa cada equipo.",
      'Instálalo en este servidor o en otro de casa (<a href="https://github.com/AdguardTeam/AdGuardHome#getting-started" target="_blank" rel="noopener">cómo</a>) y pon su dirección, por ejemplo <code>http://192.168.1.10:3000</code>, con el usuario y la contraseña de su panel.'],
    tailscale: ["Tailscale", "shield-lock-outline", "La VPN: entrar en casa desde fuera, equipos conectados y nodo de salida.",
      'Instala Tailscale en este servidor (<a href="https://tailscale.com/download/linux" target="_blank" rel="noopener">cómo</a>), entra con tu cuenta (<code>sudo tailscale up</code>) y monta en el contenedor su orden y su socket (vienen en el <code>docker-compose.yml</code>). Después pulsa «Conectar».'],
    telegram: ["Telegram", "send-outline", "Avisos al móvil: equipos nuevos, cortes de Internet, cambios en el router.",
      'Crea un bot hablando con <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> (te da el token), escríbele cualquier cosa a tu bot y pon aquí tu número de chat (te lo dice <a href="https://t.me/userinfobot" target="_blank" rel="noopener">@userinfobot</a>).'],
    home_assistant: ["Home Assistant", "home-assistant", "Ponerles nombre a los equipos con lo que ya sabe Home Assistant.",
      "La dirección de Home Assistant (por ejemplo <code>http://192.168.1.10:8123</code>) y un token de acceso de larga duración (tu perfil → Seguridad)."]
  };
  function ico(n) { return '<span class="cf-i" style="--i:url(/mdi/' + n + '.svg)"></span>'; }
  function tarjeta(n, e) {
    var x = INTEG[n], d = e[n] || {}, activo = n === "adguard" ? e.adguard_ok : n === "tailscale" ? e.tailscale_hay : !!d.activo;
    var campos = n === "adguard" ? campo("cf-ag-url", "Dirección", "text", d.url) + campo("cf-ag-usr", "Usuario", "text", d.usuario) + campo("cf-ag-pw", "Contraseña", "password", "", d.clave ? "Déjala vacía para no cambiarla." : "")
      : n === "telegram" ? campo("cf-tg-tok", "Token del bot", "password", "", d.activo ? "Ya está puesto: escríbelo solo para cambiarlo." : "") + campo("cf-tg-chat", "Tu número de chat", "text", d.chat)
      : n === "home_assistant" ? campo("cf-ha-url", "Dirección", "text", d.url) + campo("cf-ha-tok", "Token", "password", "")
      : "";
    return '<div class="cf-integ' + (activo ? " on" : "") + '" data-n="' + n + '"><div class="cf-integ-cab">' + ico(x[1]) + "<div><b>" + x[0] + "</b><small>" + x[2] + "</small></div>" +
      '<span class="cf-estado">' + (activo ? "Conectado" : "Sin conectar") + "</span></div>" +
      '<details' + (activo ? "" : " open") + "><summary>" + (activo ? "Cambiar" : "Cómo conectarlo") + '</summary><p class="cf-nota">' + x[3] + "</p>" + campos +
      '<p class="cf-error" hidden></p><div class="cf-botones">' + (activo ? '<button type="button" class="cf-btn" data-quitar="' + n + '">Desconectar</button>' : "") +
      '<button type="button" class="cf-btn pri" data-conectar="' + n + '">Conectar</button></div></details></div>';
  }
  function abrir(seccion) {
    leerEstado().then(function (e) {
      if (!e.sesion) return entrar("Ajustes de la aplicación").then(function (si) { if (si) abrir(seccion); });
      var v = ventana(
        '<div class="cf-cab"><h2>Aplicación</h2><button type="button" class="cf-x" aria-label="Cerrar">×</button></div>' +
        '<section><h3>Router</h3><div class="cf-fila">' + ico("router-wireless") + "<div><b>" + esc(e.router.ip) + "</b><small>usuario " + esc(e.router.usuario) + " · " +
          (e.preparado ? "preparado para el tráfico por aplicación" : "sin preparar: no se ve el tráfico por aplicación") + "</small></div>" +
          '<button type="button" class="cf-btn" id="cf-a-prep">' + (e.preparado ? "Volver a preparar" : "Preparar") + '</button><button type="button" class="cf-btn" id="cf-a-router">Cambiar</button></div></section>' +
        "<section><h3>Integraciones <small>opcionales: conecta las que tengas</small></h3>" + Object.keys(INTEG).map(function (n) { return tarjeta(n, e); }).join("") + "</section>" +
        '<section><h3>Acceso</h3><div class="cf-fila">' + ico("key-outline") + "<div><b>Contraseña de CasaFi</b><small>la que piden los cambios</small></div>" +
          '<button type="button" class="cf-btn" id="cf-a-clave">Cambiar</button><button type="button" class="cf-btn" id="cf-a-salir">Salir</button></div></section>' +
        '<section><h3>Si algo falla</h3><div class="cf-fila">' + ico("file-document-outline") + "<div><b>Diagnóstico</b><small>un informe con el registro de la app, sin contraseñas, para mandarlo a quien te ayude</small></div>" +
          '<a class="cf-btn pri" href="/api/app/diagnostico" download>Descargar</a></div>' +
          '<p class="cf-nota">CasaFi ' + esc(e.version) + "</p></section>", "cf-ajustes");
      v.querySelector(".cf-x").addEventListener("click", cerrar);
      v.querySelector("#cf-a-prep").addEventListener("click", function () { preparar(null, false); });
      v.querySelector("#cf-a-router").addEventListener("click", function () { cambiarRouter(e); });
      v.querySelector("#cf-a-clave").addEventListener("click", cambiarClave);
      v.querySelector("#cf-a-salir").addEventListener("click", function () { api("/api/app/salir", {}).then(function () { location.reload(); }); });
      v.addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-conectar],[data-quitar]");
        if (!b) return;
        var n = b.dataset.conectar || b.dataset.quitar, caja = b.closest(".cf-integ"), c = { nombre: n };
        if (b.dataset.quitar) c.quitar = true;
        else if (n === "adguard") { c.url = val("cf-ag-url"); c.usuario = val("cf-ag-usr"); if (document.getElementById("cf-ag-pw").value) c.clave = document.getElementById("cf-ag-pw").value; }
        else if (n === "telegram") { c.token = val("cf-tg-tok"); c.chat = val("cf-tg-chat"); }
        else if (n === "home_assistant") { c.url = val("cf-ha-url"); c.token = val("cf-ha-tok"); }
        error(caja);
        ocupado(b, true, "Probando…");
        api("/api/app/integracion", c).then(function () { abrir(); }).catch(function (er) { ocupado(b, false, b.dataset.quitar ? "Desconectar" : "Conectar"); error(caja, er.message); });
      });
      if (seccion) { var s = v.querySelector('[data-n="' + seccion + '"]'); if (s) s.scrollIntoView({ block: "center" }); }
    });
  }
  function cambiarRouter(e) {
    var v = ventana("<h2>Cambiar de router</h2>" + campo("cf-ip", "Dirección del router", "text", e.router.ip) + campo("cf-usr", "Usuario", "text", e.router.usuario) +
      campo("cf-pw", "Contraseña del router", "password", "") + '<p class="cf-error" hidden></p><div class="cf-botones"><button type="button" class="cf-btn" id="cf-no">Cancelar</button><button type="button" class="cf-btn pri" id="cf-si">Probar y guardar</button></div>');
    v.querySelector("#cf-no").addEventListener("click", function () { abrir(); });
    v.querySelector("#cf-si").addEventListener("click", function () {
      var b = this;
      ocupado(b, true, "Probando…");
      api("/api/app/bienvenida", { ip: val("cf-ip"), usuario: val("cf-usr"), clave: document.getElementById("cf-pw").value })
        .then(function () { location.reload(); }).catch(function (er) { ocupado(b, false, "Probar y guardar"); error(v, er.message); });
    });
  }
  function cambiarClave() {
    var v = ventana("<h2>Contraseña de CasaFi</h2>" + campo("cf-n1", "Nueva contraseña", "password", "") + campo("cf-n2", "Repítela", "password", "") +
      '<p class="cf-error" hidden></p><div class="cf-botones"><button type="button" class="cf-btn" id="cf-no">Cancelar</button><button type="button" class="cf-btn pri" id="cf-si">Guardar</button></div>');
    v.querySelector("#cf-no").addEventListener("click", function () { abrir(); });
    v.querySelector("#cf-si").addEventListener("click", function () {
      if (val("cf-n1") !== val("cf-n2")) return error(v, "No coinciden.");
      api("/api/app/clave", { clave: document.getElementById("cf-n1").value }).then(function () { abrir(); }).catch(function (er) { error(v, er.message); });
    });
  }

  window.CF = { entrar: entrar, abrir: abrir, estado: function () { return est; } };
  // los botones de Ajustes → Aplicación y los avisos de «conecta esto» (data-cfp="integración")
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-cfp]");
    if (!b) return;
    ev.preventDefault();
    ev.stopPropagation();
    abrir(b.dataset.cfp || "");
  }, true);
  // instalaciones de antes (router por variables de entorno): falta crear la contraseña
  function crearClave() {
    var v = ventana('<div class="cf-logo"></div><h2>Crea la contraseña de CasaFi</h2><p class="cf-nota">Desde ahora los cambios (en el router, nombres, iconos…) piden una contraseña propia de CasaFi.</p>' +
      campo("cf-n1", "Contraseña", "password", "", "Mínimo 6 caracteres.") + campo("cf-n2", "Repítela", "password", "") +
      '<p class="cf-error" hidden></p><div class="cf-botones"><button type="button" class="cf-btn" id="cf-no">Más tarde</button><button type="button" class="cf-btn pri" id="cf-si">Guardar</button></div>');
    v.querySelector("#cf-no").addEventListener("click", cerrar);
    v.querySelector("#cf-si").addEventListener("click", function () {
      if (val("cf-n1") !== val("cf-n2")) return error(v, "No coinciden.");
      api("/api/app/clave", { clave: document.getElementById("cf-n1").value }).then(cerrar).catch(function (er) { error(v, er.message); });
    });
  }
  leerEstado().then(function (e) { if (!e.configurado) bienvenida(e); else if (!e.clave_app) crearClave(); }).catch(function () { /* sin servidor: ya lo dirá la app */ });
})();
