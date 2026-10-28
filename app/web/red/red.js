// CasaFi Network: la interfaz. Nació sacada de la custom.js de un panel de
// Homepage (tools/extraer_red.py + adaptador.js); desde la fase 3 es la fuente
// y se toca aquí. La bienvenida, el acceso y Ajustes → Aplicación van en casafi.js.
(function () {
  // ==========================================================================
  // Adaptador (casalab-red, fase 2). Lo que la Red pedía a Homepage y al
  // armazón general del panel, hecho aquí. tools/extraer_red.py lo pone al
  // principio de red.js, dentro de la misma función, así que ve todo lo demás.
  // ==========================================================================
  var CDN = "/mdi/";                 // los iconos MDI los sirve la app (antes, jsDelivr)
  function icoU(n) { return CDN + n + ".svg"; }

  // Ajustes: los de fábrica del panel (AJ_DEF lo genera el extractor desde la
  // lista de ajustes de custom.js). Los que se cambien en la app, en localStorage.
  var CL_AJ = {};
  try { CL_AJ = JSON.parse(localStorage.getItem("cl-ajustes") || "{}") || {}; } catch (e) { /* sin almacenamiento */ }
  function A(k) { return k in CL_AJ ? CL_AJ[k] : AJ_DEF[k]; }

  // Aquí solo hay una pestaña.
  function pestanaActiva() { return "Red"; }
  function enPestanaPrincipal() { return false; }
  var VT = {
    Red: { ico: "lan", ruta: function () { var m = eqMac(); return m ? "/api/red/equipo?mac=" + m + "&rango=" + eq.rango : axSec() ? "/api/router/ajustes" : "/api/red"; }, cada: 5000,
      montar: function (c) {
        if (eqMac()) eqMontar(c); else if (axSec()) { axMontar(c); clAxNav(); } else { rdMontar(c); clArmar(c); }
        clAplicar();
      },
      pintar: function (d) { var m = eqMac(); if (m) { if (d.equipo ? d.equipo.mac === m : !!d.error) eqPintar(d); } else if (axSec()) { if (d.redes && d.zonas) axPintar(d); } else if (d.dispositivos) { rdPintar(d); clPintar(d); } },
      buscar: "Buscar equipo, IP o MAC…" },
  };

  // Las dos fichas de la portada que la Red reutiliza: «Tráfico de la línea»
  // (antes, la tarjeta de Glances del macmini; ahora la WAN del router, que ya
  // mide la app) y «Escudo DNS» (antes, la tarjeta de AdGuard de Homepage;
  // ahora /api/red/dns). Las dos se pintan con las mismas funciones de antes.
  var cc = { red: [], d: {}, dns: {}, firmas: {}, t: 0, ts: 0 };
  function ccPintar() {
    ccPoner("nx-cc-red", ccRed(cc.d, {}));
    ccPoner("nx-cc-dns", cc.dns.conectado === false ? clConecta("adguard", "shield-check-outline", "Conecta AdGuard Home", "para ver las consultas y los bloqueos de la red y qué aplicación usa cada equipo") : ccDns(cc.dns));
  }
  function lineaTic() {
    if (document.hidden || !document.getElementById("nx-cc-red")) return;
    // el tráfico ya lo trae el mapa cada 2 s (tr.d): aquí no se vuelve a pedir
    if (tr.d && tr.d.ts !== cc.ts) {
      var w = tr.d.wan || [0, 0];
      cc.ts = tr.d.ts;
      cc.d.baja = w[0] || 0;
      cc.d.sube = w[1] || 0;
      cc.red.push([cc.d.baja, cc.d.sube]);
      if (cc.red.length > 60) cc.red.shift();
      ccPintar();
    }
    if (Date.now() - cc.t > 30000) {
      cc.t = Date.now();
      fetch(CEN + "/api/red/dns").then(function (r) { return r.json(); }).then(function (d) { cc.dns = d || {}; ccPintar(); }).catch(function () { /* sin AdGuard */ });
    }
  }

  // ==========================================================================
  // El menú, como el de UniFi Network (28-10-2026). La barra lateral lleva sus
  // páginas con sus nombres en español: Panel (Dashboard), Topología,
  // Dispositivos (UniFi Devices), Clientes (Client Devices), Puertos (Ports),
  // Radios, Flujos (Insights) y Registro (System Log); abajo, Ajustes
  // (Settings), con sus grupos: WiFi, Redes, Internet, VPN, CyberSecure,
  // Motor de políticas y Sistema.
  //
  // La dirección lleva «?ver=<página>». La vista se monta una vez (rdMontar) y
  // aquí se reparte en páginas moviendo sus piezas: siguen pintándose por su
  // id, con la misma lectura de /api/red cada 5 s, así que cambiar de página
  // no pide nada nuevo. Lo único aparte es el Registro (/api/red/registro), y
  // solo mientras se mira.
  // ==========================================================================
  var CL_PAGS = [
    ["panel", "Panel", "view-dashboard-outline", "Dashboard"],
    ["topologia", "Topología", "sitemap-outline", "Topology"],
    ["dispositivos", "Dispositivos", "router-wireless", "UniFi Devices"],
    ["clientes", "Clientes", "devices", "Client Devices"],
    ["puertos", "Puertos", "ethernet", "Ports"],
    ["radios", "Radios", "access-point", "Radios"],
    ["flujos", "Flujos", "chart-timeline-variant", "Insights"],
    ["registro", "Registro", "text-box-outline", "System Log"]
  ];
  // Ajustes, agrupados como los de UniFi (las secciones son las de AX_SECS)
  var CL_AXG = [
    ["WiFi", ["wifi"]],
    ["Redes", ["redes", "fijas", "puertos"]],
    ["Internet", ["internet"]],
    ["VPN", ["vpn"]],
    ["CyberSecure", ["trafico"]],
    ["Motor de políticas", ["cortafuegos", "reenvios", "rutas", "dns"]],
    ["Sistema", ["router"]]
  ];
  var CL_AXN = {
    trafico: ["Filtrado de contenido", "Bloquear apps y webs, también por horas"],
    cortafuegos: ["Cortafuegos por zonas", "Quién puede hablar con quién"],
    dns: ["Registros DNS", "Nombres propios en casa"],
    puertos: ["Gestor de puertos", "Qué red va por cada boca"],
    router: ["Router", "Registro, servicios y reinicio"]
  };
  var cl = { ultima: "panel", red: null, reg: null, regTs: 0, regF: "todo" };

  function clVer() {
    if (eqMac()) return "clientes";
    if (axSec()) return "ajustes";
    var m = /[?&]ver=([a-z]+)(&|$)/.exec(location.search);
    return m && CL_PAGS.some(function (p) { return p[0] === m[1]; }) ? m[1] : "panel";
  }
  function clEnlace(v) { return location.pathname + (v && v !== "panel" ? "?ver=" + v : "") + (location.hash || "#red"); }
  function clIr(v) {
    try { history.pushState({ nx: 1 }, "", clEnlace(v)); } catch (e) { /* sin historial */ }
    if (document.querySelector("#nx-vista .cl-pg")) return clAplicar();
    eqCambio();
  }

  // la vista de la Red, repartida en páginas
  function clArmar(c) {
    var q = function (s) { return c.querySelector(s); }, caja = function (s) { var e = q(s); return e && (e.closest(".nx-b") || e); };
    var pg = {};
    CL_PAGS.forEach(function (p) {
      pg[p[0]] = document.createElement("div");
      pg[p[0]].className = "cl-pg";
      pg[p[0]].dataset.pg = p[0];
    });
    function fila(clase, piezas) {
      var f = document.createElement("div");
      f.className = "nx-vt-rejilla cl-fila " + (clase || "");
      piezas.forEach(function (p) { if (p) f.appendChild(p); });
      return f;
    }
    function nueva(clase, titulo, dentro) {
      var b = document.createElement("div");
      b.className = "nx-b " + clase;
      b.innerHTML = (titulo ? "<h3>" + titulo + "</h3>" : "") + (dentro || "");
      return b;
    }
    var cif = q("#nx-rd-cifras"), rou = q("#nx-rd-router"), viejas = c.querySelectorAll(".nx-rd-linea");
    cif.classList.remove("nx-rd-flota");
    rou.classList.remove("nx-rd-flota");
    var bCli = nueva("nx-f4 cl-b-cli", "Clientes <span>en línea ahora</span>"), bRou = nueva("nx-f4 cl-b-router", "");
    bCli.appendChild(cif);
    bRou.appendChild(rou);
    // Panel: lo de un vistazo, como el Dashboard
    pg.panel.appendChild(fila("", [bCli, caja("#nx-cc-red")]));
    pg.panel.appendChild(fila("", [caja("#nx-sa"), bRou]));
    pg.panel.appendChild(fila("", [nueva("nx-f4 cl-b-exp", "Experiencia WiFi <span>según la señal de cada cliente</span>", '<div id="cl-exp"></div>'), caja("#nx-cc-dns"), caja("#nx-rd-vel")]));
    pg.panel.appendChild(fila("", [nueva("nx-f4 cl-b-act", "Clientes más activos <span>ahora mismo</span>", '<div id="cl-act"></div>'), nueva("nx-f4 cl-b-mon", "Monitores de Internet <span>respuesta de cada uno</span>", '<div id="cl-mon"></div>'), nueva("nx-f4 cl-b-vpn", "VPN <span>Tailscale</span>", '<div id="cl-vpnr"></div>')]));
    pg.panel.appendChild(q("#nx-rs"));
    // Topología: el mapa, a toda la altura
    pg.topologia.appendChild(q(".nx-rd-escena"));
    // Dispositivos: el router en su tabla y, debajo, todo de él (#nx-rt se pone al entrar)
    pg.dispositivos.appendChild(nueva("cl-tabla", "", '<div id="cl-disp"></div>'));
    pg.dispositivos.appendChild(Object.assign(document.createElement("div"), { id: "cl-rt" }));
    // Clientes: la lista con sus filtros
    var barra = q(".nx-rd-barra");
    barra.insertAdjacentHTML("beforeend", '<button type="button" class="cl-csv" data-clcsv="clientes" title="Descargar la lista en CSV">' + exIco("download") + "CSV</button>");
    pg.clientes.appendChild(barra);
    pg.clientes.appendChild(q(".nx-rd-lista"));
    pg.clientes.appendChild(nueva("cl-tabla cl-b-vpnt", "Clientes VPN <span>Tailscale (Teleport y VPN en UniFi)</span>", '<div id="cl-vpn"></div>'));
    // Puertos: las bocas en directo y su tabla
    pg.puertos.appendChild(fila("", [caja("#nx-pt")]));
    pg.puertos.appendChild(nueva("cl-tabla", "", '<div id="cl-puertos"></div>'));
    // Radios
    pg.radios.appendChild(Object.assign(document.createElement("div"), { id: "cl-bandas", className: "nx-vt-rejilla cl-fila" }));
    pg.radios.appendChild(nueva("cl-tabla", "", '<div id="cl-radios"></div>'));
    // Flujos: adónde va el tráfico y las conexiones en directo
    pg.flujos.appendChild(q("#nx-mu"));
    // Registro
    pg.registro.appendChild(nueva("cl-reg-caja", "", '<div class="cl-reg-cab"><div class="cl-reg-filtros" id="cl-reg-f"></div><button type="button" class="cl-csv" data-clcsv="registro" title="Descargar lo filtrado en CSV">' + exIco("download") + 'CSV</button></div><div id="cl-reg"><p class="nx-b-nota">Leyendo el registro…</p></div>'));
    viejas.forEach(function (v) { v.remove(); });
    var ficha = q("#nx-rd-ficha");
    CL_PAGS.forEach(function (p) { c.insertBefore(pg[p[0]], ficha); });
  }

  // el nombre de la página arriba y en la pestaña del navegador
  function clCab() {
    var v = clVer(), p = CL_PAGS.filter(function (x) { return x[0] === v; })[0];
    var t = p ? p[1] : "Ajustes", h = document.querySelector("#nx-vista .nx-cfg-cab h1"), i = document.querySelector("#nx-vista .nx-cfg-cab .nx-tit-ico");
    if (h && h.textContent !== t) h.textContent = t;
    if (i) i.style.setProperty("--u", 'url("' + icoU(p ? p[2] : "cog-outline") + '")');
    document.title = t + " · CasaFi";
  }
  function clMarcar() {
    var v = clVer();
    document.querySelectorAll(".cl-lado [data-clv]").forEach(function (a) { a.classList.toggle("on", a.dataset.clv === v); });
  }
  function clAplicar() {
    var v = clVer(), sec = document.getElementById("nx-vista");
    clMarcar();
    clCab();
    if (!sec || !sec.querySelector(".cl-pg") || sec.dataset.pg === v) return;
    sec.dataset.pg = v;
    cl.ultima = v;
    // el detalle del router solo existe en su página (sus id no se repiten)
    var det = document.getElementById("cl-rt");
    if (det) det.innerHTML = v === "dispositivos" ? '<div id="nx-rt"></div><div class="nx-cp-caja">' +
      rtSec("backup-restore", "Copias de la configuración", "para volver atrás si algo se rompe", '<div id="nx-cp"></div>', "nx-rt-ancha") + "</div>" : "";
    rt.f = "";
    if (v === "topologia") { rdV.k = 0; vs.firmas.mapa = ""; }
    if (v === "registro") cl.regTs = 0;
    if (v === "flujos") mu.ts = 0;
    if (vs.datos) VT.Red.pintar(vs.datos);
    var w = document.getElementById("inner_wrapper");
    if (w) w.scrollTop = 0;
  }

  // ------------------------------------------------ lo propio de cada página
  function clTabla(cab, filas, vacio) {
    if (!filas.length) return '<p class="nx-b-nota">' + vacio + "</p>";
    return '<div class="cl-t-scroll"><table class="cl-t"><thead><tr>' + cab.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>" +
      filas.map(function (f) { return "<tr>" + f.map(function (c) { return "<td>" + (c == null || c === "" ? "—" : c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  }
  function clEstado(si, a, b) { return '<span class="cl-est ' + (si ? "ok" : "no") + '"><i></i>' + (si ? a : b) + "</span>"; }
  function clVel(v) { return v ? megabits(v) + " " + unidadRed() : "0"; }

  function clDispositivos(d) {
    var ro = d.router || {}, m = ro.mas || {}, y = m.sistema || {}, r = d.resumen || {}, w = (tr.d && tr.d.wan) || [0, 0];
    var mem = y.mem_total ? Math.round((1 - y.mem_libre / y.mem_total) * 100) + " %" : ro.memoria != null ? ro.memoria + " %" : "";
    vPoner("cl-disp", clTabla(["Nombre", "Modelo", "Estado", "IP", "Firmware", "Encendido", "Clientes", "Carga", "Memoria", "Internet ahora"], [[
      '<button type="button" class="cl-nombre" data-rt="1">' + exIco("router-wireless") + "<b>" + escapar(y.nombre || "Router") + "</b></button>",
      escapar(ro.modelo || ""), clEstado(!d.error, "En línea", "Sin respuesta"), escapar(ro.ip || ""),
      escapar("OpenWrt " + (y.version || ro.version || "")), ro.encendido ? vDura(ro.encendido) : "",
      String(r.en_linea || 0), ro.carga != null ? String(ro.carga).replace(".", ",") : "", mem,
      "↓ " + clVel(w[0]) + " · ↑ " + clVel(w[1])
    ]], ""));
  }

  function clPuertos(d) {
    var m = (d.router || {}).mas || {}, t = tr.d || { puertos: {}, wan: [0, 0] }, disp = d.dispositivos || [];
    vPoner("cl-puertos", clTabla(["Puerto", "Estado", "Velocidad", "Equipos", "Entra ahora", "Sale ahora", "Recibido", "Enviado", "Errores", "Descartes"],
      (m.puertos || []).map(function (p) {
        var wan = p.nombre === "wan", v = (wan ? t.wan : t.puertos[p.nombre]) || [0, 0];
        var quien = disp.filter(function (x) { return x.en_linea && (x.puerto || x.puerto_auto) === p.nombre; });
        return ['<b class="cl-boca">' + escapar(wan ? "WAN" : p.nombre.replace(/^lan/, "LAN ")) + "</b>" + (wan ? '<small class="cl-sub">Internet</small>' : ""),
          clEstado(p.enlace, "Conectado", "Sin cable"),
          p.enlace ? (p.velocidad >= 1000 ? p.velocidad / 1000 + " GbE" : p.velocidad + " Mb/s") + (p.duplex === "medio" ? " · medio dúplex" : "") : "",
          wan ? escapar((d.operador || {}).nombre || "") : quien.length ? quien.map(function (x) { return '<a href="' + eqEnlace(x.mac) + '" data-eq="' + x.mac + '">' + escapar(x.alias || x.nombre || x.ip) + "</a>"; }).join(", ") : "",
          clVel(v[0]), clVel(v[1]), vBytes(p.rx), vBytes(p.tx),
          p.errores ? '<b class="cl-mal">' + p.errores + "</b>" : "0", p.descartes ? '<b class="cl-av">' + p.descartes.toLocaleString("es-ES") + "</b>" : "0"];
      }), "El router todavía no ha dicho qué puertos tiene.") +
      '<p class="nx-b-nota cl-nota">Qué red (VLAN) va por cada boca se cambia en <a href="?ajustes=puertos#red" data-axir="puertos">Ajustes → Gestor de puertos</a>.</p>');
  }

  function clRadios(d) {
    var m = (d.router || {}).mas || {}, cli = {}, por = {};
    (d.radios || []).forEach(function (x) { cli[x.ssid + "|" + (String(x.banda).charAt(0) === "5" ? "5" : "2")] = x; });
    // los clientes de cada banda, por la calidad de su señal (como UniFi)
    (d.dispositivos || []).forEach(function (x) {
      if (!x.en_linea || !x.wifi) return;
      var b = x.conexion === "wifi5" ? "5" : "2", q = rdCalidad(x);
      por[b] = por[b] || [0, 0, 0, 0, 0];
      por[b][q]++;
    });
    var bandas = {};
    (m.radios || []).forEach(function (r) {
      var b = String(r.banda).charAt(0) === "5" ? "5" : "2";
      var x = bandas[b] = bandas[b] || { canal: r.canal, cfg: r.canal_cfg, modo: r.modo, pot: r.potencia, ruido: r.ruido, n: 0, ssid: [] };
      x.n += (cli[r.ssid + "|" + b] || {}).clientes || 0;
      x.ssid.push(r.ssid);
    });
    var gen = function (modo) { var g = RT_WIFI.filter(function (w) { return w[0].test(modo || ""); })[0]; return g ? g[1] : ""; };
    var ancho = function (modo) { var a = String(modo || "").replace(/^\D+/, ""); return a ? a + " MHz" : ""; };
    vPoner("cl-bandas", ["2", "5"].filter(function (b) { return bandas[b]; }).map(function (b) {
      var x = bandas[b], q = por[b] || [0, 0, 0, 0, 0], tot = q[1] + q[2] + q[3] + q[4];
      var trozo = function (n, c, t) { return n ? '<i class="' + c + '" style="flex:' + n + '" title="' + t + ": " + n + '"></i>' : ""; };
      return '<div class="nx-b cl-banda"><h3>' + (b === "5" ? "5 GHz" : "2,4 GHz") + " <span>" + gen(x.modo) + "</span></h3>" +
        '<div class="cl-banda-cifra"><b>' + x.n + "</b><span>clientes</span>" + (clExp(d, b) != null ? '<em class="' + clTono(clExp(d, b)) + '">Experiencia ' + clExp(d, b) + " %</em>" : "") + "</div>" +
        '<dl class="cl-dl"><div><dt>Canal</dt><dd>' + x.canal + (x.cfg === "auto" ? " <small>automático</small>" : "") + "</dd></div><div><dt>Ancho</dt><dd>" + ancho(x.modo) + "</dd></div>" +
        "<div><dt>Potencia</dt><dd>" + (x.pot != null ? x.pot + " dBm" : "—") + "</dd></div><div><dt>Ruido</dt><dd>" + (x.ruido != null ? x.ruido + " dBm" : "—") + "</dd></div></dl>" +
        '<div class="cl-calidad">' + (tot ? trozo(q[4], "q4", "Excelente") + trozo(q[3], "q3", "Buena") + trozo(q[2], "q2", "Regular") + trozo(q[1], "q1", "Débil") : '<i class="q0" style="flex:1"></i>') + "</div>" +
        '<ul class="cl-calidad-ley"><li class="q4"><b>' + q[4] + "</b>excelente</li><li class=\"q3\"><b>" + q[3] + '</b>buena</li><li class="q2"><b>' + q[2] + "</b>regular</li><li class=\"q1\"><b>" + q[1] + "</b>débil</li></ul></div>";
    }).join(""));
    vPoner("cl-radios", clTabla(["Wifi (SSID)", "Red", "Banda", "Canal", "Ancho", "Potencia", "Ruido", "Clientes", "Seguridad", "Velocidad máx.", "Recibido", "Enviado"],
      (m.radios || []).map(function (r) {
        var b = String(r.banda).charAt(0) === "5" ? "5" : "2", x = cli[r.ssid + "|" + b] || {};
        return ["<b>" + escapar(r.ssid) + "</b>", x.invitados ? "Invitados" : x.red === "lan" ? "Casa" : escapar(x.red || ""), escapar(r.banda),
          r.canal + (r.canal_cfg === "auto" ? " <small>auto</small>" : ""), ancho(r.modo), r.potencia != null ? r.potencia + " dBm" : "", r.ruido != null ? r.ruido + " dBm" : "",
          String(x.clientes || 0), escapar(r.cifrado || ""), r.tasa ? (r.tasa >= 1e6 ? (r.tasa / 1e6).toFixed(1).replace(".", ",") + " Gb/s" : Math.round(r.tasa / 1000) + " Mb/s") : "",
          vBytes(r.rx), vBytes(r.tx)];
      }), "El router todavía no ha dicho qué radios tiene.") +
      '<p class="nx-b-nota cl-nota">Los canales, el ancho y la potencia se cambian en <a href="?ajustes=wifi#red" data-axir="wifi">Ajustes → WiFi</a>.</p>');
  }

  // Registro: los sucesos de la red, por tipo, como el System Log de UniFi
  var CL_REG = [["todo", "Todo"], ["clientes", "Clientes"], ["internet", "Internet"], ["cambios", "Cambios"], ["importante", "Importantes"]];
  function clRegTipo(e) {
    var t = (e.t || "").toLowerCase();
    if (/se ha (des)?conectado|nuevo en la red|identificado|otra dirección|expulsado|despertar/.test(t)) return "clientes";
    if (/internet se ha|internet ha vuelto|vuelto a conectar|línea va lenta|línea reconectada/.test(t)) return "internet";
    return "cambios";
  }
  function clImportante(e) { return e.nivel === "mal" || e.nivel === "aviso"; }
  function clRegLista() {
    return (cl.reg || []).filter(function (e) { e._t = e._t || clRegTipo(e); return cl.regF === "todo" || (cl.regF === "importante" ? clImportante(e) : e._t === cl.regF); });
  }
  // cada 15 s mientras se mira el Registro; si no, cada minuto, para la campana
  function clRegLeer() {
    if (Date.now() - cl.regTs < (clVer() === "registro" ? 15000 : 60000) || document.hidden) return;
    cl.regTs = Date.now();
    fetch(CEN + "/api/red/registro").then(function (r) { return r.json(); }).then(function (d) { cl.reg = d.eventos || []; clRegPintar(); clAlPintar(); }).catch(function () { cl.regTs = 0; });
  }
  function clRegPintar() {
    if (!cl.reg) return;
    var cuenta = { todo: cl.reg.length, clientes: 0, internet: 0, cambios: 0, importante: 0 };
    cl.reg.forEach(function (e) { e._t = e._t || clRegTipo(e); cuenta[e._t]++; if (e.nivel === "mal" || e.nivel === "aviso") cuenta.importante++; });
    vPoner("cl-reg-f", CL_REG.map(function (f) {
      return '<button type="button" data-clr="' + f[0] + '" class="' + (cl.regF === f[0] ? "on" : "") + '">' + f[1] + "<small>" + cuenta[f[0]] + "</small></button>";
    }).join(""));
    var lista = clRegLista().slice(0, 400);
    var hoy = new Date().toDateString(), ayer = new Date(Date.now() - 864e5).toDateString(), dia = "";
    var ICO = { clientes: "devices", internet: "web", cambios: "cog-outline" };
    vPoner("cl-reg", lista.length ? '<ul class="cl-reg">' + lista.map(function (e) {
      var f = new Date(e.ts * 1000), ds = f.toDateString(), h = "";
      if (ds !== dia) { dia = ds; h = '<li class="cl-reg-dia">' + (ds === hoy ? "Hoy" : ds === ayer ? "Ayer" : f.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })) + "</li>"; }
      return h + '<li class="cl-reg-e n-' + escapar(e.nivel || "info") + '"><time>' + vHora(e.ts) + "</time>" + exIco(ICO[e._t]) + "<span><b>" + escapar(e.t) + "</b>" + (e.d ? "<small>" + escapar(e.d) + "</small>" : "") + "</span></li>";
    }).join("") + "</ul>" : '<p class="nx-b-nota">Nada que contar con este filtro.</p>');
  }

  // lo que se pinta con cada lectura de /api/red: solo la página que se mira
  function clPintar(d) {
    var v = clVer();
    cl.red = d;
    if (v === "panel") { clExpPintar(d); clActivos(d); clVpnResumen(d); clMonitores(d); }
    else if (v === "topologia") clCvArrancar();
    else if (v === "clientes") clVpnTabla(d);
    else if (v === "dispositivos") clDispositivos(d);
    else if (v === "puertos") clPuertos(d);
    else if (v === "radios") clRadios(d);
    else if (v === "registro") { clRegLeer(); clRegPintar(); }
  }

  // Experiencia WiFi (la «WiFi Experience» de UniFi): de 0 a 100, la media de
  // lo bien que llega la señal a cada cliente conectado por wifi
  var CL_EXP = [0, 30, 60, 85, 100];
  function clExp(d, banda) {
    var n = 0, s = 0;
    (d.dispositivos || []).forEach(function (x) {
      var q = x.en_linea && x.wifi ? rdCalidad(x) : 0;
      if (!q || (banda && (x.conexion === "wifi5" ? "5" : "2") !== banda)) return;
      n++;
      s += CL_EXP[q];
    });
    return n ? Math.round(s / n) : null;
  }
  function clTono(p) { return p == null ? "" : p >= 80 ? "ok" : p >= 60 ? "av" : "mal"; }
  function clExpPintar(d) {
    var t = clExp(d), b2 = clExp(d, "2"), b5 = clExp(d, "5");
    var flojos = (d.dispositivos || []).filter(function (x) { return x.en_linea && x.wifi && rdCalidad(x) === 1; })
      .sort(function (a, b) { return a.wifi.senal - b.wifi.senal; }).slice(0, 3);
    vPoner("cl-exp", t == null ? '<p class="nx-b-nota">No hay nadie conectado por wifi.</p>' :
      '<div class="cl-exp"><svg viewBox="0 0 36 36" class="cl-aro ' + clTono(t) + '" aria-hidden="true"><circle cx="18" cy="18" r="15.9155" class="f"/><circle cx="18" cy="18" r="15.9155" class="v" stroke-dasharray="' + t + ' 100"/></svg>' +
        "<b>" + t + "<small>%</small></b></div>" +
      '<dl class="cl-dl cl-dl2"><div><dt>2,4 GHz</dt><dd class="' + clTono(b2) + '">' + (b2 == null ? "—" : b2 + " %") + "</dd></div>" +
        '<div><dt>5 GHz</dt><dd class="' + clTono(b5) + '">' + (b5 == null ? "—" : b5 + " %") + "</dd></div></dl>" +
      (flojos.length ? '<p class="cl-exp-flojos">Con señal débil: ' + flojos.map(function (x) {
        return '<a href="' + eqEnlace(x.mac) + '" data-eq="' + x.mac + '">' + escapar(x.alias || x.nombre || x.ip) + "</a> <small>" + x.wifi.senal + " dBm</small>"; }).join(", ") + "</p>" : ""));
  }

  // Clientes más activos (UniFi: Most Active Clients), con el tráfico de cada
  // equipo que ya se lee para el mapa (/api/red/trafico)
  function clEqNombre(x) { return escapar(x.alias || x.nombre || x.ip || x.mac); }
  function clActivos(d) {
    var t = (tr.d && tr.d.d) || {}, eq = {};
    (d.dispositivos || []).forEach(function (x) { eq[x.mac] = x; });
    var l = Object.keys(t).filter(function (m) { return eq[m] && t[m][0] + t[m][1] > 0; })
      .sort(function (a, b) { return t[b][0] + t[b][1] - t[a][0] - t[a][1]; }).slice(0, 5);
    var max = l.length ? t[l[0]][0] + t[l[0]][1] : 1;
    vPoner("cl-act", !tr.d ? '<p class="nx-b-nota">Leyendo el tráfico…</p>' : !l.length ? '<p class="nx-b-nota">Ahora mismo nadie está usando la red.</p>' :
      '<ul class="cl-act">' + l.map(function (m) {
        var x = eq[m], v = t[m];
        return '<li><a href="' + eqEnlace(m) + '" data-eq="' + m + '">' + exIco((RD_CON[x.conexion || ""] || RD_CON[""])[1]) + "<b>" + clEqNombre(x) + "</b></a>" +
          "<span>↓ " + clVel(v[0]) + " · ↑ " + clVel(v[1]) + '</span><i style="width:' + Math.max(3, Math.round((v[0] + v[1]) / max * 100)) + '%"></i></li>';
      }).join("") + "</ul>");
  }

  // Monitores de Internet (UniFi: Internet Monitors): lo que tarda en contestar
  // cada destino que ya se mide para la salud de la línea
  function clMonitores(d) {
    var l = d.latencia || [];
    vPoner("cl-mon", !l.length ? '<p class="nx-b-nota">Todavía no se ha medido.</p>' : '<ul class="cl-mon">' + l.map(function (m) {
      var ok = m.ms != null, t = !ok ? "mal" : m.ms < 40 ? "ok" : m.ms < 100 ? "av" : "mal";
      return "<li>" + clEstado(ok, "", "") + "<b>" + escapar(m.nombre) + "</b><small>" + escapar(m.host) + '</small><em class="' + t + '">' + (ok ? String(m.ms).replace(".", ",") + " ms" : "sin respuesta") + "</em></li>";
    }).join("") + "</ul>");
  }

  // VPN: los equipos de Tailscale (UniFi: Teleport y VPN)
  function clVpnOrden(d) {
    return (d.vpn || []).slice().sort(function (a, b) { return (b.en_linea - a.en_linea) || String(a.nombre).localeCompare(b.nombre, "es"); });
  }
  function clVpnCon(x) { return x.en_linea ? (x.directo ? "Directa" : "Por relé" + (x.rele ? " (" + escapar(x.rele) + ")" : "")) : ""; }
  function clVpnResumen(d) {
    var l = clVpnOrden(d), on = l.filter(function (x) { return x.en_linea; });
    vPoner("cl-vpnr", !l.length ? '<p class="nx-b-nota">No hay equipos en Tailscale.</p>' :
      '<div class="cl-banda-cifra"><b>' + on.length + "</b><span>de " + l.length + " en línea</span></div>" +
      '<ul class="cl-vpn-l">' + on.slice(0, 6).map(function (x) {
        return "<li>" + clEstado(true, "", "") + "<b>" + escapar(x.nombre) + "</b><small>" + (x.yo ? "este servidor" : x.en_casa ? "en casa" : "fuera") + " · " + clVpnCon(x).toLowerCase() + "</small></li>";
      }).join("") + "</ul>" +
      '<p class="nx-b-nota cl-nota"><a href="' + clEnlace("clientes") + '" data-clv="clientes">Ver todos</a> · <a href="?ajustes=vpn#red" data-axir="vpn">Ajustes → VPN</a></p>');
  }
  function clVpnTabla(d) {
    vPoner("cl-vpn", clTabla(["Nombre", "Estado", "IP", "Sistema", "Conexión", "Dónde", "Salida a Internet", "Recibido", "Enviado", "Visto"],
      clVpnOrden(d).map(function (x) {
        return ["<b>" + escapar(x.nombre) + "</b>" + (x.yo ? '<small class="cl-sub">este servidor</small>' : ""), clEstado(x.en_linea, "En línea", "Desconectado"),
          escapar(x.ip || ""), escapar(x.so || ""), clVpnCon(x), x.en_linea ? (x.en_casa ? "En casa" : "Fuera") : "",
          x.salida ? "Sí" : "", x.rx ? vBytes(x.rx) : "", x.tx ? vBytes(x.tx) : "", x.en_linea ? "ahora" : vHace(x.visto)];
      }), "No hay equipos en Tailscale.") +
      '<p class="nx-b-nota cl-nota">Quién entra por la VPN se gestiona en <a href="?ajustes=vpn#red" data-axir="vpn">Ajustes → VPN</a>.</p>');
  }

  // Alarmas: la campana de la barra, con lo importante del Registro (UniFi: Alarm Manager)
  var al = { visto: 0 };
  try { al.visto = +localStorage.getItem("cl-alarmas-visto") || 0; } catch (e) { /* sin almacenamiento */ }
  function clAlarmas() { return (cl.reg || []).filter(function (e) { return clImportante(e) && e.ts > Date.now() / 1000 - 7 * 86400; }); }
  function clAlPintar() {
    var n = clAlarmas().filter(function (e) { return e.ts > al.visto; }).length, u = document.getElementById("cl-al-n");
    if (u) { u.hidden = !n; u.textContent = n > 9 ? "9+" : n; }
    var caja = document.getElementById("cl-al");
    if (caja && !caja.hidden) caja.innerHTML = clAlHTML();
  }
  function clAlHTML() {
    var l = clAlarmas().slice(0, 8);
    return '<div class="cl-al-cab"><b>Alarmas</b><small>los últimos 7 días</small></div>' + (l.length ? "<ul>" + l.map(function (e) {
      return '<li class="n-' + escapar(e.nivel) + '">' + exIco(e.nivel === "mal" ? "alert-circle-outline" : "alert-outline") + "<span><b>" + escapar(e.t) + "</b><small>" + (e.d ? escapar(e.d) + " · " : "") + vHace(e.ts) + "</small></span></li>";
    }).join("") + "</ul>" : '<p class="cl-al-nada">Nada importante esta semana.</p>') +
      '<a class="cl-al-todo" href="' + clEnlace("registro") + '" data-clal="registro">Ver el registro</a>';
  }
  function clAlAbrir() {
    var caja = document.getElementById("cl-al");
    if (!caja) { caja = document.createElement("div"); caja.id = "cl-al"; caja.hidden = true; document.body.appendChild(caja); }
    caja.hidden = !caja.hidden;
    if (caja.hidden) return;
    caja.innerHTML = clAlHTML();
    al.visto = Math.floor(Date.now() / 1000);
    try { localStorage.setItem("cl-alarmas-visto", al.visto); } catch (e) { /* sin almacenamiento */ }
    clAlPintar();
  }

  // Buscar en todo (Ctrl+K), como la búsqueda de UniFi: páginas, ajustes y equipos
  var bus = { sel: 0, res: [] };
  function clNorm(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function clBuscarAbrir() {
    var c = document.getElementById("cl-bus");
    if (!c) {
      c = document.createElement("div");
      c.id = "cl-bus";
      c.innerHTML = '<div class="cl-bus-caja" role="dialog" aria-label="Buscar"><div class="cl-bus-cab">' + exIco("magnify") +
        '<input id="cl-bus-q" type="search" placeholder="Buscar páginas, ajustes, equipos, IP o MAC…" autocomplete="off" spellcheck="false" aria-label="Buscar"><kbd>Esc</kbd></div><ul id="cl-bus-l"></ul></div>';
      document.body.appendChild(c);
      c.addEventListener("click", function (e) { var li = e.target.closest("[data-i]"); if (li) clBuscarIr(+li.dataset.i); else if (e.target === c) clBuscarCerrar(); });
      var q = c.querySelector("#cl-bus-q");
      q.addEventListener("input", function () { bus.sel = 0; clBuscarPintar(); });
      q.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); bus.sel = Math.max(0, Math.min(bus.res.length - 1, bus.sel + (e.key === "ArrowDown" ? 1 : -1))); clBuscarPintar(); }
        else if (e.key === "Enter") { e.preventDefault(); clBuscarIr(bus.sel); }
        else if (e.key === "Escape") clBuscarCerrar();
      });
    }
    // fuera de la vista de la Red (Ajustes, un equipo) no hay lista de equipos a mano: se pide una vez
    if (!cl.red) cenJSON("/api/red").then(function (d) { cl.red = d; if (!c.hidden) clBuscarPintar(); }).catch(function () { /* sin equipos */ });
    c.hidden = false;
    var i = c.querySelector("#cl-bus-q");
    i.value = "";
    bus.sel = 0;
    clBuscarPintar();
    i.focus();
  }
  function clBuscarCerrar() { var c = document.getElementById("cl-bus"); if (c) c.hidden = true; }
  function clBuscarPintar() {
    var crudo = document.getElementById("cl-bus-q").value.trim(), q = clNorm(crudo), eqs = [], pags = [], ajs = [];
    var vale = function (texto) { return !q || clNorm(texto).indexOf(q) >= 0; };
    CL_PAGS.forEach(function (p) { if (vale(p[1] + " " + p[3])) pags.push({ g: "Páginas", ico: p[2], t: p[1], sub: p[3], ir: ["ver", p[0]] }); });
    AX_SECS.forEach(function (s) { if (vale("ajustes " + s[1] + " " + s[3])) ajs.push({ g: "Ajustes", ico: s[2], t: s[1], sub: s[3], ir: ["aj", s[0]] }); });
    if (q) ((cl.red || {}).dispositivos || []).forEach(function (x) {
      if (vale([x.alias, x.nombre, x.host, x.ip, x.mac, x.fabricante, x.tipo].join(" ")))
        eqs.push({ g: "Equipos", ico: x.en_linea ? "lan-connect" : "lan-disconnect", t: x.alias || x.nombre || x.ip, sub: [x.ip, x.mac, x.en_linea ? "en línea" : "desconectado"].filter(Boolean).join(" · "), ir: ["eq", x.mac] });
    });
    if (q) ((cl.red || {}).vpn || []).forEach(function (x) {
      if (vale(["vpn tailscale", x.nombre, x.ip, x.so].join(" ")))
        eqs.push({ g: "Equipos", ico: "shield-lock-outline", t: x.nombre, sub: ["VPN", x.ip, x.en_linea ? "en línea" : "desconectado"].join(" · "), ir: ["ver", "clientes"] });
    });
    bus.res = (q ? eqs.slice(0, 12).concat(pags, ajs) : pags.concat(ajs)).slice(0, 40);
    var g = "";
    document.getElementById("cl-bus-l").innerHTML = bus.res.length ? bus.res.map(function (r, i) {
      var h = r.g !== g ? '<li class="cl-bus-g">' + r.g + "</li>" : "";
      g = r.g;
      return h + '<li data-i="' + i + '" class="' + (i === bus.sel ? "on" : "") + '">' + exIco(r.ico) + "<span><b>" + escapar(r.t) + "</b><small>" + escapar(r.sub) + "</small></span></li>";
    }).join("") : '<li class="cl-bus-nada">Nada con «' + escapar(crudo) + "»</li>";
    var on = document.querySelector("#cl-bus-l li.on");
    if (on) on.scrollIntoView({ block: "nearest" });
  }
  function clBuscarIr(i) {
    var r = bus.res[i];
    if (!r) return;
    clBuscarCerrar();
    if (r.ir[0] === "ver") clIr(r.ir[1]); else if (r.ir[0] === "aj") axIr(r.ir[1]); else eqIr(r.ir[1]);
  }

  // Exportar en CSV (con «;» y BOM, para que Excel en español lo abra bien)
  function clCsv(nombre, cab, filas) {
    var esc = function (v) { v = v == null ? "" : String(v); return /[";\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var t = "﻿" + [cab].concat(filas).map(function (f) { return f.map(esc).join(";"); }).join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([t], { type: "text/csv;charset=utf-8" }));
    a.download = nombre + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function clFecha(ts) { return ts ? new Date(ts * 1000).toLocaleString("es-ES") : ""; }
  function clExportar(que) {
    if (que === "clientes" && cl.red) clCsv("clientes", ["Nombre", "IP", "MAC", "Fabricante", "Tipo", "Red", "Conexión", "Señal (dBm)", "En línea", "IP fija", "Visto por primera vez", "Visto por última vez"],
      rdLista(cl.red).map(function (x) {
        return [x.alias || x.nombre, x.ip, x.mac, x.fabricante, x.tipo, (x.red || {}).nombre, (RD_CON[x.conexion || ""] || [x.conexion])[0], x.wifi && x.wifi.senal,
          x.en_linea ? "sí" : "no", x.fija ? "sí" : "no", clFecha(x.primera), clFecha(x.ultima)];
      }));
    if (que === "registro") clCsv("registro-red", ["Fecha", "Tipo", "Nivel", "Suceso", "Detalle"],
      clRegLista().map(function (e) { return [clFecha(e.ts), (CL_REG.filter(function (f) { return f[0] === e._t; })[0] || [0, e._t])[1], e.nivel, e.t, e.d]; }));
  }

  // Ajustes: el menú agrupado como el de UniFi
  function clAxNav() {
    var nav = document.querySelector("#nx-ax .nx-ax-nav"), por = {}, puestas = {};
    if (!nav) return;
    AX_SECS.forEach(function (s) { por[s[0]] = s; });
    var enlace = function (k) { var s = por[k]; puestas[k] = 1; return '<a href="?ajustes=' + s[0] + '#red" data-axir="' + s[0] + '" data-axs="' + s[0] + '">' + exIco(s[2]) + "<span><b>" + s[1] + "</b><small>" + s[3] + "</small></span></a>"; };
    var h = CL_AXG.map(function (g) {
      var dentro = g[1].filter(function (k) { return por[k]; }).map(enlace).join("");
      return dentro ? '<p class="cl-axg">' + g[0] + "</p>" + dentro : "";
    }).join("");
    var otras = AX_SECS.filter(function (s) { return !puestas[s[0]]; }).map(function (s) { return enlace(s[0]); }).join("");
    // el idioma de la app (lo traduce red/idioma.js; se guarda en este navegador)
    var es = (window.CL_IDIOMA || "es") !== "en";
    nav.innerHTML = h + (otras ? '<p class="cl-axg">Otros</p>' + otras : "") +
      '<p class="cl-axg">Aplicación</p>' +
      '<a href="#" data-cfp="" class="cl-app-a">' + exIco("router-wireless") + "<span><b>Router e integraciones</b><small>AdGuard, Tailscale, Telegram, Home Assistant</small></span></a>" +
      '<a href="#" data-cfp="" class="cl-app-a">' + exIco("file-document-outline") + "<span><b>Acceso y diagnóstico</b><small>contraseña e informe si algo falla</small></span></a>" +
      '<label class="cl-idioma">' + exIco("translate") + "<span><b>Idioma</b><small>Language</small></span>" +
      '<select id="cl-idioma" aria-label="Idioma · Language"><option value="es"' + (es ? " selected" : "") + '>Español</option><option value="en"' + (es ? "" : " selected") + ">English</option></select></label>";
  }

  // El flujo del mapa, como el de UniFi Network 7.5: por cada enlace con
  // tráfico, una banda de cientos de puntitos (azules los que bajan hacia el
  // equipo, morados los que suben) sobre una estela suave; cuanto más tráfico,
  // más ancha, más densa y más rápida. Se dibuja en un lienzo encima del mapa:
  // animado dentro del SVG obligaba a repintar el mapa entero en cada
  // fotograma. El SVG sigue marcando qué lleva cada enlace (trGrupo pone
  // data-n, de 1 a 5, en cada .nx-rd-flujo); sus bolas no se ven.
  var CL_ANCHO = [0, 6, 8, 10, 12, 14], CL_DENS = [0, 60, 85, 115, 150, 190], CL_VEL = [0, 40, 55, 75, 100, 135];
  var CL_TONO = { d: "74,168,255", u: "164,124,255" };
  var cv = { raf: 0, pts: {}, capa: null };
  function clAzar(i) { var v = Math.sin(i * 12.9898) * 43758.5453; return v - Math.floor(v); }
  // el camino de un enlace, en puntos (para colocar cada puntito) y como Path2D (para la estela)
  function clMuestras(p) {
    var d = p.getAttribute("d"), s = cv.pts[p.id];
    if (s && s.d === d) return s;
    var L = p.getTotalLength(), n = Math.max(16, Math.min(240, Math.round(L / 6))), a = [];
    for (var i = 0; i <= n; i++) { var q = p.getPointAtLength(L * i / n); a.push(q.x, q.y); }
    return (cv.pts[p.id] = { d: d, a: a, n: n, L: L || 1, camino: new Path2D(d) });
  }
  function clPuntos(x, s, n, sube, t) {
    var a = s.a, W = CL_ANCHO[n], k = Math.min(700, Math.round(s.L / 100 * CL_DENS[n])), tam = 1.1 + 0.15 * n, semilla = sube ? 5003 : 17;
    x.fillStyle = "rgb(" + CL_TONO[sube ? "u" : "d"] + ")";
    for (var capa = 0; capa < 3; capa++) {                 // tres brillos, para no cambiar de opacidad en cada punto
      x.globalAlpha = [0.25, 0.45, 0.7][capa];
      for (var i = 0; i < k; i++) {
        var h1 = clAzar(i + semilla), h2 = clAzar(i * 3.7 + semilla), h3 = clAzar(i * 7.1 + semilla), h4 = clAzar(i * 1.3 + semilla + 2);
        if ((h3 * 3 | 0) !== capa) continue;
        var f = (t * CL_VEL[n] * (0.8 + 0.4 * h1) / s.L + h2) % 1;
        if (sube) f = 1 - f;
        var pos = f * s.n, j = Math.min(s.n - 1, pos | 0), fr = pos - j;
        var dx = a[j * 2 + 2] - a[j * 2], dy = a[j * 2 + 3] - a[j * 2 + 1], dl = Math.hypot(dx, dy) || 1;
        var o = (h3 + h4 - 1) * W + Math.sin(t * 2.3 + i) * W * 0.15;          // más puntos en el centro de la banda
        x.fillRect(a[j * 2] + dx * fr - dy / dl * o - tam / 2, a[j * 2 + 1] + dy * fr + dx / dl * o - tam / 2, tam, tam);
      }
    }
  }
  function clCvTic(ahora) {
    cv.raf = 0;
    var m = document.getElementById("nx-rd-mapa"), svg = document.getElementById("nx-rd-svg");
    if (!m || !svg || clVer() !== "topologia" || document.hidden) return;
    var c = m.querySelector("canvas.cl-part");
    if (!c) { c = document.createElement("canvas"); c.className = "cl-part"; m.appendChild(c); }
    var dpr = Math.min(2, window.devicePixelRatio || 1), w = m.clientWidth, h = m.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    var x = c.getContext("2d"), r = c.getBoundingClientRect(), t = ahora / 1000, pistas = {};
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, c.width, c.height);
    if (!svg.classList.contains("nx-rd-sintraf")) svg.querySelectorAll("g.nx-rd-flujo[data-n]").forEach(function (g) {
      var n = +g.getAttribute("data-n"), mp = g.querySelector("mpath");
      if (!n || !mp) return;
      var id = mp.getAttribute("href").slice(1), e = pistas[id] || (pistas[id] = { d: 0, u: 0 });
      e[g.id.indexOf("nx-rd-fu-") === 0 ? "u" : "d"] = n;
    });
    var lista = Object.keys(pistas).map(function (id) {
      var p = document.getElementById(id), M = p && p.getScreenCTM();
      return M ? { e: pistas[id], s: clMuestras(p), M: M } : null;
    }).filter(Boolean);
    // la estela de todos los enlaces, en una capa aparte y opaca, que se mezcla
    // una sola vez: donde varios caminos comparten tramo no se suman
    var e2 = cv.capa || (cv.capa = document.createElement("canvas"));
    if (e2.width !== c.width || e2.height !== c.height) { e2.width = c.width; e2.height = c.height; }
    var y = e2.getContext("2d");
    y.setTransform(1, 0, 0, 1, 0, 0);
    y.clearRect(0, 0, e2.width, e2.height);
    y.strokeStyle = "rgb(" + CL_TONO.d + ")";
    y.lineCap = y.lineJoin = "round";
    lista.forEach(function (z) {
      var M = z.M;
      // se dibuja en las coordenadas del propio camino: así sigue al zoom y al arrastre del mapa
      y.setTransform(dpr * M.a, dpr * M.b, dpr * M.c, dpr * M.d, dpr * (M.e - r.left), dpr * (M.f - r.top));
      y.lineWidth = CL_ANCHO[Math.max(z.e.d, z.e.u)] * 2;
      y.stroke(z.s.camino);
    });
    if (lista.length) { x.globalAlpha = 0.09; x.drawImage(e2, 0, 0); }
    lista.forEach(function (z) {
      var M = z.M;
      x.setTransform(dpr * M.a, dpr * M.b, dpr * M.c, dpr * M.d, dpr * (M.e - r.left), dpr * (M.f - r.top));
      if (z.e.d) clPuntos(x, z.s, z.e.d, false, t);
      if (z.e.u) clPuntos(x, z.s, z.e.u, true, t);
    });
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    cv.raf = requestAnimationFrame(clCvTic);
  }
  function clCvArrancar() { if (!cv.raf && clVer() === "topologia" && !document.hidden) cv.raf = requestAnimationFrame(clCvTic); }

  function clArrancar() {
    AX_SECS.forEach(function (s) { var n = CL_AXN[s[0]]; if (n) { s[1] = n[0]; s[3] = n[1]; } });
    // del menú de Ajustes se vuelve con la barra lateral; de un equipo, a la página de la que se vino
    eqEnlace = function (mac) { return mac ? location.pathname + "?equipo=" + mac + (location.hash || "#red") : clEnlace(cl.ultima); };
    // «Todo sobre el router» es la página Dispositivos, no una ventana encima
    rtAbrir = function () { clIr("dispositivos"); };
    // el mapa del mundo solo se pide mientras se mira Flujos
    var muLeer0 = muLeer;
    muLeer = function () { if (clVer() === "flujos") muLeer0(); };
    var nav = document.querySelector(".cl-nav");
    if (nav) nav.innerHTML = CL_PAGS.map(function (p) {
      return '<a href="' + clEnlace(p[0]) + '" data-clv="' + p[0] + '" title="' + p[1] + " · " + p[3] + '" aria-label="' + p[1] + '"><span class="cl-i" style="--i:url(' + icoU(p[2]) + ')"></span><b>' + p[1] + "</b></a>";
    }).join("");
    // arriba, buscar; abajo, la campana de las alarmas
    if (nav) nav.insertAdjacentHTML("beforebegin", '<button type="button" class="cl-bus-btn" data-clbus="1" aria-label="Buscar"><span class="cl-i" style="--i:url(' + icoU("magnify") + ')"></span><b>Buscar · Ctrl+K</b></button>');
    var pie = document.querySelector(".cl-pie");
    if (pie) pie.insertAdjacentHTML("afterbegin", '<button type="button" class="cl-campana" data-clal="abrir" aria-label="Alarmas"><span class="cl-i" style="--i:url(' + icoU("bell-outline") + ')"></span><u id="cl-al-n" hidden></u><b>Alarmas</b></button>');
    document.addEventListener("visibilitychange", clCvArrancar);
    document.addEventListener("change", function (e) {
      if (e.target.id !== "cl-idioma") return;
      try { localStorage.setItem("cl-idioma", e.target.value); } catch (x) { /* sin almacenamiento */ }
      location.reload();
    });
    document.addEventListener("keydown", function (e) {
      var escribe = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || "") || (e.target || {}).isContentEditable;
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey) || e.key === "/" && !escribe) { e.preventDefault(); clBuscarAbrir(); }
      else if (e.key === "Escape") { var c = document.getElementById("cl-al"); if (c) c.hidden = true; }
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
      var caja = document.getElementById("cl-al"), alc = e.target.closest("[data-clal]");
      if (caja && !caja.hidden && !e.target.closest("#cl-al") && !alc) caja.hidden = true;
      if (alc) {
        e.preventDefault();
        if (alc.dataset.clal === "abrir") return clAlAbrir();
        caja.hidden = true;
        cl.regF = "importante";
        vs.firmas["cl-reg-f"] = vs.firmas["cl-reg"] = "";
        return clIr("registro");
      }
      if (e.target.closest("[data-clbus]")) return clBuscarAbrir();
      var csv = e.target.closest("[data-clcsv]");
      if (csv) return clExportar(csv.dataset.clcsv);
      var a = e.target.closest("[data-clv]"), rt0 = e.target.closest("[data-rt]"), f = e.target.closest("[data-clr]");
      if (a && a.dataset.clv !== "ajustes") { e.preventDefault(); return clIr(a.dataset.clv); }      // Ajustes va por data-axir
      if (rt0) { e.preventDefault(); e.stopPropagation(); return clIr("dispositivos"); }
      if (f) { cl.regF = f.dataset.clr; vs.firmas["cl-reg-f"] = vs.firmas["cl-reg"] = ""; clRegPintar(); }
    }, true);
    window.addEventListener("popstate", clAplicar);
  }

  // El repaso: lo que en el panel hacía repasar() cada 2 s, solo para la Red.
  function repasar() {
    try { pintarVistas(); velTic(); lineaTic(); clRegLeer(); } catch (e) { /* nunca romper la página por un repaso */ }
  }
  function arrancar() {
    clArrancar();
    repasar();
    setInterval(repasar, 2000);
  }

  var AJ_DEF = {acento: "tema", ancho: 1800, anim: true, animCifras: true, animEntrada: true, animFondo: true, animMedia: true, animPulsos: true, animRitmo: "normal", avBloqueos: false, avContenedor: true, avDescarga: true, avDisco: true, avDispositivo: true, avSeguridad: true, avSilencio: "noche", avSistema: true, avSmart: true, avVelocidad: 0, avisos: true, bordes: true, casaRefresco: 10, cristal: true, densidad: "comoda", discoAviso: 75, discoGrave: 90, dlAlto: 560, dlCompacto: false, dlLibre: 50, dlOrden: "activas", dlRefresco: 4, dlSembrando: true, emblema: "letra", emblemaTinte: true, escala: 100, esquinas: "redondas", fondo: "luces", fotos: true, hsDesde: 2026, inicio: "", lateral: "completa", lema: "mac mini · debian 13", marca: "NeoXNET", mediaRefresco: 5, nombre: "", nuevaPestana: true, paleta: true, particulas: true, pie: true, ps5Arte: true, ps5ArteFuerza: 75, ps5Caratula: 148, ps5Refresco: 5, ps5Utilidades: true, rdRealista: true, recarga: 0, recordar: false, redUnidad: "mbps", reloj12: 24, reposo: 0, segundos: true, srvCpuAviso: 80, srvRefresco: 3, srvTempAviso: 85, srvTempGrave: 95, teclas: true, tema: "control", tempAviso: 75, tempGrave: 85, velCada: 12};

  var catalogo = null; // se pide una vez, al abrir el selector

  function escapar(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c];
    });
  }

  function marca(el, prefijo, estado) {
    ["ok", "warn", "bad"].forEach(function (e) {
      el.classList.toggle(prefijo + e, e === estado);
    });
  }

  var ps5 = { datos: null, reloj: null, firmas: {}, filtro: "", orden: "recientes", caido: false };
  try { ps5.orden = localStorage.getItem("nx-ps5-orden") || "recientes"; } catch (e) { /* sin almacenamiento */ }

  function ps5Aviso(texto, mal) {
    var a = document.getElementById("nx-ps5-aviso");
    if (!a) {
      a = document.createElement("div");
      a.id = "nx-ps5-aviso";
      a.setAttribute("role", "status");
      document.body.appendChild(a);
    }
    a.textContent = texto;
    a.className = "visible" + (mal ? " mal" : "");
    clearTimeout(ps5Aviso.t);
    ps5Aviso.t = setTimeout(function () { a.className = ""; }, mal ? 7000 : 3500);
  }

  // Dialogo de confirmacion propio: devuelve una promesa con true o false.
  function ps5Confirmar(titulo, texto, boton, peligro) {
    return new Promise(function (resolver) {
      var d = document.getElementById("nx-ps5-dlg");
      if (!d) {
        d = document.createElement("dialog");
        d.id = "nx-ps5-dlg";
        document.body.appendChild(d);
      }
      d.innerHTML = "<b>" + escapar(titulo) + "</b><p>" + escapar(texto) + "</p>" +
        '<div><button type="button" class="nx-btn" value="no">Cancelar</button>' +
        '<button type="button" class="nx-btn ' + (peligro ? "nx-ps5-peligro" : "nx-ps5-primario") +
        '" value="si">' + escapar(boton) + "</button></div>";
      var hecho = false;
      function fin(v) { if (hecho) return; hecho = true; if (d.open) d.close(); resolver(v); }
      d.onclick = function (e) {
        if (e.target === d) return fin(false);
        var b = e.target.closest("button");
        if (b) fin(b.value === "si");
      };
      d.onclose = function () { fin(false); };
      d.showModal();
    });
  }

  function ccPoner(id, html) {
    if (cc.firmas[id] === html) return;
    var el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    cc.firmas[id] = html;
  }
  function unidadRed() { return A("redUnidad") === "mbs" ? "MB/s" : "Mbps"; }
  function megabits(bytesSeg) {
    var m = (bytesSeg || 0) * (A("redUnidad") === "mbs" ? 1 : 8) / 1e6;
    return (m >= 100 ? String(Math.round(m)) : m >= 10 ? m.toFixed(1) : m.toFixed(2)).replace(".", ",");
  }
  function ccNum(v) {                  // "66.315" -> 66315 · "14,743 ms" -> 14.743
    var s = String(v == null ? "" : v).replace(/[^\d.,]/g, "");
    if (!s) return null;
    s = s.indexOf(",") !== -1 ? s.replace(/\./g, "").replace(",", ".") : s.replace(/\./g, "");
    return parseFloat(s);
  }

  function ccRed(d, router) {
    var h = cc.red, W = 600, H = 120;
    var cab = '<div class="nx-red-cifras">' +
      '<div class="nx-red-baja"><i>↓ Bajada</i><b>' + megabits(d.baja) + "<small>" + unidadRed() + "</small></b></div>" +
      '<div class="nx-red-sube"><i>↑ Subida</i><b>' + megabits(d.sube) + "<small>" + unidadRed() + "</small></b></div></div>";
    var svg = "";
    if (h.length > 1) {
      var max = 125000;               // suelo de 1 Mbps para que el reposo no parezca una tormenta
      h.forEach(function (p) { max = Math.max(max, p[0], p[1]); });
      var trazo = function (i) {
        return h.map(function (p, k) {
          return (k / (h.length - 1) * W).toFixed(1) + "," + (H - 3 - p[i] / max * (H - 12)).toFixed(1);
        });
      };
      var baja = trazo(0), sube = trazo(1);
      svg = '<defs><linearGradient id="nx-cc-deg" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" style="stop-color:var(--nx-accent)" stop-opacity=".45"/><stop offset="1" style="stop-color:var(--nx-accent)" stop-opacity="0"/>' +
        "</linearGradient></defs>" +
        '<polygon fill="url(#nx-cc-deg)" points="0,' + H + " " + baja.join(" ") + " " + W + "," + H + '"/>' +
        '<polyline class="nx-cc-l-sube" points="' + sube.join(" ") + '"/>' +
        '<polyline class="nx-cc-l-baja" points="' + baja.join(" ") + '"/>';
    }
    var pie = router.transmitido ? "<p>" + escapar(router.transmitido + " enviados  ·  " + router.recibido + " recibidos por el router") + "</p>" : "";
    return cab + '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="Tráfico de red de los últimos minutos">' + svg + "</svg>" + pie;
  }

  // lo que sale en vez de una ficha cuando falta la integración que la alimenta
  function clConecta(n, ico, titulo, para) {
    return '<div class="cf-conecta">' + exIco(ico) + "<b>" + titulo + "</b><small>" + para + '</small><button type="button" class="nx-btn" data-cfp="' + n + '">Conectar</button></div>';
  }
  function ccDns(dns) {
    var q = ccNum(dns.consultas), b = ccNum(dns.bloqueado);
    if (!q) return '<p class="nx-b-nota">Esperando datos de AdGuard…</p>';
    var pct = b / q * 100, C = 263.89;
    return '<div class="nx-dns"><div class="nx-rosco"><svg viewBox="0 0 100 100" aria-hidden="true">' +
        '<circle cx="50" cy="50" r="42" class="nx-ps5-pista"/>' +
        '<circle cx="50" cy="50" r="42" class="nx-rosco-v" stroke-dasharray="' + (C * pct / 100).toFixed(1) + " " + C + '"/></svg>' +
        "<div><b>" + pct.toFixed(1).replace(".", ",") + "</b><small>% bloqueado</small></div></div>" +
      '<ul class="nx-top"><li><span>Consultas hoy</span><b>' + escapar(dns.consultas) + "</b></li>" +
        "<li><span>Bloqueadas</span><b>" + escapar(dns.bloqueado) + "</b></li>" +
        "<li><span>Latencia</span><b>" + escapar(dns.latencia || "-") + "</b></li></ul></div>";
  }

  function exIco(nombre) { return '<span class="nx-mdi" style="--u:url(&quot;' + icoU(nombre) + '&quot;)"></span>'; }

  var srv = { d: null, ts: 0, pidiendo: false };
  // ==========================================================================
  // HispaShare en Descargas (13-10-2026). Un bloque con las novedades de la
  // portada de hispashare.org y un buscador. Pulsar una carátula abre la ficha
  // lateral con las versiones que hay en la web; «Descargar» manda a paneld el
  // número de esa versión y él saca el ed2k y lo añade a aMule (acaba en
  // «Pelis 4K» como cualquier otra descarga de eMule).
  //
  // El bloque es un casco fijo (así el tablero no lo repinta cada 4 s y el
  // buscador no pierde el foco); lo de dentro lo pinta hsPintar.
  // Datos: paneld /api/hs/novedades, /api/hs/buscar, /api/hs/titulo, /api/hs/bajar.
  // ==========================================================================
  function hsVacia() { return { lista: null, mas: false, p: 0, cargando: false, error: "", cuando: 0 }; }
  var hs = { vista: "nov", q: "", nov: hsVacia(), bus: hsVacia() };
  // ==========================================================================
  // Pestanas con datos de centinela (08-10-2026): Dispositivos, Seguridad,
  // Actividad y PC.
  //
  // centinela (~/centinela en el macmini, :8093) recoge del router, de Docker,
  // de fail2ban, de Caddy y de Home Assistant; aqui solo se pinta. Las cuatro
  // comparten armazon (pintarVistas): cabecera, cuerpo dividido en zonas que
  // se repintan solo si cambia su HTML, y un sondeo que para al salir.
  // ==========================================================================
  var CEN = location.origin;   // casalab-red: la API de red es la propia app
  var vs = { tab: "", reloj: null, datos: null, firmas: {}, caido: false };

  function vPoner(id, html) {
    if (vs.firmas[id] === html) return false;
    var el = document.getElementById(id);
    if (!el) return false;
    el.innerHTML = html;
    vs.firmas[id] = html;
    return true;
  }
  function vHace(ts) {
    if (!ts) return "nunca";
    var s = Date.now() / 1000 - ts;
    if (s < 90) return "ahora";
    if (s < 3600) return "hace " + Math.round(s / 60) + " min";
    if (s < 86400) return "hace " + Math.round(s / 3600) + " h";
    var d = Math.round(s / 86400);
    return d === 1 ? "ayer" : d < 60 ? "hace " + d + " días" : "hace " + Math.round(d / 30) + " meses";
  }
  function vDura(s) {
    if (s == null) return "";
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min";
    if (s < 86400) return Math.floor(s / 3600) + " h " + Math.round((s % 3600) / 60) + " min";
    return Math.floor(s / 86400) + " d " + Math.round((s % 86400) / 3600) + " h";
  }
  function vBytes(b) {
    if (!b) return "0";
    var u = ["B", "kB", "MB", "GB", "TB"], i = Math.min(4, Math.floor(Math.log(b) / Math.log(1000)));
    var v = b / Math.pow(1000, i);
    return (v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1).replace(".", ",")) + " " + u[i];
  }
  function vTasa(b) { return b < 1000 ? "0" : vBytes(b) + "/s"; }
  function vHora(ts) { var a = new Date(ts * 1000); return ("0" + a.getHours()).slice(-2) + ":" + ("0" + a.getMinutes()).slice(-2); }
  function vOrden(ruta, cuerpo, hecho, base) {
    var router = ruta.indexOf("/api/router/") === 0;
    return fetch((base || CEN) + ruta, { method: "POST", credentials: router ? "include" : "same-origin",
      headers: { "Content-Type": "application/json", "X-NX-Panel": "1" }, body: JSON.stringify(cuerpo) })
      .then(function (r) { return r.json().then(function (j) {
        if (r.status === 401) { var e = new Error("sesion"); e.sesion = true; throw e; }
        if (!r.ok) throw new Error(j.error || "sin respuesta");
        return j; }); })
      .then(function (j) { ps5Aviso(hecho + (j && j.nota ? " " + j.nota : "")); vLeer(); setTimeout(vLeer, 1500); setTimeout(vLeer, 5000); return true; })
      .catch(function (e) {
        if (!e.sesion) return ps5Aviso("No se ha podido: " + e.message, true);
        // cambiar el router pide la contraseña de CasaFi (casafi.js)
        return CF.entrar("Este cambio").then(function (si) { if (si) ps5Aviso("Ya has entrado: vuelve a pulsar"); });
      });
  }

  // ------------------------------------------------------------ Dispositivos
  var RD_ICO = { router: "router-wireless", servidor: "server", pc: "desktop-tower-monitor", movil: "cellphone", tablet: "tablet",
    tv: "television", consola: "controller", altavoz: "speaker", camara: "cctv", impresora: "printer", luz: "led-strip-variant",
    iot: "chip", desconocido: "help-network-outline" };
  var RD_TIPO = { router: "Router", servidor: "Servidor", pc: "Ordenador", movil: "Móvil", tablet: "Tablet", tv: "Tele y multimedia",
    consola: "Consola", altavoz: "Altavoz", camara: "Cámara o timbre", impresora: "Impresora", luz: "Iluminación", iot: "Domótica",
    desconocido: "Sin clasificar" };
  var RD_CON = { "wifi5": ["5 GHz", "wifi"], "wifi2.4": ["2,4 GHz", "wifi"], cable: ["Cable", "ethernet"], "": ["Desconectado", "lan-disconnect"] };
  var rd = { filtro: "linea", q: "", orden: "nombre", sel: null, editando: false };
  try { rd.orden = localStorage.getItem("nx-rd-orden") || "nombre"; } catch (e) { /* sin almacenamiento */ }

  function rdCalidad(x) {                 // 4 excelente … 1 debil; 0 sin dato
    var s = x.wifi && x.wifi.senal;
    if (s == null) return 0;
    return s >= -55 ? 4 : s >= -65 ? 3 : s >= -72 ? 2 : 1;
  }
  function rdBarras(x) {
    var c = rdCalidad(x);
    if (!c) return "";
    return '<span class="nx-senal nx-senal-' + c + '" title="' + x.wifi.senal + ' dBm"><i></i><i></i><i></i><i></i></span>';
  }
  function rdLista(d) {
    var f = rd.filtro, q = rd.q;
    var l = (d.dispositivos || []).filter(function (x) {
      if (f === "linea" && !x.en_linea) return false;
      if (f === "fuera" && x.en_linea) return false;
      if (f === "wifi5" && x.conexion !== "wifi5") return false;
      if (f === "wifi24" && x.conexion !== "wifi2.4") return false;
      if (f === "cable" && x.conexion !== "cable") return false;
      return !q || (x.nombre + " " + (x.host || "") + " " + (x.ip || "") + " " + x.mac + " " + (x.fabricante || "") + " " + (RD_TIPO[x.tipo] || "")).toLowerCase().indexOf(q) !== -1;
    });
    function ip(x) { return (x.ip || "9.9.9.999").split(".").reduce(function (a, b) { return a * 256 + (+b || 0); }, 0); }
    var cmp = {
      nombre: function (a, b) { return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }); },
      ip: function (a, b) { return ip(a) - ip(b); },
      senal: function (a, b) { return ((b.wifi || {}).senal || -999) - ((a.wifi || {}).senal || -999); },
      actividad: function (a, b) { var w = b.wifi || {}, v = a.wifi || {}; return (w.baja || 0) + (w.sube || 0) - (v.baja || 0) - (v.sube || 0); },
      visto: function (a, b) { return (b.ultima || 0) - (a.ultima || 0); },
      tipo: function (a, b) { return (RD_TIPO[a.tipo] || "").localeCompare(RD_TIPO[b.tipo] || "", "es"); },
    }[rd.orden] || function () { return 0; };
    return l.sort(function (a, b) { return (b.en_linea - a.en_linea) || cmp(a, b) || a.nombre.localeCompare(b.nombre); });
  }

  // El mapa: Internet -> router -> un nudo por medio (5 GHz, 2,4 GHz, cable) ->
  // un punto por cada equipo en linea. Se dibuja solo cuando cambia quien hay;
  // el color de cada punto (su senal) se retoca despues, sin redibujar, para
  // que las particulas no vuelvan a empezar.
  // Arbol de izquierda a derecha, como la topologia de UniFi: Internet ->
  // router -> un nudo por medio (5 GHz, 2,4 GHz, cable) -> una fila por equipo
  // con su icono, su nombre y la calidad del enlace. El lienzo se arrastra y se
  // amplia (rueda, pellizco o botones); pulsar un equipo abre su ficha.
  var RD_FINO = [[/ps5|ps4|playstation/, "sony-playstation"], [/steam/, "steam"], [/shield|nvidia|apple ?tv|chromecast|fire ?tv/, "television-box"],
    [/webos|oled|\btv\b|tele|lg innotek/, "television"], [/amazon|echo|alexa/, "amazon-alexa"], [/hue/, "lightbulb-group"], [/wled|barra|tira|led/, "led-strip-variant"],
    [/ring|doorbell|timbre|intercom/, "doorbell-video"], [/midea|net_ac|aire|clima/, "air-conditioner"], [/p100|plug|meross|enchufe|sonoff|tapo/, "power-socket-eu"],
    [/rm ?mini|broadlink/, "remote"], [/aqara|hub|zigbee|matter/, "access-point"], [/esp_|espressif|tuya|ty_wr/, "chip"], [/watch|reloj/, "watch"],
    [/ipad|tablet/, "tablet"], [/iphone|android|galaxy|samsung|pixel|redmi/, "cellphone"], [/macbook|laptop|portatil/, "laptop"],
    [/mac ?mini|servidor|server|nas/, "server"], [/bano|salon|homepod|dormitorio|cocina/, "speaker"]];
  var RD_ORDEN = ["servidor", "pc", "consola", "tv", "movil", "tablet", "altavoz", "camara", "impresora", "luz", "iot", "desconocido"];
  // La carta de fotos (10-10-2026): las de producto del catalogo de UniFi, por
  // familias, para elegir a mano. El numero es el del modelo en ese catalogo;
  // para un modelo que no este aqui, el buscador de la misma ficha.
  var RD_FOTOS = [
    ["Móviles y tabletas", [[2670, "iPhone"], [2669, "Android"], [357, "Samsung"], [5346, "Pixel"], [92, "iPad"], [358, "Tablet"], [41, "Kindle"], [5342, "Apple Watch"]]],
    ["Ordenadores", [[2663, "PC"], [2665, "Portátil"], [2667, "MacBook"], [13, "iMac"], [2141, "Mac mini"], [4731, "Mac Studio"], [2664, "PC Linux"], [4133, "Raspberry Pi"], [2295, "NAS"], [3617, "Servidor"]]],
    ["Tele y vídeo", [[38, "Tele LG"], [17, "Tele Samsung"], [34, "Tele Sony"], [4405, "Apple TV"], [39, "Chromecast"], [36, "Fire TV"], [3155, "Shield Pro"], [37, "Shield"], [27, "Roku"]]],
    ["Consolas", [[4454, "PS5"], [24, "PS4"], [4455, "Xbox"], [2363, "Switch"], [4799, "Steam Deck"], [4489, "Quest"]]],
    ["Altavoces", [[4966, "Echo Dot"], [4488, "Echo Dot oscuro"], [2999, "Echo Show"], [2028, "Google Mini"], [4456, "HomePod mini"], [293, "Sonos"]]],
    ["Casa", [[2014, "Puente Hue"], [2017, "Bombilla"], [2078, "Tira de luz"], [5715, "Enchufe Tapo"], [5388, "Enchufe"], [6173, "Hub Aqara"], [3129, "Mando IR"], [285, "Timbre"], [4600, "Cámara"],
      [286, "Termostato"], [4957, "Aire"], [6029, "Purificador"], [2090, "Aspirador"], [3140, "Coche"]]],
    ["Electrónica y red", [[3900, "ESP32"], [5925, "NodeMCU"], [5586, "WLED"], [1105, "Router"], [6081, "Switch"], [2606, "Punto wifi"], [2199, "Impresora"], [3797, "Equipo wifi"], [3798, "Equipo por cable"]]],
  ];
  function rdFoto(x) {                    // la imagen subida para ese equipo, si la hay
    var m = /^img:(png|jpg|webp):(\d+)$/.exec(x.icono || "");
    return m ? CEN + "/icono/" + x.mac.replace(/:/g, "") + "." + m[1] + "?v=" + m[2] : "";
  }
  // Dibujos de los equipos (10-10-2026): un SVG propio por clase de aparato, para que el mapa y la
  // lista se parezcan a lo que hay en casa. Los genera dibujos.py; aqui van ya montados.
  var RD_REAL = {"cellphone": "movil", "tablet": "tablet", "laptop": "portatil", "desktop-tower-monitor": "pc", "monitor": "tv", "server": "servidor", "nas": "nas", "raspberry-pi": "placa", "chip": "placa", "television": "tv", "projector": "caja", "television-box": "caja", "sony-playstation": "ps5", "microsoft-xbox": "xbox", "nintendo-switch": "switch", "steam": "mando", "controller": "mando", "speaker": "altavoz", "amazon-alexa": "altavoz", "google-home": "nest", "soundbar": "altavoz", "watch": "reloj", "printer": "impresora", "cctv": "camara", "camera": "camara", "doorbell-video": "timbre", "lightbulb": "bombilla", "lightbulb-group": "bombilla", "ceiling-light": "bombilla", "floor-lamp": "bombilla", "led-strip-variant": "tira", "power-socket-eu": "enchufe", "air-conditioner": "aire", "robot-vacuum": "aspirador", "remote": "mandoir", "access-point": "hub", "home-automation": "hub", "router-wireless": "router"};
  var RD_DIBUJO = {
    movil: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"pl\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f2f4f7\"/><stop offset=\".5\" stop-color=\"#b9c0cb\"/><stop offset=\"1\" stop-color=\"#7f8896\"/></linearGradient><linearGradient id=\"fp\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#5b6cff\"/><stop offset=\".55\" stop-color=\"#b44fd6\"/><stop offset=\"1\" stop-color=\"#ff9a4d\"/></linearGradient><linearGradient id=\"br\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".35\"/><stop offset=\".5\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"13\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><rect x=\"18.5\" y=\"3\" width=\"27\" height=\"55\" rx=\"6.5\" fill=\"url(#pl)\"/><rect x=\"19.8\" y=\"4.3\" width=\"24.4\" height=\"52.4\" rx=\"5.4\" fill=\"#0b0c11\"/><rect x=\"21.2\" y=\"5.7\" width=\"21.6\" height=\"49.6\" rx=\"4.2\" fill=\"url(#fp)\"/><circle cx=\"27\" cy=\"40\" r=\"15\" fill=\"#fff\" opacity=\".1\"/><path d=\"M21.2 44 33 30l9.8 12v9.1a4.2 4.2 0 0 1-4.2 4.2H25.4a4.2 4.2 0 0 1-4.2-4.2z\" fill=\"#161032\" opacity=\".45\"/><rect x=\"27.6\" y=\"7.6\" width=\"8.8\" height=\"3\" rx=\"1.5\" fill=\"#0b0c11\"/><rect x=\"27\" y=\"52\" width=\"10\" height=\"1.2\" rx=\".6\" fill=\"#fff\" opacity=\".8\"/><rect x=\"21.2\" y=\"5.7\" width=\"21.6\" height=\"49.6\" rx=\"4.2\" fill=\"url(#br)\"/></svg>",
    tablet: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"pl\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f2f4f7\"/><stop offset=\".5\" stop-color=\"#b9c0cb\"/><stop offset=\"1\" stop-color=\"#7f8896\"/></linearGradient><linearGradient id=\"fp\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#5b6cff\"/><stop offset=\".55\" stop-color=\"#b44fd6\"/><stop offset=\"1\" stop-color=\"#ff9a4d\"/></linearGradient><linearGradient id=\"br\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".35\"/><stop offset=\".5\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"20\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><rect x=\"9\" y=\"6\" width=\"46\" height=\"51\" rx=\"5.5\" fill=\"url(#pl)\"/><rect x=\"10.2\" y=\"7.2\" width=\"43.6\" height=\"48.6\" rx=\"4.4\" fill=\"#0b0c11\"/><rect x=\"12.4\" y=\"9.4\" width=\"39.2\" height=\"44.2\" rx=\"2.6\" fill=\"url(#fp)\"/><path d=\"M12.4 42 26 28l11 11 6-6 8.6 9v9a2.6 2.6 0 0 1-2.6 2.6H15a2.6 2.6 0 0 1-2.6-2.6z\" fill=\"#161032\" opacity=\".4\"/><circle cx=\"32\" cy=\"8.3\" r=\".7\" fill=\"#39404d\"/><rect x=\"26\" y=\"50.6\" width=\"12\" height=\"1.2\" rx=\".6\" fill=\"#fff\" opacity=\".8\"/><rect x=\"12.4\" y=\"9.4\" width=\"39.2\" height=\"44.2\" rx=\"2.6\" fill=\"url(#br)\"/></svg>",
    portatil: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"pl\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f2f4f7\"/><stop offset=\".5\" stop-color=\"#b9c0cb\"/><stop offset=\"1\" stop-color=\"#7f8896\"/></linearGradient><linearGradient id=\"fp\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#5b6cff\"/><stop offset=\".55\" stop-color=\"#b44fd6\"/><stop offset=\"1\" stop-color=\"#ff9a4d\"/></linearGradient><linearGradient id=\"br\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".35\"/><stop offset=\".5\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"26\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><rect x=\"11\" y=\"10\" width=\"42\" height=\"31\" rx=\"3.2\" fill=\"#15171d\" stroke=\"#7f8896\" stroke-width=\"1\"/><rect x=\"13.2\" y=\"12.2\" width=\"37.6\" height=\"25.8\" rx=\"1.4\" fill=\"url(#fp)\"/><path d=\"M13.2 33 24 23l9 8 6-5 11.6 9v1.6a1.4 1.4 0 0 1-1.4 1.4H14.6a1.4 1.4 0 0 1-1.4-1.4z\" fill=\"#161032\" opacity=\".4\"/><rect x=\"13.2\" y=\"12.2\" width=\"37.6\" height=\"25.8\" rx=\"1.4\" fill=\"url(#br)\"/><path d=\"M5 44.5h54l-2.4 5.2a3 3 0 0 1-2.7 1.8H10.1a3 3 0 0 1-2.7-1.8z\" fill=\"url(#pl)\"/><rect x=\"4\" y=\"41\" width=\"56\" height=\"4\" rx=\"1.6\" fill=\"#dfe3ea\"/><rect x=\"26\" y=\"41\" width=\"12\" height=\"1.6\" rx=\".8\" fill=\"#9aa2b0\"/></svg>",
    pc: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"pl\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f2f4f7\"/><stop offset=\".5\" stop-color=\"#b9c0cb\"/><stop offset=\"1\" stop-color=\"#7f8896\"/></linearGradient><linearGradient id=\"ng\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4a505c\"/><stop offset=\".45\" stop-color=\"#1c1f27\"/><stop offset=\"1\" stop-color=\"#0b0c10\"/></linearGradient><linearGradient id=\"fp\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#5b6cff\"/><stop offset=\".55\" stop-color=\"#b44fd6\"/><stop offset=\"1\" stop-color=\"#ff9a4d\"/></linearGradient><linearGradient id=\"br\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".35\"/><stop offset=\".5\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"27\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><rect x=\"3\" y=\"12\" width=\"38\" height=\"26\" rx=\"2.4\" fill=\"#111318\" stroke=\"#7f8896\" stroke-width=\"1\"/><rect x=\"5\" y=\"14\" width=\"34\" height=\"22\" rx=\"1\" fill=\"url(#fp)\"/><rect x=\"5\" y=\"14\" width=\"34\" height=\"22\" rx=\"1\" fill=\"url(#br)\"/><path d=\"M18 38h8l1.5 9h-11z\" fill=\"url(#pl)\"/><rect x=\"11\" y=\"47\" width=\"22\" height=\"3\" rx=\"1.5\" fill=\"url(#pl)\"/><rect x=\"45\" y=\"8\" width=\"16\" height=\"46\" rx=\"2.6\" fill=\"url(#ng)\" stroke=\"#5a6272\" stroke-width=\".8\"/><rect x=\"47.4\" y=\"11\" width=\"11.2\" height=\"1.6\" rx=\".8\" fill=\"#2a2e38\"/><rect x=\"47.4\" y=\"14.6\" width=\"11.2\" height=\"1.6\" rx=\".8\" fill=\"#2a2e38\"/><rect x=\"52\" y=\"22\" width=\"2\" height=\"24\" rx=\"1\" fill=\"#39d0ff\"/><rect x=\"52\" y=\"22\" width=\"2\" height=\"24\" rx=\"1\" fill=\"#b44fd6\" opacity=\".6\" transform=\"translate(0 12) scale(1 .5)\"/><circle cx=\"53\" cy=\"50\" r=\"1.3\" fill=\"#3dd68c\"/></svg>",
    servidor: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"pl\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f2f4f7\"/><stop offset=\".5\" stop-color=\"#b9c0cb\"/><stop offset=\"1\" stop-color=\"#7f8896\"/></linearGradient><linearGradient id=\"br\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".35\"/><stop offset=\".5\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"25\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><path d=\"M10 24h44a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V30a6 6 0 0 1 6-6z\" fill=\"url(#pl)\"/><path d=\"M10 24h44a6 6 0 0 1 6 6v2H4v-2a6 6 0 0 1 6-6z\" fill=\"#fff\" opacity=\".55\"/><path d=\"M4 44v0a6 6 0 0 0 6 6h44a6 6 0 0 0 6-6v-3H4z\" fill=\"#000\" opacity=\".12\"/><circle cx=\"54\" cy=\"41\" r=\"1.3\" fill=\"#fff\"/><circle cx=\"54\" cy=\"41\" r=\"2.6\" fill=\"#fff\" opacity=\".25\"/><rect x=\"10\" y=\"40\" width=\"9\" height=\"2\" rx=\"1\" fill=\"#6f7886\"/><rect x=\"14\" y=\"50\" width=\"36\" height=\"2.4\" rx=\"1.2\" fill=\"#23262e\"/></svg>",
    nas: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"ng\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4a505c\"/><stop offset=\".45\" stop-color=\"#1c1f27\"/><stop offset=\"1\" stop-color=\"#0b0c10\"/></linearGradient><linearGradient id=\"br\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".35\"/><stop offset=\".5\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"18\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><rect x=\"14\" y=\"6\" width=\"36\" height=\"51\" rx=\"4\" fill=\"url(#ng)\" stroke=\"#5a6272\" stroke-width=\".9\"/><rect x=\"18\" y=\"10\" width=\"28\" height=\"8.4\" rx=\"1.6\" fill=\"#0b0c10\" stroke=\"#3a3f4b\" stroke-width=\".7\"/><rect x=\"20.4\" y=\"13.5\" width=\"12\" height=\"1.4\" rx=\".7\" fill=\"#3a3f4b\"/><circle cx=\"42\" cy=\"14.2\" r=\"1.2\" fill=\"#3dd68c\"/><rect x=\"18\" y=\"20\" width=\"28\" height=\"8.4\" rx=\"1.6\" fill=\"#0b0c10\" stroke=\"#3a3f4b\" stroke-width=\".7\"/><rect x=\"20.4\" y=\"23.9\" width=\"12\" height=\"1.4\" rx=\".7\" fill=\"#3a3f4b\"/><circle cx=\"42\" cy=\"24.6\" r=\"1.2\" fill=\"#3dd68c\"/><rect x=\"18\" y=\"30\" width=\"28\" height=\"8.4\" rx=\"1.6\" fill=\"#0b0c10\" stroke=\"#3a3f4b\" stroke-width=\".7\"/><rect x=\"20.4\" y=\"34.3\" width=\"12\" height=\"1.4\" rx=\".7\" fill=\"#3a3f4b\"/><circle cx=\"42\" cy=\"35\" r=\"1.2\" fill=\"#3dd68c\"/><rect x=\"18\" y=\"41\" width=\"28\" height=\"8.4\" rx=\"1.6\" fill=\"#0b0c10\" stroke=\"#3a3f4b\" stroke-width=\".7\"/><rect x=\"20.4\" y=\"44.7\" width=\"12\" height=\"1.4\" rx=\".7\" fill=\"#3a3f4b\"/><circle cx=\"42\" cy=\"45.4\" r=\"1.2\" fill=\"#f5b546\"/><circle cx=\"32\" cy=\"53\" r=\"1.4\" fill=\"#39d0ff\"/></svg>",
    router: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"bl\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\"1\" stop-color=\"#cfd5de\"/></linearGradient><linearGradient id=\"pl\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f2f4f7\"/><stop offset=\".5\" stop-color=\"#b9c0cb\"/><stop offset=\"1\" stop-color=\"#7f8896\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"26\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><rect x=\"10\" y=\"6\" width=\"3.4\" height=\"32\" rx=\"1.7\" fill=\"url(#pl)\"/><rect x=\"24\" y=\"4\" width=\"3.4\" height=\"34\" rx=\"1.7\" fill=\"url(#pl)\"/><rect x=\"36.6\" y=\"4\" width=\"3.4\" height=\"34\" rx=\"1.7\" fill=\"url(#pl)\"/><rect x=\"50.6\" y=\"6\" width=\"3.4\" height=\"32\" rx=\"1.7\" fill=\"url(#pl)\"/><path d=\"M9 36h46a5 5 0 0 1 5 5v9a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-9a5 5 0 0 1 5-5z\" fill=\"url(#bl)\"/><path d=\"M4 49v1a5 5 0 0 0 5 5h46a5 5 0 0 0 5-5v-1z\" fill=\"#000\" opacity=\".12\"/><circle cx=\"14\" cy=\"46\" r=\"1.5\" fill=\"#3dd68c\"/><circle cx=\"20\" cy=\"46\" r=\"1.5\" fill=\"#3dd68c\"/><circle cx=\"26\" cy=\"46\" r=\"1.5\" fill=\"#39a0ff\"/><circle cx=\"32\" cy=\"46\" r=\"1.5\" fill=\"#39a0ff\"/><rect x=\"42\" y=\"45\" width=\"12\" height=\"2\" rx=\"1\" fill=\"#aab2bf\"/></svg>",
    tv: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"ng\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4a505c\"/><stop offset=\".45\" stop-color=\"#1c1f27\"/><stop offset=\"1\" stop-color=\"#0b0c10\"/></linearGradient><linearGradient id=\"br\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".35\"/><stop offset=\".5\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"24\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><rect x=\"2.5\" y=\"10\" width=\"59\" height=\"37\" rx=\"2.4\" fill=\"#0a0b0f\" stroke=\"#5a6272\" stroke-width=\".9\"/><rect x=\"4.3\" y=\"11.8\" width=\"55.4\" height=\"33.4\" rx=\"1\" fill=\"#141a2e\"/><rect x=\"6.5\" y=\"14\" width=\"24\" height=\"15\" rx=\"1.4\" fill=\"#e23b4e\"/><rect x=\"33\" y=\"14\" width=\"24.5\" height=\"15\" rx=\"1.4\" fill=\"#2f6bff\"/><rect x=\"6.5\" y=\"31.5\" width=\"11\" height=\"11\" rx=\"1.4\" fill=\"#ff7a1a\"/><rect x=\"19.7\" y=\"31.5\" width=\"11\" height=\"11\" rx=\"1.4\" fill=\"#3dd68c\"/><rect x=\"33\" y=\"31.5\" width=\"11\" height=\"11\" rx=\"1.4\" fill=\"#b44fd6\"/><rect x=\"46.3\" y=\"31.5\" width=\"11.2\" height=\"11\" rx=\"1.4\" fill=\"#f5c542\"/><path d=\"M12.5 21.5l5-3v6z\" fill=\"#fff\" opacity=\".9\"/><rect x=\"4.3\" y=\"11.8\" width=\"55.4\" height=\"33.4\" rx=\"1\" fill=\"url(#br)\"/><path d=\"M16 47l-5 7h3.4l5-7zM48 47l5 7h-3.4l-5-7z\" fill=\"#3a3f4b\"/></svg>",
    caja: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"ng\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4a505c\"/><stop offset=\".45\" stop-color=\"#1c1f27\"/><stop offset=\"1\" stop-color=\"#0b0c10\"/></linearGradient><linearGradient id=\"br\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".35\"/><stop offset=\".5\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"25\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><path d=\"M6 30 46 22l13 6v14L20 52 6 44z\" fill=\"url(#ng)\" stroke=\"#4a505c\" stroke-width=\".8\"/><path d=\"M6 30 46 22l13 6-39 8z\" fill=\"#fff\" opacity=\".08\"/><path d=\"M20 36l39-8\" stroke=\"#76e21c\" stroke-width=\"1.8\" stroke-linecap=\"round\"/><path d=\"M20 36l39-8\" stroke=\"#76e21c\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".22\"/><path d=\"M20 36v16\" stroke=\"#000\" stroke-width=\".8\" opacity=\".5\"/></svg>",
    ps5: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"bl\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\"1\" stop-color=\"#cfd5de\"/></linearGradient><linearGradient id=\"ng\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4a505c\"/><stop offset=\".45\" stop-color=\"#1c1f27\"/><stop offset=\"1\" stop-color=\"#0b0c10\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"17\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><rect x=\"25\" y=\"7\" width=\"14\" height=\"49\" rx=\"3\" fill=\"url(#ng)\"/><rect x=\"30.5\" y=\"12\" width=\"3\" height=\"20\" rx=\"1.5\" fill=\"#0b0c10\"/><rect x=\"31.3\" y=\"36\" width=\"1.4\" height=\"6\" rx=\".7\" fill=\"#39a0ff\"/><rect x=\"29.5\" y=\"35\" width=\"5\" height=\"8\" rx=\"2.5\" fill=\"#39a0ff\" opacity=\".25\"/><path d=\"M24.5 5.5c-5-1.5-9.5-.5-11 1.2-1.2 14-.8 34 2.3 50.8 3 .9 6.7.6 8.7-.5z\" fill=\"url(#bl)\"/><path d=\"M39.5 5.5c5-1.5 9.5-.5 11 1.2 1.2 14 .8 34-2.3 50.8-3 .9-6.7.6-8.7-.5z\" fill=\"url(#bl)\"/><path d=\"M24.5 5.5v51.5\" stroke=\"#39a0ff\" stroke-width=\".9\" opacity=\".8\"/><path d=\"M39.5 5.5v51.5\" stroke=\"#39a0ff\" stroke-width=\".9\" opacity=\".8\"/><rect x=\"21\" y=\"56.5\" width=\"22\" height=\"2.4\" rx=\"1.2\" fill=\"#15171d\"/></svg>",
    xbox: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"ng\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4a505c\"/><stop offset=\".45\" stop-color=\"#1c1f27\"/><stop offset=\"1\" stop-color=\"#0b0c10\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"17\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><rect x=\"17\" y=\"6\" width=\"30\" height=\"51\" rx=\"2.6\" fill=\"url(#ng)\" stroke=\"#4a505c\" stroke-width=\".8\"/><rect x=\"17\" y=\"6\" width=\"30\" height=\"10\" rx=\"2.6\" fill=\"#0b0c10\"/><circle cx=\"21\" cy=\"9\" r=\"1\" fill=\"#76e21c\" opacity=\".85\"/><circle cx=\"25\" cy=\"9\" r=\"1\" fill=\"#76e21c\" opacity=\".85\"/><circle cx=\"29\" cy=\"9\" r=\"1\" fill=\"#76e21c\" opacity=\".85\"/><circle cx=\"33\" cy=\"9\" r=\"1\" fill=\"#76e21c\" opacity=\".85\"/><circle cx=\"37\" cy=\"9\" r=\"1\" fill=\"#76e21c\" opacity=\".85\"/><circle cx=\"41\" cy=\"9\" r=\"1\" fill=\"#76e21c\" opacity=\".85\"/><circle cx=\"21\" cy=\"12\" r=\"1\" fill=\"#76e21c\" opacity=\".85\"/><circle cx=\"25\" cy=\"12\" r=\"1\" fill=\"#76e21c\" opacity=\".85\"/><circle cx=\"29\" cy=\"12\" r=\"1\" fill=\"#76e21c\" opacity=\".85\"/><circle cx=\"33\" cy=\"12\" r=\"1\" fill=\"#76e21c\" opacity=\".85\"/><circle cx=\"37\" cy=\"12\" r=\"1\" fill=\"#76e21c\" opacity=\".85\"/><circle cx=\"41\" cy=\"12\" r=\"1\" fill=\"#76e21c\" opacity=\".85\"/><circle cx=\"42\" cy=\"22\" r=\"2.2\" fill=\"#fff\"/><circle cx=\"42\" cy=\"22\" r=\"3.6\" fill=\"#fff\" opacity=\".2\"/><rect x=\"21\" y=\"30\" width=\"14\" height=\"1.3\" rx=\".650\" fill=\"#2a2e38\"/><rect x=\"21\" y=\"50\" width=\"4\" height=\"2\" rx=\"1\" fill=\"#2a2e38\"/></svg>",
    switch: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"fp\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#5b6cff\"/><stop offset=\".55\" stop-color=\"#b44fd6\"/><stop offset=\"1\" stop-color=\"#ff9a4d\"/></linearGradient><linearGradient id=\"br\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".35\"/><stop offset=\".5\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"26\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><path d=\"M11 18h7v30h-7a7 7 0 0 1-7-7V25a7 7 0 0 1 7-7z\" fill=\"#1fb6e8\"/><path d=\"M53 18h-7v30h7a7 7 0 0 0 7-7V25a7 7 0 0 0-7-7z\" fill=\"#f0463c\"/><rect x=\"18\" y=\"18\" width=\"28\" height=\"30\" rx=\"1.6\" fill=\"#15171d\"/><rect x=\"20\" y=\"20.5\" width=\"24\" height=\"25\" rx=\"1\" fill=\"url(#fp)\"/><rect x=\"20\" y=\"20.5\" width=\"24\" height=\"25\" rx=\"1\" fill=\"url(#br)\"/><circle cx=\"11\" cy=\"27\" r=\"2.8\" fill=\"#0b0c10\"/><circle cx=\"53\" cy=\"38\" r=\"2.8\" fill=\"#0b0c10\"/><circle cx=\"11\" cy=\"38\" r=\"1\" fill=\"#0b0c10\"/><circle cx=\"8.5\" cy=\"40.5\" r=\"1\" fill=\"#0b0c10\"/><circle cx=\"13.5\" cy=\"40.5\" r=\"1\" fill=\"#0b0c10\"/><circle cx=\"11\" cy=\"43\" r=\"1\" fill=\"#0b0c10\"/><circle cx=\"53\" cy=\"24\" r=\"1\" fill=\"#0b0c10\"/><circle cx=\"50.5\" cy=\"26.5\" r=\"1\" fill=\"#0b0c10\"/><circle cx=\"55.5\" cy=\"26.5\" r=\"1\" fill=\"#0b0c10\"/><circle cx=\"53\" cy=\"29\" r=\"1\" fill=\"#0b0c10\"/></svg>",
    mando: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"ng\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4a505c\"/><stop offset=\".45\" stop-color=\"#1c1f27\"/><stop offset=\"1\" stop-color=\"#0b0c10\"/></linearGradient><linearGradient id=\"bl\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\"1\" stop-color=\"#cfd5de\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"24\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><path d=\"M16 17h32c6 0 9 4 10.5 12l2 12c1 7-5.5 10-9.5 4.5L46 38H18l-5 7.5C9 51 2.5 48 3.5 41l2-12C7 21 10 17 16 17z\" fill=\"url(#bl)\"/><rect x=\"23\" y=\"19\" width=\"18\" height=\"9\" rx=\"2\" fill=\"#15171d\"/><circle cx=\"23\" cy=\"36\" r=\"4\" fill=\"#15171d\"/><circle cx=\"41\" cy=\"36\" r=\"4\" fill=\"#15171d\"/><path d=\"M13.5 24.5v6M10.5 27.5h6\" stroke=\"#15171d\" stroke-width=\"2.2\" stroke-linecap=\"round\"/><circle cx=\"50.5\" cy=\"24.5\" r=\"1.3\" fill=\"#3dd68c\"/><circle cx=\"53.5\" cy=\"27.5\" r=\"1.3\" fill=\"#f0463c\"/><circle cx=\"47.5\" cy=\"27.5\" r=\"1.3\" fill=\"#b44fd6\"/><circle cx=\"50.5\" cy=\"30.5\" r=\"1.3\" fill=\"#39a0ff\"/></svg>",
    altavoz: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><radialGradient id=\"es\" cx=\".35\" cy=\".28\" r=\".85\"><stop offset=\"0\" stop-color=\"#6a7386\"/><stop offset=\".5\" stop-color=\"#2b303b\"/><stop offset=\"1\" stop-color=\"#0e1015\"/></radialGradient><pattern id=\"tj\" width=\"2.4\" height=\"2.4\" patternUnits=\"userSpaceOnUse\"><circle cx=\"1.2\" cy=\"1.2\" r=\".45\" fill=\"#000\" opacity=\".35\"/></pattern></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"20\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><circle cx=\"32\" cy=\"31\" r=\"24\" fill=\"url(#es)\"/><circle cx=\"32\" cy=\"31\" r=\"24\" fill=\"url(#tj)\"/><path d=\"M10.5 42a24 24 0 0 0 43 0 60 60 0 0 1-43 0z\" fill=\"#15171d\"/><path d=\"M10.8 42.6a58 58 0 0 0 42.4 0\" fill=\"none\" stroke=\"#39c8ff\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M10.8 42.6a58 58 0 0 0 42.4 0\" fill=\"none\" stroke=\"#39c8ff\" stroke-width=\"6\" stroke-linecap=\"round\" opacity=\".22\"/><ellipse cx=\"24\" cy=\"17\" rx=\"9\" ry=\"5\" fill=\"#fff\" opacity=\".1\" transform=\"rotate(-28 24 17)\"/></svg>",
    nest: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><radialGradient id=\"tl\" cx=\".4\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#f1f2f4\"/><stop offset=\".7\" stop-color=\"#c9ccd2\"/><stop offset=\"1\" stop-color=\"#9ea3ad\"/></radialGradient><pattern id=\"tj\" width=\"2.2\" height=\"2.2\" patternUnits=\"userSpaceOnUse\"><circle cx=\"1.1\" cy=\"1.1\" r=\".4\" fill=\"#5a6272\" opacity=\".35\"/></pattern></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"23\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><ellipse cx=\"32\" cy=\"36\" rx=\"27\" ry=\"19\" fill=\"#8b919c\"/><ellipse cx=\"32\" cy=\"32\" rx=\"27\" ry=\"19\" fill=\"url(#tl)\"/><ellipse cx=\"32\" cy=\"32\" rx=\"27\" ry=\"19\" fill=\"url(#tj)\"/><circle cx=\"23\" cy=\"32\" r=\"1.7\" fill=\"#fff\"/><circle cx=\"29\" cy=\"32\" r=\"1.7\" fill=\"#fff\"/><circle cx=\"35\" cy=\"32\" r=\"1.7\" fill=\"#fff\"/><circle cx=\"41\" cy=\"32\" r=\"1.7\" fill=\"#fff\"/></svg>",
    bombilla: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><radialGradient id=\"lz\" cx=\".5\" cy=\".42\" r=\".6\"><stop offset=\"0\" stop-color=\"#fffbe0\"/><stop offset=\".55\" stop-color=\"#ffd95a\"/><stop offset=\"1\" stop-color=\"#f59b1c\"/></radialGradient><linearGradient id=\"pl\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f2f4f7\"/><stop offset=\".5\" stop-color=\"#b9c0cb\"/><stop offset=\"1\" stop-color=\"#7f8896\"/></linearGradient></defs><circle cx=\"32\" cy=\"25\" r=\"24\" fill=\"#ffd95a\" opacity=\".16\"/><path d=\"M32 4c-11 0-19 8.3-19 18.5 0 6.5 3.4 11 7 15 2.3 2.6 3.5 4.8 3.5 7.5h17c0-2.7 1.2-4.9 3.5-7.5 3.6-4 7-8.5 7-15C51 12.3 43 4 32 4z\" fill=\"url(#lz)\"/><path d=\"M26 29l3 5 3-5 3 5 3-5\" fill=\"none\" stroke=\"#fff\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" opacity=\".9\"/><path d=\"M29 34v11M35 34v11\" stroke=\"#fff\" stroke-width=\"1\" opacity=\".5\"/><ellipse cx=\"24\" cy=\"15\" rx=\"4\" ry=\"7\" fill=\"#fff\" opacity=\".4\" transform=\"rotate(28 24 15)\"/><rect x=\"23.5\" y=\"45\" width=\"17\" height=\"3.3\" rx=\"1.3\" fill=\"url(#pl)\"/><rect x=\"24\" y=\"48.8\" width=\"16\" height=\"3.3\" rx=\"1.3\" fill=\"url(#pl)\"/><rect x=\"24.5\" y=\"52.6\" width=\"15\" height=\"3.3\" rx=\"1.3\" fill=\"url(#pl)\"/><path d=\"M28 56.4h8l-1.6 3.6h-4.8z\" fill=\"#23262e\"/></svg>",
    tira: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"ng\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4a505c\"/><stop offset=\".45\" stop-color=\"#1c1f27\"/><stop offset=\"1\" stop-color=\"#0b0c10\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"22\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><circle cx=\"32\" cy=\"31\" r=\"24\" fill=\"none\" stroke=\"#1c1f27\" stroke-width=\"9\"/><circle cx=\"32\" cy=\"31\" r=\"24\" fill=\"none\" stroke=\"#e8ebf0\" stroke-width=\"7\"/><circle cx=\"32\" cy=\"31\" r=\"14\" fill=\"#15171d\" stroke=\"#4a505c\" stroke-width=\"1\"/><circle cx=\"32\" cy=\"31\" r=\"5\" fill=\"#0b0c10\"/><circle cx=\"32\" cy=\"7\" r=\"2.3\" fill=\"#ff4d6a\"/><circle cx=\"32\" cy=\"7\" r=\"4.2\" fill=\"#ff4d6a\" opacity=\".3\"/><circle cx=\"44\" cy=\"10.2\" r=\"2.3\" fill=\"#ff9a3d\"/><circle cx=\"44\" cy=\"10.2\" r=\"4.2\" fill=\"#ff9a3d\" opacity=\".3\"/><circle cx=\"52.8\" cy=\"19\" r=\"2.3\" fill=\"#ffe14d\"/><circle cx=\"52.8\" cy=\"19\" r=\"4.2\" fill=\"#ffe14d\" opacity=\".3\"/><circle cx=\"56\" cy=\"31\" r=\"2.3\" fill=\"#4dff88\"/><circle cx=\"56\" cy=\"31\" r=\"4.2\" fill=\"#4dff88\" opacity=\".3\"/><circle cx=\"52.8\" cy=\"43\" r=\"2.3\" fill=\"#3dd0ff\"/><circle cx=\"52.8\" cy=\"43\" r=\"4.2\" fill=\"#3dd0ff\" opacity=\".3\"/><circle cx=\"44\" cy=\"51.8\" r=\"2.3\" fill=\"#4d7dff\"/><circle cx=\"44\" cy=\"51.8\" r=\"4.2\" fill=\"#4d7dff\" opacity=\".3\"/><circle cx=\"32\" cy=\"55\" r=\"2.3\" fill=\"#a64dff\"/><circle cx=\"32\" cy=\"55\" r=\"4.2\" fill=\"#a64dff\" opacity=\".3\"/><circle cx=\"20\" cy=\"51.8\" r=\"2.3\" fill=\"#ff4dd2\"/><circle cx=\"20\" cy=\"51.8\" r=\"4.2\" fill=\"#ff4dd2\" opacity=\".3\"/><circle cx=\"11.2\" cy=\"43\" r=\"2.3\" fill=\"#ff4d6a\"/><circle cx=\"11.2\" cy=\"43\" r=\"4.2\" fill=\"#ff4d6a\" opacity=\".3\"/><circle cx=\"8\" cy=\"31\" r=\"2.3\" fill=\"#ff9a3d\"/><circle cx=\"8\" cy=\"31\" r=\"4.2\" fill=\"#ff9a3d\" opacity=\".3\"/><circle cx=\"11.2\" cy=\"19\" r=\"2.3\" fill=\"#ffe14d\"/><circle cx=\"11.2\" cy=\"19\" r=\"4.2\" fill=\"#ffe14d\" opacity=\".3\"/><circle cx=\"20\" cy=\"10.2\" r=\"2.3\" fill=\"#4dff88\"/><circle cx=\"20\" cy=\"10.2\" r=\"4.2\" fill=\"#4dff88\" opacity=\".3\"/></svg>",
    timbre: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"ng\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4a505c\"/><stop offset=\".45\" stop-color=\"#1c1f27\"/><stop offset=\"1\" stop-color=\"#0b0c10\"/></linearGradient><linearGradient id=\"pl\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f2f4f7\"/><stop offset=\".5\" stop-color=\"#b9c0cb\"/><stop offset=\"1\" stop-color=\"#7f8896\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"12\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><rect x=\"20\" y=\"3\" width=\"24\" height=\"55\" rx=\"6\" fill=\"url(#pl)\"/><rect x=\"20\" y=\"3\" width=\"24\" height=\"29\" rx=\"6\" fill=\"url(#ng)\"/><rect x=\"20\" y=\"24\" width=\"24\" height=\"8\" fill=\"#15171d\"/><circle cx=\"32\" cy=\"15\" r=\"5.5\" fill=\"#07080b\" stroke=\"#4a505c\" stroke-width=\"1\"/><circle cx=\"32\" cy=\"15\" r=\"2.4\" fill=\"#1d2f52\"/><circle cx=\"30.8\" cy=\"13.8\" r=\".9\" fill=\"#fff\" opacity=\".8\"/><circle cx=\"32\" cy=\"44\" r=\"6.5\" fill=\"#e8ebf0\" stroke=\"#39a0ff\" stroke-width=\"1.8\"/><circle cx=\"32\" cy=\"44\" r=\"9\" fill=\"#39a0ff\" opacity=\".2\"/></svg>",
    aire: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"bl\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\"1\" stop-color=\"#cfd5de\"/></linearGradient></defs><path d=\"M7 9h50a5 5 0 0 1 5 5v14a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V14a5 5 0 0 1 5-5z\" fill=\"url(#bl)\"/><path d=\"M2 26h60v2a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5z\" fill=\"#b9c0cb\"/><rect x=\"7\" y=\"28\" width=\"50\" height=\"1.8\" rx=\".9\" fill=\"#5a6272\"/><rect x=\"44\" y=\"14\" width=\"12\" height=\"5.5\" rx=\"1.4\" fill=\"#15171d\"/><rect x=\"46\" y=\"15.8\" width=\"5\" height=\"1.9\" rx=\".5\" fill=\"#3dd68c\"/><rect x=\"7\" y=\"13.5\" width=\"26\" height=\"1.2\" rx=\".6\" fill=\"#aab2bf\"/><path d=\"M16 39c-3 4-3 8 0 12s3 7 1 9M32 39c-3 4-3 8 0 12s3 7 1 9M48 39c-3 4-3 8 0 12s3 7 1 9\" fill=\"none\" stroke=\"#5cc8ff\" stroke-width=\"2.4\" stroke-linecap=\"round\" opacity=\".9\"/></svg>",
    enchufe: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"bl\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\"1\" stop-color=\"#cfd5de\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"19\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><rect x=\"9\" y=\"7\" width=\"46\" height=\"48\" rx=\"12\" fill=\"url(#bl)\"/><rect x=\"9\" y=\"7\" width=\"46\" height=\"48\" rx=\"12\" fill=\"none\" stroke=\"#aab2bf\" stroke-width=\".8\"/><circle cx=\"32\" cy=\"29\" r=\"14.5\" fill=\"#e2e6ec\" stroke=\"#b9c0cb\" stroke-width=\"1\"/><circle cx=\"32\" cy=\"29\" r=\"11\" fill=\"#d3d8e0\"/><circle cx=\"26\" cy=\"29\" r=\"2.6\" fill=\"#23262e\"/><circle cx=\"38\" cy=\"29\" r=\"2.6\" fill=\"#23262e\"/><rect x=\"30.8\" y=\"15\" width=\"2.4\" height=\"4\" rx=\"1\" fill=\"#9aa2b0\"/><rect x=\"30.8\" y=\"39\" width=\"2.4\" height=\"4\" rx=\"1\" fill=\"#9aa2b0\"/><circle cx=\"32\" cy=\"49.5\" r=\"1.7\" fill=\"#39a0ff\"/><circle cx=\"32\" cy=\"49.5\" r=\"3.4\" fill=\"#39a0ff\" opacity=\".25\"/></svg>",
    mandoir: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"ng\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4a505c\"/><stop offset=\".45\" stop-color=\"#1c1f27\"/><stop offset=\"1\" stop-color=\"#0b0c10\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"18\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><path d=\"M12 22v22c0 5.5 9 10 20 10s20-4.5 20-10V22z\" fill=\"url(#ng)\"/><ellipse cx=\"32\" cy=\"22\" rx=\"20\" ry=\"10\" fill=\"#23262e\" stroke=\"#4a505c\" stroke-width=\".8\"/><ellipse cx=\"27\" cy=\"19.5\" rx=\"9\" ry=\"3.6\" fill=\"#fff\" opacity=\".1\"/><circle cx=\"32\" cy=\"46\" r=\"1.5\" fill=\"#39a0ff\"/><circle cx=\"32\" cy=\"46\" r=\"3.2\" fill=\"#39a0ff\" opacity=\".25\"/><path d=\"M24 9a11 11 0 0 1 16 0M27.5 12.5a6 6 0 0 1 9 0\" fill=\"none\" stroke=\"#ff5a5a\" stroke-width=\"1.8\" stroke-linecap=\"round\" opacity=\".85\"/></svg>",
    hub: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"bl\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\"1\" stop-color=\"#cfd5de\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"22\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><rect x=\"7\" y=\"16\" width=\"50\" height=\"38\" rx=\"15\" fill=\"#b9c0cb\"/><rect x=\"7\" y=\"12\" width=\"50\" height=\"38\" rx=\"15\" fill=\"url(#bl)\"/><ellipse cx=\"32\" cy=\"31\" rx=\"13\" ry=\"9.5\" fill=\"none\" stroke=\"#5cc8ff\" stroke-width=\"2\"/><ellipse cx=\"32\" cy=\"31\" rx=\"13\" ry=\"9.5\" fill=\"none\" stroke=\"#5cc8ff\" stroke-width=\"6\" opacity=\".2\"/><circle cx=\"32\" cy=\"31\" r=\"2\" fill=\"#aab2bf\"/></svg>",
    placa: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"ng\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4a505c\"/><stop offset=\".45\" stop-color=\"#1c1f27\"/><stop offset=\"1\" stop-color=\"#0b0c10\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"18\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><rect x=\"13\" y=\"5\" width=\"38\" height=\"52\" rx=\"2.6\" fill=\"#0f6b4a\"/><rect x=\"13\" y=\"5\" width=\"38\" height=\"52\" rx=\"2.6\" fill=\"none\" stroke=\"#0a4a33\" stroke-width=\"1\"/><path d=\"M20 9h24v3h-4v3h4v3h-4v3h-20z\" fill=\"none\" stroke=\"#d9b54a\" stroke-width=\"1.3\" stroke-linejoin=\"round\"/><rect x=\"20\" y=\"25\" width=\"24\" height=\"17\" rx=\"1.2\" fill=\"url(#ng)\" stroke=\"#aab2bf\" stroke-width=\".7\"/><rect x=\"23\" y=\"28\" width=\"18\" height=\"2\" rx=\".6\" fill=\"#3a3f4b\"/><circle cx=\"41\" cy=\"38.5\" r=\".9\" fill=\"#5a6272\"/><rect x=\"27\" y=\"48\" width=\"10\" height=\"7\" rx=\"1\" fill=\"#cfd5de\"/><circle cx=\"19\" cy=\"50\" r=\"1.3\" fill=\"#ff4d4d\"/><circle cx=\"45\" cy=\"50\" r=\"1.3\" fill=\"#3dd68c\"/><rect x=\"9.5\" y=\"24\" width=\"3.5\" height=\"2\" fill=\"#d9b54a\"/><rect x=\"51\" y=\"24\" width=\"3.5\" height=\"2\" fill=\"#d9b54a\"/><rect x=\"9.5\" y=\"28\" width=\"3.5\" height=\"2\" fill=\"#d9b54a\"/><rect x=\"51\" y=\"28\" width=\"3.5\" height=\"2\" fill=\"#d9b54a\"/><rect x=\"9.5\" y=\"32\" width=\"3.5\" height=\"2\" fill=\"#d9b54a\"/><rect x=\"51\" y=\"32\" width=\"3.5\" height=\"2\" fill=\"#d9b54a\"/><rect x=\"9.5\" y=\"36\" width=\"3.5\" height=\"2\" fill=\"#d9b54a\"/><rect x=\"51\" y=\"36\" width=\"3.5\" height=\"2\" fill=\"#d9b54a\"/><rect x=\"9.5\" y=\"40\" width=\"3.5\" height=\"2\" fill=\"#d9b54a\"/><rect x=\"51\" y=\"40\" width=\"3.5\" height=\"2\" fill=\"#d9b54a\"/><rect x=\"9.5\" y=\"44\" width=\"3.5\" height=\"2\" fill=\"#d9b54a\"/><rect x=\"51\" y=\"44\" width=\"3.5\" height=\"2\" fill=\"#d9b54a\"/></svg>",
    reloj: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"ng\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4a505c\"/><stop offset=\".45\" stop-color=\"#1c1f27\"/><stop offset=\"1\" stop-color=\"#0b0c10\"/></linearGradient><linearGradient id=\"fp\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#5b6cff\"/><stop offset=\".55\" stop-color=\"#b44fd6\"/><stop offset=\"1\" stop-color=\"#ff9a4d\"/></linearGradient></defs><path d=\"M22 2h20l2 14H20zM22 62h20l2-14H20z\" fill=\"#2b303b\"/><rect x=\"14\" y=\"13\" width=\"36\" height=\"38\" rx=\"10\" fill=\"url(#ng)\" stroke=\"#7f8896\" stroke-width=\"1.2\"/><rect x=\"17.5\" y=\"16.5\" width=\"29\" height=\"31\" rx=\"7\" fill=\"#07080b\"/><circle cx=\"32\" cy=\"32\" r=\"10.5\" fill=\"none\" stroke=\"#2a1420\" stroke-width=\"3.4\"/><path d=\"M32 21.5a10.5 10.5 0 1 1-9.9 7\" fill=\"none\" stroke=\"#ff3d71\" stroke-width=\"3.4\" stroke-linecap=\"round\"/><circle cx=\"32\" cy=\"32\" r=\"6\" fill=\"none\" stroke=\"#17301f\" stroke-width=\"3\"/><path d=\"M32 26a6 6 0 1 1-5.2 9\" fill=\"none\" stroke=\"#7dff5a\" stroke-width=\"3\" stroke-linecap=\"round\"/><rect x=\"50\" y=\"24\" width=\"2.6\" height=\"7\" rx=\"1.3\" fill=\"#7f8896\"/></svg>",
    impresora: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"bl\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\"1\" stop-color=\"#cfd5de\"/></linearGradient><linearGradient id=\"ng\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4a505c\"/><stop offset=\".45\" stop-color=\"#1c1f27\"/><stop offset=\"1\" stop-color=\"#0b0c10\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"25\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><rect x=\"17\" y=\"5\" width=\"30\" height=\"18\" rx=\"1.6\" fill=\"#fff\" stroke=\"#cfd5de\" stroke-width=\".8\"/><rect x=\"21\" y=\"9\" width=\"18\" height=\"1.5\" rx=\".7\" fill=\"#b9c0cb\"/><rect x=\"21\" y=\"13\" width=\"22\" height=\"1.5\" rx=\".7\" fill=\"#b9c0cb\"/><rect x=\"5\" y=\"20\" width=\"54\" height=\"24\" rx=\"5\" fill=\"url(#bl)\"/><rect x=\"5\" y=\"36\" width=\"54\" height=\"8\" rx=\"4\" fill=\"#b9c0cb\"/><rect x=\"11\" y=\"33\" width=\"42\" height=\"4\" rx=\"2\" fill=\"#23262e\"/><circle cx=\"50\" cy=\"26.5\" r=\"1.5\" fill=\"#3dd68c\"/><circle cx=\"45\" cy=\"26.5\" r=\"1.5\" fill=\"#39a0ff\"/><rect x=\"14\" y=\"36\" width=\"36\" height=\"19\" rx=\"1.6\" fill=\"#fff\" stroke=\"#cfd5de\" stroke-width=\".8\"/><rect x=\"18\" y=\"41\" width=\"28\" height=\"1.5\" rx=\".7\" fill=\"#b9c0cb\"/><rect x=\"18\" y=\"45\" width=\"22\" height=\"1.5\" rx=\".7\" fill=\"#b9c0cb\"/><rect x=\"18\" y=\"49\" width=\"25\" height=\"1.5\" rx=\".7\" fill=\"#b9c0cb\"/></svg>",
    camara: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"bl\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\"1\" stop-color=\"#cfd5de\"/></linearGradient><linearGradient id=\"ng\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4a505c\"/><stop offset=\".45\" stop-color=\"#1c1f27\"/><stop offset=\"1\" stop-color=\"#0b0c10\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"14\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><rect x=\"29\" y=\"44\" width=\"6\" height=\"9\" fill=\"#b9c0cb\"/><ellipse cx=\"32\" cy=\"55\" rx=\"13\" ry=\"3.6\" fill=\"url(#bl)\"/><circle cx=\"32\" cy=\"26\" r=\"22\" fill=\"url(#bl)\"/><circle cx=\"32\" cy=\"26\" r=\"15.5\" fill=\"url(#ng)\"/><circle cx=\"32\" cy=\"26\" r=\"9\" fill=\"#07080b\" stroke=\"#3a3f4b\" stroke-width=\"1.2\"/><circle cx=\"32\" cy=\"26\" r=\"4.5\" fill=\"#1d2f52\"/><circle cx=\"29.5\" cy=\"23.5\" r=\"1.8\" fill=\"#fff\" opacity=\".8\"/><circle cx=\"32\" cy=\"43.5\" r=\"1.2\" fill=\"#3dd68c\"/></svg>",
    aspirador: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><defs><linearGradient id=\"ng\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4a505c\"/><stop offset=\".45\" stop-color=\"#1c1f27\"/><stop offset=\"1\" stop-color=\"#0b0c10\"/></linearGradient><linearGradient id=\"br\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".35\"/><stop offset=\".5\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient></defs><ellipse cx=\"32\" cy=\"58.5\" rx=\"24\" ry=\"2.6\" fill=\"#000\" opacity=\".35\"/><circle cx=\"32\" cy=\"31\" r=\"27\" fill=\"url(#ng)\" stroke=\"#5a6272\" stroke-width=\"1\"/><circle cx=\"32\" cy=\"31\" r=\"22\" fill=\"none\" stroke=\"#3a3f4b\" stroke-width=\"1\"/><circle cx=\"32\" cy=\"22\" r=\"8\" fill=\"#0b0c10\" stroke=\"#5a6272\" stroke-width=\"1\"/><circle cx=\"32\" cy=\"22\" r=\"4\" fill=\"#23262e\"/><circle cx=\"32\" cy=\"22\" r=\"1.4\" fill=\"#ff7a1a\"/><rect x=\"25\" y=\"40\" width=\"5.5\" height=\"5.5\" rx=\"2.7\" fill=\"#23262e\" stroke=\"#5a6272\" stroke-width=\".7\"/><rect x=\"33.5\" y=\"40\" width=\"5.5\" height=\"5.5\" rx=\"2.7\" fill=\"#23262e\" stroke=\"#5a6272\" stroke-width=\".7\"/><circle cx=\"27.7\" cy=\"42.7\" r=\"1\" fill=\"#3dd68c\"/><path d=\"M8 22a27 27 0 0 1 48 0\" fill=\"none\" stroke=\"#fff\" stroke-width=\"1.5\" opacity=\".18\"/></svg>",
  };
  var rdUri = {};
  function rdDibujo(x) {                  // la direccion (data:) del dibujo de ese equipo, o ""
    var foto = /^ufp:(\d+)$/.exec(x.icono || "");
    if (foto) return CEN + "/ufp/" + foto[1] + ".png";
    if (!A("rdRealista")) return "";
    var n = RD_REAL[rdIcono(x)];
    if (!n) return "";
    return rdUri[n] || (rdUri[n] = "data:image/svg+xml," + encodeURIComponent(RD_DIBUJO[n]));
  }
  function rdIcoHTML(x) {
    var u = rdFoto(x), d = u ? "" : rdDibujo(x);
    return u ? '<img alt="" src="' + u + '">' : d ? '<img class="nx-rd-dib" alt="" src="' + d + '">' : exIco(rdIcono(x));
  }
  function rdIcono(x) {
    if (/^mdi:/.test(x.icono || "")) return x.icono.slice(4);
    var t = (x.nombre + " " + (x.host || "") + " " + (x.fabricante || "")).toLowerCase();
    for (var i = 0; i < RD_FINO.length; i++) if (RD_FINO[i][0].test(t)) return RD_FINO[i][1];
    return RD_ICO[x.tipo] || RD_ICO.desconocido;
  }
  // de 0 a 100, como la «experiencia» de UniFi: por cable 100; por wifi, segun la senal
  function rdPct(x) {
    if (!x.wifi || x.wifi.senal == null) return 100;
    return Math.max(5, Math.min(100, Math.round((x.wifi.senal + 92) / 42 * 100)));
  }
  function rdNivel(p) { return p >= 70 ? "b" : p >= 45 ? "r" : "m"; }
  function rdCorto(t, n) { t = String(t || ""); return t.length > n ? t.slice(0, n - 1) + "…" : t; }

  var rdV = { x: 0, y: 0, k: 0, w: 1080, h: 600 };
  function rdEscala() { return (+A("escala") || 100) / 100; }
  function rdVista() {
    var g = document.getElementById("nx-rd-vp");
    if (g) g.setAttribute("transform", "translate(" + rdV.x.toFixed(1) + "," + rdV.y.toFixed(1) + ") scale(" + rdV.k.toFixed(4) + ")");
    var z = document.getElementById("nx-rd-zoom");
    if (z) z.textContent = Math.round(rdV.k * 100) + " %";
  }
  // El hueco del lienzo que no tapan los paneles flotantes (cifras a la
  // izquierda, router a la derecha): ahi es donde se encaja el arbol.
  function rdHueco() {
    var c = document.getElementById("nx-rd-mapa");
    if (!c) return null;
    var z = rdEscala(), r = c.getBoundingClientRect(), izq = 16, der = 16;
    [["nx-rd-izq", 1], ["nx-rd-router", 0]].forEach(function (p) {
      var e = document.getElementById(p[0]);
      if (!e || getComputedStyle(e).position !== "absolute") return;
      var b = e.getBoundingClientRect();
      if (p[1]) izq = Math.max(izq, (b.right - r.left) / z + 18); else der = Math.max(der, (r.right - b.left) / z + 18);
    });
    return { x: izq, y: 14, w: Math.max(200, c.clientWidth - izq - der), h: Math.max(200, c.clientHeight - 96) };
  }
  // todo = que quepa entero; si no, que quepa pero sin encogerlo por debajo de la mitad
  function rdAjustar(todo) {
    var a = rdHueco();
    if (!a) return;
    var cabe = Math.min(a.w / rdV.w, a.h / rdV.h);
    rdV.k = todo ? Math.min(1.3, cabe) : Math.min(1.15, Math.max(cabe, 0.5));
    rdV.x = a.x + Math.max(0, (a.w - rdV.w * rdV.k) / 2);
    rdV.y = a.y + (a.h - rdV.h * rdV.k) / 2;
    rdVista();
  }
  function rdZoom(f, cx, cy) {
    var k = Math.max(0.2, Math.min(3, rdV.k * f));
    rdV.x = cx - (cx - rdV.x) * k / rdV.k;
    rdV.y = cy - (cy - rdV.y) * k / rdV.k;
    rdV.k = k;
    rdVista();
  }

  // ---- El menu del mapa (09-10-2026), como el de la topologia de UniFi:
  // orientacion, trafico, resaltar, y filtros por estado, conexion, red wifi,
  // fabricante, tipo y etiqueta. Con «resaltar» lo que no coincide se atenua;
  // sin el, desaparece del mapa. Se recuerda en este navegador.
  var MF_CLAVE = "nx-rd-mapa";
  var mf = { o: "h", traf: true, foco: true, cli: true, est: { on: 1 }, con: {}, ssid: {}, red: {}, fab: {}, tipo: {}, etq: {}, abre: { est: 1, con: 1 }, plegado: false, q: "" };
  var MF_FILTROS = ["con", "ssid", "red", "fab", "tipo", "etq"], MF_ETQ = { invitado: "Red de invitados", nuevo: "Nuevos", fija: "Con IP fija", vetado: "Sin Internet" };
  var mfTop = {}, mfFabs = [];
  try {
    var mfG = JSON.parse(localStorage.getItem(MF_CLAVE) || "null");
    if (mfG) Object.keys(mf).forEach(function (k) { if (k !== "q" && k in mfG && typeof mfG[k] === typeof mf[k]) mf[k] = mfG[k]; });
  } catch (eMf) { /* sin almacenamiento */ }
  function mfGuardar() {
    var o = {};
    Object.keys(mf).forEach(function (k) { if (k !== "q") o[k] = mf[k]; });
    try { localStorage.setItem(MF_CLAVE, JSON.stringify(o)); } catch (e) { /* sin almacenamiento */ }
  }
  function mfPlano(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function mfHay(o) { for (var k in o) if (o[k]) return true; return false; }
  function mfActivo() { return !!mf.q || MF_FILTROS.some(function (k) { return mfHay(mf[k]); }); }
  function mfSsid(d) { var m = {}; (d.radios || []).forEach(function (r) { m["wifi" + r.banda] = r.ssid || ""; }); return m; }
  function mfFab(x) { return x.fabricante || "Sin identificar"; }
  function mfEtq(x) { var e = []; if (x.invitado) e.push("invitado"); if (x.nuevo) e.push("nuevo"); if (x.reserva && x.reserva.ip) e.push("fija"); if (x.bloqueado) e.push("vetado"); return e; }
  function mfPasa(x, ssid) {
    if (mf.q && mfPlano([x.nombre, x.host, x.ip, x.mac, x.fabricante, RD_TIPO[x.tipo]].join(" ")).indexOf(mfPlano(mf.q)) < 0) return false;
    if (mfHay(mf.con) && !mf.con[x.en_linea ? x.conexion : ""]) return false;
    if (mfHay(mf.ssid) && !mf.ssid[(x.en_linea && x.wifi && x.wifi.ssid) || "-"]) return false;
    if (mfHay(mf.red) && !mf.red[(x.red && x.red.id) || "-"]) return false;
    if (mfHay(mf.fab) && !mf.fab[mfTop[mfFab(x)] ? mfFab(x) : "__otros"]) return false;
    if (mfHay(mf.tipo) && !mf.tipo[x.tipo]) return false;
    if (mfHay(mf.etq) && !mfEtq(x).some(function (e) { return mf.etq[e]; })) return false;
    return true;
  }
  function mfCuenta(ds, f) {
    var m = {};
    ds.forEach(function (x) { [].concat(f(x)).forEach(function (k) { if (k != null && k !== "") m[k] = (m[k] || 0) + 1; }); });
    return m;
  }
  // los fabricantes con mas equipos, y el resto juntos en «Otros»
  function mfPrepara(d) {
    var m = mfCuenta((d.dispositivos || []).filter(function (x) { return x.tipo !== "router"; }), mfFab);
    var l = Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0], "es"); });
    var top = l.length > 9 ? l.slice(0, 8) : l, resto = 0;
    l.slice(top.length).forEach(function (f) { resto += f[1]; });
    mfTop = {};
    top.forEach(function (f) { mfTop[f[0]] = 1; });
    mfFabs = resto ? top.concat([["__otros", resto]]) : top;
  }
  function mfMenu(d) {
    var ds = (d.dispositivos || []).filter(function (x) { return x.tipo !== "router"; }), ssid = mfSsid(d);
    var linea = ds.filter(function (x) { return x.en_linea; });
    function op(grupo, clave, texto, n) {
      return '<button type="button" role="checkbox" aria-checked="' + (mf[grupo][clave] ? "true" : "false") + '" class="nx-mf-op' + (mf[grupo][clave] ? " on" : "") + '" data-mf="' + grupo + ":" + escapar(clave) + '"><i></i><span>' +
        escapar(texto) + "</span><small>" + (n || 0) + "</small></button>";
    }
    function llave(clave, texto, ayuda) {
      return '<button type="button" role="switch" aria-checked="' + (mf[clave] ? "true" : "false") + '" class="nx-mf-llave' + (mf[clave] ? " on" : "") + '" data-mf="' + clave + '" title="' + ayuda + '"><span>' + texto + "</span><i></i></button>";
    }
    function sec(clave, titulo, ops, extra) {
      if (!ops) return "";
      var n = clave === "est" ? 0 : Object.keys(mf[clave]).filter(function (k) { return mf[clave][k]; }).length;
      return '<div class="nx-mf-sec' + (mf.abre[clave] ? " abierta" : "") + '"><div class="nx-mf-h"><button type="button" data-mf="abre:' + clave + '" aria-expanded="' + (mf.abre[clave] ? "true" : "false") + '">' + titulo +
        (n ? "<u>" + n + "</u>" : "") + "<em></em></button>" + (extra || "") + "</div>" + (mf.abre[clave] ? '<div class="nx-mf-ops">' + ops + "</div>" : "") + "</div>";
    }
    var cc = mfCuenta(linea, function (x) { return x.conexion; }), cs = mfCuenta(linea, function (x) { return x.wifi && x.wifi.ssid; });
    var ct = mfCuenta(ds, function (x) { return x.tipo; }), ce = mfCuenta(ds, mfEtq), cr = mfCuenta(ds, function (x) { return x.red && x.red.id; });
    return llave("traf", "Tráfico de Internet", "Las partículas y el color de cada enlace según lo que baja y sube") +
      llave("foco", "Resaltar la selección", "Encendido: lo que no coincide se atenúa. Apagado: desaparece del mapa") +
      sec("est", "Estado", op("est", "on", "En línea", linea.length) + op("est", "off", "Desconectados", ds.length - linea.length)) +
      sec("con", "Equipos", op("con", "cable", "Cable", cc.cable) + op("con", "wifi2.4", "Wifi 2,4 GHz", cc["wifi2.4"]) + op("con", "wifi5", "Wifi 5 GHz", cc.wifi5),
        '<button type="button" role="switch" aria-checked="' + (mf.cli ? "true" : "false") + '" class="nx-mf-llave sola' + (mf.cli ? " on" : "") + '" data-mf="cli" title="Mostrar u ocultar todos los equipos"><i></i></button>') +
      sec("ssid", "Redes wifi", Object.keys(cs).sort().map(function (k) { return op("ssid", k, k, cs[k]); }).join("")) +
      ((d.redes || []).length > 1 ? sec("red", "Redes (VLAN)", d.redes.map(function (r) { return op("red", r.id, r.nombre + (r.vlan ? " · VLAN " + r.vlan : ""), cr[r.id]); }).join("")) : "") +
      sec("fab", "Fabricantes", mfFabs.map(function (f) { return op("fab", f[0], f[0] === "__otros" ? "Otros" : f[0], f[1]); }).join("")) +
      sec("tipo", "Tipo de equipo", RD_ORDEN.filter(function (t) { return ct[t]; }).map(function (t) { return op("tipo", t, RD_TIPO[t] || t, ct[t]); }).join("")) +
      sec("etq", "Etiquetas", Object.keys(MF_ETQ).map(function (k) { return op("etq", k, MF_ETQ[k], ce[k]); }).join("")) +
      (mfActivo() ? '<button type="button" class="nx-h-abrir nx-mf-limpiar" data-mf="limpiar">Quitar filtros</button>' : "");
  }
  // lo que no pasa por rdMapa: plegado, orientacion marcada, trafico a la vista y cuantos filtros hay
  function mfAplicar() {
    var m = document.getElementById("nx-rd-menu"), svg = document.getElementById("nx-rd-svg");
    if (!m) return;
    m.classList.toggle("plegado", !!mf.plegado);
    if (svg) svg.classList.toggle("nx-rd-sintraf", !mf.traf);
    m.querySelectorAll("[data-mf^='o:']").forEach(function (b) { b.classList.toggle("on", b.dataset.mf === "o:" + mf.o); });
    var n = (mf.q ? 1 : 0);
    MF_FILTROS.forEach(function (k) { for (var c in mf[k]) if (mf[k][c]) n++; });
    vTexto("nx-mf-n", n ? String(n) : "");
  }
  function mfClic(v) {
    var p = v.split(":"), k = p[0], a = p.slice(1).join(":"), forma = false;
    if (k === "plegar") mf.plegado = !mf.plegado;
    else if (k === "o") { forma = mf.o !== a; mf.o = a === "v" ? "v" : "h"; }
    else if (k === "traf") mf.traf = !mf.traf;
    else if (k === "foco" || k === "cli") { mf[k] = !mf[k]; forma = true; }
    else if (k === "abre") mf.abre[a] = !mf.abre[a];
    else if (k === "limpiar") {
      MF_FILTROS.forEach(function (f) { mf[f] = {}; });
      mf.q = "";
      var q = document.getElementById("nx-mf-q");
      if (q) q.value = "";
      forma = !mf.foco;
    } else if (k === "est" || MF_FILTROS.indexOf(k) >= 0) {
      if (mf[k][a]) delete mf[k][a]; else mf[k][a] = 1;
      forma = k === "est" || !mf.foco;
    } else return;
    mfGuardar();
    if (forma) rdV.k = 0;                     // cambia la forma del arbol: se vuelve a encajar
    vsPintar();
  }
  // la segunda linea de un equipo en el mapa: [experiencia, detalle]
  function rdSub(x) {
    if (x.vpn) return x.en_linea ? [x.vpn.directo ? "directo" : "por relé", (mf.o === "v" ? "" : " · ") + (x.ip || "")] : ["", x.ultima ? "visto " + vHace(x.ultima) : "desconectado"];
    if (!x.en_linea) return ["", "visto " + vHace(x.ultima)];
    return [rdPct(x) + " %", mf.o === "v" ? (x.ip || "") : " · " + (x.wifi ? x.wifi.senal + " dBm · " : "") + (x.ip || "")];
  }

  function rdMapa(d) {
    var V = mf.o === "v", ssid = mfSsid(d), activo = mfActivo();
    var grupos = [["wifi5", "5 GHz", "wifi"], ["wifi2.4", "2,4 GHz", "wifi"], ["cable", "Cable", "ethernet"]];
    // la red de invitados cuelga de un nudo propio (sea cual sea la banda de cada equipo)
    var rInv = (d.radios || []).filter(function (r) { return r.invitados; });
    if (rInv.length) grupos.push(["inv", "Invitados", "account-multiple-outline"]);
    var vpnL = mf.cli ? vpnNodos(d).filter(function (x) { return x.en_linea ? mf.est.on : mf.est.off; }) : [];
    if (vpnL.length) grupos.push(["vpn", "VPN", "shield-lock-outline"]);
    if (mf.est.off) grupos.push(["off", "Desconectados", "lan-disconnect"]);
    // sin «resaltar», las ramas que el filtro deja fuera tampoco se dibujan
    if (activo && !mf.foco) grupos = grupos.filter(function (g) { return g[0] === "inv" || (g[0] === "vpn" ? !mfActivo() : !mfHay(mf.con) || mf.con[g[0]]); });
    var radios = {}; (d.radios || []).forEach(function (r) { if (!r.invitados) radios["wifi" + r.banda] = r; });
    rd.tenue = {};
    var vivos = (d.dispositivos || []).filter(function (x) {
      if (x.tipo === "router" || !mf.cli || !(x.en_linea ? mf.est.on : mf.est.off)) return false;
      if (!activo || mfPasa(x, ssid)) return true;
      if (mf.foco) rd.tenue[x.mac] = 1;
      return mf.foco;
    });
    var ro = d.router || {}, s = "", enl = "";
    // Internet lleva el logo de quien da la linea y el router, su foto; los dos se pueden pulsar
    var op = rdOperador(d), roEq = (d.dispositivos || []).filter(function (x) { return x.tipo === "router"; })[0], roImg = roEq ? rdFoto(roEq) || rdDibujo(roEq) : "";
    var PULSA = ' tabindex="0" role="button"';
    function nudoInet(cx, cy) {
      return op.logo ? '<circle cx="' + cx + '" cy="' + cy + '" r="24" class="nx-n-halo nx-rd-oph"/><image class="nx-rd-oplogo" href="' + op.logo + '" x="' + (cx - 27) + '" y="' + (cy - 21) + '" width="54" height="42"/>'
        : '<circle cx="' + cx + '" cy="' + cy + '" r="24" class="nx-n-halo"/><circle cx="' + cx + '" cy="' + cy + '" r="18" class="nx-n-nucleo"/><image href="' + CDN + 'web.svg" x="' + (cx - 10) + '" y="' + (cy - 10) + '" width="20" height="20"/>';
    }
    function nudoRouter(cx, cy) {
      return roImg ? '<image class="nx-rd-rofoto" href="' + roImg + '" x="' + (cx - 27) + '" y="' + (cy - 27) + '" width="54" height="54" preserveAspectRatio="xMidYMid meet"/>'
        : '<image href="' + CDN + 'router-wireless.svg" x="' + (cx - 16) + '" y="' + (cy - 16) + '" width="32" height="32"/>';
    }
    function clave(g) { return g[0].replace(".", ""); }
    function curva(x1, y1, x2, y2) { var m = (x1 + x2) / 2; return "M" + x1 + "," + y1 + " C" + m + "," + y1 + " " + m + "," + y2 + " " + x2 + "," + y2; }
    function curvaV(x1, y1, x2, y2) { var m = (y1 + y2) / 2; return "M" + x1 + "," + y1 + " C" + x1 + "," + m + " " + x2 + "," + m + " " + x2 + "," + y2; }
    // el flujo de una pista: cinco particulas de bajada (hacia el equipo) y cinco de subida, apagadas hasta que haya trafico
    function flujo(clave, pista, at) {
      var h = "";
      [["d", ""], ["u", ' keyPoints="1;0" keyTimes="0;1" calcMode="linear"']].forEach(function (s) {
        h += '<g class="nx-rd-flujo"' + (at || "") + ' id="nx-rd-f' + s[0] + "-" + clave + '">';
        for (var i = 0; i < 5; i++) h += '<circle r="3" style="display:none"><animateMotion dur="3s" begin="-' + ([0, 0.5, 0.25, 0.75, 0.125][i] * 3 + (s[0] === "u" ? 0.19 : 0)).toFixed(2) +
          's" repeatCount="indefinite"' + s[1] + '><mpath href="#' + pista + '"/></animateMotion></circle>';
        h += "</g>";
      });
      return h;
    }
    // un equipo: su enlace corto, su camino entero desde el nudo (por el se pinta
    // el calor y corren sus particulas) y su ficha, con el icono centrado en cx,cy
    function equipo(x, g, corto, entero, caja, cx, cy, textos) {
      var k = x.mac.replace(/:/g, ""), aire = x.en_linea && g[0] !== "cable" ? " nx-rd-aire" : "";
      var at = (rd.tenue[x.mac] ? ' data-tenue="1"' : "") + (x.en_linea ? "" : ' data-fuera="1"');
      enl += '<path id="nx-rd-r-' + k + '" class="nx-rd-enl nx-rd-rama' + aire + '" data-de="' + x.mac + '"' + at + ' d="' + corto + '"/>';
      if (x.en_linea) enl += '<path id="nx-rd-t-' + k + '" class="nx-rd-traf" data-g="' + g[0] + '" data-mac="' + x.mac + '"' + at + ' d="' + entero + '"/>' + flujo(k, "nx-rd-t-" + k, at);
      s += '<g class="nx-rd-nodo" data-mac="' + x.mac + '"' + at + ' tabindex="0" role="button" aria-label="' + escapar(x.nombre) + '">' +
        '<rect x="' + caja[0] + '" y="' + caja[1] + '" width="' + caja[2] + '" height="' + caja[3] + '" rx="12" class="nx-rd-zona"/>' +
        '<rect x="' + (cx - 18) + '" y="' + (cy - 18) + '" width="36" height="36" rx="10" class="nx-rd-n"/>' +
        (rdFoto(x) ? '<image class="nx-rd-foto" href="' + rdFoto(x) + '" x="' + (cx - 18) + '" y="' + (cy - 18) + '" width="36" height="36" preserveAspectRatio="xMidYMid slice"/>'
          : rdDibujo(x) ? '<image class="nx-rd-dib" href="' + rdDibujo(x) + '" x="' + (cx - 24) + '" y="' + (cy - 23) + '" width="46" height="46"/>'
          : '<image href="' + CDN + rdIcono(x) + '.svg" x="' + (cx - 11) + '" y="' + (cy - 11) + '" width="22" height="22"/>') + textos + "</g>";
    }
    function pie(b) {
      var r = radios[b.g[0]];
      return b.l.length + (b.l.length === 1 ? " equipo" : " equipos") + (r ? " · canal " + r.canal : b.g[0] === "inv" ? " · " + escapar(rInv[0].ssid || "") : b.g[0] === "vpn" ? " · Tailscale" : "");
    }
    var listas = grupos.map(function (g) {
      if (g[0] === "vpn") return vpnL;
      return vivos.filter(function (x) { return (!x.en_linea ? "off" : x.invitado ? "inv" : x.conexion) === g[0]; }).sort(function (a, b) {
        return (RD_ORDEN.indexOf(a.tipo) - RD_ORDEN.indexOf(b.tipo)) || a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
      });
    });
    var hueco = rdHueco() || { w: 1000, h: 600 }, mejor = null;

    // ---- En vertical, como el arbol de UniFi: Internet arriba, el router
    // debajo, las tres ramas en fila y cada equipo en una casilla (icono y
    // nombre debajo). Con mas de una fila el reparto va «en peine», girado:
    // una bajante a la izquierda del bloque y un riel por fila.
    if (V) {
      var CW = 128, RH = 112, GAP = 70, MINB = 220, YI = 40, YR = 176, YM = 336, YD = 432;
      for (var nf = 1; nf <= 8; nf++) {
        var w2 = 0, mr = 1;
        listas.forEach(function (l) { var c = Math.max(1, Math.ceil(l.length / nf)); w2 += Math.max(MINB, c * CW) + GAP; mr = Math.max(mr, Math.ceil(l.length / c)); });
        var k2 = Math.min(hueco.w / (Math.max(MINB, w2 - GAP) + 70), hueco.h / (YD + mr * RH + 10));
        if (!mejor || k2 > mejor.k * 1.03) mejor = { k: k2, nf: nf };
      }
      var x0 = 0, bl = [], filasMax = 1;
      grupos.forEach(function (g, gi) {
        var l = listas[gi], cols = Math.max(1, Math.ceil(l.length / mejor.nf)), nfil = Math.max(1, Math.ceil(l.length / cols)), bw = Math.max(MINB, cols * CW);
        bl.push({ g: g, l: l, cols: cols, nf: nfil, cx: x0 + bw / 2, tx: x0 + bw / 2 - cols * CW / 2 });
        filasMax = Math.max(filasMax, nfil);
        x0 += bw + GAP;
      });
      var W = Math.max(MINB, x0 - GAP), CX = W / 2;
      rdV.w = W + 70;                              // el rotulo de la ultima rama sobresale por la derecha
      rdV.h = YD + filasMax * RH + 10;
      enl += '<path id="nx-rd-l-inet" class="nx-rd-enl nx-rd-troncal" d="M' + CX + "," + (YI + 26) + " L" + CX + "," + (YR - 40) + '"/>' + flujo("inet", "nx-rd-l-inet");
      bl.forEach(function (b) {
        var g = b.g, id = "nx-rd-l-" + clave(g), fuera = g[0] === "off" ? ' data-fuera="1"' : "", aire = g[0] === "cable" || fuera ? "" : " nx-rd-aire";
        var izq = b.tx - 14, peine = b.nf > 1;
        function riel(f) { return YD + f * RH - 12; }
        enl += '<path id="' + id + '" class="nx-rd-enl nx-rd-troncal' + aire + '"' + fuera + ' d="' + curvaV(CX, YR + 40, b.cx, YM - 28) + '"/>' + flujo(clave(g), id);
        if (peine) {
          enl += '<path id="' + id + '-f" class="nx-rd-enl nx-rd-peine' + aire + '"' + fuera + ' d="M' + b.cx + "," + (YM + 28) + " V" + (YM + 52) + " H" + izq + " V" + riel(b.nf - 1) + '"/>';
          for (var f = 0; f < b.nf; f++) {
            var n = Math.min(b.cols, b.l.length - f * b.cols);
            if (n > 0) enl += '<path id="' + id + "-c" + f + '" class="nx-rd-enl nx-rd-peine' + aire + '"' + fuera + ' d="M' + izq + "," + riel(f) + " H" + (b.tx + (n - 1) * CW + CW / 2) + '"/>';
          }
        }
        b.l.forEach(function (x, i) {
          var f = Math.floor(i / b.cols), tcx = b.tx + (i % b.cols) * CW + CW / 2, ty = YD + f * RH, sub = rdSub(x);
          equipo(x, g,
            peine ? "M" + tcx + "," + riel(f) + " V" + (ty + 8) : curvaV(b.cx, YM + 28, tcx, ty + 8),
            peine ? "M" + b.cx + "," + (YM + 28) + " V" + (YM + 52) + " H" + izq + " V" + riel(f) + " H" + tcx + " V" + (ty + 8) : curvaV(b.cx, YM + 28, tcx, ty + 8),
            [tcx - CW / 2 + 4, ty + 2, CW - 8, RH - 16], tcx, ty + 30,
            '<text x="' + tcx + '" y="' + (ty + 66) + '" text-anchor="middle" class="nx-rd-t nx-rd-tv">' + escapar(rdCorto(x.nombre, 16)) + "</text>" +
            '<text x="' + tcx + '" y="' + (ty + 81) + '" text-anchor="middle" class="nx-rd-s nx-rd-sv"><tspan class="nx-rd-pct">' + sub[0] + '</tspan><tspan class="nx-rd-det" x="' + tcx + '" dy="13">' + escapar(sub[1]) + "</tspan></text>");
        });
        s += '<g class="nx-rd-nudo"' + fuera + '><circle cx="' + b.cx + '" cy="' + YM + '" r="28" class="nx-n-halo"/><circle cx="' + b.cx + '" cy="' + YM + '" r="21" class="nx-n-nucleo"/>' +
          '<image href="' + CDN + g[2] + '.svg" x="' + (b.cx - 11) + '" y="' + (YM - 11) + '" width="22" height="22"/>' +
          '<text x="' + (b.cx + 34) + '" y="' + (YM - 1) + '" class="nx-rd-t">' + g[1] + "</text>" +
          '<text x="' + (b.cx + 34) + '" y="' + (YM + 15) + '" class="nx-rd-s">' + pie(b) + "</text></g>";
      });
      s += '<g class="nx-rd-nudo nx-rd-pulsa" data-nudo="inet"' + PULSA + ' aria-label="Internet · ' + escapar(op.nombre) + '">' + nudoInet(CX, YI) +
        '<text x="' + (CX + 34) + '" y="' + (YI - 1) + '" class="nx-rd-t">' + escapar(op.nombre) + '</text>' +
        '<text x="' + (CX + 34) + '" y="' + (YI + 15) + '" class="nx-rd-s">' + escapar((ro.wan || {}).ip || "") + "</text></g>";
      s += '<circle cx="' + CX + '" cy="' + YR + '" r="34" class="nx-radar"/><circle cx="' + CX + '" cy="' + YR + '" r="34" class="nx-radar nx-radar-2"/>' +
        '<g class="nx-rd-nudo nx-rd-router nx-rd-pulsa" data-nudo="router"' + PULSA + ' aria-label="Router: verlo al detalle"><circle cx="' + CX + '" cy="' + YR + '" r="58" fill="url(#nx-rd-g)"/><circle cx="' + CX + '" cy="' + YR + '" r="40" class="nx-n-halo"/>' +
        '<circle cx="' + CX + '" cy="' + YR + '" r="31" class="nx-n-nucleo"/>' + nudoRouter(CX, YR) +
        '<text x="' + (CX + 54) + '" y="' + (YR - 1) + '" class="nx-rd-t">' + escapar(rdCorto((ro.modelo || "Router").replace(/^Xiaomi Mi Router /, ""), 22)) + "</text>" +
        '<text x="' + (CX + 54) + '" y="' + (YR + 16) + '" class="nx-rd-s">' + escapar(ro.ip || "") + "</text></g>";
      return enl + s;
    }

    // ---- En horizontal: de izquierda a derecha, una fila por equipo
    var XI = 56, XR = 230, XM = 470, XD = 720, FILA = 46, HUECO = 44, COL = 340;
    // Cuantas columnas por rama: las que hagan que el arbol se parezca mas a
    // la forma del lienzo (en una pantalla muy ancha, varias; en una alta, una).
    for (var nc = 1; nc <= 5; nc++) {
      var filas = 0;
      listas.forEach(function (l) { filas += Math.max(88 / FILA, Math.ceil(l.length / Math.min(nc, Math.max(1, Math.ceil(l.length / 3))))); });
      var w = XD + nc * COL - 20, h = filas * FILA + (listas.length - 1) * HUECO + 96, k = Math.min(hueco.w / w, hueco.h / h);
      if (!mejor || k > mejor.k * 1.03) mejor = { k: k, nc: nc };
    }
    var y = 48, bloques = [], ancho = 1;
    grupos.forEach(function (g, gi) {
      var l = listas[gi], cols = Math.min(mejor.nc, Math.max(1, Math.ceil(l.length / 3))), nf = Math.max(1, Math.ceil(l.length / cols));
      var altoB = Math.max(nf * FILA, 88), y0b = y + (altoB - nf * FILA) / 2;
      bloques.push({ g: g, l: l, y0: y0b, cy: y + altoB / 2, cols: cols, nf: nf });
      ancho = Math.max(ancho, cols);
      y += altoB + HUECO;
    });
    var H = Math.max(190, y - HUECO + 48), RY = H / 2;
    rdV.h = H;
    rdV.w = XD + ancho * COL - 20;
    enl += '<path id="nx-rd-l-inet" class="nx-rd-enl nx-rd-troncal" d="M' + (XI + 26) + "," + RY + " L" + (XR - 40) + "," + RY + '"/>' + flujo("inet", "nx-rd-l-inet");
    bloques.forEach(function (b) {
      var g = b.g, id = "nx-rd-l-" + clave(g), fuera = g[0] === "off" ? ' data-fuera="1"' : "", aire = g[0] === "cable" || fuera ? "" : " nx-rd-aire";
      enl += '<path id="' + id + '" class="nx-rd-enl nx-rd-troncal' + aire + '"' + fuera + ' d="' + curva(XR + 40, RY, XM - 28, b.cy) + '"/>' + flujo(clave(g), id);
      // con varias columnas, el reparto va «en peine»: un ramal por encima de la
      // rama y una bajante por columna, para que ningun hilo cruce sobre un equipo
      var arriba = b.y0 - 14;
      if (b.cols > 1) {
        enl += '<path id="' + id + '-f" class="nx-rd-enl nx-rd-peine' + aire + '"' + fuera + ' d="M' + (XM + 28) + "," + b.cy + " H" + (XM + 62) + " V" + arriba + " H" + (XD + (b.cols - 1) * COL - 44) + '"/>';
        for (var c = 0; c < b.cols; c++) {
          var n = Math.min(b.nf, b.l.length - c * b.nf);
          if (n > 0) enl += '<path id="' + id + "-c" + c + '" class="nx-rd-enl nx-rd-peine' + aire + '"' + fuera + ' d="M' + (XD + c * COL - 44) + "," + arriba + " V" + (b.y0 + FILA / 2 + (n - 1) * FILA) + '"/>';
        }
      }
      b.l.forEach(function (x, i) {
        var c = Math.floor(i / b.nf), px = XD + c * COL, py = b.y0 + FILA / 2 + (i % b.nf) * FILA, sub = rdSub(x);
        equipo(x, g,
          b.cols > 1 ? "M" + (px - 44) + "," + py + " H" + (px - 24) : curva(XM + 28, b.cy, px - 26, py),
          b.cols > 1 ? "M" + (XM + 28) + "," + b.cy + " H" + (XM + 62) + " V" + arriba + " H" + (px - 44) + " V" + py + " H" + (px - 24) : curva(XM + 28, b.cy, px - 26, py),
          [px - 26, py - 21, COL - 30, 42], px - 2, py,
          '<text x="' + (px + 28) + '" y="' + (py - 3) + '" class="nx-rd-t">' + escapar(rdCorto(x.nombre, 27)) + "</text>" +
          '<text x="' + (px + 28) + '" y="' + (py + 13) + '" class="nx-rd-s"><tspan class="nx-rd-pct">' + sub[0] + '</tspan><tspan class="nx-rd-det">' + escapar(sub[1]) + "</tspan></text>");
      });
      s += '<g class="nx-rd-nudo"' + fuera + '><circle cx="' + XM + '" cy="' + b.cy + '" r="28" class="nx-n-halo"/><circle cx="' + XM + '" cy="' + b.cy + '" r="21" class="nx-n-nucleo"/>' +
        '<image href="' + CDN + g[2] + '.svg" x="' + (XM - 11) + '" y="' + (b.cy - 11) + '" width="22" height="22"/>' +
        '<text x="' + XM + '" y="' + (b.cy - 38) + '" text-anchor="middle" class="nx-rd-t">' + g[1] + "</text>" +
        '<text x="' + XM + '" y="' + (b.cy + 46) + '" text-anchor="middle" class="nx-rd-s">' + pie(b) + "</text></g>";
    });
    s += '<g class="nx-rd-nudo nx-rd-pulsa" data-nudo="inet"' + PULSA + ' aria-label="Internet · ' + escapar(op.nombre) + '">' + nudoInet(XI, RY) +
      '<text x="' + XI + '" y="' + (RY + 44) + '" text-anchor="middle" class="nx-rd-t">' + escapar(op.nombre) + '</text>' +
      '<text x="' + XI + '" y="' + (RY + 60) + '" text-anchor="middle" class="nx-rd-s">' + escapar((ro.wan || {}).ip || "") + "</text></g>";
    s += '<circle cx="' + XR + '" cy="' + RY + '" r="34" class="nx-radar"/><circle cx="' + XR + '" cy="' + RY + '" r="34" class="nx-radar nx-radar-2"/>' +
      '<g class="nx-rd-nudo nx-rd-router nx-rd-pulsa" data-nudo="router"' + PULSA + ' aria-label="Router: verlo al detalle"><circle cx="' + XR + '" cy="' + RY + '" r="58" fill="url(#nx-rd-g)"/><circle cx="' + XR + '" cy="' + RY + '" r="40" class="nx-n-halo"/>' +
      '<circle cx="' + XR + '" cy="' + RY + '" r="31" class="nx-n-nucleo"/>' + nudoRouter(XR, RY) +
      '<text x="' + XR + '" y="' + (RY + 66) + '" text-anchor="middle" class="nx-rd-t">' + escapar(rdCorto((ro.modelo || "Router").replace(/^Xiaomi Mi Router /, ""), 22)) + "</text>" +
      '<text x="' + XR + '" y="' + (RY + 83) + '" text-anchor="middle" class="nx-rd-s">' + escapar(ro.ip || "") + "</text></g>";
    return enl + s;
  }

  // El catalogo entero de fotos (10-10-2026): una ventana para recorrer los mas
  // de 6.000 modelos por clase, por marca o buscando, y ponerle uno al equipo
  // cuya ficha esta abierta. Se va cargando de 120 en 120 al bajar.
  var cat = { mac: "", q: "", clase: "", marca: "", n: 0, total: 0, cargando: false, t: null };
  function catCargar(mas) {
    var caja = document.getElementById("nx-cat-rejilla");
    if (!caja || cat.cargando || (mas && cat.n >= cat.total)) return;
    if (!mas) { cat.n = 0; caja.innerHTML = ""; caja.scrollTop = 0; }
    cat.cargando = true;
    cenJSON("/api/ufp?todo=1&n=120&desde=" + cat.n + "&q=" + encodeURIComponent(cat.q) + "&clase=" + encodeURIComponent(cat.clase) + "&marca=" + encodeURIComponent(cat.marca)).then(function (d) {
      cat.cargando = false;
      if (!caja.isConnected) return;
      cat.total = d.total || 0;
      cat.n += (d.modelos || []).length;
      caja.insertAdjacentHTML("beforeend", (d.modelos || []).map(function (m) {
        return '<button type="button" data-cat="' + m.id + '" title="' + escapar(m.nombre + (m.marca ? " · " + m.marca : "")) + '"><img loading="lazy" alt="" src="' + CEN + "/ufp/" + m.id + '.png?m=1" onerror="this.style.visibility=\'hidden\'"><b>' +
          escapar(m.nombre) + "</b><small>" + escapar(m.clase || "") + "</small></button>"; }).join(""));
      vTexto("nx-cat-cuenta", cat.total ? cat.n + " de " + cat.total.toLocaleString("es-ES") : "Nada con esos filtros");
    }).catch(function () { cat.cargando = false; vTexto("nx-cat-cuenta", "No se ha podido leer el catálogo"); });
  }
  function catAbrir(mac, alElegir, nombre) {
    var x = nombre ? { nombre: nombre } : ((vs.datos || {}).dispositivos || []).filter(function (y) { return y.mac === mac; })[0];
    cat.mac = mac; cat.q = ""; cat.clase = ""; cat.marca = ""; cat.cb = alElegir || null;
    var c = conCaja("image-multiple-outline", "Catálogo de equipos", x ? "elige la foto de «" + x.nombre + "»" : "",
      '<input type="search" id="nx-cat-q" placeholder="Buscar modelo…" autocomplete="off" spellcheck="false" aria-label="Buscar modelo">' +
      '<select id="nx-cat-clase" class="nx-ps5-sel" aria-label="Clase de aparato"><option value="">Todas las clases</option></select>' +
      '<select id="nx-cat-marca" class="nx-ps5-sel" aria-label="Marca"><option value="">Todas las marcas</option></select><span id="nx-cat-cuenta"></span>');
    c.classList.add("nx-con-cat");
    c.querySelector("#nx-con-cuerpo").innerHTML = '<div id="nx-cat-rejilla"></div>';
    var rej = c.querySelector("#nx-cat-rejilla");
    cenJSON("/api/ufp/indice").then(function (d) {
      c.querySelector("#nx-cat-clase").insertAdjacentHTML("beforeend", (d.clases || []).map(function (k) { return '<option value="' + escapar(k[0]) + '">' + escapar(k[0]) + " (" + k[1] + ")</option>"; }).join(""));
      c.querySelector("#nx-cat-marca").insertAdjacentHTML("beforeend", (d.marcas || []).map(function (k) { return '<option value="' + escapar(k[0]) + '">' + escapar(k[0]) + " (" + k[1] + ")</option>"; }).join(""));
    }).catch(function () { /* sin indice se puede buscar igual */ });
    c.querySelector("#nx-cat-q").addEventListener("input", function () { cat.q = this.value.trim(); clearTimeout(cat.t); cat.t = setTimeout(function () { catCargar(false); }, 260); });
    c.querySelector("#nx-cat-clase").addEventListener("change", function () { cat.clase = this.value; catCargar(false); });
    c.querySelector("#nx-cat-marca").addEventListener("change", function () { cat.marca = this.value; catCargar(false); });
    rej.addEventListener("scroll", function () { if (rej.scrollTop + rej.clientHeight > rej.scrollHeight - 500) catCargar(true); });
    rej.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat]");
      if (!b) return;
      var mio = cat.mac;
      conCerrar();
      if (cat.cb) return cat.cb(b.dataset.cat);
      vOrden("/api/red/icono", { mac: mio, icono: "ufp:" + b.dataset.cat }, "Foto cambiada").then(function () { setTimeout(function () { if (rd.sel === mio) rdAbrir(mio); }, 700); });
    });
    catCargar(false);
    c.querySelector("#nx-cat-q").focus();
  }

  // Trafico en directo (10-10-2026): centinela mide lo que baja y sube cada
  // equipo; aqui se traduce a particulas (cuantas y a que ritmo) y a color:
  // azul, verde, amarillo, naranja y rojo segun los megabits. La bajada corre
  // hacia el equipo y la subida hacia el router.
  var tr = { d: null, t: 0 };
  var TR_DUR = [3, 3, 2.3, 1.7, 1.25, 0.9];
  function trNivel(bytes) { var b = (bytes || 0) * 8; return b < 4e4 ? 0 : b < 1e6 ? 1 : b < 1e7 ? 2 : b < 5e7 ? 3 : b < 2e8 ? 4 : 5; }
  function trGrupo(id, n) {
    var g = document.getElementById(id);
    if (!g) return;
    if (g.getAttribute("data-n") === String(n)) return;
    g.setAttribute("data-n", n);
    g.setAttribute("class", "nx-rd-flujo n" + n);
    for (var i = 0; i < g.children.length; i++) {
      var c = g.children[i];
      c.style.display = i < n ? "" : "none";
      if (n) c.firstChild.setAttribute("dur", TR_DUR[n] + "s");
    }
  }
  function trTexto(v) { return megabits(v[0]) === "0" && megabits(v[1]) === "0" ? "" : "↓ " + megabits(v[0]) + " ↑ " + megabits(v[1]) + " " + unidadRed(); }
  function trPintar() {
    var t = tr.d, svg = document.getElementById("nx-rd-svg");
    if (!t || !svg) return;
    var suma = {};
    svg.querySelectorAll(".nx-rd-traf").forEach(function (p) {
      var mac = p.getAttribute("data-mac"), v = t.d[mac] || [0, 0], nb = trNivel(v[0]), ns = trNivel(v[1]), n = Math.max(nb, ns), k = mac.replace(/:/g, "");
      var cl = "nx-rd-traf" + (n ? " n" + n : "");
      if (p.getAttribute("class") !== cl) p.setAttribute("class", cl);
      trGrupo("nx-rd-fd-" + k, nb); trGrupo("nx-rd-fu-" + k, ns);
      var g = p.getAttribute("data-g").replace(".", ""), s = suma[g] || (suma[g] = [0, 0]);
      s[0] += v[0]; s[1] += v[1];
      var nodo = svg.querySelector('.nx-rd-nodo[data-mac="' + mac + '"]');
      if (nodo) {
        nodo.classList.toggle("viva", n > 0);
        var det = nodo.querySelector(".nx-rd-det"), txt = n ? (mf.o === "v" ? "" : " · ") + trTexto(v) : nodo.getAttribute("data-det") || "";
        if (det && txt && det.textContent !== txt) det.textContent = txt;
      }
    });
    ["wifi5", "wifi24", "cable", "inv"].forEach(function (g) {
      var s = suma[g] || [0, 0], linea = document.getElementById("nx-rd-l-" + g), n = Math.max(trNivel(s[0]), trNivel(s[1]));
      trGrupo("nx-rd-fd-" + g, trNivel(s[0])); trGrupo("nx-rd-fu-" + g, trNivel(s[1]));
      if (linea) { var base = linea.getAttribute("class").replace(/ n\d/, ""); linea.setAttribute("class", base + (n ? " n" + n : "")); }
    });
    var w = t.wan || [0, 0], li = document.getElementById("nx-rd-l-inet"), nw = Math.max(trNivel(w[0]), trNivel(w[1]));
    trGrupo("nx-rd-fd-inet", trNivel(w[0])); trGrupo("nx-rd-fu-inet", trNivel(w[1]));
    if (li) li.setAttribute("class", li.getAttribute("class").replace(/ n\d/, "") + (nw ? " n" + nw : ""));
    var cif = document.querySelector("#nx-rd-cifras .nx-rd-trafico");
    if (cif) cif.innerHTML = "<span>↓ " + megabits(w[0]) + " " + unidadRed() + "</span><span>↑ " + megabits(w[1]) + " " + unidadRed() + "</span><small>Internet ahora</small>";
  }
  function trTic() {
    if (pestanaActiva() !== "Red" || document.hidden || Date.now() - tr.t < 1900) return;
    tr.t = Date.now();
    cenJSON("/api/red/trafico").then(function (d) { tr.d = d; trPintar(); }).catch(function () { /* sin centinela no hay flujo */ });
  }
  setInterval(trTic, 1000);

  function rdFila(x) {
    var w = x.wifi, con = RD_CON[x.conexion || ""], act = w ? (w.baja || 0) + (w.sube || 0) : 0;
    return '<button type="button" class="nx-rd-fila' + (x.en_linea ? "" : " fuera") + (rd.sel === x.mac ? " sel" : "") + '" data-mac="' + x.mac + '">' +
      '<span class="nx-rd-quien"><span class="nx-rd-ico nx-rd-k-' + x.tipo + '">' + rdIcoHTML(x) + (x.en_linea ? "<em></em>" : "") + "</span>" +
        "<span><b>" + escapar(x.nombre) + (x.invitado ? ' <u class="inv">invitados</u>' : "") + (x.nuevo ? ' <u>nuevo</u>' : "") + (x.bloqueado ? ' <u class="mal">sin Internet</u>' : "") + "</b><i>" + escapar([RD_TIPO[x.tipo], x.fabricante && x.fabricante !== x.nombre ? x.fabricante : ""].filter(Boolean).join(" · ")) + "</i></span></span>" +
      '<span class="nx-rd-ip' + (x.reserva && x.reserva.ip ? " fija" : "") + '"' + (x.reserva && x.reserva.ip ? ' title="IP fija en el router"' : "") + ">" + escapar(x.ip || "—") + "</span>" +
      '<span class="nx-rd-con nx-rd-' + (x.conexion ? x.conexion.replace(".", "") : "no") + '">' + exIco(con[1]) + con[0] + (w && w.gen ? "<small>Wi-Fi " + w.gen + "</small>" : "") + "</span>" +
      '<span class="nx-rd-sen">' + (w ? rdBarras(x) + "<small>" + w.senal + " dBm</small>" : "") + "</span>" +
      '<span class="nx-rd-enl">' + (w ? "<b>" + w.enlace_baja + "</b><small> / " + w.enlace_sube + " Mb/s</small>" : x.conexion === "cable" ? "<small>cableado</small>" : "") + "</span>" +
      '<span class="nx-rd-act' + (act > 20000 ? " viva" : "") + '">' + (w ? "↓ " + vTasa(w.baja) + "<small>↑ " + vTasa(w.sube) + "</small>" : "") + "</span>" +
      '<span class="nx-rd-vis">' + (x.en_linea ? (w && w.conectado ? vDura(w.conectado) : "en línea") : vHace(x.ultima)) + "</span></button>";
  }

  function rdFicha(x) {
    var w = x.wifi, con = RD_CON[x.conexion || ""];
    function dato(r, v) { return v ? "<div><dt>" + r + "</dt><dd>" + v + "</dd></div>" : ""; }
    var graf = "";
    if (x.historia && x.historia.length > 3) {
      var h = x.historia, W = 520, HH = 70, mn = -90, mx = -30;
      var pts = h.map(function (p, i) { return (i / (h.length - 1) * W).toFixed(1) + "," + (HH - (Math.max(mn, Math.min(mx, p[1])) - mn) / (mx - mn) * HH).toFixed(1); });
      graf = '<h4>Señal <small>últimos ' + Math.round((h[h.length - 1][0] - h[0][0]) / 60) + ' min</small></h4><svg class="nx-rd-graf" viewBox="0 0 ' + W + " " + HH + '" preserveAspectRatio="none">' +
        '<polygon points="0,' + HH + " " + pts.join(" ") + " " + W + "," + HH + '"/><polyline points="' + pts.join(" ") + '"/></svg>';
    }
    return '<div id="nx-rd-vivo"><dl class="nx-rd-datos">' +
        dato("Estado", x.en_linea ? '<span class="nx-rd-on">En línea</span>' : "Desconectado · visto " + vHace(x.ultima)) +
        dato("Conexión", con[0] + (x.invitado ? " · red de invitados" + (w && w.ssid ? " (" + escapar(w.ssid) + ")" : "") : "") + (w ? " · canal " + w.canal + (w.ancho ? " · " + w.ancho + " MHz" : "") : "")) +
        dato("Dirección IP", escapar(x.ip || "") + (x.reserva && x.reserva.ip ? " <u>fija</u>" : "")) +
        dato("Red", x.red ? escapar(x.red.nombre) + (x.red.vlan ? " · VLAN " + x.red.vlan : "") : "") + dato("MAC", x.mac) + dato("Nombre en la red", escapar(x.host || "")) + dato("Fabricante", escapar(x.fabricante || "")) + dato("Modelo", escapar(x.modelo || "")) +
        dato("Foto", x.icono_auto ? "puesta sola: " + escapar(x.icono_auto.modelo) + " (por " + escapar(x.icono_auto.de) + ")" : "") +
        (w ? dato("Señal", rdBarras(x) + " " + w.senal + " dBm" + (w.ruido ? " · ruido " + w.ruido : "")) + dato("Velocidad del enlace", "↓ " + w.enlace_baja + " · ↑ " + w.enlace_sube + " Mb/s") +
          dato("Tráfico ahora", "↓ " + vTasa(w.baja) + " · ↑ " + vTasa(w.sube)) + dato("Desde que conectó", "↓ " + vBytes(w.total_baja) + " · ↑ " + vBytes(w.total_sube)) +
          dato("Conectado hace", vDura(w.conectado)) + dato("Estándar", w.gen ? "Wi-Fi " + w.gen : "") : "") +
        dato("Primera vez", vHace(x.primera)) +
      "</dl>" + graf + "</div>";
  }

  // Lo que se cambia en el router de verdad: IP fija, salida a Internet y wifi.
  function rdRouter(x) {
    if (x.tipo === "router") return "";
    var r = x.reserva || {}, h = '<h4>En el router <small>se aplica de verdad · pide la contraseña de CasaFi</small></h4><div class="nx-rd-rt">';
    h += '<div><span><b>IP fija</b><i>' + (r.ip ? "Reservada: siempre recibirá " + escapar(r.ip) + "." : "Ahora se la reparte el router y puede cambiar.") + "</i></span>" +
      '<input type="text" id="nx-rd-ip" inputmode="decimal" maxlength="15" value="' + escapar(r.ip || x.ip || "") + '" aria-label="IP que se le reserva">' +
      '<button type="button" class="nx-cfg-btn" data-rd="reservar">' + (r.ip ? "Cambiar" : "Fijar") + "</button>" +
      (r.sec ? '<button type="button" class="nx-cfg-btn" data-rd="liberar">Quitar</button>' : "") + "</div>";
    if (x.tipo !== "servidor") {
      h += '<div><span><b>Salida a Internet</b><i>' + (x.bloqueado ? "Bloqueada: solo ve la red de casa." : "Permitida.") + "</i></span>" +
        '<button type="button" class="nx-cfg-btn' + (x.bloqueado ? "" : " nx-cfg-peligro") + '" data-rd="bloquear" data-si="' + (x.bloqueado ? "0" : "1") + '">' + (x.bloqueado ? "Permitir" : "Bloquear") + "</button></div>";
    }
    if (x.wifi) {
      h += '<div><span><b>Conexión wifi</b><i>Lo desconecta; vuelve a entrar solo. Sirve para que cambie de banda.</i></span>' +
        '<button type="button" class="nx-cfg-btn" data-rd="expulsar">Expulsar</button></div>';
    }
    return h + "</div>";
  }

  // Internet (10-10-2026): el nudo lleva el logo de quien da la linea y, al
  // pulsarlo, se abre su ficha, como la de UniFi: estado, direcciones, lo que
  // tarda en contestar, quien es el operador, velocidad medida, disponibilidad
  // y la grafica de respuesta del ultimo dia. Para otro operador: una fila mas.
  var RD_OPERADORES = [
    [/digi/i, "Digi Spain", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-151.3 350.4 228 118.3"><path fill="#00A6FF" d="m -148.18555,350.5625 c -1.67186,0 -3.01757,1.34571 -3.01757,3.01758 v 111.96484 c 0,1.67187 1.34571,3.01758 3.01757,3.01758 H 18.867188 c 5.159021,-0.56846 11.840981,-1.23272 15.53125,-2.21484 4.533374,-1.20733 8.141202,-3.66867 11.769531,-5.64063 9.664135,-5.36466 17.749525,-13.52239 23.066406,-23.21289 5.316881,-9.6905 7.854621,-20.87937 7.285156,-31.91797 -0.731365,-14.17696 -6.684097,-28.06901 -16.626953,-38.20117 -9.94286,-10.13216 -23.81907,-16.3646 -38.007812,-16.8125 -58.834153,-0.005 -119.492797,-6e-5 -170.070316,0 z m 55.863284,14.79492 c 20.576957,-10e-4 45.32946,0.005 69.197266,0 23.0284253,-4.9e-4 41.696979,19.8267 41.697266,44.28516 -2.92e-4,24.45845 -18.66884438,44.28564 -41.697266,44.28515 -0.721271,-0.0176 -2.185793,0.11216 -2.886719,0.12696 -1.760472,0.0375 -2.726451,0.0204 -4.548828,0.0469 -4.312412,0.0628 -8.826543,0.0163 -13.128906,0.0332 -16.225983,0.0637 -32.432888,0.0793 -48.632813,-0.20704 z"/></svg>']
  ];
  function rdOperador(d) {
    var o = (d || {}).operador || {}, t = (o.nombre || "") + " " + (o.host || "");
    for (var i = 0; i < RD_OPERADORES.length; i++) {
      if (RD_OPERADORES[i][0].test(t)) return { nombre: RD_OPERADORES[i][1], logo: "data:image/svg+xml," + encodeURIComponent(RD_OPERADORES[i][2]), svg: RD_OPERADORES[i][2], o: o };
    }
    return { nombre: "Internet", logo: "", svg: "", o: o };
  }
  var inet = { d: null, ts: 0 };
  function inLeer() {
    if (Date.now() - inet.ts < 30000) return;
    inet.ts = Date.now();
    cenJSON("/api/red/salud?rango=24h").then(function (d) { inet.d = d; inPintar(); }).catch(function () { /* se reintenta */ });
  }
  function inCuerpo() {
    var d = vs.datos || {}, ro = d.router || {}, i = (ro.mas || {}).internet || {}, op = rdOperador(d), o = op.o, s = inet.d, t = tr.d || {};
    function dato(r, v) { return v ? "<div><dt>" + r + "</dt><dd>" + v + "</dd></div>" : ""; }
    var lat = (d.latencia || []).filter(function (x) { return x.ms != null; }), ms = lat.length ? lat.reduce(function (a, x) { return a + x.ms; }, 0) / lat.length : null;
    var wanP = ((ro.mas || {}).puertos || []).filter(function (p) { return p.nombre === "wan"; })[0];
    var vel = s && s.velocidad && s.velocidad.length ? s.velocidad : [], uv = vel.length ? vel[vel.length - 1] : null;
    var capB = 0, capS = 0;
    vel.forEach(function (v) { capB = Math.max(capB, v[1] || 0); capS = Math.max(capS, v[2] || 0); });
    if (!capB && wanP && wanP.velocidad) capB = capS = wanP.velocidad;
    var pico = t.pico && capB ? Math.min(100, Math.round(t.pico[0] * 8 / 1e6 / capB * 100)) + " % / " + Math.min(100, Math.round(t.pico[1] * 8 / 1e6 / (capS || capB) * 100)) + " %" : "";
    var disp = s ? s.disponibilidad : null, caido = s ? s.caido : i.activa === false;
    var h = '<dl class="nx-rd-datos nx-in-datos">' +
      dato("Estado", caido ? '<span class="nx-in-mal">Sin conexión</span>' : '<span class="nx-rd-on">En línea</span>') +
      dato("IP pública <small>puerto WAN</small>", escapar(i.ip || (ro.wan || {}).ip || "")) +
      dato("Puerta de enlace", escapar(i.puerta || "")) +
      dato("Latencia", ms == null ? "—" : Math.round(ms) + " ms") +
      dato("Operador", escapar(o.nombre || op.nombre) + (o.asn ? " <small>" + escapar(o.asn) + "</small>" : "")) +
      dato("Ubicación <small>según la IP</small>", escapar([o.ciudad, o.region].filter(Boolean).join(", "))) +
      dato("Conexión", escapar(i.proto || "") + (i.vlan ? " · VLAN " + escapar(i.vlan) : "") + (i.mtu ? " · MTU " + i.mtu : "")) +
      dato("Enlace del puerto", wanP && wanP.enlace ? (wanP.velocidad >= 1000 ? String(wanP.velocidad / 1000).replace(".", ",") + " GbE" : wanP.velocidad + " Mb") : "") +
      dato("Velocidad de bajada", uv ? mbps(uv[1]) + " Mbps <small>medida</small>" : "") +
      dato("Velocidad de subida", uv ? mbps(uv[2]) + " Mbps <small>medida</small>" : "") +
      dato("Disponibilidad <small>24 h</small>", disp == null ? "" : (disp >= 100 ? "100" : disp.toFixed(2).replace(".", ",")) + " %") +
      dato("Pico de uso <small>↓ / ↑ · 24 h</small>", pico) +
      dato("Ahora", t.wan ? "↓ " + megabits(t.wan[0]) + " · ↑ " + megabits(t.wan[1]) + " " + unidadRed() : "") +
      dato("Sesión abierta hace", i.desde != null ? vDura(i.desde) : "") + "</dl>";
    h += "<h4>Calidad de Internet <small>lo que tarda en contestar · último día</small></h4>";
    if (!s) return h + '<p class="nx-b-nota">Leyendo las medidas…</p>';
    var serie = s.serie, n = serie.length, W = 520, H = 120, mx = 30;
    serie.forEach(function (p) { if (p[1] != null) mx = Math.max(mx, p[1]); });
    mx = Math.ceil(mx / 15) * 15;
    var barras = "", paso = W / n;
    serie.forEach(function (p, k) {
      if (p[1] == null) return;
      var a = Math.max(2, p[1] / mx * (H - 6)), c = p[2] >= 50 ? "mal" : p[2] > 0 ? "av" : "ok";
      barras += '<rect class="' + c + '" x="' + (k * paso).toFixed(1) + '" y="' + (H - a).toFixed(1) + '" width="' + (paso + 0.3).toFixed(2) + '" height="' + a.toFixed(1) + '"><title>' + saCuando(p[0], "24h") + " · " + String(p[1]).replace(".", ",") + " ms</title></rect>";
    });
    var ejeY = [1, 0.75, 0.5, 0.25, 0].map(function (q) { return "<span>" + Math.round(mx * q) + "</span>"; }).join("");
    h += '<div class="nx-in-graf"><div class="nx-in-y">' + ejeY + '</div><svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">' +
      [0, 0.25, 0.5, 0.75].map(function (q) { return '<line x1="0" x2="' + W + '" y1="' + (H * q + 0.5) + '" y2="' + (H * q + 0.5) + '"/>'; }).join("") +
      [0.25, 0.5, 0.75].map(function (q) { return '<line x1="' + W * q + '" x2="' + W * q + '" y1="0" y2="' + H + '"/>'; }).join("") + barras + "</svg>" +
      '<div class="nx-in-x"><span>−24 h</span><span>ahora</span></div></div>';
    h += '<div class="nx-in-hosts">' + rsLatencia(d.latencia) + "</div>";
    h += '<p class="nx-b-nota nx-in-pie">' + (s.cortes ? s.cortes + (s.cortes === 1 ? " corte" : " cortes") + " en el último día" : "Sin cortes en el último día") +
      (s.reconexiones ? " · " + s.reconexiones + (s.reconexiones === 1 ? " reconexión" : " reconexiones") : "") + (s.cobertura < 90 ? " · hay medidas del " + s.cobertura + " % del tiempo" : "") + ".</p>";
    return h;
  }
  function inPintar() { if (rd.sel === "INET") { vPoner("nx-in-cuerpo", inCuerpo()); inLeer(); } }
  function inAbrir() {
    var caja = document.getElementById("nx-rd-ficha"), op = rdOperador(vs.datos);
    if (!caja) return;
    rd.sel = "INET";
    caja.innerHTML = '<div class="nx-rd-fcab"><span class="nx-in-logo">' + (op.svg || exIco("web")) + "</span>" +
        "<div><h3>" + escapar(op.nombre) + "</h3><p>" + (op.logo ? "Internet · la línea de casa" : "La línea de casa") + '</p></div><button type="button" class="nx-rd-x" data-rd="cerrar" aria-label="Cerrar">✕</button></div>' +
      '<div id="nx-in-cuerpo"></div>' +
      '<div class="nx-rd-botones"><button type="button" class="nx-cfg-btn" data-rt="1">Todo sobre el router</button></div>';
    caja.classList.add("on");
    vs.firmas["nx-in-cuerpo"] = "";
    inet.ts = 0;
    inPintar();
  }

  function rdAbrir(mac) {
    if (/^VPN/.test(mac)) return vpnAviso(mac);
    var d = vs.datos || {}, x = (d.dispositivos || []).filter(function (y) { return y.mac === mac; })[0];
    var caja = document.getElementById("nx-rd-ficha");
    if (!x || !caja) return;
    rd.sel = mac;
    var ops = Object.keys(RD_TIPO).map(function (t) { return '<option value="' + t + '"' + (t === x.tipo ? " selected" : "") + ">" + RD_TIPO[t] + "</option>"; }).join("");
    var actual = /^mdi:/.test(x.icono || "") ? x.icono.slice(4) : "";
    caja.innerHTML = '<div class="nx-rd-fcab"><span class="nx-rd-ico grande" id="nx-rd-fico">' + rdIcoHTML(x) + "</span>" +
        "<div><h3>" + escapar(x.nombre) + "</h3><p>" + escapar(RD_TIPO[x.tipo] || "") + '</p></div><button type="button" class="nx-rd-x" data-rd="cerrar" aria-label="Cerrar">✕</button></div>' +
      (x.tipo === "router" ? "" : '<a class="nx-rd-pag" href="' + eqEnlace(x.mac) + '" data-eq="' + x.mac + '">' + exIco("chart-donut") + "<span><b>Abrir su página</b><small>Aplicaciones que más usa, consumo y actividad</small></span><em>→</em></a>") +
      '<div id="nx-rd-fcuerpo">' + rdFicha(x) + "</div>" +
      '<h4>Nombre y tipo</h4><div class="nx-rd-editar"><input type="text" id="nx-rd-alias" maxlength="40" placeholder="' + escapar(x.host || x.fabricante || "Ponle un nombre") + '" value="' + escapar(x.alias || "") + '" aria-label="Nombre del dispositivo">' +
        '<select id="nx-rd-tipo" class="nx-ps5-sel" aria-label="Tipo de dispositivo">' + ops + "</select>" +
        (x.conexion === "cable" ? '<select id="nx-rd-puerto" class="nx-ps5-sel" aria-label="Puerto del router" title="A qué puerto del router va su cable (directo o a través de un switch). Hace falta para medir su tráfico.">' +
          '<option value="">Puerto del router: ' + (x.puerto_auto ? "detectado (" + x.puerto_auto.replace("lan", "LAN ") + ")" : "no lo sé") + "</option>" +
          (((d.router || {}).mas || {}).puertos || []).filter(function (p) { return p.nombre !== "wan"; }).map(function (p) {
            return '<option value="' + p.nombre + '"' + (x.puerto === p.nombre ? " selected" : "") + ">" + p.nombre.replace("lan", "LAN ") + "</option>"; }).join("") + "</select>" : "") +
        '<button type="button" class="nx-cfg-btn" data-rd="guardar">Guardar</button>' +
        '<label class="nx-rd-chk"><input type="checkbox" id="nx-rd-enrouter"> Ponerle también este nombre en el router</label></div>' +
      '<h4>Icono <small>cómo se ve en el mapa y en la lista</small></h4><details class="nx-rd-icosel"><summary><span class="nx-rd-ico">' + rdIcoHTML(x) + "</span><b>" +
        (rdFoto(x) ? "Tu imagen" : /^ufp:/.test(x.icono || "") ? "Foto del modelo" : actual ? actual.replace(/-/g, " ") : "Automático") + '</b><i>Cambiar…</i></summary><div class="nx-rd-carta" id="nx-rd-carta">' +
        '<div class="nx-rd-modelo"><input type="search" id="nx-rd-modelo" placeholder="Busca tu modelo: «iphone 15», «echo dot», «tapo»…" autocomplete="off" spellcheck="false" aria-label="Buscar el modelo exacto">' +
          '<div id="nx-rd-modelos"></div></div>' +
        '<button type="button" class="nx-rd-auto' + (x.icono ? "" : " on") + '" data-ico="" title="Que lo decida el panel por el nombre y el fabricante">Auto</button>' +
        RD_FOTOS.map(function (f) {
          return '<h5>' + f[0] + "</h5>" + f[1].map(function (m) {
            return '<button type="button" class="nx-rd-fotoop' + (x.icono === "ufp:" + m[0] ? " on" : "") + '" data-ico="ufp:' + m[0] + '" title="' + m[1] + '"><img loading="lazy" alt="" src="' + CEN + "/ufp/" + m[0] + '.png"><small>' + m[1] + "</small></button>"; }).join("");
        }).join("") +
        '<button type="button" class="nx-rd-todo" data-catalogo="' + x.mac + '">' + exIco("image-multiple-outline") + "Ver el catálogo entero · más de 6.000 modelos</button>" +
        '<button type="button" class="nx-rd-subir' + (rdFoto(x) ? " on" : "") + '" data-ico="subir" title="Una foto o un logo tuyo (se recorta en cuadrado)">' + exIco("image-plus") + "Tu imagen</button>" +
        '<input type="file" id="nx-rd-fichero" accept="image/png,image/jpeg,image/webp" hidden></div></details>' +
      '<div id="nx-rd-frouter"></div>' +
      '<div class="nx-rd-botones">' + (x.ip ? '<a class="nx-cfg-btn" target="_blank" rel="noreferrer" href="http://' + escapar(x.ip) + '/">Abrir http://' + escapar(x.ip) + "</a>" : "") +
        (!x.wifi ? '<button type="button" class="nx-cfg-btn" data-rd="despertar" title="Manda un paquete Wake-on-LAN. Solo despierta equipos por cable que lo tengan activado.">Despertar</button>' : "") + "</div>";
    caja.classList.add("on");
    vs.firmas["nx-rd-frouter"] = "";
    vs.firmas["nx-rd-tabla"] = "";
    vsPintar();
  }

  function rdPintar(d) {
    var r = d.resumen || {}, ro = d.router || {};
    vTexto("nx-vista-sub", r.total ? r.en_linea + " de " + r.total + " equipos en línea" + (r.nuevos ? " · " + r.nuevos + " nuevos hoy" : "") : "Leyendo la red…");
    // el mapa, solo si cambia quien hay
    mfPrepara(d);
    vPoner("nx-mf-cuerpo", mfMenu(d));
    mfAplicar();
    var firma = (d.dispositivos || []).map(function (x) { return x.mac + (x.en_linea ? x.conexion : "-") + x.tipo + (x.icono || "") + mfEtq(x).join(""); }).sort().join("|") + (A("rdRealista") ? "R" : "") + ((ro.wan || {}).ip || "") + (d.vpn || []).map(function (n) { return n.id + (n.en_linea ? 1 : 0) + (n.en_casa ? 1 : 0) + (n.directo ? 1 : 0); }).join("") +
      JSON.stringify([mf.o, mf.foco, mf.cli, mf.est, mf.con, mf.ssid, mf.red, mf.fab, mf.tipo, mf.etq, mf.q]);
    var lienzo = document.getElementById("nx-rd-vp"), caja = document.getElementById("nx-rd-mapa");
    if (caja) firma += "|" + Math.round(caja.clientWidth / 60) + "x" + Math.round(caja.clientHeight / 60);
    if (vs.firmas.mapa !== firma && lienzo) {
      if (vs.firmas.mapa && vs.firmas.mapa.split("|").pop() !== firma.split("|").pop()) rdV.k = 0;
      lienzo.innerHTML = rdMapa(d);
      vs.firmas.mapa = firma;
      if (!rdV.k) rdAjustar(false); else rdVista();
      trPintar();
    }
    (d.dispositivos || []).forEach(function (x) {
      var n = document.querySelector('#nx-rd-svg .nx-rd-nodo[data-mac="' + x.mac + '"]');
      if (!n) return;
      var p = rdPct(x), nv = rdNivel(p), vt = (tr.d && tr.d.d[x.mac]) || null, viva = !!vt && trNivel(Math.max(vt[0], vt[1])) > 0;
      n.setAttribute("class", "nx-rd-nodo nx-rd-k-" + x.tipo + " nx-rd-" + nv + (viva ? " viva" : "") + (rd.sel === x.mac ? " sel" : "") + (x.bloqueado ? " vetado" : ""));
      var t = n.querySelector(".nx-rd-pct"), det = n.querySelector(".nx-rd-det"), sub = rdSub(x);
      if (t && t.textContent !== sub[0]) t.textContent = sub[0];
      var fijo = sub[1];
      n.setAttribute("data-det", fijo);
      var txt = viva ? (mf.o === "v" ? "" : " · ") + trTexto(vt) : fijo;
      if (det && det.textContent !== txt) det.textContent = txt;
      var rama = document.querySelector('#nx-rd-svg .nx-rd-rama[data-de="' + x.mac + '"]');
      if (rama) rama.setAttribute("class", "nx-rd-enl nx-rd-rama nx-rd-" + nv + (x.wifi ? " nx-rd-aire" : "") + (viva ? " viva" : ""));
    });
    var tot = Math.max(1, r.en_linea || 0);
    function trozo(n, c, t) { return n ? '<i class="' + c + '" style="flex:' + n + '" title="' + t + ": " + n + '"></i>' : ""; }
    vPoner("nx-rd-cifras",
      '<div class="nx-rd-gran"><b>' + (r.en_linea || 0) + "</b><span>en línea<small>de " + (r.total || 0) + " conocidos</small></span></div>" +
      '<div class="nx-rd-reparto">' + trozo(r.wifi5, "a", "5 GHz") + trozo(r.wifi24, "b", "2,4 GHz") + trozo(r.cable, "c", "Cable") + trozo(r.invitados, "d", "Invitados") + "</div>" +
      '<ul class="nx-rd-leyenda"><li class="a"><b>' + (r.wifi5 || 0) + "</b>5 GHz</li><li class=\"b\"><b>" + (r.wifi24 || 0) + '</b>2,4 GHz</li><li class="c"><b>' + (r.cable || 0) + "</b>Cable</li>" + (r.invitados ? '<li class="d"><b>' + r.invitados + "</b>Invitados</li>" : "") + "</ul>" +
      '<div class="nx-rd-trafico">' + (tr.d ? "<span>↓ " + megabits(tr.d.wan[0]) + " " + unidadRed() + "</span><span>↑ " + megabits(tr.d.wan[1]) + " " + unidadRed() + "</span><small>Internet ahora</small>"
        : "<span>↓ " + vTasa(r.baja || 0) + "</span><span>↑ " + vTasa(r.sube || 0) + "</span><small>tráfico wifi ahora</small>") + "</div>");
    var mi = (ro.mas || {}).internet || {}, ms = (ro.mas || {}).sistema || {};
    vPoner("nx-rd-router",
      "<h3>Router</h3><b>" + escapar(ro.modelo || "—") + "</b><i>" + escapar(ro.version || "") + "</i>" +
      '<dl class="nx-rd-datos mini">' +
        "<div><dt>IP pública</dt><dd>" + escapar((ro.wan || {}).ip || "—") + "</dd></div>" +
        "<div><dt>" + (((ro.mas || {}).internet || {}).proto ? escapar(ro.mas.internet.proto) + (ro.mas.internet.vlan ? " · VLAN " + escapar(ro.mas.internet.vlan) : "") : "Conexión") +
          "</dt><dd>" + ((ro.wan || {}).desde ? vDura(ro.wan.desde) : "—") + "</dd></div>" +
        "<div><dt>Encendido</dt><dd>" + (ro.encendido ? vDura(ro.encendido) : "—") + "</dd></div>" +
        "<div><dt>Carga · memoria</dt><dd>" + (ro.carga != null ? String(ro.carga).replace(".", ",") : "—") + " · " + (ro.memoria != null ? ro.memoria + " %" : "—") + "</dd></div>" +
        (mi.puerta ? "<div><dt>Puerta de enlace</dt><dd>" + escapar(mi.puerta) + "</dd></div>" : "") +
        (mi.mtu ? "<div><dt>MTU · DNS</dt><dd>" + mi.mtu + " · " + ((mi.dns || [])[0] === location.hostname ? "AdGuard" : escapar((mi.dns || ["—"])[0])) + "</dd></div>" : "") +
        (mi.rx != null ? "<div><dt>Bajado en la sesión</dt><dd>↓ " + vBytes(mi.rx) + "</dd></div><div><dt>Subido</dt><dd>↑ " + vBytes(mi.tx) + "</dd></div>" : "") +
        (ms.conexiones != null ? "<div><dt>Conexiones abiertas</dt><dd>" + ms.conexiones.toLocaleString("es-ES") + "</dd></div>" : "") +
        (mi.v6 ? "<div><dt>IPv6</dt><dd>" + (mi.v6.activa ? "activo" + (mi.v6.prefijo ? " · /" + mi.v6.prefijo.split("/")[1] : "") : "apagado") + "</dd></div>" : "") +
      "</dl>" +
      ((ro.mas || {}).puertos ? '<div class="nx-rd-puertos">' + ro.mas.puertos.map(function (p) {
        return '<span class="' + (p.enlace ? "on" : "") + (p.nombre === "wan" ? " wan" : "") + '" title="' + escapar(p.nombre.toUpperCase()) + (p.enlace ? " · " + p.velocidad + " Mb · ↓ " + vBytes(p.rx) + " ↑ " + vBytes(p.tx) : " · sin cable") + '"><i></i>' +
          escapar(p.nombre.replace(/^lan/, "L").replace("wan", "WAN").toUpperCase()) + "<small>" + (p.enlace ? (p.velocidad >= 1000 ? p.velocidad / 1000 + "G" : p.velocidad + "M") : "—") + "</small></span>"; }).join("") + "</div>" : "") +
      (d.radios || []).map(function (x) {
        var mr = ((ro.mas || {}).radios || []).filter(function (r) { return r.ssid === x.ssid; })[0] || {};
        return '<div class="nx-rd-radio"><span>' + exIco("wifi") + escapar(x.ssid || "") + "<b>" + x.clientes + "</b></span><small>" + (x.banda === "5" ? "5 GHz" : "2,4 GHz") + " · canal " + x.canal +
          (mr.modo ? " · " + escapar(String(mr.modo).replace(/^\D+/, "")) + " MHz" : "") + (mr.potencia != null ? " · " + mr.potencia + " dBm" : "") + (mr.ruido != null ? " · ruido " + mr.ruido : "") + "</small></div>";
      }).join("") +
      rsLatencia(d.latencia) +
      '<div class="nx-rd-enlaces"><button type="button" class="nx-h-abrir nx-rt-btn" data-rt="1">Ver todo</button>' +
        '<a class="nx-h-abrir" target="_blank" rel="noreferrer" href="http://' + escapar(ro.ip || "192.168.1.1") + '/">Router</a>' +
        '<a class="nx-h-abrir" target="_blank" rel="noreferrer" href="' + location.protocol + "//" + location.hostname + ':3000/">AdGuard</a></div>');
    var cuenta = { todos: r.total, linea: r.en_linea, wifi5: r.wifi5, wifi24: r.wifi24, cable: r.cable, fuera: (r.total || 0) - (r.en_linea || 0) };
    vPoner("nx-rd-filtros", [["linea", "En línea"], ["todos", "Todos"], ["wifi5", "5 GHz"], ["wifi24", "2,4 GHz"], ["cable", "Cable"], ["fuera", "Desconectados"]].map(function (f) {
      return '<button type="button" data-rdf="' + f[0] + '" class="' + (rd.filtro === f[0] ? "on" : "") + '">' + f[1] + "<small>" + (cuenta[f[0]] || 0) + "</small></button>";
    }).join(""));
    var l = rdLista(d);
    vPoner("nx-rd-tabla", l.length ? l.map(rdFila).join("") : '<p class="nx-ps5-vacio">Ningún equipo coincide.</p>');
    // la ficha abierta: solo su parte viva, para no pisar lo que se este escribiendo
    if (rd.sel) {
      var x = (d.dispositivos || []).filter(function (y) { return y.mac === rd.sel; })[0];
      if (x) { vPoner("nx-rd-fcuerpo", rdFicha(x)); vPoner("nx-rd-frouter", rdRouter(x)); }
      inPintar();
    }
    if (rd.abrir) { var pedido = rd.abrir; rd.abrir = null; rdAbrir(pedido); }
    rtPintar();
    velPintar();
    rsLeer();
    muLeer();
    saLeer();
    if (sa.d) saPintar();
    ptPintar(d);
    cpLeer();
  }

  function rdMontar(cuerpo) {
    cuerpo.innerHTML =
      '<div class="nx-rd-escena"><div id="nx-rd-mapa" aria-label="Topología de la red">' +
          '<svg id="nx-rd-svg" role="group"><defs><radialGradient id="nx-rd-g"><stop offset="0" style="stop-color:var(--nx-accent)" stop-opacity=".5"/><stop offset="1" style="stop-color:var(--nx-accent)" stop-opacity="0"/></radialGradient></defs><g id="nx-rd-vp"></g></svg>' +
          '<div class="nx-rd-ctl"><button type="button" data-mp="mas" title="Acercar" aria-label="Acercar">+</button><b id="nx-rd-zoom"></b><button type="button" data-mp="menos" title="Alejar" aria-label="Alejar">−</button>' +
            '<button type="button" data-mp="todo" title="Que quepa todo" aria-label="Que quepa todo">' + exIco("fit-to-screen-outline") + '</button>' +
            '<button type="button" data-mp="pleno" title="Pantalla completa" aria-label="Pantalla completa">' + exIco("fullscreen") + "</button></div>" +
          '<div class="nx-rd-ley"><span><i class="c"></i>cable</span><span><i class="w"></i>wifi</span><span><b class="b"></b>buena</span><span><b class="r"></b>regular</span><span><b class="m"></b>floja</span><span class="nx-rd-calor">poco <i></i> mucho tráfico</span><em>arrastra para moverte · Ctrl + rueda para ampliar</em></div><div class="nx-rd-aviso">Mantén pulsado <kbd>Ctrl</kbd> y gira la rueda para ampliar</div>' +
        '</div><div id="nx-rd-izq"><a class="nx-rd-flota nx-ax-entrar" href="?ajustes=redes#red" data-axir="redes">' + exIco("cog-outline") + "<span><b>Ajustes de red</b><small>redes y VLAN, wifi, puertos, cortafuegos…</small></span></a>" +
          '<div class="nx-rd-flota" id="nx-rd-cifras"></div>' +
          '<div class="nx-rd-flota" id="nx-rd-menu"><div class="nx-mf-cab"><button type="button" class="nx-mf-tit" data-mf="plegar" title="Plegar o desplegar el menú del mapa">' + exIco("tune-variant") + 'Mapa<u id="nx-mf-n"></u><em></em></button>' +
            '<span class="nx-mf-seg" role="group" aria-label="Orientación del mapa"><button type="button" data-mf="o:h" title="En horizontal: de izquierda a derecha" aria-label="En horizontal">' + exIco("sitemap-outline") + '</button>' +
              '<button type="button" data-mf="o:v" title="En vertical: de arriba abajo" aria-label="En vertical">' + exIco("sitemap-outline") + "</button></span></div>" +
            '<div class="nx-mf-dentro"><input type="search" id="nx-mf-q" placeholder="Buscar en el mapa…" autocomplete="off" spellcheck="false" aria-label="Buscar en el mapa" value="' + escapar(mf.q) + '"><div id="nx-mf-cuerpo"></div></div></div></div>' +
        '<div class="nx-rd-flota" id="nx-rd-router"></div></div>' +
      // lo que antes era la pestana Red: el trafico de la linea y el filtro DNS (los pinta ccPintar)
      '<section id="nx-rs" aria-label="Resumen de la red"><div class="nx-rs-cab"><h2>Toda la red <small>quién gasta más y en qué · solo lo que sale a Internet</small></h2><div class="nx-eq-seg mini" role="group" aria-label="Periodo">' + EQ_RANGOS.map(function (r) {
          return '<button type="button" data-rsr="' + r[0] + '" title="' + r[2] + '"' + (rs.rango === r[0] ? ' class="on"' : "") + ">" + r[1] + "</button>"; }).join("") + '</div></div><div class="nx-rs-rej" id="nx-rs-cuerpo"></div></section>' +
      '<section id="nx-mu" aria-label="Tráfico por el mundo"><div class="nx-rs-cab"><h2>Por el mundo <small>a qué países va el tráfico de casa · en directo</small></h2><div class="nx-eq-ahora nx-mu-cifras" id="nx-mu-cifras"></div></div>' +
        '<div class="nx-mu-rej"><div class="nx-b nx-mu-mapa"><svg id="nx-mu-svg" role="img" aria-label="Mapa del mundo con el tráfico por países"></svg>' +
          '<p class="nx-mu-pie">Países según <a href="https://db-ip.com" target="_blank" rel="noreferrer">IP Geolocation by DB-IP</a> · las redes de reparto (CDN) cuentan donde tienen registrada la dirección, no donde está el servidor</p></div>' +
        '<div class="nx-mu-lado"><div class="nx-b"><h3>Países <span>del periodo</span></h3><div id="nx-mu-paises"></div></div>' +
          '<div class="nx-b"><h3>Conexiones en directo <span>las que más mueven</span></h3><div id="nx-mu-flujos"></div></div></div></div></section>' +
      '<div class="nx-vt-rejilla nx-rd-linea nx-rd-salud"><div class="nx-b nx-f8"><h3>Salud de Internet <span>cortes, respuesta y velocidad</span></h3><div id="nx-sa"></div></div>' +
        '<div class="nx-b nx-f4"><h3>Puertos del router <span>en directo</span></h3><div id="nx-pt"></div></div></div>' +
      '<div class="nx-vt-rejilla nx-rd-linea"><div class="nx-b nx-f8 nx-b-red"><h3>Tráfico de la línea <span>router · en directo</span></h3><div id="nx-cc-red"></div></div>' +
        '<div class="nx-b nx-f4 nx-b-dns"><h3>Escudo DNS <span>AdGuard Home</span></h3><div id="nx-cc-dns"></div></div>' +
        '<div class="nx-b nx-f4 nx-b-vel"><h3>Velocidad de la línea <span>prueba propia</span></h3><div id="nx-rd-vel"></div></div></div>' +
      '<div class="nx-rd-barra"><div class="nx-rd-filtros" id="nx-rd-filtros"></div>' +
        '<select id="nx-rd-orden" class="nx-ps5-sel" aria-label="Ordenar">' + [["nombre", "Por nombre"], ["tipo", "Por tipo"], ["ip", "Por IP"], ["senal", "Mejor señal"], ["actividad", "Más actividad"], ["visto", "Vistos hace poco"]].map(function (o) {
          return '<option value="' + o[0] + '"' + (rd.orden === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div>" +
      '<div class="nx-b nx-rd-lista"><div class="nx-rd-fila nx-rd-enc"><span>Equipo</span><span>IP</span><span>Conexión</span><span>Señal</span><span>Enlace</span><span>Actividad</span><span>Conectado</span></div>' +
        '<div id="nx-rd-tabla"></div></div>' +
      '<aside id="nx-rd-ficha" aria-label="Ficha del dispositivo"></aside>';
    cc.firmas = {};
    try { ccPintar(); } catch (e0) { /* aun sin datos */ }
    rdV.k = 0;
    mu.ts = 0; mu.firma = mu.fondo = ""; sa.ts = 0;
    var mapa = cuerpo.querySelector("#nx-rd-mapa"), dedos = {}, arr = null;
    function dentro(e) { var r = mapa.getBoundingClientRect(), z = rdEscala(); return [(e.clientX - r.left) / z, (e.clientY - r.top) / z]; }
    // La rueda sola desplaza la pagina (para bajar a la lista); con Ctrl amplia,
    // como en los mapas incrustados. A pantalla completa no hay pagina que
    // mover, asi que alli la rueda amplia sin mas. El pellizco del panel
    // tactil llega como rueda con Ctrl, y funciona igual.
    mapa.addEventListener("wheel", function (e) {
      if (!e.ctrlKey && !e.metaKey && !mapa.parentElement.classList.contains("nx-rd-pleno")) {
        mapa.classList.add("nx-rd-pista");
        clearTimeout(rd.tp);
        rd.tp = setTimeout(function () { mapa.classList.remove("nx-rd-pista"); }, 1400);
        return;
      }
      e.preventDefault();
      var p = dentro(e);
      rdZoom(Math.pow(1.0018, -e.deltaY * (e.deltaMode ? 30 : 1)), p[0], p[1]);
    }, { passive: false });
    mapa.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".nx-rd-ctl") || (e.pointerType === "mouse" && e.button)) return;
      dedos[e.pointerId] = dentro(e);
      var ids = Object.keys(dedos);
      arr = { x: rdV.x, y: rdV.y, p: dedos[e.pointerId], movido: false, dist: 0 };
      if (ids.length === 2) { var a = dedos[ids[0]], b2 = dedos[ids[1]]; arr.dist = Math.hypot(a[0] - b2[0], a[1] - b2[1]); arr.k = rdV.k; }
      mapa.classList.add("arrastrando");
    });
    window.addEventListener("pointermove", function (e) {
      if (!arr || !(e.pointerId in dedos) || !mapa.isConnected) return;
      var p = dentro(e), ids = Object.keys(dedos);
      dedos[e.pointerId] = p;
      if (ids.length === 2 && arr.dist) {              // pellizco
        var a = dedos[ids[0]], b2 = dedos[ids[1]], dn = Math.hypot(a[0] - b2[0], a[1] - b2[1]);
        arr.movido = true;
        return rdZoom(arr.k * dn / arr.dist / rdV.k, (a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2);
      }
      if (!arr.movido && Math.hypot(p[0] - arr.p[0], p[1] - arr.p[1]) < 5) return;
      arr.movido = true;
      rdV.x = arr.x + p[0] - arr.p[0];
      rdV.y = arr.y + p[1] - arr.p[1];
      rdVista();
    });
    function soltar(e) {
      if (!(e.pointerId in dedos)) return;
      delete dedos[e.pointerId];
      if (Object.keys(dedos).length) return;
      mapa.classList.remove("arrastrando");
      rd.arrastro = arr && arr.movido;
      arr = null;
      setTimeout(function () { rd.arrastro = false; }, 60);
    }
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    mapa.addEventListener("dblclick", function (e) { if (!e.target.closest(".nx-rd-ctl,.nx-rd-nodo")) { var p = dentro(e); rdZoom(1.5, p[0], p[1]); } });
    cuerpo.addEventListener("click", function (e) {
      var mp = e.target.closest("[data-mp]");
      if (mp) {
        var cx = mapa.clientWidth / 2, cy = mapa.clientHeight / 2;
        if (mp.dataset.mp === "mas") rdZoom(1.3, cx, cy);
        else if (mp.dataset.mp === "menos") rdZoom(1 / 1.3, cx, cy);
        else if (mp.dataset.mp === "todo") rdAjustar(true);
        else if (mp.dataset.mp === "pleno") {
          var esc = mapa.parentElement;
          esc.classList.toggle("nx-rd-pleno");
          document.getElementById("nx-vista").classList.toggle("nx-con-pleno", esc.classList.contains("nx-rd-pleno"));
          rdV.k = 0; vs.firmas.mapa = ""; vsPintar();
        }
        return;
      }
      var mm = e.target.closest("[data-mf]");
      if (mm) return mfClic(mm.dataset.mf);
      var ct = e.target.closest("[data-catalogo]");
      if (ct) return catAbrir(ct.dataset.catalogo);
      var ic = e.target.closest("[data-ico]");
      if (ic && rd.sel) {
        if (ic.dataset.ico === "subir") return document.getElementById("nx-rd-fichero").click();
        var mio = rd.sel;
        return vOrden("/api/red/icono", { mac: mio, icono: ic.dataset.ico }, "Icono cambiado").then(function () { setTimeout(function () { if (rd.sel === mio) rdAbrir(mio); }, 700); });
      }
      if (rd.arrastro) return;                  // era el final de un arrastre, no un clic
      var nu = e.target.closest("[data-nudo]");
      if (nu) return nu.dataset.nudo === "router" ? rtAbrir() : inAbrir();
      var f = e.target.closest("[data-rdf]"), n = e.target.closest("[data-mac]"), b = e.target.closest("[data-rd]");
      if (f) { rd.filtro = f.dataset.rdf; vs.firmas["nx-rd-filtros"] = ""; return vsPintar(); }
      if (b) {
        var mac = rd.sel, caja = document.getElementById("nx-rd-ficha");
        if (b.dataset.rd === "cerrar") { rd.sel = null; caja.classList.remove("on"); vs.firmas["nx-rd-tabla"] = ""; return vsPintar(); }
        var eq = ((vs.datos || {}).dispositivos || []).filter(function (y) { return y.mac === mac; })[0] || {};
        var alias = (document.getElementById("nx-rd-alias") || {}).value || "";
        if (b.dataset.rd === "guardar") {
          var tambien = document.getElementById("nx-rd-enrouter").checked && alias.trim();
          return vOrden("/api/red/dispositivo", (function () { var o = { mac: mac, alias: alias, tipo: document.getElementById("nx-rd-tipo").value }, pu = document.getElementById("nx-rd-puerto"); if (pu) o.puerto = pu.value; return o; })(), "Guardado")
            .then(function () { if (tambien) return vOrden("/api/router/nombrar", { mac: mac, nombre: alias }, "Nombre puesto en el router."); });
        }
        if (b.dataset.rd === "reservar") return vOrden("/api/router/reservar", { mac: mac, ip: document.getElementById("nx-rd-ip").value.trim(), nombre: alias || eq.host || "" }, "IP fijada en el router.");
        if (b.dataset.rd === "liberar") return ps5Confirmar("Quitar la IP fija", "El router volverá a darle la dirección que le toque, y también olvida el nombre que tuviera puesto allí.", "Quitar", false)
          .then(function (si) { if (si) vOrden("/api/router/liberar", { mac: mac }, "Reserva quitada."); });
        if (b.dataset.rd === "bloquear") {
          var si = b.dataset.si === "1";
          return (si ? ps5Confirmar("Bloquear la salida a Internet", "«" + (eq.nombre || mac) + "» seguirá en la red de casa pero no podrá salir a Internet hasta que lo permitas otra vez. Lo que ya tenga abierto puede tardar un poco en cortarse.", "Bloquear", true) : Promise.resolve(true))
            .then(function (ok) { if (ok) vOrden("/api/router/bloquear", { mac: mac, si: si }, si ? "Salida a Internet bloqueada." : "Salida a Internet permitida."); });
        }
        if (b.dataset.rd === "expulsar") return ps5Confirmar("Expulsar del wifi", "Se le corta la conexión ahora mismo. No queda vetado: se volverá a conectar solo en unos segundos.", "Expulsar", false)
          .then(function (si) { if (si) vOrden("/api/router/expulsar", { mac: mac }, "Expulsado del wifi."); });
        if (b.dataset.rd === "despertar") return vOrden("/api/red/despertar", { mac: mac }, "Paquete de despertar enviado");
      }
      if (n) rdAbrir(n.dataset.mac);
    });
    cuerpo.addEventListener("keydown", function (e) {
      var n = e.target.closest && e.target.closest(".nx-rd-nodo"), nu = e.target.closest && e.target.closest("[data-nudo]");
      if (n && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); rdAbrir(n.dataset.mac); }
      if (nu && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); if (nu.dataset.nudo === "router") rtAbrir(); else inAbrir(); }
      if (e.key === "Escape" && mapa.parentElement.classList.contains("nx-rd-pleno") && !rd.sel) {
        mapa.parentElement.classList.remove("nx-rd-pleno"); document.getElementById("nx-vista").classList.remove("nx-con-pleno");
        rdV.k = 0; vs.firmas.mapa = ""; return vsPintar();
      }
      if (e.key === "Escape" && rd.sel) { rd.sel = null; document.getElementById("nx-rd-ficha").classList.remove("on"); vs.firmas["nx-rd-tabla"] = ""; vsPintar(); }
    });
    cuerpo.addEventListener("input", function (e) {
      if (e.target.id === "nx-mf-q") {
        mf.q = e.target.value.trim();
        if (!mf.foco) rdV.k = 0;
        return vsPintar();
      }
      if (e.target.id !== "nx-rd-modelo") return;
      var q = e.target.value.trim();
      clearTimeout(rd.tm);
      rd.tm = setTimeout(function () {
        var caja = document.getElementById("nx-rd-modelos");
        if (!caja) return;
        if (q.length < 2) { caja.innerHTML = ""; return; }
        cenJSON("/api/ufp?q=" + encodeURIComponent(q)).then(function (d) {
          caja.innerHTML = (d.modelos || []).map(function (m) {
            return '<button type="button" data-ico="ufp:' + m.id + '" title="' + escapar(m.nombre) + '"><img loading="lazy" alt="" src="' + CEN + "/ufp/" + m.id + '.png" onerror="this.parentElement.remove()"><small>' + escapar(m.nombre) + "</small></button>";
          }).join("") || '<p class="nx-b-nota">Ningún modelo con ese nombre. Prueba en inglés o con menos palabras.</p>';
        }).catch(function () { caja.innerHTML = '<p class="nx-b-nota">No se ha podido buscar.</p>'; });
      }, 260);
    });
    cuerpo.addEventListener("change", function (e) {
      if (e.target.id === "nx-rd-fichero" && e.target.files[0] && rd.sel) {
        var fichero = e.target.files[0], mio = rd.sel, img = new Image();
        e.target.value = "";
        img.onload = function () {
          var L = 160, c = document.createElement("canvas"), k = Math.max(L / img.width, L / img.height);
          c.width = c.height = L;
          c.getContext("2d").drawImage(img, (L - img.width * k) / 2, (L - img.height * k) / 2, img.width * k, img.height * k);
          URL.revokeObjectURL(img.src);
          vOrden("/api/red/icono", { mac: mio, imagen: c.toDataURL("image/png") }, "Imagen puesta como icono").then(function () { setTimeout(function () { if (rd.sel === mio) rdAbrir(mio); }, 700); });
        };
        img.onerror = function () { ps5Aviso("Ese fichero no es una imagen que se pueda leer", true); };
        img.src = URL.createObjectURL(fichero);
        return;
      }
      if (e.target.id !== "nx-rd-orden") return;
      rd.orden = e.target.value;
      try { localStorage.setItem("nx-rd-orden", rd.orden); } catch (e2) { /* sin almacenamiento */ }
      vsPintar();
    });
  }

  // ------------------------------------------------------------ armazon comun
  // ==========================================================================
  // Red · la pagina de un equipo (09-10-2026).
  // Como la pagina de cliente de UniFi: lo primero, las aplicaciones y sitios
  // que mas usa (con el icono oficial de UniFi de cada una, que sirve centinela
  // en /dpi/), y debajo el consumo por horas o dias, lo que hace ahora mismo,
  // sus datos, los sitios, el filtro DNS, la senal y su historial.
  // Vive dentro de la pestana Red: la direccion lleva «?equipo=<MAC>» y la
  // pestana pinta esta pagina en vez del mapa. Los datos, de centinela
  // /api/red/equipo (ver alli de donde sale cada cifra y sus limites).
  // ==========================================================================
  var EQ_COLOR = ["#4797FF", "#8E7BFF", "#2DD4A7", "#F5B94A", "#F2555A", "#3ED0E8", "#E879C6", "#B6E05A"];
  var EQ_RANGOS = [["24h", "1D", "Últimas 24 horas"], ["7d", "1S", "Últimos 7 días"], ["30d", "1M", "Últimos 30 días"]];
  var EQ_CAT_ICO = { video: "play-circle-outline", social: "account-group-outline", mensajes: "message-text-outline", juegos: "controller-classic-outline", web: "web",
    nube: "cloud-outline", trabajo: "briefcase-outline", ia: "creation-outline", compras: "cart-outline", hogar: "home-automation", sistema: "update",
    cdn: "server-network", publi: "bullhorn-outline", p2p: "download-network-outline", red: "lan", adultos: "eye-off-outline", servidor: "server", otros: "help-circle-outline" };
  var eq = { rango: "24h", modo: "apps", todo: false, html: {} };
  try { eq.rango = localStorage.getItem("nx-eq-rango") || "24h"; } catch (e) { /* sin almacenamiento */ }

  function eqMac() {
    var m = /[?&]equipo=([0-9A-Fa-f:]{17})(&|$)/.exec(location.search);
    return m ? m[1].toUpperCase() : "";
  }
  function eqEnlace(mac) { return location.pathname + (mac ? "?equipo=" + mac : "") + (location.hash || "#red"); }
  function eqCambio() {
    var sec = document.getElementById("nx-vista");
    if (sec) sec.remove();
    vs.tab = "";
    pintarVistas();
    var caja = document.getElementById("inner_wrapper");
    if (caja) caja.scrollTop = 0;
  }
  function eqIr(mac) {
    try { history.pushState({ nx: 1 }, "", eqEnlace(mac)); } catch (e) { /* sin historial */ }
    eqCambio();
  }
  window.addEventListener("popstate", function () { if (pestanaActiva() === "Red") eqCambio(); });
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-eq]");
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;      // con Ctrl o la rueda, en otra pestana
    e.preventDefault();
    eqIr(a.dataset.eq);
  });

  function eqPon(id, h) {
    var c = document.getElementById(id);
    if (c && eq.html[id] !== h) { eq.html[id] = h; c.innerHTML = h; }
  }
  function eqTasa(b) {
    if (A("redUnidad") === "mbs") return b < 1000 ? "0" : vBytes(b) + "/s";
    var v = (b || 0) * 8;
    if (v < 1000) return "0";
    if (v < 1e6) return Math.round(v / 1000) + " kbps";
    return (v < 1e8 ? (v / 1e6).toFixed(1).replace(".", ",") : Math.round(v / 1e6)) + " Mbps";
  }
  function eqTono(t) { var h = 0; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360; return h; }
  function eqIco(a) {
    if (a.icono) return '<span class="nx-eq-ico"><img loading="lazy" alt="" src="' + CEN + "/dpi/" + encodeURIComponent(a.icono) + '"></span>';
    return '<span class="nx-eq-ico letra" style="--h:' + eqTono(a.nombre) + '">' + escapar((a.nombre.replace(/^www\./, "")[0] || "?").toUpperCase()) + "</span>";
  }
  function eqPct(v, total) {
    if (!total) return "0 %";
    var p = v / total * 100;
    return (p >= 10 ? Math.round(p) : p >= 0.1 ? p.toFixed(1).replace(".", ",") : "<0,1") + " %";
  }

  // ---- lo primero: aplicaciones y sitios mas usados
  function eqApps(d) {
    var total = d.total[0] + d.total[1];
    if (!total) {
      return '<p class="nx-eq-vacio">' + exIco("chart-donut") + "<span><b>Todavía no hay consumo que enseñar en este periodo.</b>" +
        "Se mide desde el " + new Date(d.desde + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" }) +
        " y solo cuenta lo que sale a Internet: lo que este equipo hable con otros de casa no pasa por el router.</span></p>";
    }
    var porCat = eq.modo === "cats";
    var filas = porCat ? d.cats.map(function (c) { return { nombre: c.nombre, cat: "", baja: c.baja, sube: c.sube, ico: EQ_CAT_ICO[c.cat] || "shape-outline", pie: c.apps + (c.apps === 1 ? " aplicación" : " aplicaciones") }; })
      : d.apps.map(function (a) { return { nombre: a.nombre, icono: a.icono, sitio: a.sitio, baja: a.baja, sube: a.sube, pie: (d.nomCat[a.cat] || "") + (a.ultima ? " · " + vHace(a.ultima) : "") }; });
    var mayor = filas.length ? filas[0].baja + filas[0].sube : 1;
    // la rosca: las siete primeras y «el resto»
    var acum = 0, arcos = "", resto = total;
    filas.slice(0, 7).forEach(function (f, i) {
      var p = (f.baja + f.sube) / total * 100;
      resto -= f.baja + f.sube;
      if (p < 0.4) return;
      arcos += '<circle r="15.915" cx="21" cy="21" stroke="' + EQ_COLOR[i] + '" stroke-dasharray="' + Math.max(0, p - 0.6).toFixed(2) + " " + (100 - Math.max(0, p - 0.6)).toFixed(2) + '" stroke-dashoffset="' + (25 - acum).toFixed(2) + '"><title>' + escapar(f.nombre) + " · " + eqPct(f.baja + f.sube, total) + "</title></circle>";
      acum += p;
    });
    if (resto / total > 0.004) arcos += '<circle r="15.915" cx="21" cy="21" class="resto" stroke-dasharray="' + Math.max(0, resto / total * 100 - 0.6).toFixed(2) + " " + (100 - Math.max(0, resto / total * 100 - 0.6)).toFixed(2) + '" stroke-dashoffset="' + (25 - acum).toFixed(2) + '"><title>El resto</title></circle>';
    var ver = eq.todo ? filas : filas.slice(0, 10);
    var lista = ver.map(function (f, i) {
      var t = f.baja + f.sube;
      return '<li><i class="nx-eq-n" style="--c:' + (i < 7 ? EQ_COLOR[i] : "rgba(255,255,255,.22)") + '">' + (i + 1) + "</i>" +
        (porCat ? '<span class="nx-eq-ico cat">' + exIco(f.ico) + "</span>" : eqIco(f)) +
        '<span class="nx-eq-app"><b>' + escapar(f.nombre) + "</b><small>" + escapar(f.pie) + "</small></span>" +
        '<span class="nx-eq-bar"><i style="width:' + Math.max(1.5, t / mayor * 100).toFixed(1) + "%;--c:" + (i < 7 ? EQ_COLOR[i] : "rgba(255,255,255,.3)") + '"></i></span>' +
        '<span class="nx-eq-bs"><em class="b">↓ ' + vBytes(f.baja) + '</em><em class="s">↑ ' + vBytes(f.sube) + "</em></span>" +
        '<span class="nx-eq-tot"><b>' + vBytes(t) + "</b><small>" + eqPct(t, total) + "</small></span></li>";
    }).join("");
    return '<div class="nx-eq-apps"><div class="nx-eq-rosca"><svg viewBox="0 0 42 42" role="img" aria-label="Reparto del consumo"><circle r="15.915" cx="21" cy="21" class="fondo"/>' + arcos + "</svg>" +
        "<div><b>" + vBytes(total) + "</b><small>" + (porCat ? d.cats.length + " categorías" : d.apps.length + (d.apps.length === 1 ? " aplicación" : " aplicaciones")) + '</small></div></div>' +
        '<div class="nx-eq-tt"><div><small>Bajada</small><b class="b">↓ ' + vBytes(d.total[0]) + '</b></div><div><small>Subida</small><b class="s">↑ ' + vBytes(d.total[1]) + "</b></div></div>" +
      '<ol class="nx-eq-lista">' + lista + "</ol></div>" +
      (filas.length > 10 ? '<button type="button" class="nx-eq-mas" data-eqa="todo">' + (eq.todo ? "Ver solo las 10 primeras" : "Ver las " + filas.length) + "</button>" : "");
  }

  // ---- consumo por horas o dias
  function eqUso(d) {
    var s = d.serie, mx = 1, W = 1000, H = 220, n = s.length, hueco = n > 24 ? 4 : 8, an = (W - hueco * (n - 1)) / n;
    s.forEach(function (p) { mx = Math.max(mx, p[1] + p[2]); });
    var porDia = d.rango !== "24h", barras = "", ejes = "";
    s.forEach(function (p, i) {
      var x = i * (an + hueco), hb = p[1] / mx * (H - 8), hs = p[2] / mx * (H - 8), f = new Date(p[0] * 1000);
      var rot = porDia ? f.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }) : ("0" + f.getHours()).slice(-2) + ":00";
      barras += '<g><rect class="h" x="' + (x - hueco / 2).toFixed(1) + '" y="0" width="' + (an + hueco).toFixed(1) + '" height="' + H + '"/>' +
        (hb > 0.4 ? '<rect class="b" x="' + x.toFixed(1) + '" y="' + (H - hb - hs).toFixed(1) + '" width="' + an.toFixed(1) + '" height="' + hb.toFixed(1) + '" rx="3"/>' : "") +
        (hs > 0.4 ? '<rect class="s" x="' + x.toFixed(1) + '" y="' + (H - hs).toFixed(1) + '" width="' + an.toFixed(1) + '" height="' + hs.toFixed(1) + '" rx="3"/>' : "") +
        "<title>" + rot + " · ↓ " + vBytes(p[1]) + " · ↑ " + vBytes(p[2]) + "</title></g>";
      var cada = porDia ? (n > 10 ? 5 : 1) : 4;
      if (i % cada === 0 || i === n - 1 && !porDia) ejes += '<span style="left:' + ((x + an / 2) / W * 100).toFixed(2) + '%">' + (porDia ? f.toLocaleDateString("es-ES", n > 10 ? { day: "numeric", month: "short" } : { weekday: "short", day: "numeric" }) : ("0" + f.getHours()).slice(-2) + " h") + "</span>";
    });
    return '<div class="nx-eq-graf"><div class="nx-eq-tope">' + vBytes(mx) + '</div><svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none"><line x1="0" x2="' + W + '" y1="8" y2="8"/><line x1="0" x2="' + W + '" y1="' + (H / 2 + 4) + '" y2="' + (H / 2 + 4) + '"/>' + barras + "</svg>" +
      '<div class="nx-eq-eje">' + ejes + '</div></div><div class="nx-eq-ley"><span><i class="b"></i>Bajada · ' + vBytes(d.total[0]) + '</span><span><i class="s"></i>Subida · ' + vBytes(d.total[1]) + "</span></div>";
  }

  // ---- la ultima hora, de cinco en cinco segundos
  function eqVivo(d) {
    var m = d.minutos || [], W = 1000, H = 170, fin = d.ts, ini = fin - 3600, mx = 12500;
    m = m.filter(function (p) { return p[0] >= ini; });
    m.forEach(function (p) { mx = Math.max(mx, p[1], p[2]); });
    function linea(k) { return m.map(function (p) { return ((p[0] - ini) / 3600 * W).toFixed(1) + "," + (H - 4 - p[k] / mx * (H - 12)).toFixed(1); }).join(" "); }
    var ahora = d.ahora || [0, 0, ""], ult = m.length ? m[m.length - 1] : [0, 0, 0];
    var b = ult[1], s = ult[2];
    var graf = m.length > 2 ? '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none"><line x1="0" x2="' + W + '" y1="8" y2="8"/><line x1="0" x2="' + W + '" y1="' + (H / 2 + 2) + '" y2="' + (H / 2 + 2) + '"/>' +
        '<polygon class="b" points="' + ((m[0][0] - ini) / 3600 * W).toFixed(1) + "," + H + " " + linea(1) + " " + ((m[m.length - 1][0] - ini) / 3600 * W).toFixed(1) + "," + H + '"/>' +
        '<polyline class="b" points="' + linea(1) + '"/><polyline class="s" points="' + linea(2) + '"/></svg>' : '<p class="nx-b-nota">Reuniendo datos: la curva aparece en unos segundos.</p>';
    return '<div class="nx-eq-ahora"><div><small>Bajada ahora</small><b class="b">↓ ' + eqTasa(b) + '</b></div><div><small>Subida ahora</small><b class="s">↑ ' + eqTasa(s) + "</b></div>" +
        "<div><small>Conexiones abiertas</small><b>" + d.vivo.conexiones + "</b></div><div><small>Pico de la hora</small><b>" + eqTasa(mx > 12500 ? mx : 0) + "</b></div></div>" +
      '<div class="nx-eq-graf vivo"><div class="nx-eq-tope">' + eqTasa(mx) + "</div>" + graf + '<div class="nx-eq-eje"><span style="left:0">hace 1 h</span><span style="left:50%">hace 30 min</span><span style="left:100%">ahora</span></div></div>';
  }
  function eqFlujos(d) {
    var l = d.vivo.flujos.filter(function (f) { return f.baja + f.sube > 0; });
    if (!l.length) return '<p class="nx-b-nota">' + (d.equipo.en_linea ? "Ahora mismo no mueve datos hacia Internet." : "El equipo no está conectado.") + "</p>";
    return '<ul class="nx-eq-mini">' + l.slice(0, 8).map(function (f) {
      return "<li>" + eqIco(f) + '<span class="nx-eq-app"><b>' + escapar(f.nombre) + "</b><small>" + escapar(f.destino !== f.nombre ? f.destino : f.n + (f.n === 1 ? " conexión" : " conexiones")) + "</small></span>" +
        '<span class="nx-eq-bs"><em class="b">↓ ' + eqTasa(f.baja) + '</em><em class="s">↑ ' + eqTasa(f.sube) + "</em></span></li>"; }).join("") + "</ul>";
  }

  function eqDetalles(d) {
    var x = d.equipo, w = x.wifi, con = RD_CON[x.conexion || ""];
    function dato(r, v) { return v ? "<div><dt>" + r + "</dt><dd>" + v + "</dd></div>" : ""; }
    return '<dl class="nx-rd-datos">' +
      dato("Estado", x.en_linea ? '<span class="nx-rd-on">En línea</span>' : "Desconectado · visto " + vHace(x.ultima)) +
      dato("Conexión", con[0] + (w ? " · " + escapar(w.ssid || "") : x.conexion === "cable" && (x.puerto || x.puerto_auto) ? " · puerto " + (x.puerto || x.puerto_auto).replace("lan", "LAN ") : "")) +
      dato("Dirección IP", escapar(x.ip || "") + (x.reserva && x.reserva.ip ? " <u>fija</u>" : "")) + dato("MAC", x.mac) +
      dato("Nombre en la red", escapar(x.host || "")) + dato("Fabricante", escapar(x.fabricante || "")) + dato("Modelo", escapar(x.modelo || "")) +
      dato("Foto", x.icono_auto ? "puesta sola: " + escapar(x.icono_auto.modelo) + " <small>por " + escapar(x.icono_auto.de) + "</small>" : "") +
      (w ? dato("Señal", rdBarras(x) + " " + w.senal + " dBm" + (w.ruido ? " · ruido " + w.ruido : "")) + dato("Canal", w.canal + (w.ancho ? " · " + w.ancho + " MHz" : "")) +
        dato("Estándar", w.gen ? "Wi-Fi " + w.gen : "") + dato("Velocidad del enlace", "↓ " + w.enlace_baja + " · ↑ " + w.enlace_sube + " Mb/s") +
        dato("Conectado hace", vDura(w.conectado)) + dato("Desde que conectó", "↓ " + vBytes(w.total_baja) + " · ↑ " + vBytes(w.total_sube)) : "") +
      dato("Salida a Internet", x.bloqueado ? '<span style="color:var(--nx-bad)">Bloqueada</span>' : "Permitida") +
      dato("Primera vez en la red", vHace(x.primera)) + "</dl>" +
      '<div class="nx-rd-botones"><a class="nx-cfg-btn" href="' + eqEnlace("") + '" data-eq="">Volver al mapa</a>' +
        (x.ip ? '<a class="nx-cfg-btn" target="_blank" rel="noreferrer" href="http://' + escapar(x.ip) + '/">Abrir http://' + escapar(x.ip) + "</a>" : "") + "</div>";
  }

  function eqSitios(d) {
    if (!d.sitios.length) return '<p class="nx-b-nota">Sin sitios con nombre en este periodo.</p>';
    var mayor = d.sitios[0].baja + d.sitios[0].sube || 1;
    return '<ul class="nx-eq-mini sitios">' + d.sitios.slice(0, 14).map(function (s) {
      var t = s.baja + s.sube;
      return "<li>" + eqIco(s) + '<span class="nx-eq-app"><b>' + escapar(s.dominio) + "</b><small>" + escapar(s.sitio ? "sitio web" : s.nombre) + "</small></span>" +
        '<span class="nx-eq-bar"><i style="width:' + Math.max(2, t / mayor * 100).toFixed(1) + '%"></i></span><span class="nx-eq-tot"><b>' + vBytes(t) + "</b></span></li>"; }).join("") + "</ul>";
  }

  function eqDns(d) {
    var q = d.dns;
    if (!q.consultas) return '<p class="nx-b-nota">AdGuard no ha recibido consultas de este equipo en este periodo. Si usa su propio DNS (o pregunta al router por IPv6), no pasa por el filtro con su nombre.</p>';
    var p = q.bloqueadas / q.consultas * 100;
    return '<div class="nx-eq-ahora dns"><div><small>Consultas</small><b>' + q.consultas.toLocaleString("es-ES") + "</b></div><div><small>Bloqueadas</small><b" + (q.bloqueadas ? ' style="color:var(--nx-bad)"' : "") + ">" + q.bloqueadas.toLocaleString("es-ES") + "</b></div>" +
        "<div><small>Filtrado</small><b>" + (p >= 10 ? Math.round(p) : p.toFixed(1).replace(".", ",")) + ' %</b></div></div><div class="nx-eq-filtro"><i style="width:' + Math.min(100, p).toFixed(1) + '%"></i></div>' +
      (q.top.length ? '<h4 class="nx-eq-h4">Lo que más se le bloquea</h4><ul class="nx-eq-doms">' + q.top.slice(0, 8).map(function (t) { return "<li><span>" + escapar(t[0]) + "</span><b>" + t[1].toLocaleString("es-ES") + "</b></li>"; }).join("") + "</ul>" : "") +
      (q.pedidas.length ? '<h4 class="nx-eq-h4">Lo que más pregunta</h4><ul class="nx-eq-doms ap">' + q.pedidas.slice(0, 8).map(function (a) { return "<li>" + eqIco(a) + "<span>" + escapar(a.nombre) + "</span><b>" + a.consultas.toLocaleString("es-ES") + "</b></li>"; }).join("") + "</ul>" : "");
  }

  function eqSenal(d) {
    var x = d.equipo, h = x.historia || [];
    if (!x.wifi) return '<p class="nx-b-nota">' + (x.conexion === "cable" ? "Va por cable: no hay señal que medir." : "No está conectado al wifi.") + "</p>";
    var W = 1000, H = 150, mn = -92, mx = -28, graf = '<p class="nx-b-nota">Reuniendo lecturas…</p>';
    if (h.length > 3) {
      var pts = h.map(function (p, i) { return (i / (h.length - 1) * W).toFixed(1) + "," + (H - (Math.max(mn, Math.min(mx, p[1])) - mn) / (mx - mn) * H).toFixed(1); });
      graf = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none"><rect class="z1" x="0" y="0" width="' + W + '" height="' + ((mx + 60) / (mx - mn) * H).toFixed(1) + '"/><rect class="z3" x="0" y="' + ((mx + 72) / (mx - mn) * H).toFixed(1) + '" width="' + W + '" height="' + (H - (mx + 72) / (mx - mn) * H).toFixed(1) + '"/>' +
        '<polygon class="b" points="0,' + H + " " + pts.join(" ") + " " + W + "," + H + '"/><polyline class="b" points="' + pts.join(" ") + '"/></svg>';
    }
    var min = h.length ? Math.round((h[h.length - 1][0] - h[0][0]) / 60) : 0, pct = rdPct(x);
    return '<div class="nx-eq-ahora"><div><small>Experiencia</small><b class="nx-eq-exp ' + rdNivel(pct) + '">' + pct + " %</b></div><div><small>Señal</small><b>" + x.wifi.senal + ' dBm</b></div>' +
        "<div><small>Banda</small><b>" + (x.wifi.banda === "5" ? "5 GHz" : "2,4 GHz") + "</b></div><div><small>Enlace</small><b>" + x.wifi.enlace_baja + " Mb/s</b></div></div>" +
      '<div class="nx-eq-graf senal"><div class="nx-eq-tope">' + mx + " dBm</div>" + graf + '<div class="nx-eq-eje"><span style="left:0">' + (min ? "hace " + (min >= 60 ? Math.round(min / 6) / 10 + " h" : min + " min") : "") + '</span><span style="left:100%">ahora</span></div></div>';
  }

  function eqHist(d) {
    if (!d.eventos.length) return '<p class="nx-b-nota">Nada apuntado sobre este equipo todavía. Aquí salen sus entradas y salidas de la red y lo que se le cambie en el router.</p>';
    return '<ul class="nx-eq-hist">' + d.eventos.map(function (e) {
      var f = new Date(e.ts * 1000), hoy = new Date().toDateString() === f.toDateString();
      return '<li class="' + escapar(e.nivel || "info") + '"><i></i><span><b>' + escapar(e.t) + "</b>" + (e.d ? "<small>" + escapar(e.d) + "</small>" : "") + "</span><time>" +
        (hoy ? "" : f.toLocaleDateString("es-ES", { day: "numeric", month: "short" }) + " · ") + vHora(e.ts) + "</time></li>"; }).join("") + "</ul>";
  }

  function eqMontar(cuerpo) {
    eq.html = {};
    var sec = document.getElementById("nx-vista");
    if (sec) sec.classList.add("nx-equipo");
    cuerpo.innerHTML =
      '<nav class="nx-eq-miga" aria-label="Dónde estás"><a href="' + eqEnlace("") + '" data-eq="">' + exIco("chevron-left") + "Red</a><span>/</span><b id=\"nx-eq-miga\">Equipo</b></nav>" +
      '<header class="nx-b nx-eq-cab"><span class="nx-rd-ico grande" id="nx-eq-foto"></span><div class="nx-eq-quien"><h1 id="nx-eq-nombre">Cargando…</h1><p id="nx-eq-sub"></p><div class="nx-eq-pildoras" id="nx-eq-pildoras"></div></div>' +
        '<div class="nx-eq-cifras" id="nx-eq-cifras"></div></header>' +
      '<div class="nx-eq-barra"><div class="nx-eq-seg" id="nx-eq-rangos" role="group" aria-label="Periodo">' + EQ_RANGOS.map(function (r) {
          return '<button type="button" data-eqr="' + r[0] + '" title="' + r[2] + '"' + (eq.rango === r[0] ? ' class="on"' : "") + ">" + r[1] + "</button>"; }).join("") + '</div><p id="nx-eq-nota"></p></div>' +
      '<div class="nx-vt-rejilla nx-eq-rej">' +
        '<div class="nx-b nx-f12 nx-eq-b-apps"><h3>Aplicaciones y sitios más usados <div class="nx-eq-seg mini" role="group" aria-label="Agrupar"><button type="button" data-eqa="apps" class="on">Aplicaciones</button><button type="button" data-eqa="cats">Categorías</button></div></h3><div id="nx-eq-apps"></div></div>' +
        '<div class="nx-b nx-f8"><h3>Consumo de datos <span id="nx-eq-uso-t"></span></h3><div id="nx-eq-uso"></div></div>' +
        '<div class="nx-b nx-f4"><h3>Detalles <span>del equipo</span></h3><div id="nx-eq-det"></div></div>' +
        '<div class="nx-b nx-f8"><h3>Actividad en directo <span>última hora · hacia Internet</span></h3><div id="nx-eq-vivo"></div></div>' +
        '<div class="nx-b nx-f4"><h3>Ahora mismo <span>a dónde habla</span></h3><div id="nx-eq-flujos"></div></div>' +
        '<div class="nx-b nx-f6"><h3>Sitios <span>por dominio</span></h3><div id="nx-eq-sitios"></div></div>' +
        '<div class="nx-b nx-f6"><h3>Filtro DNS <span>AdGuard Home</span></h3><div id="nx-eq-dns"></div></div>' +
        '<div class="nx-b nx-f12"><h3>Línea de tiempo <span>cuándo ha estado conectado, por dónde y con qué señal</span></h3><div id="nx-eq-linea"></div></div>' +
        '<div class="nx-b nx-f6"><h3>Wifi <span>señal y experiencia</span></h3><div id="nx-eq-senal"></div></div>' +
        '<div class="nx-b nx-f6"><h3>Historial <span>lo último apuntado</span></h3><div id="nx-eq-hist"></div></div>' +
      "</div>";
    cuerpo.addEventListener("click", function (e) {
      var r = e.target.closest("[data-eqr]"), a = e.target.closest("[data-eqa]");
      if (r) {
        eq.rango = r.dataset.eqr;
        try { localStorage.setItem("nx-eq-rango", eq.rango); } catch (e2) { /* sin almacenamiento */ }
        cuerpo.querySelectorAll("[data-eqr]").forEach(function (b) { b.classList.toggle("on", b === r); });
        cuerpo.classList.add("nx-eq-espera");
        return vLeer();
      }
      if (a) {
        if (a.dataset.eqa === "todo") eq.todo = !eq.todo;
        else { eq.modo = a.dataset.eqa; eq.todo = false; cuerpo.querySelectorAll("[data-eqa='apps'],[data-eqa='cats']").forEach(function (b) { b.classList.toggle("on", b === a); }); }
        vsPintar();
      }
    });
  }

  function eqPintar(d) {
    if (d.error) return eqPon("nx-eq-apps", '<p class="nx-eq-vacio">' + exIco("lan-disconnect") + "<span><b>Ese equipo no está en la red.</b>Vuelve al mapa y elige otro.</span></p>");
    if (d.rango !== eq.rango) return;                 // llego tarde: ya se ha pedido otro periodo
    var x = d.equipo, w = x.wifi, con = RD_CON[x.conexion || ""], cuerpo = document.getElementById("nx-vista-cuerpo");
    if (cuerpo) cuerpo.classList.remove("nx-eq-espera");
    d.nomCat = {};
    d.cats.forEach(function (c) { d.nomCat[c.cat] = c.nombre; });
    document.title = x.nombre + " · Red";
    vTexto("nx-eq-miga", x.nombre);
    vTexto("nx-eq-nombre", x.nombre);
    vTexto("nx-eq-sub", [RD_TIPO[x.tipo], x.fabricante && x.fabricante !== x.nombre ? x.fabricante : "", x.host && x.host !== x.nombre ? x.host : ""].filter(Boolean).join(" · "));
    eqPon("nx-eq-foto", rdIcoHTML(x));
    eqPon("nx-eq-pildoras", '<span class="' + (x.en_linea ? "ok" : "off") + '"><i></i>' + (x.en_linea ? "En línea" : "Desconectado · " + vHace(x.ultima)) + "</span>" +
      (x.conexion ? "<span>" + exIco(con[1]) + con[0] + (w ? " · canal " + w.canal : "") + "</span>" : "") + (x.ip ? "<span>" + escapar(x.ip) + (x.reserva && x.reserva.ip ? " · fija" : "") + "</span>" : "") +
      (x.bloqueado ? '<span class="mal">Sin salida a Internet</span>' : "") + (x.nuevo ? '<span class="nuevo">Nuevo</span>' : ""));
    var pct = rdPct(x), ahora = d.ahora || [0, 0, ""], ult = d.minutos.length ? d.minutos[d.minutos.length - 1] : [0, 0, 0];
    var rg = EQ_RANGOS.filter(function (r) { return r[0] === d.rango; })[0];
    eqPon("nx-eq-cifras",
      (x.en_linea ? '<div><small>Experiencia</small><b class="nx-eq-exp ' + rdNivel(pct) + '">' + pct + " %</b></div>" : "") +
      '<div><small>Bajada ahora</small><b class="b">↓ ' + eqTasa(ult[1]) + '</b></div><div><small>Subida ahora</small><b class="s">↑ ' + eqTasa(ult[2]) + "</b></div>" +
      "<div><small>Consumo · " + rg[1] + "</small><b>" + vBytes(d.total[0] + d.total[1]) + "</b></div>" +
      "<div><small>" + (w ? "Conectado" : "Conexiones") + "</small><b>" + (w ? vDura(w.conectado) : d.vivo.conexiones) + "</b></div>");
    vTexto("nx-eq-nota", rg[2] + " · solo lo que sale a Internet" + (d.fuente.router && d.fuente.adguard ? "" : " · " + (d.fuente.error || "la medida está parada")));
    vTexto("nx-eq-uso-t", d.rango === "24h" ? "por horas" : "por días");
    eqPon("nx-eq-apps", eqApps(d));
    eqPon("nx-eq-uso", eqUso(d));
    eqPon("nx-eq-det", eqDetalles(d));
    eqPon("nx-eq-vivo", eqVivo(d));
    eqPon("nx-eq-flujos", eqFlujos(d));
    eqPon("nx-eq-sitios", eqSitios(d));
    eqPon("nx-eq-dns", eqDns(d));
    eqPon("nx-eq-linea", eqLinea(d));
    eqPon("nx-eq-senal", eqSenal(d));
    eqPon("nx-eq-hist", eqHist(d));
  }

  // ==========================================================================
  // Red · el resumen de toda la red y la respuesta de Internet (09-10-2026).
  // Las cuatro fichas de UniFi (resumen, destinos, equipos y aplicaciones que
  // mas gastan) debajo del mapa, y en la ficha del router lo que tardan en
  // contestar Microsoft, Google y Cloudflare. Datos: centinela
  // /api/red/resumen y el campo «latencia» de /api/red.
  // ==========================================================================
  var RS_LOGO = {
    Microsoft: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="9.5" height="9.5" fill="#F25022"/><rect x="12.5" y="2" width="9.5" height="9.5" fill="#7FBA00"/><rect x="2" y="12.5" width="9.5" height="9.5" fill="#00A4EF"/><rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFB900"/></svg>',
    Google: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.500-.2-2.200H12v4.200h5.900a5 5 0 0 1-2.200 3.300v2.700h3.600c2.100-1.900 3.300-4.800 3.300-8z"/><path fill="#34A853" d="M12 23c3 0 5.500-1 7.300-2.700l-3.600-2.700c-1 .7-2.300 1.100-3.700 1.100-2.900 0-5.300-1.900-6.200-4.500H2.100v2.800A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.800 14.100a6.600 6.600 0 0 1 0-4.200V7.100H2.100a11 11 0 0 0 0 9.800l3.700-2.800z"/><path fill="#EA4335" d="M12 5.400c1.600 0 3.100.6 4.200 1.600l3.200-3.200A11 11 0 0 0 2.100 7.100l3.700 2.800C6.700 7.300 9.100 5.400 12 5.400z"/></svg>',
    Cloudflare: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#F6821F" d="M16.300 17.500H4.700A3.200 3.200 0 0 1 4.300 11.100a4.700 4.700 0 0 1 8.900-1.800 3.500 3.500 0 0 1 4.700 2.600l.4-.000A2.800 2.800 0 0 1 21 14.700a2.800 2.800 0 0 1-2.700 2.800z"/><path fill="#FBAD41" d="M19.200 12.300l-.6.050a.3.3 0 0 0-.3.200l-.3 1.200c-.2.600 0 1.100.4 1.400.300.200.700.300 1.100.300l1.100.050a.200.200 0 0 0 .2-.100 2.700 2.700 0 0 0-1.600-3.100z"/></svg>'
  };
  function rsLatencia(l) {
    if (!l || !l.length) return "";
    return '<div class="nx-rd-lat" aria-label="Lo que tarda en contestar Internet">' + l.map(function (x) {
      var ms = x.ms, c = ms == null ? "m" : ms < 40 ? "b" : ms < 100 ? "r" : "m";
      return '<span class="' + c + '" title="' + escapar(x.nombre) + " · " + escapar(x.host) + (ms == null ? " · no contesta" : " · " + String(ms).replace(".", ",") + " ms en contestar") + '">' +
        (RS_LOGO[x.nombre] || exIco("web")) + "<b>" + (ms == null ? "—" : Math.round(ms) + "<small>ms</small>") + "</b></span>"; }).join("") + "</div>";
  }

  var rs = { datos: null, ts: 0, rango: "24h", mas: {} };
  try { rs.rango = localStorage.getItem("nx-rs-rango") || "24h"; } catch (e) { /* sin almacenamiento */ }
  function rsLeer(ya) {
    if (!ya && Date.now() - rs.ts < 30000) return rsPintar();
    rs.ts = Date.now();
    var pedido = rs.rango;
    fetch(CEN + "/api/red/resumen?rango=" + pedido).then(function (r) { return r.json(); }).then(function (d) {
      if (pedido !== rs.rango || d.error) return;
      rs.datos = d; rsPintar();
    }).catch(function () { /* se reintenta en la siguiente pasada */ });
  }
  // Cada grupo es una tira de fichas (un cuadro con la foto o el icono, el
  // nombre y lo gastado debajo), como los «Top Clients» y «Top Apps» de UniFi.
  // Se ve una fila; «Ver más» enseña el resto.
  function rsTira(clave, titulo, fichas, vacio) {
    var todo = !!rs.mas[clave];
    return '<div class="nx-tp-g"><h3>' + titulo + (fichas.length > 4 ? '<button type="button" class="nx-rs-mas" data-rsm="' + clave + '">' + (todo ? "Ver menos" : "Ver más") + "</button>" : "") + "</h3>" +
      (fichas.length ? '<div class="nx-tp-l' + (todo ? " todo" : "") + '">' + fichas.join("") + "</div>" : '<p class="nx-b-nota">' + vacio + "</p>") + "</div>";
  }
  function rsPintar() {
    var d = rs.datos;
    if (!d || !document.getElementById("nx-rs-cuerpo")) return;
    var total = d.total[0] + d.total[1];
    function pct(a, b) { if (!b) return "0 %"; var p = a / b * 100; return (p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1).replace(".", ",")) + " %"; }
    function fila(ico, nombre, valor, extra) { return "<li" + (extra || "") + ">" + ico + "<span>" + nombre + "</span><b>" + valor + "</b></li>"; }
    function ficha(ico, nombre, valor, titulo) { return '<div class="nx-tp" title="' + titulo + '"><span class="nx-tp-c">' + ico + "</span><b>" + nombre + "</b><small>" + valor + "</small></div>"; }
    var resumen = '<div class="nx-b nx-rs-f"><h3>Resumen</h3><ul class="nx-rs-l res">' +
      fila(exIco("swap-vertical"), "Total", vBytes(total)) +
      fila('<i class="p b"></i>', "Bajada", vBytes(d.total[0])) + fila('<i class="p s"></i>', "Subida", vBytes(d.total[1])) +
      fila('<i class="p ok"></i>', "Conexiones", d.flujos.toLocaleString("es-ES") + " <small>· " + d.abiertas.toLocaleString("es-ES") + " abiertas</small>") +
      fila('<i class="p mal"></i>', "Bloqueadas por DNS", d.bloqueadas.toLocaleString("es-ES") + " <small>(" + pct(d.bloqueadas, d.consultas) + ")</small>") +
      fila('<i class="p av"></i>', "Sin identificar", vBytes(d.sin_identificar) + " <small>(" + pct(d.sin_identificar, total) + ")</small>") + "</ul></div>";
    var clientes = d.clientes.map(function (c) {
      return '<a class="nx-tp cli' + (c.en_linea ? "" : " fuera") + '" href="' + eqEnlace(c.mac) + '" data-eq="' + c.mac + '" title="' + escapar(c.nombre) + " · ↓ " + vBytes(c.baja) + " · ↑ " + vBytes(c.sube) + '">' +
        '<span class="nx-tp-c">' + rdIcoHTML(c) + "</span><b>" + escapar(c.nombre) + "</b><small>" + vBytes(c.baja + c.sube) + "</small></a>"; });
    var apps = d.apps.map(function (a) { return ficha(eqIco(a), escapar(a.nombre), vBytes(a.baja + a.sube), escapar(a.nombre) + " · ↓ " + vBytes(a.baja) + " · ↑ " + vBytes(a.sube) + " · " + pct(a.baja + a.sube, total)); });
    var destinos = d.destinos.map(function (s) { return ficha(eqIco(s), escapar(s.dominio), vBytes(s.baja + s.sube), escapar(s.dominio) + (s.sitio ? "" : " · " + escapar(s.nombre)) + " · ↓ " + vBytes(s.baja) + " · ↑ " + vBytes(s.sube)); });
    vPoner("nx-rs-cuerpo", resumen + '<div class="nx-b nx-rs-f nx-tp-caja">' +
      rsTira("clientes", "Equipos que más gastan", clientes, "Ningún equipo ha movido datos todavía.") +
      rsTira("apps", "Aplicaciones principales", apps, "Sin consumo medido todavía.") +
      rsTira("destinos", "Destinos principales", destinos, "Sin destinos con nombre todavía.") + "</div>");
  }
  document.addEventListener("click", function (e) {
    var r = e.target.closest && e.target.closest("[data-rsr]"), m = e.target.closest && e.target.closest("[data-rsm]");
    if (r) {
      rs.rango = r.dataset.rsr;
      try { localStorage.setItem("nx-rs-rango", rs.rango); } catch (e2) { /* sin almacenamiento */ }
      [].forEach.call(document.querySelectorAll("[data-rsr]"), function (b) { b.classList.toggle("on", b === r); });
      mu.ts = 0; muLeer(); saLeer(true);
      return rsLeer(true);
    }
    if (m) { rs.mas[m.dataset.rsm] = !rs.mas[m.dataset.rsm]; rsPintar(); }
  });

  // ==========================================================================
  // Red · mas de UniFi (10-10-2026).
  //   · El mundo: a que paises va el trafico de casa, con un arco vivo por pais
  //     (centinela /api/red/mundo; las fronteras, de /api/red/mundo/mapa).
  //   · Puertos del router: cada boca, su enlace, lo que mueve y quien cuelga.
  //   · Salud de Internet: disponibilidad, cortes, respuesta y velocidad
  //     (/api/red/salud).
  //   · En la pagina de un equipo, su linea de tiempo (campo «historial»).
  //   · En el mapa, la rama VPN con los equipos de Tailscale que estan fuera.
  //   · En la ventana del router, las copias de su configuracion.
  // ==========================================================================
  var MU_NIVEL = ["", "n1", "n2", "n3", "n4", "n5"];
  var mu = { mapa: null, pidiendo: false, d: null, ts: 0, firma: "", fondo: "" };
  function muPunto(c) { var p = mu.mapa && mu.mapa.paises[c]; return p ? p.c : null; }
  function muArco(a, b) {                 // de casa al pais, combado hacia arriba
    var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, alto = Math.min(120, l * 0.28);
    return "M" + a[0] + "," + a[1] + " Q" + ((a[0] + b[0]) / 2).toFixed(1) + "," + ((a[1] + b[1]) / 2 - alto).toFixed(1) + " " + b[0] + "," + b[1];
  }
  function muLeer() {
    if (!document.getElementById("nx-mu-svg")) return;
    if (!mu.mapa && !mu.pidiendo) {
      mu.pidiendo = true;
      cenJSON("/api/red/mundo/mapa?v=4").then(function (m) { mu.mapa = m; mu.pidiendo = false; mu.firma = mu.fondo = ""; muPintar(); })
        .catch(function () { mu.pidiendo = false; });
    }
    if (Date.now() - mu.ts < 4500) return muPintar();
    mu.ts = Date.now();
    var pedido = rs.rango;
    cenJSON("/api/red/mundo?rango=" + pedido).then(function (d) { if (pedido === rs.rango) { mu.d = d; muPintar(); } }).catch(function () { /* se reintenta */ });
  }
  function muPintar() {
    var svg = document.getElementById("nx-mu-svg"), m = mu.mapa, d = mu.d;
    if (!svg || !m) return;
    if (!svg.firstChild || svg.dataset.hecho !== "1") {
      svg.setAttribute("viewBox", "0 0 " + m.ancho + " " + m.alto);
      var tierra = "";
      Object.keys(m.paises).forEach(function (c) { var p = m.paises[c]; if (p.d) tierra += '<path class="nx-mu-p" data-c="' + c + '" d="' + p.d + '"><title>' + escapar(p.n) + "</title></path>"; });
      svg.innerHTML = '<g id="nx-mu-tierra">' + tierra + '</g><g id="nx-mu-arcos"></g><g id="nx-mu-puntos"></g>';
      svg.dataset.hecho = "1";
      mu.firma = mu.fondo = "";
    }
    if (!d) return;
    // el fondo: cada pais, mas encendido cuanto mas se ha hablado con el en el periodo
    var mayor = 1, acum = {};
    d.paises.forEach(function (p) { acum[p.c] = p.baja + p.sube; if (p.c !== d.casa) mayor = Math.max(mayor, acum[p.c]); });
    var fondo = d.rango + d.paises.map(function (p) { return p.c + Math.round(Math.log(acum[p.c] + 1)); }).join("");
    if (fondo !== mu.fondo) {
      mu.fondo = fondo;
      svg.querySelectorAll(".nx-mu-p").forEach(function (e) {
        var c = e.getAttribute("data-c"), v = acum[c] || 0, t = e.querySelector("title");
        var f = v ? Math.min(1, 0.16 + 0.84 * Math.log(v + 1) / Math.log(mayor + 1)) : 0;
        e.style.setProperty("--f", f.toFixed(3));
        e.classList.toggle("casa", c === d.casa);
        e.classList.toggle("on", v > 0);
        if (t) t.textContent = m.paises[c].n + (v ? " · " + vBytes(v) : "");
      });
    }
    // los arcos: los paises con los que se habla AHORA (los doce que mas)
    var casa = muPunto(d.casa) || [500, 100];
    var vivos = d.paises.filter(function (p) { return p.c && p.c !== d.casa && muPunto(p.c) && trNivel(Math.max(p.ahora[0], p.ahora[1])) > 0; })
      .sort(function (a, b) { return (b.ahora[0] + b.ahora[1]) - (a.ahora[0] + a.ahora[1]); }).slice(0, 12);
    var firma = d.casa + vivos.map(function (p) { return p.c + trNivel(p.ahora[0]) + trNivel(p.ahora[1]); }).join("|");
    if (firma !== mu.firma) {
      mu.firma = firma;
      var arcos = "", puntos = "";
      vivos.forEach(function (p, i) {
        var b = muPunto(p.c), nb = trNivel(p.ahora[0]), ns = trNivel(p.ahora[1]), n = Math.max(nb, ns), id = "nx-mu-a-" + p.c;
        arcos += '<path id="' + id + '" class="nx-mu-arco ' + MU_NIVEL[n] + '" d="' + muArco(casa, b) + '"/>';
        [[nb, "b", ' keyPoints="1;0" keyTimes="0;1" calcMode="linear"'], [ns, "s", ""]].forEach(function (k) {
          for (var j = 0; j < Math.min(4, k[0] + 1) && k[0]; j++) {
            arcos += '<circle r="' + (1.6 + k[0] * 0.28).toFixed(1) + '" class="nx-mu-pt ' + k[1] + " " + MU_NIVEL[k[0]] + '"><animateMotion dur="' + TR_DUR[k[0]] * 1.5 + 's" begin="-' + (j / Math.min(4, k[0] + 1) * TR_DUR[k[0]] * 1.5).toFixed(2) +
              's" repeatCount="indefinite"' + k[2] + '><mpath href="#' + id + '"/></animateMotion></circle>';
          }
        });
        puntos += '<g class="nx-mu-dest ' + MU_NIVEL[n] + '"><circle cx="' + b[0] + '" cy="' + b[1] + '" r="7" class="halo"/><circle cx="' + b[0] + '" cy="' + b[1] + '" r="2.6"/>' +
          (i < 6 ? '<text x="' + (b[0] + 7) + '" y="' + (b[1] - 5) + '">' + escapar(p.nombre) + "</text>" : "") + "<title>" + escapar(p.nombre) + " · ↓ " + eqTasa(p.ahora[0]) + " · ↑ " + eqTasa(p.ahora[1]) + "</title></g>";
      });
      puntos += '<g class="nx-mu-casa"><circle cx="' + casa[0] + '" cy="' + casa[1] + '" r="5" class="onda"/><circle cx="' + casa[0] + '" cy="' + casa[1] + '" r="5" class="onda dos"/><circle cx="' + casa[0] + '" cy="' + casa[1] + '" r="3.4"/><title>Casa</title></g>';
      document.getElementById("nx-mu-arcos").innerHTML = arcos;
      document.getElementById("nx-mu-puntos").innerHTML = puntos;
    }
    var total = d.total[0] + d.total[1], fuera = 0, nPaises = 0;
    d.paises.forEach(function (p) { if (p.c && p.c !== d.casa) { fuera += p.baja + p.sube; if (p.baja + p.sube) nPaises++; } });
    vPoner("nx-mu-cifras", '<div><small>Países</small><b>' + nPaises + '</b></div><div><small>Fuera de ' + escapar((m.paises[d.casa] || {}).n || "casa") + '</small><b>' + eqPct(fuera, total) + "</b></div>" +
      "<div><small>Hablando ahora con</small><b>" + vivos.length + (vivos.length === 1 ? " país" : " países") + "</b></div>");
    var mayorL = d.paises.length ? d.paises[0].baja + d.paises[0].sube || 1 : 1;
    vPoner("nx-mu-paises", d.paises.length ? '<ul class="nx-mu-l">' + d.paises.slice(0, mu.todo ? 40 : 6).map(function (p) {
      var t = p.baja + p.sube, viva = trNivel(Math.max(p.ahora[0], p.ahora[1]));
      return '<li title="↓ ' + vBytes(p.baja) + " · ↑ " + vBytes(p.sube) + '"><i class="nx-mu-cod' + (p.c === d.casa ? " casa" : "") + '">' + escapar(p.c || "?") + "</i><span><b>" + escapar(p.nombre) + "</b>" +
        '<u><s style="width:' + Math.max(2, t / mayorL * 100).toFixed(1) + '%"></s></u></span><em>' + vBytes(t) + (viva ? '<small class="' + MU_NIVEL[viva] + '">↓ ' + eqTasa(p.ahora[0]) + "</small>" : "<small>" + eqPct(t, total) + "</small>") + "</em></li>"; }).join("") + "</ul>" +
      (d.paises.length > 6 ? '<button type="button" class="nx-rs-mas" data-mu="todo">' + (mu.todo ? "Ver menos" : "Ver los " + d.paises.length) + "</button>" : "")
      : '<p class="nx-b-nota">' + (d.geo ? "Todavía no hay tráfico medido en este periodo." : "Bajando la tabla de países…") + "</p>");
    var fl = d.flujos.filter(function (f) { return f.baja + f.sube > 250; }).slice(0, 6);
    vPoner("nx-mu-flujos", fl.length ? '<ul class="nx-mu-fl">' + fl.map(function (f) {
      return '<li><a href="' + eqEnlace(f.mac) + '" data-eq="' + f.mac + '" title="' + escapar(f.equipo) + '"><span class="nx-rd-ico">' + rdIcoHTML({ mac: f.mac, icono: f.ico_eq, nombre: f.equipo, tipo: f.tipo }) + "</span></a>" + eqIco(f) +
        '<span class="nx-eq-app"><b>' + escapar(f.destino) + "</b><small>" + escapar(f.equipo) + " → " + escapar(f.nombre) + "</small></span>" +
        '<i class="nx-mu-cod" title="' + escapar(f.pais_n) + '">' + escapar(f.pais || "?") + '</i><span class="nx-eq-bs"><em class="b">↓ ' + eqTasa(f.baja) + '</em><em class="s">↑ ' + eqTasa(f.sube) + "</em></span></li>"; }).join("") + "</ul>"
      : '<p class="nx-b-nota">Ahora mismo nadie mueve datos hacia Internet.</p>');
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-mu]");
    if (b) { mu.todo = !mu.todo; muPintar(); }
  });

  // ------------------------------------------------------------ los puertos del router
  function ptPintar(d) {
    var caja = document.getElementById("nx-pt");
    if (!caja) return;
    var m = (d.router || {}).mas || {}, puertos = m.puertos || [], t = tr.d || { puertos: {}, wan: [0, 0] };
    if (!puertos.length) return vPoner("nx-pt", '<p class="nx-b-nota">El router todavía no ha dicho qué puertos tiene.</p>');
    var vivos = (d.dispositivos || []).filter(function (x) { return x.en_linea && x.conexion === "cable" && x.tipo !== "router"; });
    var hay = {}, col = puertos.length > 6 ? Math.ceil(puertos.length / 2) : puertos.length;
    var h = '<div class="nx-pt-cab"><div class="nx-pt-bocas" style="--col:' + col + '">' + puertos.map(function (p) {
      var wan = p.nombre === "wan", v = wan ? t.wan : t.puertos[p.nombre], n = v ? Math.max(trNivel(v[0]), trNivel(v[1])) : 0;
      var vel = !p.enlace ? "off" : p.velocidad >= 10000 ? "v10g" : p.velocidad >= 2500 ? "v25" : p.velocidad >= 1000 ? "v1g" : "v100";
      hay[vel] = 1;
      return '<i class="nx-pt-boca ' + vel + (n ? " " + MU_NIVEL[n] : "") + '" title="' + escapar(p.nombre.toUpperCase()) + (p.enlace ? " · " + p.velocidad + " Mb/s" + (p.duplex === "medio" ? " · medio dúplex" : "") : " · sin cable") + '">' +
        (wan ? '<svg viewBox="0 0 16 16" aria-label="WAN"><path d="M3.5 10.2 8 5.8l4.5 4.4"/></svg>' : escapar(p.nombre.replace(/^lan/, ""))) + "</i>"; }).join("") + "</div>" +
      '<ul class="nx-pt-ley">' + [["v10g", "10 GbE"], ["v25", "2,5 GbE"], ["v1g", "GbE"], ["v100", "100 Mb"], ["off", "Sin cable"]].filter(function (x) { return hay[x[0]] || x[0] === "v1g" || x[0] === "off"; }).map(function (x) {
        return '<li><i class="nx-pt-boca ' + x[0] + '"></i>' + x[1] + "</li>"; }).join("") + "</ul></div>";
    h += '<ul class="nx-pt-l">' + puertos.map(function (p) {
      var wan = p.nombre === "wan", v = wan ? t.wan : t.puertos[p.nombre], suyos = vivos.filter(function (x) { return (x.puerto || x.puerto_auto) === p.nombre; });
      var n = v ? Math.max(trNivel(v[0]), trNivel(v[1])) : 0;
      var vel = !p.enlace ? "sin cable" : p.velocidad >= 1000 ? String(p.velocidad / 1000).replace(".", ",") + " GbE" : (p.velocidad || "?") + " Mb";
      return '<li class="' + (p.enlace ? "on" : "off") + '"><i class="nx-pt-n' + (wan ? " wan" : "") + (n ? " " + MU_NIVEL[n] : "") + '">' + (wan ? "WAN" : p.nombre.replace(/^lan/, "")) + "</i>" +
        '<span class="nx-pt-q"><b>' + (wan ? "Internet" + ((m.internet || {}).proto ? " · " + escapar(m.internet.proto) : "") : suyos.length ? suyos.slice(0, 5).map(function (x) {
          return '<a href="' + eqEnlace(x.mac) + '" data-eq="' + x.mac + '" title="' + escapar(x.nombre) + '"><span class="nx-rd-ico">' + rdIcoHTML(x) + "</span></a>"; }).join("") +
          '<span class="nom">' + (suyos.length === 1 ? escapar(suyos[0].nombre) : suyos.length + " equipos · detrás de un switch") + "</span>" : p.enlace ? "Algo conectado, sin identificar" : "Libre") + "</b>" +
          "<small>" + vel + (p.enlace ? " · ↓ " + vBytes(wan ? p.rx : p.tx) + " · ↑ " + vBytes(wan ? p.tx : p.rx) + " desde que arrancó" : "") + (p.errores ? ' · <u class="a">' + p.errores + " errores</u>" : "") + "</small></span>" +
        '<span class="nx-eq-bs">' + (v && p.enlace ? '<em class="b">↓ ' + eqTasa(v[0]) + '</em><em class="s">↑ ' + eqTasa(v[1]) + "</em>" : "") + "</span></li>"; }).join("") + "</ul>";
    vPoner("nx-pt", h);
  }

  // ------------------------------------------------------------ la salud de Internet
  var sa = { d: null, ts: 0 };
  function saLeer(ya) {
    if (!document.getElementById("nx-sa")) return;
    if (!ya && Date.now() - sa.ts < 30000) return;
    sa.ts = Date.now();
    var pedido = rs.rango;
    cenJSON("/api/red/salud?rango=" + pedido).then(function (d) { if (pedido === rs.rango) { sa.d = d; saPintar(); } }).catch(function () { /* se reintenta */ });
  }
  function saCuando(ts, rango) {
    var f = new Date(ts * 1000), hoy = new Date().toDateString() === f.toDateString();
    return (hoy && rango === "24h" ? "" : f.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }) + " · ") + vHora(ts);
  }
  function saPintar() {
    var d = sa.d;
    if (!d || !document.getElementById("nx-sa")) return;
    var s = d.serie, n = s.length, W = 1000, H = 120, mx = 40;
    s.forEach(function (p) { if (p[1] != null) mx = Math.max(mx, p[1]); });
    mx = Math.ceil(mx / 20) * 20;
    // la tira: un tramo por cubo. Verde bien, ambar con perdidas, rojo caido, gris sin datos
    var tira = "", pts = [], trozos = [];
    s.forEach(function (p, i) {
      var c = !p[3] ? "nd" : p[2] >= 50 ? "mal" : p[2] > 0 ? "av" : "ok";
      tira += '<i class="' + c + '" title="' + saCuando(p[0], d.rango) + (c === "nd" ? " · sin datos (el servidor no medía)" : c === "ok" ? " · sin fallos · " + String(p[1]).replace(".", ",") + " ms" : " · " + String(p[2]).replace(".", ",") + " % de las medidas sin respuesta") + '"></i>';
      if (p[1] == null) { if (pts.length) { trozos.push(pts); pts = []; } return; }
      pts.push(((i + 0.5) / n * W).toFixed(1) + "," + (H - 4 - p[1] / mx * (H - 12)).toFixed(1));
    });
    if (pts.length) trozos.push(pts);
    var graf = trozos.map(function (t) { return t.length > 1 ? '<polyline class="b" points="' + t.join(" ") + '"/>' : '<circle class="b" r="2" cx="' + t[0].split(",")[0] + '" cy="' + t[0].split(",")[1] + '"/>'; }).join("");
    var disp = d.disponibilidad, cls = d.caido ? "mal" : disp == null ? "" : disp >= 99.9 ? "ok" : disp >= 99 ? "av" : "mal";
    var ahora = (d.ahora || []).filter(function (x) { return x.ms != null; }), msAhora = ahora.length ? ahora.reduce(function (a, x) { return a + x.ms; }, 0) / ahora.length : null;
    var vel = d.velocidad || [], uv = vel.length ? vel[vel.length - 1] : null;
    var h = '<div class="nx-sa-estado ' + cls + '"><span class="luz"></span><div><b>' + (d.caido ? "Sin conexión a Internet" : "Internet funciona") + "</b><small>" +
        (d.linea && d.linea.desde != null ? escapar(d.linea.proto || "Sesión") + " abierta hace " + vDura(d.linea.desde) : "") + "</small></div></div>" +
      '<div class="nx-eq-ahora"><div><small>Disponibilidad</small><b class="nx-sa-' + cls + '">' + (disp == null ? "—" : (disp >= 100 ? "100" : disp.toFixed(disp >= 99.9 ? 3 : 2).replace(".", ",")) + " %") + "</b></div>" +
        "<div><small>Cortes</small><b>" + d.cortes + (d.caido_s ? " <small>· " + vDura(d.caido_s) + "</small>" : "") + "</b></div>" +
        "<div><small>Reconexiones</small><b>" + d.reconexiones + "</b></div>" +
        "<div><small>Respuesta ahora</small><b>" + (msAhora == null ? "—" : Math.round(msAhora) + " ms") + "</b></div>" +
        (uv ? "<div><small>Última prueba</small><b>↓ " + mbps(uv[1]) + " · ↑ " + mbps(uv[2]) + "</b></div>" : "") + "</div>" +
      '<div class="nx-sa-tira" style="--n:' + n + '">' + tira + "</div>" +
      '<div class="nx-eq-graf nx-sa-graf"><div class="nx-eq-tope">' + mx + " ms</div><svg viewBox=\"0 0 " + W + " " + H + '" preserveAspectRatio="none"><line x1="0" x2="' + W + '" y1="8" y2="8"/><line x1="0" x2="' + W + '" y1="' + (H / 2 + 2) + '" y2="' + (H / 2 + 2) + '"/>' + graf + "</svg>" +
        '<div class="nx-eq-eje"><span style="left:0">' + saCuando(d.ini, d.rango) + '</span><span style="left:50%">' + saCuando((d.ini + d.fin) / 2, d.rango) + '</span><span style="left:100%">ahora</span></div></div>';
    if (vel.length > 1) {
      var vm = 1;
      vel.forEach(function (v) { vm = Math.max(vm, v[1] || 0, v[2] || 0); });
      h += '<div class="nx-sa-vel" title="Pruebas de velocidad del periodo">' + vel.slice(-40).map(function (v) {
        return '<span title="' + saCuando(v[0], d.rango) + " · ↓ " + mbps(v[1]) + " · ↑ " + mbps(v[2]) + ' Mbps"><i class="b" style="height:' + ((v[1] || 0) / vm * 100).toFixed(0) + '%"></i><i class="s" style="height:' + ((v[2] || 0) / vm * 100).toFixed(0) + '%"></i></span>'; }).join("") +
        "<small>pruebas de velocidad · tope " + mbps(vm) + " Mbps</small></div>";
    }
    var SU = { corte: ["mal", "Corte de Internet"], reconexion: ["aviso", "El router volvió a conectar"], ip: ["info", "Cambio de IP pública"] };
    h += d.sucesos.length ? '<ul class="nx-eq-hist nx-sa-suc">' + d.sucesos.slice(0, 8).map(function (x) {
      var k = SU[x.tipo] || ["info", x.tipo];
      return '<li class="' + k[0] + '"><i></i><span><b>' + k[1] + (x.tipo === "corte" ? " · " + (x.fin ? vDura(x.fin - x.ts) : "sigue caído") : "") + "</b>" + (x.d ? "<small>" + escapar(x.d) + "</small>" : "") + "</span><time>" + saCuando(x.ts, "x") + "</time></li>"; }).join("") + "</ul>"
      : '<p class="nx-b-nota nx-sa-nada">Sin cortes ni reconexiones en este periodo' + (d.cobertura < 90 ? " (hay medidas del " + d.cobertura + " % del tiempo: se empezó a medir el 10 de octubre)" : "") + ".</p>";
    vPoner("nx-sa", h);
  }

  // ------------------------------------------------------------ la linea de tiempo de un equipo
  var HI_CON = { "5": ["5 GHz", "a"], "2": ["2,4 GHz", "b"], c: ["Cable", "c"], i: ["Invitados", "d"], "": ["Desconectado", "off"] };
  function eqLinea(d) {
    var h = d.historial;
    if (!h) return "";
    var ini = h.ini, fin = h.fin, dur = fin - ini;
    if (!h.puntos.length && !h.cambios.length) {
      return '<p class="nx-b-nota">Todavía no hay historial de este equipo en este periodo. Se apunta desde el ' +
        new Date(h.desde + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" }) + ": cada cinco minutos, por dónde está conectado y con qué señal.</p>";
    }
    var tira = h.tramos.map(function (t) {
      var a = Math.max(ini, t[0]), b = Math.min(fin, t[1]), k = HI_CON[t[2]] || HI_CON[""];
      return b > a ? '<i class="' + k[1] + '" style="left:' + ((a - ini) / dur * 100).toFixed(2) + "%;width:" + Math.max(0.25, (b - a) / dur * 100).toFixed(2) + '%" title="' + k[0] + " · " + saCuando(a, d.rango) + " → " + vHora(b) + " (" + vDura(b - a) + ')"></i>' : ""; }).join("");
    var W = 1000, H = 110, mn = -92, mx = -28, trozos = [], pts = [], ant = 0;
    h.puntos.forEach(function (p) {
      if (p[1] == null || (ant && p[0] - ant > h.paso * 2.5)) { if (pts.length) { trozos.push(pts); pts = []; } }
      if (p[1] != null) { pts.push(((p[0] - ini) / dur * W).toFixed(1) + "," + (H - (Math.max(mn, Math.min(mx, p[1])) - mn) / (mx - mn) * H).toFixed(1)); ant = p[0]; }
    });
    if (pts.length) trozos.push(pts);
    var graf = trozos.length ? '<div class="nx-eq-graf senal nx-hi-graf"><div class="nx-eq-tope">' + mx + ' dBm</div><svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">' +
      '<rect class="z1" x="0" y="0" width="' + W + '" height="' + ((mx + 60) / (mx - mn) * H).toFixed(1) + '"/><rect class="z3" x="0" y="' + ((mx + 72) / (mx - mn) * H).toFixed(1) + '" width="' + W + '" height="' + (H - (mx + 72) / (mx - mn) * H).toFixed(1) + '"/>' +
      trozos.map(function (t) { return t.length > 1 ? '<polyline class="b" points="' + t.join(" ") + '"/>' : ""; }).join("") + "</svg></div>" : "";
    var usadas = {};
    h.tramos.forEach(function (t) { usadas[t[2]] = (usadas[t[2]] || 0) + Math.min(fin, t[1]) - Math.max(ini, t[0]); });
    var ley = Object.keys(usadas).sort(function (a, b) { return usadas[b] - usadas[a]; }).map(function (k) { var c = HI_CON[k] || HI_CON[""]; return '<span><i class="' + c[1] + '"></i>' + c[0] + " · " + vDura(usadas[k]) + "</span>"; }).join("");
    var cambios = h.cambios.slice(0, 10).map(function (c) {
      var a = HI_CON[c[1]] || HI_CON[""], b = HI_CON[c[2]] || HI_CON[""];
      var t = !c[2] ? "Se conectó · " + a[0] : !c[1] ? "Se desconectó" : "Pasó de " + b[0] + " a " + a[0];
      return '<li class="' + (!c[1] ? "aviso" : !c[2] ? "bien" : "info") + '"><i></i><span><b>' + t + "</b></span><time>" + saCuando(c[0], d.rango) + "</time></li>"; }).join("");
    return '<div class="nx-eq-ahora"><div><small>En línea</small><b>' + (h.en_linea == null ? "—" : String(Math.min(100, h.en_linea)).replace(".", ",") + " %") + "</b></div>" +
        "<div><small>Cambios</small><b>" + h.cambios.length + '</b></div></div><div class="nx-hi-tira">' + tira + "</div>" + graf +
      '<div class="nx-eq-eje nx-hi-eje"><span style="left:0">' + saCuando(ini, d.rango) + '</span><span style="left:50%">' + saCuando((ini + fin) / 2, d.rango) + '</span><span style="left:100%">ahora</span></div>' +
      '<div class="nx-eq-ley nx-hi-ley">' + ley + "</div>" + (cambios ? '<ul class="nx-eq-hist">' + cambios + "</ul>" : "");
  }

  // ------------------------------------------------------------ la VPN en el mapa
  // Los equipos de Tailscale que estan fuera de casa entran como una rama mas.
  // No son equipos de la red (no tienen MAC ni ficha): solo se ven.
  var VPN_SO = { iOS: "movil", android: "movil", macOS: "pc", windows: "pc", linux: "servidor", tvOS: "tv" };
  function vpnNodos(d) {
    return (d.vpn || []).filter(function (n) { return !n.yo && !n.en_casa; }).map(function (n) {
      return { mac: "VPN" + String(n.id).replace(/[^A-Za-z0-9]/g, ""), vpn: n, nombre: n.nombre, host: "", fabricante: "", ip: n.ip, tipo: VPN_SO[n.so] || VPN_SO[String(n.so).toLowerCase()] || "desconocido",
        en_linea: n.en_linea, ultima: n.visto, conexion: "vpn", icono: "" };
    });
  }
  function vpnAviso(mac) {
    var x = vpnNodos(vs.datos || {}).filter(function (y) { return y.mac === mac; })[0];
    if (!x) return;
    ps5Aviso(x.nombre + " · " + (x.en_linea ? (x.vpn.directo ? "conectado directo" : "conectado por relé" + (x.vpn.rele ? " (" + x.vpn.rele + ")" : "")) + " · " + x.ip : "desconectado · visto " + vHace(x.ultima)));
  }

  // ------------------------------------------------------------ copias de la configuracion del router
  var cp = { d: null, ts: 0, abierta: "", dif: {} };
  function cpLeer(ya) {
    if (!document.getElementById("nx-cp")) return;
    if (!ya && Date.now() - cp.ts < 20000) return cpPintar();
    cp.ts = Date.now();
    cenJSON("/api/router/copias").then(function (d) { cp.d = d; cpPintar(); }).catch(function () { /* se reintenta */ });
  }
  function cpFecha(ts) { return new Date(ts * 1000).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }) + " · " + vHora(ts); }
  function cpDif(id) {
    var d = cp.dif[id];
    if (!d) return '<p class="nx-b-nota">Leyendo la copia…</p>';
    if (d.error) return '<p class="nx-b-nota">' + escapar(d.error) + "</p>";
    if (!d.anterior) return '<p class="nx-b-nota">Es la primera copia: no hay otra anterior con la que compararla. Lleva ' + d.ficheros.length + " ficheros de configuración (" + d.ficheros.map(escapar).join(", ") + ").</p>";
    if (!d.difs.length) return '<p class="nx-b-nota">Igual que la copia anterior.</p>';
    return d.difs.map(function (f) {
      return '<div class="nx-cp-f"><h5>' + escapar(f.fichero) + " <small>" + f.estado + '</small></h5><pre>' + f.lineas.map(function (l) {
        var c = l[0] === "+" ? "mas" : l[0] === "-" ? "menos" : l[0] === "@" ? "sitio" : "";
        return "<span" + (c ? ' class="' + c + '"' : "") + ">" + escapar(l) + "</span>"; }).join("") + "</pre></div>"; }).join("");
  }
  function cpPintar() {
    var d = cp.d;
    if (!d || !document.getElementById("nx-cp")) return;
    var h = '<div class="nx-cp-cab"><p>' + (d.copias.length ? d.copias.length + (d.copias.length === 1 ? " copia guardada" : " copias guardadas") + " · se mira cada 6 horas y se guarda una nueva solo si algo ha cambiado" +
        (d.comprobada ? " · última comprobación " + vHace(d.comprobada) : "") : "Todavía no hay ninguna copia.") + (d.error ? ' <u class="a">' + escapar(d.error) + "</u>" : "") + "</p>" +
      '<button type="button" class="nx-cfg-btn" data-cp="ahora">Copiar ahora</button></div>';
    h += '<ul class="nx-cp-l">' + d.copias.map(function (c, i) {
      var ab = cp.abierta === c.id;
      return '<li class="' + (ab ? "ab" : "") + '"><button type="button" class="nx-cp-fila" data-cp="ver:' + c.id + '" aria-expanded="' + ab + '"><i></i><span><b>' + cpFecha(c.ts) + "</b><small>" +
        (c.cambios.length ? escapar(c.cambios.join(", ")) + ' · <u class="mas">+' + c.mas + '</u> <u class="menos">−' + c.menos + "</u>" : i === d.copias.length - 1 ? "primera copia · " + c.ficheros + " ficheros" : "sin cambios") +
        " · " + (c.motivo === "a mano" ? "a mano" : "automática") + "</small></span><em>" + vBytes(c.tam) + "</em></button>" +
        (ab ? '<div class="nx-cp-det">' + cpDif(c.id) + '<div class="nx-rd-botones"><button type="button" class="nx-cfg-btn" data-cp="bajar:' + c.id + '">Descargar esta copia (.tar.gz)</button>' +
          "<small>Se restaura desde el panel del router: Sistema → Copia de seguridad. Lleva dentro las claves del wifi y del operador.</small></div></div>" : "") + "</li>"; }).join("") + "</ul>";
    vPoner("nx-cp", h);
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-cp]");
    if (!b) return;
    var v = b.dataset.cp;
    if (v === "ahora") {
      return conSesion("Hacer una copia de la configuración del router").then(function (si) {
        if (!si) return;
        b.disabled = true;
        cenOrden("/api/router/copiar", {}).then(function () { ps5Aviso("Copia hecha"); cpLeer(true); }).catch(function (er) { ps5Aviso(er.sesion ? "Hace falta entrar con la contraseña de CasaFi" : "No se ha podido copiar: " + er.message, true); })
          .then(function () { b.disabled = false; });
      });
    }
    var id = v.split(":")[1];
    if (v.indexOf("ver:") === 0) {
      cp.abierta = cp.abierta === id ? "" : id;
      if (cp.abierta && !cp.dif[id]) cenJSON("/api/router/copia?id=" + id).then(function (d) { cp.dif[id] = d; cpPintar(); }).catch(function (er) { cp.dif[id] = { error: "No se ha podido leer: " + er.message }; cpPintar(); });
      return cpPintar();
    }
    if (v.indexOf("bajar:") === 0) {
      conSesion("Descargar una copia del router (lleva sus claves)").then(function (si) {
        if (!si) return;
        fetch(CEN + "/api/router/copia/descargar?id=" + id, { credentials: "include" }).then(function (r) { if (!r.ok) throw new Error("sin permiso"); return r.blob(); }).then(function (bl) {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(bl); a.download = "router-" + id + ".tar.gz";
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        }).catch(function () { ps5Aviso("No se ha podido descargar la copia", true); });
      });
    }
  });

  // ==========================================================================
  // Red · ajustes al estilo UniFi (28-10-2026).
  //
  // Lo que UniFi tiene en «Ajustes»: redes con VLAN, wifi y radios, puertos
  // (qué red va por cada boca), cortafuegos por zonas con su matriz, reglas,
  // reenvío de puertos, rutas, DNS local, IP fijas y el propio router
  // (sistema, registro, reinicio). Vive dentro de la pestana Red: la
  // direccion lleva «?ajustes=<seccion>», como la pagina de un equipo.
  // Los datos son de centinela /api/router/ajustes; los cambios van a
  // POST /api/router/ajustes {que: …} y piden la sesion de mantenimiento
  // (vOrden ya la pide si falta). El router aplica cada cambio con vuelta
  // atras: si deja de contestar, lo deshace solo.
  // ==========================================================================
  var AX_SECS = [
    ["redes", "Redes", "lan", "VLAN, direcciones y DHCP"],
    ["wifi", "WiFi", "wifi", "Nombres, contraseñas y radios"],
    ["internet", "Internet", "web", "La línea, IPv6 y MTU"],
    ["vpn", "VPN", "vpn", "Tailscale: entrar desde fuera"],
    ["puertos", "Puertos", "ethernet", "Qué red va por cada boca"],
    ["cortafuegos", "Cortafuegos", "shield-half-full", "Quién puede hablar con quién"],
    ["trafico", "Reglas de tráfico", "traffic-light-outline", "Bloquear apps y filtrar contenido"],
    ["reenvios", "Reenvío de puertos", "arrow-decision-outline", "Abrir puertos a Internet"],
    ["rutas", "Rutas", "routes", "Rutas estáticas"],
    ["dns", "DNS local", "dns-outline", "Nombres propios en casa"],
    ["fijas", "IP fijas", "pin-outline", "Reservas del DHCP"],
    ["router", "Router", "router-wireless", "Sistema, registro y reinicio"]
  ];
  var AX_ZONA = { lan: "Casa", wan: "Internet", guest: "Invitados" };
  var AX_PLAZOS = [["30m", "30 minutos"], ["1h", "1 hora"], ["2h", "2 horas"], ["4h", "4 horas"], ["12h", "12 horas"], ["1d", "1 día"], ["7d", "1 semana"]];
  var ax = { d: null, eq: null, eqTs: 0, sis: false, reg: null, regF: "" };

  function axSec() {
    var m = /[?&]ajustes=([a-z]+)(&|$)/.exec(location.search);
    return m ? (AX_SECS.some(function (s) { return s[0] === m[1]; }) ? m[1] : "redes") : "";
  }
  function axIr(sec) {
    try { history.pushState({ nx: 1 }, "", location.pathname + (sec ? "?ajustes=" + sec : "") + (location.hash || "#red")); } catch (e) { /* sin historial */ }
    if (sec && vs.tab === "Red" && document.getElementById("nx-ax")) { axPintar(ax.d); var c = document.getElementById("inner_wrapper"); if (c) c.scrollTop = 0; return; }
    eqCambio();
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-axir]");
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault();
    axIr(a.dataset.axir);
  });

  // los equipos (para poner nombre a las IP y elegir equipo en los formularios)
  function axEquipos() {
    if (Date.now() - ax.eqTs < 60000) return;
    ax.eqTs = Date.now();
    cenJSON("/api/red").then(function (d) { ax.eq = d.dispositivos || []; if (ax.d) axPintar(ax.d); }).catch(function () { ax.eqTs = 0; });
  }
  function axQuien(ip) {
    var x = (ax.eq || []).filter(function (y) { return y.ip === ip; })[0];
    return x ? x.nombre : "";
  }
  function axZona(z) {
    if (AX_ZONA[z]) return AX_ZONA[z];
    var r = ((ax.d || {}).redes || []).filter(function (x) { return x.zona === z; })[0];
    return r ? r.nombre : z;
  }
  function axRedNombre(id) { var r = ((ax.d || {}).redes || []).filter(function (x) { return x.id === id; })[0]; return r ? r.nombre : id; }
  function axVlanNombre(v) { var r = ((ax.d || {}).redes || []).filter(function (x) { return x.vlan === v; })[0]; return r ? r.nombre : "VLAN " + v; }
  function axChip(t, cls) { return '<span class="nx-ax-chip' + (cls ? " " + cls : "") + '">' + t + "</span>"; }
  function axVacio(t) { return '<div class="nx-ax-vacio">' + t + "</div>"; }
  function axBanda(b) { return b === "5g" ? "5 GHz" : b === "2g" ? "2,4 GHz" : b; }

  // ------------------------------------------------------------ el armazon
  function axMontar(cuerpo) {
    cuerpo.innerHTML = '<div id="nx-ax"><nav class="nx-ax-nav" aria-label="Secciones de los ajustes">' +
      '<a class="nx-ax-volver" href="' + location.pathname + '#red" data-axir="">' + exIco("arrow-left") + "Mapa de la red</a>" +
      AX_SECS.map(function (s) {
        return '<a href="?ajustes=' + s[0] + '#red" data-axir="' + s[0] + '" data-axs="' + s[0] + '">' + exIco(s[2]) + "<span><b>" + s[1] + "</b><small>" + s[3] + "</small></span></a>";
      }).join("") + '</nav><div class="nx-ax-cuerpo"><header class="nx-ax-cab"><h2 id="nx-ax-tit"></h2><div class="nx-ax-herr" id="nx-ax-herr"></div></header><div id="nx-ax-sec"></div></div></div>';
    vTexto("nx-vista-sub", "Ajustes de red · se aplican de verdad en el router");
    axEquipos();
  }
  function axPintar(d) {
    if (!d || !document.getElementById("nx-ax")) return;
    ax.d = d;
    axEquipos();
    var sec = axSec() || "redes", s = AX_SECS.filter(function (x) { return x[0] === sec; })[0];
    document.querySelectorAll("#nx-ax [data-axs]").forEach(function (a) { a.classList.toggle("on", a.dataset.axs === sec); });
    vTexto("nx-ax-tit", s[1]);
    vTexto("nx-vista-sub", "Ajustes de red · " + (d.sistema && d.sistema.modelo ? d.sistema.modelo + " · OpenWrt " + (d.sistema.version || "") : "router") + " · se aplican de verdad");
    var f = AX_PINTAR[sec];
    vPoner("nx-ax-herr", f.herr ? f.herr(d) : "");
    vPoner("nx-ax-sec", f.cuerpo(d));
    if (f.despues) f.despues(d);
  }

  // ------------------------------------------------------------ formularios
  // campos: [{k, t: texto|numero|clave|lista|llave|varias|area|nota, l, v, o: [[valor, texto]], ayuda, des, ph}]
  function axCampo(c) {
    var id = "nx-axf-" + c.k, ayuda = c.ayuda ? "<small>" + c.ayuda + "</small>" : "", dis = c.des ? " disabled" : "";
    if (c.t === "nota") return '<p class="nx-ax-nota">' + c.l + "</p>";
    if (c.t === "apps") return axApps(c);
    if (c.t === "llave") {
      return '<label class="nx-ax-llave"><span><b>' + c.l + "</b>" + ayuda + '</span><input type="checkbox" data-k="' + c.k + '"' + (c.v ? " checked" : "") + dis + "><i></i></label>";
    }
    var ctl;
    if (c.t === "lista") {
      ctl = '<select id="' + id + '" class="nx-ps5-sel" data-k="' + c.k + '"' + dis + ">" + c.o.map(function (o) {
        return '<option value="' + escapar(String(o[0])) + '"' + (String(o[0]) === String(c.v) ? " selected" : "") + ">" + escapar(o[1]) + "</option>"; }).join("") + "</select>";
    } else if (c.t === "varias") {
      ctl = '<div class="nx-ax-varias" data-k="' + c.k + '" data-varias="1">' + c.o.map(function (o) {
        return '<label><input type="checkbox" value="' + escapar(String(o[0])) + '"' + ((c.v || []).map(String).indexOf(String(o[0])) >= 0 ? " checked" : "") + dis + "><span>" + escapar(o[1]) + "</span></label>"; }).join("") + "</div>";
    } else if (c.t === "area") {
      ctl = '<textarea id="' + id + '" data-k="' + c.k + '" rows="3" spellcheck="false" placeholder="' + escapar(c.ph || "") + '"' + dis + ">" + escapar(c.v || "") + "</textarea>";
    } else {
      ctl = '<div class="nx-ax-in"><input id="' + id + '" data-k="' + c.k + '" type="' + (c.t === "clave" ? "password" : "text") + '"' + (c.t === "numero" ? ' inputmode="numeric"' : "") +
        ' value="' + escapar(c.v == null ? "" : String(c.v)) + '" placeholder="' + escapar(c.ph || "") + '" autocomplete="off" spellcheck="false"' + (c.lista ? ' list="' + c.lista + '"' : "") + dis + ">" +
        (c.t === "clave" ? '<button type="button" class="nx-ax-ojo" data-axojo="' + id + '" title="Ver u ocultar">' + exIco("eye-outline") + "</button>" : "") + (c.pre ? "<em>" + c.pre + "</em>" : "") + "</div>";
    }
    return '<label class="nx-ax-f' + (c.ancho ? " ancho" : "") + '" for="' + id + '"><span><b>' + c.l + "</b>" + ayuda + "</span>" + ctl + "</label>";
  }
  // abre la ventana; guardar(valores) devuelve la promesa de vOrden (true si fue bien)
  function axForm(ico, titulo, sub, campos, guardar, borrar, extra, pie) {
    var c = conCaja(ico, titulo, sub, "");
    c.classList.add("nx-con-ax");
    c.querySelector("#nx-con-cuerpo").innerHTML = '<form class="nx-ax-form" novalidate><div class="nx-ax-campos">' + campos.map(axCampo).join("") + "</div>" + (extra || "") +
      '<footer>' + (borrar ? '<button type="button" class="nx-cfg-btn nx-cfg-peligro" data-axf="borrar">Borrar</button>' : "") +
      '<span class="nx-ax-aviso">' + (pie || "Se aplica en el router con vuelta atrás automática") + '</span><button type="button" class="nx-cfg-btn" data-con="cerrar">Cancelar</button>' +
      '<button type="submit" class="nx-cfg-btn nx-ax-prim">Guardar</button></footer></form>';
    var form = c.querySelector("form");
    function valores() {
      var v = {};
      form.querySelectorAll("[data-k]").forEach(function (el) {
        if (el.dataset.varias) v[el.dataset.k] = [].map.call(el.querySelectorAll("input:checked"), function (i) { return i.value; });
        else if (el.type === "checkbox") v[el.dataset.k] = el.checked;
        else v[el.dataset.k] = el.value.trim();
      });
      return v;
    }
    function ocupado(si) { form.querySelectorAll("footer button").forEach(function (b) { b.disabled = si; }); form.classList.toggle("nx-ax-ocupado", si); }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      ocupado(true);
      Promise.resolve(guardar(valores(), form)).then(function (ok) { if (ok) conCerrar(); else ocupado(false); });
    });
    form.addEventListener("click", function (e) {
      var o = e.target.closest("[data-axojo]");
      if (o) { var i = document.getElementById(o.dataset.axojo); i.type = i.type === "password" ? "text" : "password"; return; }
      if (e.target.closest('[data-axf="borrar"]')) {
        ps5Confirmar("¿Borrar " + titulo.toLowerCase() + "?", "Se quita del router ahora mismo.", "Borrar", true).then(function (si) {
          if (!si) return;
          ocupado(true);
          Promise.resolve(borrar()).then(function (ok) { if (ok) conCerrar(); else ocupado(false); });
        });
      }
    });
    var p = form.querySelector("input:not([disabled]),select:not([disabled])");
    if (p) setTimeout(function () { p.focus(); }, 30);
    return form;
  }
  function axOrden(cuerpo, hecho) {
    return vOrden("/api/router/ajustes", cuerpo, hecho).then(function (ok) { if (ok) { ax.eqTs = 0; vLeer(); } return ok; });
  }
  function axListaEquipos() {
    return '<datalist id="nx-ax-eqs">' + (ax.eq || []).filter(function (x) { return x.ip; }).map(function (x) {
      return '<option value="' + escapar(x.ip) + '">' + escapar(x.nombre) + "</option>"; }).join("") + "</datalist>";
  }

  // ------------------------------------------------------------ Redes
  function axRedes(d) {
    var filas = d.redes.map(function (r) {
      return '<button type="button" class="nx-ax-fila" data-axe="red" data-id="' + escapar(r.id) + '">' +
        "<span>" + exIco(r.id === "guest" ? "account-multiple-outline" : r.id === "lan" ? "home-outline" : "lan") + "<b>" + escapar(r.nombre) + "</b>" + (r.fija ? axChip("del sistema") : "") + "</span>" +
        "<span>" + (r.vlan ? axChip("VLAN " + r.vlan, "v") : axChip("sin VLAN")) + "</span>" +
        "<span><code>" + escapar(r.cidr) + "</code><small>puerta " + escapar(r.ip) + "</small></span>" +
        "<span>" + (r.dhcp.activo ? "<code>." + r.dhcp.desde.split(".").pop() + " – ." + r.dhcp.hasta.split(".").pop() + "</code><small>concesión " + escapar(r.dhcp.plazo) + "</small>" : "<small>DHCP apagado</small>") + "</span>" +
        "<span>" + (r.ssids.length ? r.ssids.map(function (s) { return axChip(exIco("wifi") + escapar(s)); }).join("") : "<small>—</small>") + "</span>" +
        "<span>" + (r.internet ? axChip("Internet", "ok") : axChip("sin Internet", "mal")) + (r.aislada ? axChip("aislada", "av") : "") + "</span>" +
        "<span><b>" + r.equipos + "</b></span></button>";
    }).join("");
    return '<div class="nx-b nx-ax-tabla nx-ax-t-redes"><div class="nx-ax-fila nx-ax-enc"><span>Red</span><span>VLAN</span><span>Subred</span><span>DHCP</span><span>WiFi</span><span>Acceso</span><span>Equipos</span></div>' + filas + "</div>" +
      (d.filtra_vlan ? "" : '<p class="nx-ax-pie">' + exIco("information-outline") + "Al crear la primera red con VLAN, el router pasa a separar el tráfico por VLAN: la red de casa queda como VLAN 1 sin etiquetar en todas las bocas y nada cambia para los equipos.</p>") +
      '<p class="nx-ax-pie">' + exIco("information-outline") + "Una red <b>aislada</b> solo sale a Internet: no ve la red de casa ni el panel del router (como la de invitados). Para meterle equipos por cable, ve a <a href=\"?ajustes=puertos#red\" data-axir=\"puertos\">Puertos</a>; por wifi, crea una wifi en esa red.</p>";
  }
  function axRedLibre(d) {
    var usadas = d.redes.map(function (r) { return r.vlan; }), v = 10;
    while (usadas.indexOf(v) >= 0 || v === 20 || d.redes.some(function (r) { return r.cidr === "192.168." + v + ".0/24"; })) v += 10;
    return v;
  }
  function axRedAbrir(id) {
    var d = ax.d, r = d.redes.filter(function (x) { return x.id === id; })[0], nueva = !r, v = nueva ? axRedLibre(d) : r.vlan;
    r = r || { nombre: "", ip: "192.168." + v + ".1", prefijo: 24, dhcp: { activo: true, desde: "192.168." + v + ".100", hasta: "192.168." + v + ".199", plazo: "12h", dns: [] }, internet: true, aislada: false, fija: false };
    var ult = function (ip) { return ip.split(".").pop(); };
    var campos = [{ k: "nombre", t: "texto", l: "Nombre", v: r.nombre, ph: "Domótica, Cámaras, Trabajo…" }];
    if (!r.fija) {
      campos.push({ k: "vlan", t: "numero", l: "VLAN", v: v, des: !nueva, ayuda: nueva ? "De 2 a 4094. La 1 es la red de casa." : "No se cambia: borra la red y créala de nuevo." },
        { k: "ip", t: "texto", l: "Puerta de enlace (IP del router)", v: r.ip, ayuda: "La subred sale de aquí: 192.168.10.1 → 192.168.10.0" },
        { k: "prefijo", t: "lista", l: "Tamaño", v: r.prefijo, o: [[24, "/24 · 254 equipos"], [23, "/23 · 510"], [22, "/22 · 1.022"], [25, "/25 · 126"], [26, "/26 · 62"], [27, "/27 · 30"], [28, "/28 · 14"]] });
    } else {
      campos.push({ t: "nota", l: "La subred de «" + escapar(r.nombre) + "» (" + escapar(r.cidr) + ") no se cambia desde aquí: todos los equipos y reservas dependen de ella." });
    }
    campos.push({ k: "dhcp", t: "llave", l: "Servidor DHCP", v: r.dhcp.activo, ayuda: "El router reparte las direcciones" },
      { k: "inicio", t: "numero", l: "Reparte desde", v: ult(r.dhcp.desde), pre: "." },
      { k: "fin", t: "numero", l: "hasta", v: ult(r.dhcp.hasta), pre: "." },
      { k: "plazo", t: "lista", l: "Concesión", v: r.dhcp.plazo, o: AX_PLAZOS.some(function (p) { return p[0] === r.dhcp.plazo; }) ? AX_PLAZOS : AX_PLAZOS.concat([[r.dhcp.plazo, r.dhcp.plazo]]) });
    if (!r.fija) {
      campos.push({ k: "dns", t: "texto", l: "DNS que reparte", v: (r.dhcp.dns || []).join(", "), ph: "vacío = el router (filtra con AdGuard)", ayuda: "Varias, separadas por comas" },
        { k: "internet", t: "llave", l: "Acceso a Internet", v: r.internet },
        { k: "aislada", t: "llave", l: "Aislar la red", v: r.aislada, ayuda: "No ve la red de casa ni el router (solo DHCP y DNS)" });
    }
    axForm(nueva ? "plus-network-outline" : "lan", nueva ? "Nueva red" : r.nombre, nueva ? "red con su propia VLAN" : (r.vlan ? "VLAN " + r.vlan + " · " : "") + r.cidr, campos, function (val) {
      if (r.id === "lan" && !val.dhcp) { ps5Aviso("Sin DHCP en la red de casa nadie nuevo podría entrar", true); return false; }
      return axOrden(Object.assign({ que: "red", id: nueva ? "" : r.id }, val), nueva ? "Red creada." : "Red guardada.");
    }, !nueva && !r.fija ? function () { return axOrden({ que: "red_borrar", id: r.id }, "Red borrada."); } : null);
  }

  // ------------------------------------------------------------ WiFi y radios
  function axWifi(d) {
    var tarjetas = d.wifi.map(function (w) {
      return '<button type="button" class="nx-b nx-ax-wifi' + (w.activa ? "" : " apagada") + '" data-axe="wifi" data-id="' + escapar(w.id) + '">' +
        '<div class="nx-ax-wifi-cab">' + exIco(w.activa ? "wifi" : "wifi-off") + "<b>" + escapar(w.ssid) + "</b>" + (w.oculta ? axChip("oculta") : "") + "</div>" +
        "<dl><div><dt>Red</dt><dd>" + escapar(axRedNombre(w.red)) + "</dd></div><div><dt>Bandas</dt><dd>" + w.bandas.map(axBanda).join(" + ") + "</dd></div>" +
        "<div><dt>Seguridad</dt><dd>" + escapar(d.seguridades[w.seguridad] || w.seguridad) + "</dd></div><div><dt>Equipos</dt><dd>" + w.equipos + "</dd></div></dl>" +
        '<div class="nx-ax-wifi-pie">' + (w.aislar ? axChip("clientes aislados", "av") : "") + (w.filtro !== "disable" ? axChip(w.filtro === "allow" ? "solo MAC permitidas" : "MAC vetadas", "av") : "") +
        (w.activa ? "" : axChip("apagada", "mal")) + '<span class="nx-ax-qr-b" data-axqr="' + escapar(w.id) + '" role="button" tabindex="0" title="Código QR para conectarse">' + exIco("qrcode") + "QR</span></div></button>";
    }).join("");
    var radios = d.radios.map(function (r) {
      var q = r.calidad && r.calidad_max ? Math.round(r.calidad / r.calidad_max * 100) : null;
      return '<button type="button" class="nx-b nx-ax-radio" data-axe="radio" data-id="' + escapar(r.id) + '"><div class="nx-ax-wifi-cab">' + exIco("access-point") + "<b>" + axBanda(r.banda) + "</b>" + (r.activa ? "" : axChip("apagada", "mal")) + "</div>" +
        "<dl><div><dt>Canal</dt><dd>" + (r.canal_ahora || "—") + (r.canal === "auto" ? " <small>automático</small>" : "") + "</dd></div>" +
        "<div><dt>Ancho</dt><dd>" + escapar(String(r.ancho).replace(/^[A-Z]+/, "")) + " MHz</dd></div>" +
        "<div><dt>Potencia</dt><dd>" + (r.potencia_ahora != null ? r.potencia_ahora + " dBm" : "—") + (r.potencia ? "" : " <small>máxima</small>") + "</dd></div>" +
        "<div><dt>Ruido</dt><dd>" + (r.ruido ? r.ruido + " dBm" : "—") + "</dd></div><div><dt>Equipos</dt><dd>" + r.equipos + "</dd></div>" +
        (q != null ? "<div><dt>Calidad</dt><dd>" + q + " %</dd></div>" : "") + "</dl>" +
        (r.uso ? '<div class="nx-ax-uso" title="Envía ' + r.uso.envia + " % · recibe " + r.uso.recibe + " % · otras redes e interferencias " + r.uso.otros + ' %"><span>Uso del canal <b>' + r.uso.ocupado + " %</b></span>" +
          '<i><u class="e" style="width:' + r.uso.envia + '%"></u><u class="r" style="width:' + r.uso.recibe + '%"></u><u class="o" style="width:' + r.uso.otros + '%"></u></i>' +
          "<small><em class=\"e\"></em>envía <em class=\"r\"></em>recibe <em class=\"o\"></em>otras redes</small></div>" : '<div class="nx-ax-uso"><span>Uso del canal <b>midiendo…</b></span></div>') + "</button>";
    }).join("");
    return '<div class="nx-ax-rejilla">' + tarjetas + "</div><h3 class=\"nx-ax-sub\">Radios <small>canal, ancho y potencia de cada banda</small></h3><div class=\"nx-ax-rejilla\">" + radios + "</div>" +
      '<p class="nx-ax-pie">' + exIco("information-outline") + "Cambiar una radio o una wifi reinicia esa emisión: los equipos conectados se caen unos segundos y vuelven solos.</p>";
  }
  function axWifiAbrir(id) {
    var d = ax.d, w0 = d.wifi.filter(function (x) { return x.id === id; })[0], nueva = !w0, conClave = false;
    var w = w0 || { ssid: "", red: "lan", bandas: ["2g", "5g"], seguridad: "psk2", oculta: false, aislar: false, activa: true, filtro: "disable", macs: [], equipos: 0 };
    var form = axForm(nueva ? "wifi-plus" : "wifi", nueva ? "Nueva wifi" : w.ssid, nueva ? "un nombre de wifi más" : w.equipos + " equipos conectados", [
      { k: "ssid", t: "texto", l: "Nombre (SSID)", v: w.ssid },
      { k: "clave", t: "clave", l: "Contraseña", v: "", ph: nueva ? "8 a 63 caracteres" : "leyendo…", ayuda: nueva ? "" : "Vacía = no se cambia" },
      { k: "red", t: "lista", l: "Red", v: w.red, o: d.redes.map(function (r) { return [r.id, r.nombre + (r.vlan ? " · VLAN " + r.vlan : "")]; }) },
      { k: "bandas", t: "varias", l: "Bandas", v: w.bandas, o: d.radios.map(function (r) { return [r.banda, axBanda(r.banda)]; }) },
      { k: "seguridad", t: "lista", l: "Seguridad", v: w.seguridad, o: Object.keys(d.seguridades).map(function (k) { return [k, d.seguridades[k] + (k === "sae-mixed" ? " (recomendada)" : "")]; }) },
      { k: "activa", t: "llave", l: "Emitir", v: w.activa, ayuda: "Apagada no aparece ni deja entrar" },
      { k: "oculta", t: "llave", l: "Ocultar el nombre", v: w.oculta, ayuda: "Hay que escribirlo a mano para entrar" },
      { k: "aislar", t: "llave", l: "Aislar a los clientes", v: w.aislar, ayuda: "Los equipos de esta wifi no se ven entre ellos" },
      { k: "filtro", t: "lista", l: "Filtro por MAC", v: w.filtro, o: [["disable", "Sin filtro"], ["allow", "Solo las de la lista"], ["deny", "Todas menos las de la lista"]] },
      { k: "macs", t: "area", l: "Lista de MAC", v: (w.macs || []).join("\n"), ph: "AA:BB:CC:DD:EE:FF, una por línea", ancho: true }
    ], function (val) {
      if (!nueva && !val.clave) delete val.clave;
      var peligro = !nueva && w.red === "lan" && (val.ssid !== w.ssid || (val.clave && val.clave !== w.clave) || !val.activa);
      var hacer = function () { return axOrden(Object.assign({ que: "wifi", id: nueva ? "" : id, firma: w.ssid }, val), nueva ? "Wifi creada." : "Wifi guardada."); };
      if (!peligro) return hacer();
      return ps5Confirmar("¿Cambiar la wifi de casa?", "Todos los equipos conectados a «" + w.ssid + "» se desconectarán" + (val.ssid !== w.ssid || val.clave ? " y tendrán que volver a entrar con los datos nuevos" : "") + ". Si estás por wifi, tú también.", "Cambiar", true)
        .then(function (si) { return si ? hacer() : false; });
    }, nueva ? null : function () { return axOrden({ que: "wifi_borrar", id: id, firma: w.ssid }, "Wifi borrada."); });
    if (nueva) return;
    // la contraseña solo llega con la sesion de mantenimiento: se rellena al llegar
    cenJSON("/api/router/ajustes", { credentials: "include" }).then(function (dd) {
      var wc = (dd.wifi || []).filter(function (x) { return x.id === id; })[0], i = form.querySelector('[data-k="clave"]');
      if (!i || !form.isConnected) return;
      if (wc && wc.clave != null) { w.clave = wc.clave; if (!i.value) i.value = wc.clave; i.placeholder = "8 a 63 caracteres"; }
      else i.placeholder = "sin cambios (no hay sesión para verla)";
    }).catch(function () { var i = form.querySelector('[data-k="clave"]'); if (i) i.placeholder = "sin cambios"; });
  }
  function axRadioAbrir(id) {
    var r = ax.d.radios.filter(function (x) { return x.id === id; })[0];
    axForm("access-point", "Radio de " + axBanda(r.banda), "ahora en el canal " + (r.canal_ahora || "?"), [
      { k: "canal", t: "lista", l: "Canal", v: r.canal, o: [["auto", "Automático"]].concat(r.canales.map(function (c) { return [c, "Canal " + c + (r.dfs.indexOf(c) >= 0 ? " (DFS: puede tardar en arrancar)" : "")]; })) },
      { k: "ancho", t: "lista", l: "Ancho", v: r.ancho, o: r.anchos.map(function (a) { return [a, a.replace(/^[A-Z]+/, "") + " MHz" + (a === "HE20" && r.banda === "2g" ? " (recomendado)" : a === "HE80" ? " (recomendado)" : "")]; }) },
      { k: "potencia", t: "lista", l: "Potencia", v: r.potencia || "", o: [["", "Máxima"]].concat(r.potencias.filter(function (p) { return p >= 5; }).reverse().map(function (p) { return [p, p + " dBm"]; })) },
      { k: "activa", t: "llave", l: "Radio encendida", v: r.activa, ayuda: "Apagada, ninguna wifi emite en esta banda" }
    ], function (val) {
      var hacer = function () { return axOrden(Object.assign({ que: "radio", id: id }, val), "Radio guardada."); };
      if (val.activa) return hacer();
      return ps5Confirmar("¿Apagar la radio de " + axBanda(r.banda) + "?", "Se caen los " + r.equipos + " equipos que van por ella.", "Apagar", true).then(function (si) { return si ? hacer() : false; });
    });
  }
  // el QR para entrar en una wifi con la camara del movil
  function axQr(id) {
    var w = ax.d.wifi.filter(function (x) { return x.id === id; })[0];
    conSesion("Ver la contraseña de la wifi").then(function (si) {
      if (!si) return;
      Promise.all([cenJSON("/api/router/ajustes", { credentials: "include" }), axQrLib()]).then(function (r) {
        var wc = (r[0].wifi || []).filter(function (x) { return x.id === id; })[0] || w;
        var esc = function (t) { return String(t || "").replace(/([\\;,:"])/g, "\\$1"); };
        var q = qrcode(0, "M");
        q.addData("WIFI:T:" + (wc.seguridad === "none" ? "nopass" : wc.seguridad === "sae" ? "SAE" : "WPA") + ";S:" + esc(wc.ssid) + ";" + (wc.seguridad === "none" ? "" : "P:" + esc(wc.clave) + ";") + (wc.oculta ? "H:true;" : "") + ";");
        q.make();
        var c = conCaja("qrcode", wc.ssid, "apunta con la cámara del móvil", "");
        c.classList.add("nx-con-ax", "nx-con-qr");
        c.querySelector("#nx-con-cuerpo").innerHTML = '<div class="nx-ax-qr">' + q.createSvgTag({ cellSize: 8, margin: 2, scalable: true }) +
          "<dl><div><dt>Red</dt><dd>" + escapar(wc.ssid) + "</dd></div>" + (wc.seguridad === "none" ? "" : '<div><dt>Contraseña</dt><dd><code>' + escapar(wc.clave || "") + "</code></dd></div>") + "</dl></div>";
      }).catch(function (e) { ps5Aviso("No se ha podido: " + e.message, true); });
    });
  }
  function axQrLib() {
    if (window.qrcode) return Promise.resolve();
    return new Promise(function (ok, mal) {
      var s = document.createElement("script");
      s.src = XT + "qrcode-generator@1.4.4/qrcode.js";
      s.onload = ok; s.onerror = function () { mal(new Error("no carga el generador de QR")); };
      document.head.appendChild(s);
    });
  }

  // ------------------------------------------------------------ Puertos
  function axPuertos(d) {
    var bocas = d.puertos.map(function (p) {
      var vel = p.velocidad ? (p.velocidad >= 1000 ? p.velocidad / 1000 + " GbE" : p.velocidad + " Mb") : "";
      return '<button type="button" class="nx-b nx-ax-boca' + (p.enlace ? " on" : "") + (p.wan ? " wan" : "") + '"' + (p.wan ? " disabled" : ' data-axe="puerto" data-id="' + p.boca + '"') + ">" +
        '<div class="nx-ax-boca-cab"><i class="nx-ax-rj"></i><b>' + (p.wan ? "WAN · Internet" : p.boca.replace("lan", "LAN ")) + "</b>" + (p.servidor ? axChip("servidor", "v") : "") + "</div>" +
        "<small>" + (p.enlace ? vel + (p.duplex ? " · dúplex " + p.duplex : "") : "sin cable") + "</small>" +
        (p.wan ? "<p>PPPoE de la línea · no se toca desde aquí</p>" :
          '<dl><div><dt>Nativa</dt><dd>' + (p.nativa ? escapar(axVlanNombre(p.nativa)) + " <small>VLAN " + p.nativa + "</small>" : "ninguna") + "</dd></div>" +
          "<div><dt>Etiquetadas</dt><dd>" + (p.etiquetadas.length ? p.etiquetadas.map(function (v) { return axChip(escapar(axVlanNombre(v)) + " · " + v, "v"); }).join("") : "ninguna") + "</dd></div></dl>") +
        (p.equipos.length ? '<div class="nx-ax-boca-eq">' + p.equipos.map(function (n) { return "<span>" + escapar(n) + "</span>"; }).join("") + "</div>" : "") + "</button>";
    }).join("");
    return '<div class="nx-ax-rejilla nx-ax-bocas">' + bocas + "</div>" +
      '<p class="nx-ax-pie">' + exIco("information-outline") + "La red <b>nativa</b> va sin etiquetar: es la que recibe cualquier equipo que enchufes. Las <b>etiquetadas</b> solo las ven los aparatos que entienden VLAN (un switch gestionable, un punto de acceso, un servidor con VLAN). " +
      "El puerto del servidor no puede salir de la red de casa.</p>";
  }
  function axPuertoAbrir(boca) {
    var d = ax.d, p = d.puertos.filter(function (x) { return x.boca === boca; })[0], conVlan = d.redes.filter(function (r) { return r.vlan; });
    axForm("ethernet", boca.replace("lan", "LAN "), p.equipos.length ? p.equipos.join(", ") : "sin equipos vistos", [
      { k: "nativa", t: "lista", l: "Red nativa (sin etiquetar)", v: p.nativa || 0, o: [[0, "Ninguna"]].concat(conVlan.map(function (r) { return [r.vlan, r.nombre + " · VLAN " + r.vlan]; })), des: p.servidor },
      { k: "etiquetadas", t: "varias", l: "Redes etiquetadas", v: p.etiquetadas, o: conVlan.filter(function (r) { return r.vlan !== 1; }).map(function (r) { return [r.vlan, r.nombre + " · " + r.vlan]; }) },
      { t: "nota", l: d.filtra_vlan ? "El cambio se prueba unos segundos: si el router deja de contestar, se deshace solo." : "Es el primer cambio de puertos: el router pasará a separar por VLAN (la red de casa queda como VLAN 1 en todas las bocas)." }
    ], function (val) {
      if (p.servidor) val.nativa = 1;
      var hacer = function () { return axOrden({ que: "puerto", boca: boca, nativa: +val.nativa, etiquetadas: val.etiquetadas.map(Number) }, "Puerto guardado."); };
      if (+val.nativa === (p.nativa || 0) || !p.equipos.length) return hacer();
      return ps5Confirmar("¿Cambiar la red de " + boca.replace("lan", "LAN ") + "?", "Lo que cuelga de ese puerto (" + p.equipos.join(", ") + ") pasará a otra red y cambiará de IP.", "Cambiar", true).then(function (si) { return si ? hacer() : false; });
    });
  }

  // ------------------------------------------------------------ Cortafuegos
  function axCortafuegos(d) {
    var zs = d.zonas.map(function (z) { return z.nombre; }), hay = {};
    d.reenvio_zonas.forEach(function (f) { hay[f.de + ">" + f.a] = 1; });
    var tabla = '<div class="nx-b nx-ax-matriz"><h3>Matriz de zonas <span>fila = de dónde sale · columna = adónde va · pulsa para cambiar</span></h3><div class="nx-ax-mtz" style="--n:' + (zs.length + 1) + '">' +
      '<span class="nx-ax-mtz-esq">De ↓ · A →</span>' + zs.map(function (z) { return '<span class="nx-ax-mtz-col">' + escapar(axZona(z)) + "</span>"; }).join("");
    zs.forEach(function (de) {
      var zd = d.zonas.filter(function (z) { return z.nombre === de; })[0];
      tabla += '<span class="nx-ax-mtz-fila">' + escapar(axZona(de)) + "<small>al router: " + (zd.entrada === "ACCEPT" ? "sí" : "solo lo básico") + "</small></span>";
      zs.forEach(function (a) {
        if (de === a) return (tabla += '<span class="nx-ax-mtz-c misma">' + (zd.reenvio === "ACCEPT" ? "Dentro: libre" : "Dentro: aislados") + "</span>");
        var si = !!hay[de + ">" + a], fijo = de === "wan" || (de === "lan" && a === "wan");
        tabla += '<button type="button" class="nx-ax-mtz-c ' + (si ? "si" : "no") + '"' + (fijo ? " disabled" : ' data-axmtz="' + escapar(de) + ">" + escapar(a) + '" data-si="' + (si ? 0 : 1) + '"') +
          ' title="' + escapar(axZona(de)) + " → " + escapar(axZona(a)) + '">' + (si ? "Permitido" : "Bloqueado") + "</button>";
      });
    });
    tabla += "</div><p class=\"nx-b-nota\">De Internet hacia dentro todo está cerrado salvo los <a href=\"?ajustes=reenvios#red\" data-axir=\"reenvios\">reenvíos de puertos</a>. Las reglas de abajo pueden hacer excepciones.</p></div>";
    var reglas = d.reglas.filter(function (r) { return ax.sis || !r.fija; });
    var filas = reglas.map(function (r) {
      return '<button type="button" class="nx-ax-fila' + (r.activa ? "" : " apagada") + (r.fija ? " fija" : "") + '"' + (r.fija ? "" : ' data-axe="regla" data-id="' + escapar(r.id) + '"') + ">" +
        "<span><b>" + escapar(r.nombre || "(sin nombre)") + "</b>" + (r.fija ? axChip("sistema") : "") + "</span>" +
        "<span>" + axChip(r.accion === "ACCEPT" ? "Permitir" : r.accion === "DROP" ? "Descartar" : "Rechazar", r.accion === "ACCEPT" ? "ok" : "mal") + "</span>" +
        "<span>" + escapar(axZona(r.origen) || "—") + (r.ip_origen ? "<small>" + escapar(r.ip_origen) + "</small>" : "") + (r.mac_origen ? "<small>" + escapar(r.mac_origen) + "</small>" : "") + "</span>" +
        "<span>" + (r.destino ? escapar(r.destino === "*" ? "Cualquiera" : axZona(r.destino)) : "El router") + (r.ip_destino ? "<small>" + escapar(r.ip_destino) + "</small>" : "") + "</span>" +
        "<span><code>" + escapar(r.proto.toUpperCase()) + (r.puerto ? " " + escapar(r.puerto) : "") + "</code>" + (r.familia ? "<small>" + escapar(r.familia) + "</small>" : "") + "</span>" +
        "<span>" + (r.activa ? axChip("activa", "ok") : axChip("apagada")) + "</span></button>";
    }).join("");
    return tabla + '<h3 class="nx-ax-sub">Reglas <small>' + d.reglas.filter(function (r) { return !r.fija; }).length + " tuyas · " + d.reglas.filter(function (r) { return r.fija; }).length + " del sistema</small></h3>" +
      '<div class="nx-b nx-ax-tabla nx-ax-t-reglas"><div class="nx-ax-fila nx-ax-enc"><span>Nombre</span><span>Acción</span><span>De</span><span>A</span><span>Tráfico</span><span>Estado</span></div>' +
      (filas || axVacio("Aún no hay reglas tuyas. Las del sistema (DHCP, ping, IPv6…) están escondidas.")) + "</div>";
  }
  function axReglaAbrir(id) {
    var d = ax.d, r = d.reglas.filter(function (x) { return x.id === id; })[0], nueva = !r;
    r = r || { nombre: "", accion: "REJECT", origen: "lan", destino: "wan", ip_origen: "", ip_destino: "", mac_origen: "", proto: "tcp udp", puerto: "", activa: true };
    var zonas = d.zonas.map(function (z) { return [z.nombre, axZona(z.nombre)]; });
    axForm("shield-half-full", nueva ? "Nueva regla" : r.nombre, "cortafuegos", [
      { k: "nombre", t: "texto", l: "Nombre", v: r.nombre, ph: "Cámaras sin Internet" },
      { k: "accion", t: "lista", l: "Acción", v: r.accion, o: [["REJECT", "Rechazar (avisa)"], ["DROP", "Descartar (en silencio)"], ["ACCEPT", "Permitir"]] },
      { k: "origen", t: "lista", l: "De", v: r.origen, o: zonas },
      { k: "ip_origen", t: "texto", l: "IP o red de origen", v: r.ip_origen, ph: "opcional · 192.168.1.50 o 192.168.10.0/24", lista: "nx-ax-eqs" },
      { k: "mac_origen", t: "texto", l: "MAC de origen", v: r.mac_origen, ph: "opcional" },
      { k: "destino", t: "lista", l: "A", v: r.destino, o: [["", "El router"], ["*", "Cualquiera"]].concat(zonas) },
      { k: "ip_destino", t: "texto", l: "IP o red de destino", v: r.ip_destino, ph: "opcional", lista: "nx-ax-eqs" },
      { k: "proto", t: "lista", l: "Protocolo", v: r.proto, o: [["tcp udp", "TCP y UDP"], ["tcp", "TCP"], ["udp", "UDP"], ["icmp", "ICMP (ping)"], ["all", "Todo"]] },
      { k: "puerto", t: "texto", l: "Puerto de destino", v: r.puerto, ph: "opcional · 443 o 8000-8010" },
      { k: "activa", t: "llave", l: "Activa", v: r.activa }
    ], function (val) { return axOrden(Object.assign({ que: "regla", id: nueva ? "" : id, firma: r.nombre }, val), nueva ? "Regla creada." : "Regla guardada."); },
    nueva ? null : function () { return axOrden({ que: "regla_borrar", id: id, firma: r.nombre }, "Regla borrada."); }, axListaEquipos());
  }

  // ------------------------------------------------------------ Reenvío de puertos
  function axReenvios(d) {
    var filas = d.reenvios.map(function (r) {
      return '<button type="button" class="nx-ax-fila' + (r.activa ? "" : " apagada") + '" data-axe="reenvio" data-id="' + escapar(r.id) + '">' +
        "<span><b>" + escapar(r.nombre) + "</b></span><span><code>" + escapar(r.proto.toUpperCase().replace(" ", "/")) + "</code></span>" +
        "<span><code>" + escapar(r.externo) + "</code>" + (r.origen ? "<small>solo desde " + escapar(r.origen) + "</small>" : "") + "</span>" +
        "<span><b>" + escapar(axQuien(r.ip) || r.ip) + "</b><small>" + escapar(r.ip) + ":" + escapar(r.interno || r.externo) + "</small></span>" +
        "<span>" + (r.activa ? axChip("abierto", "av") : axChip("apagado")) + "</span></button>";
    }).join("");
    return '<div class="nx-b nx-ax-tabla nx-ax-t-reenv"><div class="nx-ax-fila nx-ax-enc"><span>Nombre</span><span>Protocolo</span><span>Puerto de fuera</span><span>Va a</span><span>Estado</span></div>' +
      (filas || axVacio("No hay ningún puerto abierto a Internet.")) + "</div>" +
      '<p class="nx-ax-pie">' + exIco("shield-alert-outline") + "Cada puerto abierto es una puerta desde Internet hasta ese equipo. Los que crees aquí no saltan como alarma en Seguridad; los que aparezcan por otro lado, sí.</p>";
  }
  function axReenvioAbrir(id) {
    var r = ax.d.reenvios.filter(function (x) { return x.id === id; })[0], nuevo = !r;
    r = r || { nombre: "", proto: "tcp", externo: "", ip: "", interno: "", origen: "", activa: true };
    axForm("arrow-decision-outline", nuevo ? "Nuevo reenvío" : r.nombre, "de Internet a un equipo de casa", [
      { k: "nombre", t: "texto", l: "Nombre", v: r.nombre, ph: "Servidor de juegos" },
      { k: "proto", t: "lista", l: "Protocolo", v: r.proto, o: [["tcp", "TCP"], ["udp", "UDP"], ["tcp udp", "TCP y UDP"]] },
      { k: "externo", t: "texto", l: "Puerto de fuera", v: r.externo, ph: "25565 o 27015-27030" },
      { k: "ip", t: "texto", l: "Equipo (IP)", v: r.ip, lista: "nx-ax-eqs", ph: "elige o escribe" },
      { k: "interno", t: "texto", l: "Puerto del equipo", v: r.interno, ph: "vacío = el mismo" },
      { k: "origen", t: "texto", l: "Solo desde", v: r.origen, ph: "opcional · IP o red de Internet" },
      { k: "activa", t: "llave", l: "Abierto", v: r.activa }
    ], function (val) {
      var hacer = function () { return axOrden(Object.assign({ que: "reenvio", id: nuevo ? "" : id, firma: r.nombre }, val), nuevo ? "Puerto abierto." : "Reenvío guardado."); };
      if (!val.activa || !nuevo) return hacer();
      return ps5Confirmar("¿Abrir el puerto " + val.externo + " a Internet?", "Cualquiera en Internet podrá llegar a " + (axQuien(val.ip) || val.ip) + " por ese puerto.", "Abrir", true).then(function (si) { return si ? hacer() : false; });
    }, nuevo ? null : function () { return axOrden({ que: "reenvio_borrar", id: id, firma: r.nombre }, "Reenvío borrado."); }, axListaEquipos());
  }

  // ------------------------------------------------------------ Rutas
  function axRutas(d) {
    var filas = d.rutas.map(function (r) {
      return '<button type="button" class="nx-ax-fila" data-axe="ruta" data-id="' + escapar(r.id) + '"><span><code>' + escapar(r.destino) + "</code></span><span><code>" + escapar(r.puerta) + "</code><small>" + escapar(axQuien(r.puerta)) + "</small></span>" +
        "<span>" + escapar(axRedNombre(r.interfaz)) + "</span><span>" + escapar(r.metrica || "—") + "</span></button>";
    }).join("");
    return '<div class="nx-b nx-ax-tabla nx-ax-t-rutas"><div class="nx-ax-fila nx-ax-enc"><span>Destino</span><span>Por</span><span>Red</span><span>Métrica</span></div>' +
      (filas || axVacio("Sin rutas estáticas: todo sale por Internet o por las redes de casa.")) + "</div>" +
      '<p class="nx-ax-pie">' + exIco("information-outline") + "Sirven para llegar a redes que están detrás de otro equipo de casa (una VPN en un servidor, otro router…).</p>";
  }
  function axRutaAbrir(id) {
    var r = ax.d.rutas.filter(function (x) { return x.id === id; })[0], nueva = !r;
    r = r || { destino: "", puerta: "", interfaz: "lan", metrica: "" };
    axForm("routes", nueva ? "Nueva ruta" : r.destino, "ruta estática", [
      { k: "destino", t: "texto", l: "Red de destino", v: r.destino, ph: "10.8.0.0/24" },
      { k: "puerta", t: "texto", l: "Por (puerta de enlace)", v: r.puerta, lista: "nx-ax-eqs", ph: "IP del equipo que la conoce" },
      { k: "interfaz", t: "lista", l: "Red", v: r.interfaz, o: ax.d.redes.map(function (x) { return [x.id, x.nombre]; }) },
      { k: "metrica", t: "numero", l: "Métrica", v: r.metrica, ph: "opcional" }
    ], function (val) { return axOrden(Object.assign({ que: "ruta", id: nueva ? "" : id, firma: r.destino }, val), nueva ? "Ruta creada." : "Ruta guardada."); },
    nueva ? null : function () { return axOrden({ que: "ruta_borrar", id: id, firma: r.destino }, "Ruta borrada."); }, axListaEquipos());
  }

  // ------------------------------------------------------------ DNS local
  function axDns(d) {
    var filas = d.dns.map(function (x) {
      return '<button type="button" class="nx-ax-fila' + (x.fija ? " fija" : "") + '"' + (x.fija ? "" : ' data-axe="dns" data-id="' + escapar(x.id) + '"') + "><span><b>" + escapar(x.nombre) + "</b>" + (x.fija ? axChip("del sistema") : "") + "</span>" +
        "<span><code>" + escapar(x.ip) + "</code></span><span>" + escapar(axQuien(x.ip)) + "</span></button>";
    }).join("");
    return '<div class="nx-b nx-ax-tabla nx-ax-t-dns"><div class="nx-ax-fila nx-ax-enc"><span>Nombre</span><span>Apunta a</span><span>Equipo</span></div>' + (filas || axVacio("Sin nombres propios.")) + "</div>" +
      '<p class="nx-ax-pie">' + exIco("information-outline") + "Los resuelve el router para toda la casa (también los equipos que preguntan a AdGuard, que le pregunta a él por lo local). Los «del sistema» son los de la tienda, que apuntan al servidor sin pasar por Internet.</p>";
  }
  function axDnsAbrir(id) {
    var x = ax.d.dns.filter(function (y) { return y.id && y.id === id; })[0], nuevo = !x;
    x = x || { nombre: "", ip: "" };
    axForm("dns-outline", nuevo ? "Nuevo nombre" : x.nombre, "DNS local", [
      { k: "nombre", t: "texto", l: "Nombre", v: x.nombre, ph: "nas.lan o impresora" },
      { k: "ip", t: "texto", l: "IP", v: x.ip, lista: "nx-ax-eqs" }
    ], function (val) { return axOrden(Object.assign({ que: "dns", id: nuevo ? "" : id, firma: x.nombre }, val), nuevo ? "Nombre creado." : "Nombre guardado."); },
    nuevo ? null : function () { return axOrden({ que: "dns_borrar", id: id, firma: x.nombre }, "Nombre borrado."); }, axListaEquipos());
  }

  // ------------------------------------------------------------ IP fijas
  function axFijas(d) {
    var filas = d.fijas.map(function (f) {
      return '<button type="button" class="nx-ax-fila" data-axe="fija" data-id="' + escapar(f.id) + '"><span><i class="nx-ax-punto' + (f.en_linea ? " on" : "") + '"></i><b>' + escapar(f.alias || f.nombre || "Sin nombre") + "</b>" +
        (f.alias && f.nombre ? "<small>" + escapar(f.nombre) + "</small>" : "") + "</span><span>" + (f.ip ? "<code>" + escapar(f.ip) + "</code>" : axChip("solo nombre")) + "</span><span><code>" + escapar(f.mac || "—") + "</code></span>" +
        "<span>" + escapar(axRedNombre(((d.redes.filter(function (r) { return axDentro(f.ip, r.cidr); })[0]) || {}).id || "")) + "</span></button>";
    }).join("");
    return '<div class="nx-b nx-ax-tabla nx-ax-t-fijas"><div class="nx-ax-fila nx-ax-enc"><span>Equipo</span><span>IP</span><span>MAC</span><span>Red</span></div>' + (filas || axVacio("Ninguna IP fija.")) + "</div>" + axConcesiones(d);
  }
  function axDentro(ip, cidr) {
    var p = cidr.split("/"), t = Math.pow(2, 32 - p[1]);
    function n(x) { return x.split(".").reduce(function (s, y) { return s * 256 + (+y); }, 0); }
    return /^\d+\.\d+\.\d+\.\d+$/.test(ip || "") && Math.floor(n(ip) / t) === Math.floor(n(p[0]) / t);
  }
  function axFijaAbrir(id, pre) {
    var f = ax.d.fijas.filter(function (x) { return x.id === id; })[0], nueva = !f;
    f = f || pre || { mac: "", ip: "", nombre: "" };
    var macs = '<datalist id="nx-ax-macs">' + (ax.eq || []).map(function (x) { return '<option value="' + escapar(x.mac) + '">' + escapar(x.nombre + (x.ip ? " · " + x.ip : "")) + "</option>"; }).join("") + "</datalist>";
    axForm("pin-outline", nueva ? "Nueva IP fija" : f.alias || f.nombre || f.mac, "el router siempre le dará la misma IP", [
      { k: "mac", t: "texto", l: "MAC del equipo", v: f.mac, des: !nueva || !!pre, lista: "nx-ax-macs", ph: "elige o escribe" },
      { k: "ip", t: "texto", l: "IP", v: f.ip },
      { k: "nombre", t: "texto", l: "Nombre en la red", v: f.nombre, ph: "opcional · letras, números y guiones" }
    ], function (val) { if (!nueva || pre) val.mac = f.mac; return axOrden(Object.assign({ que: "fija" }, val), "IP fija guardada. El equipo la cogerá al renovar."); },
    nueva ? null : function () { return axOrden({ que: "fija_borrar", id: id, firma: f.mac }, "IP fija quitada."); }, macs);
  }

  // ------------------------------------------------------------ Router
  function axRouter() {
    return '<div id="nx-ax-sis"></div><div class="nx-b nx-ax-reg"><h3>Registro del router <span>lo último que ha pasado</span></h3><div class="nx-ax-reg-herr">' +
      '<input type="search" id="nx-ax-reg-q" placeholder="Filtrar…" autocomplete="off">' +
      '<button type="button" class="nx-cfg-btn" data-axreg="1" id="nx-ax-reg-b">Leer el registro</button></div><div id="nx-ax-reg"></div></div>';
  }
  function axRouterSis(d) {
    var s = d.sistema || {};
    function dato(r, v) { return v ? "<div><dt>" + r + "</dt><dd>" + v + "</dd></div>" : ""; }
    var mem = s.mem_total ? Math.round(100 - s.mem_libre / s.mem_total * 100) : null, fl = s.flash_total ? Math.round(100 - s.flash_libre / s.flash_total * 100) : null;
    return '<div class="nx-vt-rejilla"><div class="nx-b nx-f8"><h3>Sistema <span>' + escapar(s.nombre || "") + '</span></h3><dl class="nx-rd-datos nx-ax-sis">' +
      dato("Modelo", escapar(s.modelo || "")) + dato("Firmware", "OpenWrt " + escapar(s.version || "") + " <small>" + escapar(s.revision || "") + "</small>" +
        (s.firmware && s.firmware.hay ? " " + axChip("hay " + escapar(s.firmware.estable), "av") : s.firmware ? " " + axChip("al día", "ok") : "")) +
      dato("Procesador", escapar(s.procesador || "")) + dato("Núcleo", escapar(s.nucleo || "")) + dato("Encendido hace", vDura(s.encendido)) +
      dato("Carga", (s.carga || []).map(function (x) { return String(x).replace(".", ","); }).join(" · ")) + dato("Memoria", mem != null ? mem + " % usada" : "") +
      dato("Almacenamiento", fl != null ? fl + " % usado" : "") + dato("Conexiones", s.conexiones != null ? s.conexiones + " de " + s.conexiones_max : "") +
      dato("Aceleración por hardware", s.aceleracion ? "activada" : "apagada") + dato("Filtrado por VLAN", d.filtra_vlan ? "activado" : "sin usar") + "</dl></div>" +
      '<div class="nx-b nx-f4"><h3>Acciones</h3><div class="nx-ax-acc">' +
        '<button type="button" class="nx-cfg-btn" data-rt="1">' + exIco("backup-restore") + "Copias de la configuración</button>" +
        '<a class="nx-cfg-btn" target="_blank" rel="noreferrer" href="http://192.168.1.1/">' + exIco("open-in-new") + "Abrir LuCI</a>" +
        '<button type="button" class="nx-cfg-btn nx-cfg-peligro" data-axreinicio="1">' + exIco("restart") + "Reiniciar el router</button></div>" +
        '<p class="nx-b-nota">Reiniciar deja la casa sin Internet ni wifi un par de minutos.' + (s.firmware && s.firmware.hay ? " Hay OpenWrt " + escapar(s.firmware.estable) +
          ": se actualiza desde LuCI (Attended Sysupgrade); después hay que reinstalar <code>ethtool</code> e <code>ip-bridge</code> para el tráfico por puerto." : "") + "</p></div></div>";
  }
  function axRegHTML() {
    if (!ax.reg) return '<p class="nx-b-nota">Hace falta entrar con la contraseña de CasaFi.</p>';
    var f = ax.regF.toLowerCase(), N = ["emerg", "alerta", "crítico", "error", "aviso", "nota", "info", "depurar"];
    var l = ax.reg.filter(function (x) { return !f || x.msg.toLowerCase().indexOf(f) >= 0; }).slice(-400).reverse();
    return "<pre>" + (l.map(function (x) {
      return '<div class="n' + x.nivel + '"><time>' + vHora(x.t) + ":" + ("0" + new Date(x.t * 1000).getSeconds()).slice(-2) + "</time><i>" + N[x.nivel] + "</i>" + escapar(x.msg) + "</div>";
    }).join("") || "<div>Nada con ese filtro.</div>") + "</pre>";
  }
  function axRegLeer() {
    conSesion("Leer el registro del router").then(function (si) {
      if (!si) return;
      cenJSON("/api/router/registro?n=600", { credentials: "include" }).then(function (r) { ax.reg = r.lineas; vPoner("nx-ax-reg", axRegHTML()); vTexto("nx-ax-reg-b", "Actualizar"); })
        .catch(function (e) { ps5Aviso("No se ha podido: " + e.message, true); });
    });
  }

  // ------------------------------------------------------------ Internet
  function axInternet(d) {
    var i = d.internet || {};
    function dato(r, v) { return v ? "<div><dt>" + r + "</dt><dd>" + v + "</dd></div>" : ""; }
    var modo = { auto: "Automático (crea su propio cliente DHCPv6)", "1": "Por la interfaz wan6", "0": "Apagado" };
    return (i.dhcpv6_doble ? '<p class="nx-ax-nota nx-ax-alerta">' + exIco("alert-outline") + "Hay dos clientes DHCPv6 sobre la misma línea (" +
        i.hijos.map(function (h) { return escapar(h.nombre) + (h.pendiente ? " atascado" : ""); }).join(", ") + "). Pon el IPv6 en «Por la interfaz wan6» para quitar el duplicado.</p>" : "") +
      '<div class="nx-vt-rejilla"><div class="nx-b nx-f8"><h3>Línea <span>' + escapar((i.proto || "").toUpperCase()) + (i.vlan ? " · VLAN " + escapar(i.vlan) : "") + '</span></h3><dl class="nx-rd-datos nx-ax-sis">' +
        dato("Estado", i.arriba ? '<span class="nx-rd-on">Conectada</span>' : '<span class="nx-in-mal">Sin conexión</span>') + dato("IP pública", escapar(i.ip || "")) +
        dato("Conectada hace", i.desde != null ? vDura(i.desde) : "") + dato("IPv6", (i.v6_arriba ? "activo" : "sin IPv6") + (i.v6_prefijo ? " <small>" + escapar(i.v6_prefijo) + "</small>" : "")) +
        dato("Modo IPv6", escapar(modo[i.ipv6] || i.ipv6)) + dato("MTU", escapar(i.mtu || "la de siempre (1492)")) +
        dato("DNS del router", i.dns_propios ? escapar(i.dns.join(", ")) + " <small>propios, no los de la operadora</small>" : "los de la operadora") + "</dl></div>" +
      '<div class="nx-b nx-f4"><h3>Acciones</h3><div class="nx-ax-acc"><button type="button" class="nx-cfg-btn" data-axe="internet" data-id="">' + exIco("tune-variant") + "Cambiar IPv6 o MTU</button>" +
        '<button type="button" class="nx-cfg-btn nx-cfg-peligro" data-axreconectar="1">' + exIco("restart") + "Reconectar la línea</button></div>" +
        '<p class="nx-b-nota">Cualquier cambio aquí reconecta el PPPoE: unos segundos sin Internet. Si la línea no vuelve a subir en un minuto, el router deshace el cambio solo.</p></div></div>';
  }
  function axInternetAbrir() {
    var i = ax.d.internet || {};
    axForm("web", "Conexión a Internet", "PPPoE de la línea", [
      { k: "ipv6", t: "lista", l: "IPv6", v: i.ipv6, o: [["1", "Por la interfaz wan6 (recomendado)"], ["auto", "Automático"], ["0", "Apagado"]] },
      { k: "mtu", t: "numero", l: "MTU", v: i.mtu, ph: "vacía = 1492", ayuda: "Solo si alguna web se queda colgada" },
      { t: "nota", l: "Al guardar se reconecta la línea." }
    ], function (val) {
      return ps5Confirmar("¿Reconectar la línea?", "La casa se queda unos segundos sin Internet y la IP pública puede cambiar.", "Guardar y reconectar", true)
        .then(function (si) { return si ? axOrden(Object.assign({ que: "internet" }, val), "Conexión cambiada.") : false; });
    });
  }

  // ------------------------------------------------------------ Reglas de tráfico (AdGuard)
  var AX_DIAS = [["mon", "L"], ["tue", "M"], ["wed", "X"], ["thu", "J"], ["fri", "V"], ["sat", "S"], ["sun", "D"]];
  var AX_GRUPOS = { ai: "IA", cdn: "Redes de reparto", dating: "Citas", gambling: "Apuestas", gaming: "Juegos", hosting: "Alojamiento", messenger: "Mensajería",
    privacy: "Privacidad", shopping: "Compras", social_network: "Redes sociales", software: "Programas", streaming: "Vídeo y música" };
  function axServicios() {
    if (ax.srv || ax.srvPide) return;
    ax.srvPide = true;
    cenJSON("/api/router/servicios").then(function (d) { ax.srv = d; ax.srvPide = false; ax.srvPor = {}; d.servicios.forEach(function (x) { ax.srvPor[x.id] = x; }); if (ax.d) { vs.firmas["nx-ax-sec"] = ""; axPintar(ax.d); } })
      .catch(function () { ax.srvPide = false; });
  }
  function axSrvIco(id) {
    var x = (ax.srvPor || {})[id];
    return x && x.icono ? '<img alt="" src="data:image/svg+xml;base64,' + x.icono + '">' : exIco("application-outline");
  }
  function axQuienes(ids) {
    return ids.map(function (t) {
      var n = /\//.test(t) ? (((ax.d.redes || []).filter(function (r) { return r.cidr === t; })[0] || {}).nombre || t) : axQuien(t) || ((ax.eq || []).filter(function (y) { return (y.mac || "").toLowerCase() === t; })[0] || {}).nombre || t;
      return escapar(n);
    }).join(", ");
  }
  function axTrafico(d) {
    axServicios();
    var t = d.trafico || { reglas: [] };
    if (!t.ok) return axVacio("AdGuard no contesta: " + escapar(t.error || ""));
    var tarj = t.reglas.map(function (r) {
      var dias = r.pausa ? AX_DIAS.filter(function (x) { return r.pausa.dias.indexOf(x[0]) >= 0; }).map(function (x) { return x[1]; }).join(" ") : "";
      return '<button type="button" class="nx-b nx-ax-tr" data-axe="trafico" data-id="' + escapar(r.nombre) + '"><div class="nx-ax-wifi-cab">' + exIco("traffic-light-outline") + "<b>" + escapar(r.nombre) + "</b></div>" +
        '<p class="nx-ax-tr-quien">' + exIco("account-outline") + axQuienes(r.ids) + "</p>" +
        (r.servicios.length ? '<div class="nx-ax-apps-mini">' + r.servicios.slice(0, 14).map(function (s) { return '<span title="' + escapar(((ax.srvPor || {})[s] || {}).nombre || s) + '">' + axSrvIco(s) + "</span>"; }).join("") +
          (r.servicios.length > 14 ? "<em>+" + (r.servicios.length - 14) + "</em>" : "") + "</div>" : "") +
        '<div class="nx-ax-wifi-pie">' + (r.familia ? axChip("familiar", "av") : "") + (r.busquedas ? axChip("búsquedas seguras", "v") : "") + (r.malware ? axChip("anti-malware", "ok") : "") +
        (r.pausa ? axChip("pausa " + dias + " · " + r.pausa.desde + "–" + r.pausa.hasta) : "") + "</div></button>";
    }).join("");
    return (tarj ? '<div class="nx-ax-rejilla">' + tarj + "</div>" : axVacio("Ninguna regla. Con una regla puedes bloquear apps (TikTok, juegos, redes…) o activar el filtrado familiar para un equipo o una red.")) +
      '<p class="nx-ax-pie">' + exIco("information-outline") + "Se aplican en <b>AdGuard Home</b>, por DNS: funcionan con los equipos que le preguntan a él directamente (los de la red de casa por IPv4). Lo que pregunta por el router (IPv6, redes aisladas) le llega como si fuera el router y la regla no lo alcanza. Para que no se escape, ponle IP fija al equipo.</p>";
  }
  function axTraficoAbrir(nombre) {
    var d = ax.d, r = ((d.trafico || {}).reglas || []).filter(function (x) { return x.nombre === nombre; })[0], nueva = !r;
    r = r || { nombre: "", ids: [], servicios: [], familia: false, busquedas: false, malware: true, pausa: null };
    var srv = ax.srv ? ax.srv.servicios : [];
    var form = axForm("traffic-light-outline", nueva ? "Nueva regla de tráfico" : r.nombre, "bloqueo de apps y filtrado, por DNS", [
      { k: "nombre", t: "texto", l: "Nombre", v: r.nombre, ph: "Tablet de los peques" },
      { k: "ids", t: "texto", l: "A quién", v: r.ids.join(", "), lista: "nx-ax-eqs", ph: "IP, red (192.168.1.0/24) o MAC; varias con comas" },
      { k: "servicios", t: "apps", l: "Apps bloqueadas", v: r.servicios, o: srv, ancho: true },
      { k: "familia", t: "llave", l: "Filtrado familiar", v: r.familia, ayuda: "Bloquea webs para adultos" },
      { k: "busquedas", t: "llave", l: "Búsquedas seguras", v: r.busquedas, ayuda: "Google, Bing, YouTube… en modo restringido" },
      { k: "malware", t: "llave", l: "Anti-malware", v: r.malware, ayuda: "Webs de estafas y virus" },
      { k: "pausa", t: "llave", l: "Pausar el bloqueo de apps", v: !!r.pausa, ayuda: "En ese rato las apps sí funcionan" },
      { k: "dias", t: "varias", l: "Días de la pausa", v: r.pausa ? r.pausa.dias : ["sat", "sun"], o: AX_DIAS },
      { k: "desde", t: "texto", l: "Desde", v: r.pausa ? r.pausa.desde : "17:00", ph: "HH:MM" },
      { k: "hasta", t: "texto", l: "Hasta", v: r.pausa ? r.pausa.hasta : "20:00", ph: "HH:MM" }
    ], function (val) { return axOrden(Object.assign({ que: "trafico", antes: nueva ? "" : r.nombre }, val), nueva ? "Regla creada." : "Regla guardada."); },
    nueva ? null : function () { return axOrden({ que: "trafico_borrar", nombre: r.nombre }, "Regla borrada."); }, axListaEquipos(), "Se aplica al momento en AdGuard Home");
    var q = form.querySelector(".nx-ax-apps-q");
    if (q) q.addEventListener("input", function () {
      var t = q.value.trim().toLowerCase();
      form.querySelectorAll(".nx-ax-apps label").forEach(function (l) { l.hidden = !!t && l.dataset.n.indexOf(t) < 0; });
      form.querySelectorAll(".nx-ax-apps h5").forEach(function (h) { h.hidden = !!t; });
    });
  }
  function axApps(c) {
    var por = {};
    (c.o || []).forEach(function (x) { (por[x.grupo] = por[x.grupo] || []).push(x); });
    var sel = c.v || [];
    return '<div class="nx-ax-f ancho"><span><b>' + c.l + "</b><small>" + sel.length + ' elegidas · pulsa para marcar</small></span><input type="search" class="nx-ax-apps-q" placeholder="Buscar app…" autocomplete="off">' +
      '<div class="nx-ax-apps" data-k="' + c.k + '" data-varias="1">' + (c.o && c.o.length ? Object.keys(por).sort(function (a, b) { return (AX_GRUPOS[a] || a).localeCompare(AX_GRUPOS[b] || b, "es"); }).map(function (g) {
        return "<h5>" + escapar(AX_GRUPOS[g] || g) + "</h5>" + por[g].map(function (x) {
          return '<label data-n="' + escapar(x.nombre.toLowerCase()) + '"><input type="checkbox" value="' + escapar(x.id) + '"' + (sel.indexOf(x.id) >= 0 ? " checked" : "") + ">" +
            (x.icono ? '<img alt="" src="data:image/svg+xml;base64,' + x.icono + '">' : "") + "<span>" + escapar(x.nombre) + "</span></label>";
        }).join("");
      }).join("") : '<p class="nx-b-nota">Cargando la lista de apps…</p>') + "</div></div>";
  }

  // ------------------------------------------------------------ concesiones del DHCP (bajo IP fijas)
  function axConcesiones(d) {
    var l = d.concesiones || [];
    if (!l.length) return "";
    return '<h3 class="nx-ax-sub">Concesiones activas <small>' + l.length + " equipos con IP repartida ahora</small></h3>" +
      '<div class="nx-b nx-ax-tabla nx-ax-t-conc"><div class="nx-ax-fila nx-ax-enc"><span>Equipo</span><span>IP</span><span>MAC</span><span>Caduca en</span><span></span></div>' +
      l.map(function (c) {
        return '<div class="nx-ax-fila fija"><span><b>' + escapar(c.nombre || "Sin nombre") + "</b></span><span><code>" + escapar(c.ip) + "</code></span><span><code>" + escapar(c.mac) + "</code></span>" +
          "<span>" + (c.expira > 0 ? vDura(c.expira) : "—") + "</span><span>" + (c.fija ? axChip("fija", "ok") :
            '<button type="button" class="nx-cfg-btn nx-ax-mini" data-axfijar="' + escapar(c.mac) + '" data-ip="' + escapar(c.ip) + '" data-n="' + escapar(c.nombre) + '">Fijar</button>') + "</span></div>";
      }).join("") + "</div>";
  }

  // ------------------------------------------------------------ VPN (Tailscale)
  var AX_SO = { linux: "linux", macOS: "apple", iOS: "cellphone", android: "android", windows: "microsoft-windows" };
  function axVpn(d) {
    var v = d.vpn || {};
    if (!v.ok) return clConecta("tailscale", "shield-lock-outline", "Conecta Tailscale", "para entrar en casa desde fuera y ver aquí la VPN (" + escapar(v.error || "este servidor no lo tiene") + ")");
    var yo = v.nodos[0] || {}, on = v.nodos.filter(function (n) { return n.en_linea; }).length;
    var aviso = v.operador ? "" : '<div class="nx-ax-nota nx-ax-alerta">' + exIco("key-outline") + "<span>Para cambiar algo desde aquí, Tailscale pide una vez en este servidor: <code>sudo tailscale set --operator=$USER</code>. Mientras, todo esto es solo de lectura.</span></div>";
    var redes = (d.redes || []).filter(function (r) { return r.id !== "guest"; }).map(function (r) {
      var x = v.rutas.filter(function (y) { return y.red === r.cidr; })[0];
      return '<li><span><b>' + escapar(r.nombre) + "</b><code>" + escapar(r.cidr) + "</code></span>" + (x ? (x.aprobada ? axChip("visible desde fuera", "ok") : axChip("pendiente de aprobar", "av")) : axChip("no visible")) + "</li>";
    }).join("");
    var nodos = v.nodos.map(function (n) {
      return '<div class="nx-ax-fila fija' + (n.en_linea ? "" : " apagada") + '"><span><i class="nx-ax-punto' + (n.en_linea ? " on" : "") + '"></i>' + exIco(AX_SO[n.so] || "devices") +
        "<b>" + escapar(n.nombre === "device-of-shared-to-user" ? "Compartido" : n.nombre) + "</b>" + (n.yo ? axChip("este servidor", "v") : "") + (n.compartido ? axChip("compartido") : "") +
        "<small>" + escapar(n.usuario) + (n.dns ? " · " + escapar(n.dns.split(".")[0]) : "") + "</small></span>" +
        "<span><code>" + escapar(n.ip) + "</code></span>" +
        "<span>" + (n.yo ? "—" : n.en_linea ? (n.conexion ? axChip(n.conexion === "directa" ? "directa" : n.conexion.replace("relé ", "relé · "), n.conexion === "directa" ? "ok" : "av") : "—") : "visto " + vHace(n.visto)) + "</span>" +
        "<span>" + (n.yo ? "" : "↓ " + vBytes(n.baja) + " · ↑ " + vBytes(n.sube)) + "</span>" +
        "<span>" + (n.rutas.length ? n.rutas.map(function (r) { return axChip(escapar(r), "v"); }).join("") : "") + (n.salida_ofrece ? axChip("salida", "ok") : "") + (n.usa_salida ? axChip("en uso como salida", "av") : "") + "</span></div>";
    }).join("");
    return aviso + '<div class="nx-vt-rejilla">' +
      '<div class="nx-b nx-f4"><h3>Acceso remoto <span>Tailscale ' + escapar(v.version) + '</span></h3><dl class="nx-rd-datos nx-ax-sis">' +
        "<div><dt>Estado</dt><dd>" + (v.estado === "Running" ? '<span class="nx-rd-on">Conectado</span>' : escapar(v.estado || "")) + "</dd></div>" +
        "<div><dt>IP de este servidor</dt><dd>" + escapar(yo.ip || "") + "</dd></div>" +
        "<div><dt>Red privada</dt><dd>" + escapar(v.dominio) + "</dd></div><div><dt>Dispositivos</dt><dd>" + on + " de " + v.nodos.length + " conectados</dd></div></dl></div>" +
      '<div class="nx-b nx-f4"><h3>Redes de casa visibles <span>desde fuera</span></h3><ul class="nx-ax-vpn-redes">' + redes + "</ul>" +
        '<button type="button" class="nx-cfg-btn" data-axe="vpn" data-id="rutas"' + (v.operador ? "" : " disabled") + ">" + exIco("tune-variant") + "Elegir redes</button></div>" +
      '<div class="nx-b nx-f4"><h3>Nodo de salida <span>Internet de casa desde fuera</span></h3><p class="nx-b-nota">Con él activo, el móvil o el portátil pueden salir a Internet por tu casa (wifi públicas, contenidos solo de España…).</p>' +
        '<div class="nx-ax-vpn-sal">' + (v.salida.anunciada ? (v.salida.aprobada ? axChip("activo", "ok") : axChip("anunciado · falta aprobarlo en la consola", "av")) : axChip("apagado")) +
        '<button type="button" class="nx-cfg-btn' + (v.salida.anunciada ? " nx-cfg-peligro" : " nx-ax-prim") + '" data-axvpnsal="' + (v.salida.anunciada ? 0 : 1) + '"' + (v.operador ? "" : " disabled") + ">" + (v.salida.anunciada ? "Quitar" : "Activar") + "</button></div></div></div>" +
      '<h3 class="nx-ax-sub">Dispositivos <small>toda la red de Tailscale</small><a class="nx-ax-consola" href="https://login.tailscale.com/admin/machines" target="_blank" rel="noreferrer">Consola de Tailscale ↗</a></h3>' +
      '<div class="nx-b nx-ax-tabla nx-ax-t-vpn"><div class="nx-ax-fila nx-ax-enc"><span>Dispositivo</span><span>IP</span><span>Conexión</span><span>Tráfico</span><span>Ofrece</span></div>' + nodos + "</div>" +
      '<p class="nx-ax-pie">' + exIco("information-outline") + "Lo que anuncies (una red o el nodo de salida) hay que <b>aprobarlo</b> después en la consola de Tailscale, salvo que tengas autoaprobación. «Relé» quiere decir que la conexión no es directa y pasa por un servidor de Tailscale (más lenta).</p>";
  }
  function axVpnAbrir() {
    var d = ax.d, v = d.vpn, ya = v.rutas.map(function (r) { return r.red; });
    var redes = (d.redes || []).filter(function (r) { return r.id !== "guest"; });
    axForm("vpn", "Redes visibles desde fuera", "lo que anuncia este servidor en Tailscale", [
      { k: "redes", t: "varias", l: "Redes", v: ya, o: redes.map(function (r) { return [r.cidr, r.nombre + " · " + r.cidr]; }), ancho: true },
      { t: "nota", l: "La red de casa no se puede quitar: es por donde entras al panel desde fuera. Las VLAN nuevas solo se alcanzan si el cortafuegos deja pasar de Casa a esa red." }
    ], function (val) { return axOrden({ que: "vpn_rutas", redes: val.redes }, "Redes anunciadas."); }, null, "", "Se aplica en el Tailscale de este servidor");
  }

  var AX_PINTAR = {
    redes: { cuerpo: axRedes, herr: function () { return '<button type="button" class="nx-cfg-btn nx-ax-prim" data-axe="red" data-id="">' + exIco("plus") + "Crear red</button>"; } },
    wifi: { cuerpo: axWifi, herr: function () { return '<button type="button" class="nx-cfg-btn nx-ax-prim" data-axe="wifi" data-id="">' + exIco("plus") + "Crear wifi</button>"; } },
    puertos: { cuerpo: axPuertos },
    internet: { cuerpo: axInternet },
    vpn: { cuerpo: axVpn },
    trafico: { cuerpo: axTrafico, herr: function () { return '<button type="button" class="nx-cfg-btn nx-ax-prim" data-axe="trafico" data-id="">' + exIco("plus") + "Crear regla</button>"; } },
    cortafuegos: { cuerpo: axCortafuegos, herr: function () {
      return '<button type="button" class="nx-cfg-btn" data-axsis="1">' + (ax.sis ? "Esconder" : "Ver") + " las del sistema</button>" +
        '<button type="button" class="nx-cfg-btn nx-ax-prim" data-axe="regla" data-id="">' + exIco("plus") + "Crear regla</button>"; } },
    reenvios: { cuerpo: axReenvios, herr: function () { return '<button type="button" class="nx-cfg-btn nx-ax-prim" data-axe="reenvio" data-id="">' + exIco("plus") + "Abrir un puerto</button>"; } },
    rutas: { cuerpo: axRutas, herr: function () { return '<button type="button" class="nx-cfg-btn nx-ax-prim" data-axe="ruta" data-id="">' + exIco("plus") + "Crear ruta</button>"; } },
    dns: { cuerpo: axDns, herr: function () { return '<button type="button" class="nx-cfg-btn nx-ax-prim" data-axe="dns" data-id="">' + exIco("plus") + "Añadir nombre</button>"; } },
    fijas: { cuerpo: axFijas, herr: function () { return '<button type="button" class="nx-cfg-btn nx-ax-prim" data-axe="fija" data-id="">' + exIco("plus") + "Añadir IP fija</button>"; } },
    router: { cuerpo: axRouter, despues: function (d) {
      vPoner("nx-ax-sis", axRouterSis(d));
      if (ax.reg && !document.querySelector("#nx-ax-reg pre")) vPoner("nx-ax-reg", axRegHTML());
      var q = document.getElementById("nx-ax-reg-q");
      if (q && document.activeElement !== q && q.value !== ax.regF) q.value = ax.regF; } }
  };
  var AX_ABRIR = { vpn: axVpnAbrir, internet: axInternetAbrir, trafico: axTraficoAbrir, red: axRedAbrir, wifi: axWifiAbrir, radio: axRadioAbrir, puerto: axPuertoAbrir, regla: axReglaAbrir, reenvio: axReenvioAbrir, ruta: axRutaAbrir, dns: axDnsAbrir, fija: axFijaAbrir };

  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest("#nx-ax")) return;
    var q = e.target.closest("[data-axqr]");
    if (q) { e.stopPropagation(); return axQr(q.dataset.axqr); }
    var b = e.target.closest("[data-axe]");
    if (b && ax.d) return AX_ABRIR[b.dataset.axe](b.dataset.id);
    var m = e.target.closest("[data-axmtz]");
    if (m) {
      var p = m.dataset.axmtz.split(">"), si = m.dataset.si === "1";
      return ps5Confirmar((si ? "¿Permitir" : "¿Bloquear") + " de «" + axZona(p[0]) + "» a «" + axZona(p[1]) + "»?",
        si ? "Los equipos de " + axZona(p[0]) + " podrán abrir conexiones hacia " + axZona(p[1]) + "." : "Las conexiones nuevas de " + axZona(p[0]) + " hacia " + axZona(p[1]) + " se cortarán.", si ? "Permitir" : "Bloquear", !si)
        .then(function (ok) { if (ok) axOrden({ que: "matriz", de: p[0], a: p[1], si: si }, "Cortafuegos cambiado."); });
    }
    if (e.target.closest("[data-axsis]")) { ax.sis = !ax.sis; return axPintar(ax.d); }
    var vs_ = e.target.closest("[data-axvpnsal]");
    if (vs_) {
      var si_ = vs_.dataset.axvpnsal === "1";
      return ps5Confirmar(si_ ? "¿Activar el nodo de salida?" : "¿Quitar el nodo de salida?", si_ ? "Tus dispositivos podrán salir a Internet por casa. Después hay que aprobarlo en la consola de Tailscale." : "Quien lo esté usando volverá a salir por su propia conexión.", si_ ? "Activar" : "Quitar", !si_)
        .then(function (ok) { if (ok) axOrden({ que: "vpn_salida", si: si_ }, si_ ? "Nodo de salida anunciado." : "Nodo de salida quitado."); });
    }
    var fj = e.target.closest("[data-axfijar]");
    if (fj) return axFijaAbrir("", { mac: fj.dataset.axfijar, ip: fj.dataset.ip, nombre: fj.dataset.n });
    if (e.target.closest("[data-axreconectar]")) {
      return ps5Confirmar("¿Reconectar la línea?", "La casa se queda unos segundos sin Internet y la IP pública puede cambiar.", "Reconectar", true)
        .then(function (ok) { if (ok) axOrden({ que: "reconectar" }, "Reconectando."); });
    }
    if (e.target.closest("[data-axreg]")) return axRegLeer();
    if (e.target.closest("[data-axreinicio]")) {
      return ps5Confirmar("¿Reiniciar el router?", "Toda la casa se queda sin Internet ni wifi un par de minutos. El panel volverá solo cuando arranque.", "Reiniciar", true)
        .then(function (ok) { if (ok) vOrden("/api/router/ajustes", { que: "reiniciar", seguro: "REINICIAR" }, "Reiniciando el router."); });
    }
  });
  document.addEventListener("keydown", function (e) {
    var q = e.target.closest && e.target.closest("[data-axqr]");
    if (q && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); axQr(q.dataset.axqr); }
  }, true);
  document.addEventListener("input", function (e) {
    if (e.target.id !== "nx-ax-reg-q") return;
    ax.regF = e.target.value;
    vPoner("nx-ax-reg", axRegHTML());
  });

  function vTexto(id, t) { var e = document.getElementById(id); if (e && e.textContent !== t) e.textContent = t; }
  function vsPintar() {
    var v = VT[vs.tab];
    if (!v || !document.getElementById("nx-vista")) return;
    document.getElementById("nx-vista").classList.toggle("nx-vista-caida", vs.caido);
    if (vs.caido && !vs.datos) return vTexto("nx-vista-sub", "El servicio de datos no responde.");
    if (vs.datos) v.pintar(vs.datos);
  }
  function vLeer() {
    var t = vs.tab, v = VT[t];
    if (!v || document.hidden) return;
    fetch((v.base ? v.base() : CEN) + v.ruta()).then(function (r) { return r.json(); }).then(function (d) {
      if (t !== vs.tab) return;
      vs.datos = d; vs.caido = false; vsPintar();
    }).catch(function () { if (t === vs.tab) { vs.caido = true; vsPintar(); } });
  }
  window.addEventListener("resize", function () {
    if (vs.tab !== "Red") return;
    clearTimeout(rd.tr);
    rd.tr = setTimeout(vsPintar, 180);
  });
  function pintarVistas() {
    var cont = document.getElementById("layout-groups"), sec = document.getElementById("nx-vista");
    var t = pestanaActiva(), v = cont && VT[t];
    document.body.classList.toggle("nx-en-vista", !!v);
    var deEq = t === "Red" ? eqMac() || (axSec() ? "ajustes" : "") : "";
    if (t && t !== "Red" && (eqMac() || axSec())) { try { history.replaceState(history.state, "", location.pathname + location.hash); } catch (e) { /* sin historial */ } }
    document.body.classList.toggle("nx-a-sangre", !!v && (t === "Red" && !deEq || t === "Domótica"));
    if (!v) {
      if (sec) sec.remove();
      if (vs.reloj) { clearInterval(vs.reloj); vs.reloj = null; }
      vs.tab = "";
      return;
    }
    if (sec && sec.dataset.t === t && sec.isConnected && (sec.dataset.eqm || "") === deEq) return;
    if (sec) sec.remove();
    if (vs.reloj) clearInterval(vs.reloj);
    vs.tab = t; vs.datos = null; vs.firmas = {}; vs.caido = false;
    sec = document.createElement("section");
    sec.id = "nx-vista";
    sec.dataset.t = t;
    sec.dataset.eqm = deEq;
    sec.className = "nx-vista-" + palNorm(t);
    sec.innerHTML = '<div class="nx-cfg-cab"><span class="nx-tit-ico" style="--u:url(&quot;' + CDN + v.ico + '.svg&quot;)"></span>' +
      "<div><h1>" + t + '</h1><p id="nx-vista-sub">Cargando…</p></div>' +
      (v.buscar ? '<div class="nx-cfg-herr"><input id="nx-vista-buscar" type="search" placeholder="' + v.buscar + '" autocomplete="off" aria-label="' + v.buscar + '"></div>' : "") +
      '</div><div id="nx-vista-cuerpo"></div>';
    cont.parentElement.insertBefore(sec, cont);
    v.montar(sec.querySelector("#nx-vista-cuerpo"));
    var b = sec.querySelector("#nx-vista-buscar");
    if (b) { b.value = rd.q; b.addEventListener("input", function () { rd.q = b.value.trim().toLowerCase(); vsPintar(); }); }
    vLeer();
    vs.reloj = setInterval(vLeer, v.cada);
  }

  // ==========================================================================
  // Velocidad, discos, consola y paleta (09-10-2026).
  //
  //   · Red: ficha «Velocidad de la línea» (centinela mide sola cada tantas
  //     horas contra Cloudflare; aquí se ve la última y el histórico).
  //   · Sistema: «Salud de los discos» (SMART) y, en la tabla de contenedores,
  //     el registro y una terminal de cada uno, más la terminal del servidor.
  //   · Ctrl+K: la paleta. Se escribe lo que se quiere («reiniciar jellyfin»,
  //     «red», «luz cocina») y se hace.
  // Registros, terminal y órdenes a contenedores piden la sesión de
  // mantenimiento: la misma cookie que el panel del :8099.
  // ==========================================================================
  var MANT = location.protocol + "//" + location.hostname + ":8099/";
  function cenJSON(ruta, opciones) {
    return fetch(CEN + ruta, opciones || {}).then(function (r) {
      return r.json().then(function (j) {
        if (r.status === 401) { var e = new Error("sesion"); e.sesion = true; throw e; }
        if (!r.ok) throw new Error(j.error || "sin respuesta");
        return j;
      });
    });
  }
  function cenOrden(ruta, cuerpo) {
    return cenJSON(ruta, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-NX-Panel": "1" }, body: JSON.stringify(cuerpo || {}) });
  }
  function pedirSesion(para) {
    return CF.entrar(para);
  }
  function conSesion(para) {              // promesa: true si hay sesion; si no, la pide
    return cenJSON("/api/sesion", { credentials: "include" }).then(function (s) { return s.ok ? true : pedirSesion(para); })
      .catch(function () { ps5Aviso("El servicio de datos no responde", true); return false; });
  }
  function mbps(v) { return v == null ? "—" : v >= 100 ? String(Math.round(v)) : String(v).replace(".", ","); }

  // ------------------------------------------------------------ velocidad
  var vl = { d: null, t: 0 };
  function velPintar() {
    var d = vl.d;
    if (!d || !document.getElementById("nx-rd-vel")) return;
    var u = d.ultima, h = (d.historia || []).slice(-36), max = 1;
    h.forEach(function (x) { max = Math.max(max, x[1] || 0, x[2] || 0); });
    var barras = h.map(function (x) {
      return '<i title="' + vHace(x[0]) + " · ↓ " + mbps(x[1]) + " · ↑ " + mbps(x[2]) + ' Mbps"><b style="height:' + Math.max(3, (x[1] || 0) / max * 100).toFixed(0) +
        '%"></b><em style="height:' + Math.max(3, (x[2] || 0) / max * 100).toFixed(0) + '%"></em></i>';
    }).join("");
    var s = d.semana;
    vPoner("nx-rd-vel",
      (u ? '<div class="nx-vel-cifras"><div><b>' + mbps(u.baja) + "</b><small>Mbps</small><span>↓ bajada</span></div>" +
            "<div><b>" + mbps(u.sube) + "</b><small>Mbps</small><span>↑ subida</span></div>" +
            "<div><b>" + (u.ping == null ? "—" : Math.round(u.ping)) + "</b><small>ms</small><span>latencia</span></div></div>"
         : '<p class="nx-b-nota">' + (d.midiendo ? "Midiendo por primera vez…" : "Todavía no hay ninguna medida.") + "</p>") +
      (h.length > 1 ? '<div class="nx-vel-hist">' + barras + "</div>" : "") +
      '<div class="nx-vel-pie"><span>' + (d.midiendo ? "Midiendo ahora…" : u ? vHace(u.ts) + " · " + escapar(u.servidor) +
          (s && s.n > 2 ? " · semana: " + mbps(s.min) + "–" + mbps(s.max) : "") : "") + (d.error ? " · " + escapar(d.error) : "") + "</span>" +
        '<button type="button" class="nx-h-abrir" data-vel="medir"' + (d.midiendo ? " disabled" : "") + ">" + (d.midiendo ? "Midiendo…" : "Medir ahora") + "</button></div>");
  }
  function velLeer() {
    vl.t = Date.now();
    cenJSON("/api/velocidad").then(function (d) { vl.d = d; velPintar(); }).catch(function () { /* centinela caido: ya lo dice la vista */ });
  }
  function velMedir() {
    return cenOrden("/api/velocidad/medir").then(function () {
      ps5Aviso("Midiendo la línea: tarda unos veinte segundos");
      if (vl.d) { vl.d.midiendo = true; velPintar(); }
      setTimeout(velLeer, 1500);
    }).catch(function (e) { ps5Aviso("No se ha podido: " + e.message, true); });
  }
  function velTic() {
    if (pestanaActiva() !== "Red" || document.hidden) return;
    if (Date.now() - vl.t > (vl.d && vl.d.midiendo ? 2500 : 30000)) velLeer(); else velPintar();
  }

  // ------------------------------------------------------------ el router al detalle
  // Todo lo que centinela saca del router (router.mas): la sesion PPPoE, IPv6,
  // los puertos, las dos radios, la red local y el propio aparato.
  var rt = { f: "" };
  var RT_WIFI = [[/^EHT/, "Wi-Fi 7"], [/^HE/, "Wi-Fi 6"], [/^VHT/, "Wi-Fi 5"], [/^HT/, "Wi-Fi 4"]];
  function rtDato(r, v, cls) { return v == null || v === "" ? "" : "<div" + (cls ? ' class="' + cls + '"' : "") + "><dt>" + r + "</dt><dd>" + v + "</dd></div>"; }
  function rtBarra(r, usado, total, texto) {
    if (!total) return "";
    var p = Math.max(0, Math.min(100, usado / total * 100));
    return '<div class="nx-rt-barra"><dt>' + r + "</dt><dd>" + texto + '</dd><span><i style="width:' + p.toFixed(1) + '%" class="' + (p > 85 ? "m" : p > 65 ? "a" : "") + '"></i></span></div>';
  }
  function rtDesde(seg) { return seg == null ? "" : vDura(seg) + " <small>desde el " + new Date(Date.now() - seg * 1000).toLocaleDateString("es-ES", { day: "numeric", month: "long" }) + "</small>"; }
  function rtSec(ico, titulo, sub, cuerpo, cls) {
    return '<section class="nx-rt-sec ' + (cls || "") + '"><h3>' + exIco(ico) + titulo + (sub ? "<span>" + sub + "</span>" : "") + "</h3>" + cuerpo + "</section>";
  }
  function rtHTML(d) {
    var m = (d.router || {}).mas;
    if (!m || m.error) return '<p class="nx-ps5-vacio">' + (m && m.error ? "El router no ha contestado: " + escapar(m.error) : "Preguntando al router…") + "</p>";
    var i = m.internet || {}, v6 = i.v6 || {}, l = m.local || {}, y = m.sistema || {}, disp = d.dispositivos || [];
    var chip = function (si, a, b) { return '<em class="nx-rt-chip ' + (si ? "ok" : "mal") + '">' + (si ? a : b) + "</em>"; };
    var dns = function (lista) { return (lista || []).map(function (x) { return escapar(x) + (x === location.hostname ? " <small>AdGuard, en este servidor</small>" : ""); }).join("<br>"); };
    var h = rtSec("web", "Internet", escapar(i.proto || "") + (i.vlan ? " · VLAN " + escapar(i.vlan) : ""), "<dl>" +
      rtDato("Estado", chip(i.activa, "Conectada", "Sin conexión")) +
      rtDato("Protocolo", escapar(i.proto || "") + (i.vlan ? " sobre la VLAN " + escapar(i.vlan) + " del puerto " + escapar((i.puerto || "").toUpperCase()) : "")) +
      rtDato("Sesión abierta", rtDesde(i.desde)) +
      rtDato("IP pública", "<b>" + escapar(i.ip || "—") + "</b>") +
      rtDato("Puerta de enlace del operador", escapar(i.puerta || "")) +
      rtDato("Interfaz · MTU", escapar(i.ifaz || "") + " · " + (i.mtu || "—")) +
      rtDato("DNS que usa el router", dns(i.dns)) +
      rtDato("Recibido en esta sesión", "↓ " + vBytes(i.rx)) + rtDato("Enviado en esta sesión", "↑ " + vBytes(i.tx)) +
      rtDato("Paquetes descartados · errores", (i.descartes || 0).toLocaleString("es-ES") + " · " + (i.errores || 0), i.errores ? "a" : "") + "</dl>", "nx-rt-ancha");
    h += rtSec("ip-network-outline", "IPv6", v6.activa ? "en marcha" : "sin IPv6", "<dl>" +
      rtDato("Estado", chip(v6.activa, "Activo", "Apagado")) + rtDato("Dirección del router", escapar(v6.ip || "")) +
      rtDato("Prefijo que da el operador", escapar(v6.prefijo || "")) + rtDato("Redes de casa", (l.v6 || []).map(escapar).join("<br>")) +
      rtDato("DNS del operador", dns(v6.dns)) + rtDato("En marcha", rtDesde(v6.desde)) + "</dl>");
    h += rtSec("ethernet", "Puertos", (m.puertos || []).filter(function (p) { return p.enlace; }).length + " de " + (m.puertos || []).length + " con cable",
      '<div class="nx-rt-puertos">' + (m.puertos || []).map(function (p) {
        var vel = !p.enlace ? "sin cable" : p.velocidad >= 1000 ? String(p.velocidad / 1000).replace(".", ",") + " Gb" : (p.velocidad || "?") + " Mb";
        return '<div class="nx-rt-puerto' + (p.enlace ? " on" : "") + (p.nombre === "wan" ? " wan" : "") + '"><span></span><b>' + escapar(p.nombre.replace(/^lan/, "LAN ").toUpperCase()) + "</b><i>" + vel +
          (p.enlace && p.duplex === "medio" ? " · medio dúplex" : "") + "</i><small>↓ " + vBytes(p.rx) + "<br>↑ " + vBytes(p.tx) + "</small>" +
          (p.errores ? '<em class="a">' + p.errores + " errores</em>" : "") + "</div>";
      }).join("") + "</div>", "nx-rt-ancha");
    (m.radios || []).forEach(function (r) {
      var gen = "", ancho = String(r.modo || "").replace(/^\D+/, "");
      RT_WIFI.some(function (g) { if (g[0].test(r.modo || "")) { gen = g[1]; return true; } });
      var n = disp.filter(function (x) { return x.en_linea && x.wifi && (x.conexion === (r.banda === "5 GHz" ? "wifi5" : "wifi2.4")); }).length;
      h += rtSec("wifi", escapar(r.ssid || "Wifi"), r.banda, "<dl>" +
        rtDato("Equipos conectados", "<b>" + n + "</b>") +
        rtDato("Canal", (r.canal || "—") + (r.canal_cfg === "auto" ? " <small>elegido solo</small>" : "") + (r.frecuencia ? " · " + r.frecuencia + " MHz" : "")) +
        rtDato("Estándar · ancho", (gen || escapar(r.modo || "—")) + (ancho ? " · " + ancho + " MHz" : "")) +
        rtDato("Potencia de emisión", r.potencia != null ? r.potencia + " dBm" : "") + rtDato("Ruido del canal", r.ruido != null ? r.ruido + " dBm" : "") +
        rtDato("Seguridad", escapar(r.cifrado || "")) + rtDato("País", escapar(r.pais || "")) + rtDato("MAC de la radio", escapar(r.mac || "")) +
        rtDato("Tráfico desde que arrancó", "↓ " + vBytes(r.tx) + " · ↑ " + vBytes(r.rx)) + "</dl>");
    });
    var res = disp.filter(function (x) { return x.reserva; }).length, veto = disp.filter(function (x) { return x.bloqueado; }).length;
    h += rtSec("lan", "Red de casa", escapar(l.ip || ""), "<dl>" +
      rtDato("Dirección del router", escapar(l.ip || "")) + rtDato("Reparto automático (DHCP)", escapar(l.rango || "")) + rtDato("Duración de cada concesión", escapar(l.plazo || "")) +
      rtDato("DNS que reciben los equipos", dns(String(l.dns || "").split(", ").filter(Boolean))) + rtDato("IP fijas reservadas", res) +
      rtDato("Equipos sin salida a Internet", veto, veto ? "a" : "") +
      rtDato("Tráfico del puente", l.puente ? "↓ " + vBytes(l.puente.tx) + " · ↑ " + vBytes(l.puente.rx) : "") + "</dl>");
    h += rtSec("chip", "El aparato", "OpenWrt " + escapar(y.version || ""), "<dl>" +
      rtDato("Modelo", escapar(y.modelo || "")) + rtDato("Nombre", escapar(y.nombre || "")) +
      rtDato("Firmware", "OpenWrt " + escapar(y.version || "") + " <small>" + escapar(y.revision || "") + "</small>") +
      rtDato("Compilado el", y.compilado ? new Date(y.compilado * 1000).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "") +
      rtDato("Núcleo · plataforma", escapar(y.nucleo || "") + " · " + escapar(y.plataforma || "")) + rtDato("Procesador", escapar(y.procesador || "")) +
      rtDato("Encendido", rtDesde(y.encendido)) + rtDato("Carga (1 · 5 · 15 min)", (y.carga || []).map(function (c) { return String(c).replace(".", ","); }).join(" · ")) +
      rtBarra("Memoria", y.mem_total - y.mem_libre, y.mem_total, vBytes(y.mem_total - y.mem_libre) + " de " + vBytes(y.mem_total)) +
      rtBarra("Almacenamiento", y.flash_total - y.flash_libre, y.flash_total, vBytes(y.flash_total - y.flash_libre) + " de " + vBytes(y.flash_total)) +
      rtBarra("Conexiones abiertas", y.conexiones, y.conexiones_max, (y.conexiones || 0).toLocaleString("es-ES") + " de " + (y.conexiones_max || 0).toLocaleString("es-ES")) +
      rtDato("Procesos", y.procesos) + rtDato("Aceleración del tráfico", y.aceleracion ? "activada" : "desactivada") + "</dl>" +
      ((y.servicios || []).length ? '<div class="nx-rt-serv"><span>Servicios en marcha</span>' + y.servicios.map(function (x) { return "<em>" + escapar(x) + "</em>"; }).join("") + "</div>" : ""), "nx-rt-ancha");
    return h;
  }
  function rtPintar() {
    var e = document.getElementById("nx-rt");
    if (!e || !vs.datos) return;
    var h = rtHTML(vs.datos);
    if (rt.f !== h || !e.firstChild) { e.innerHTML = h; rt.f = h; }
  }
  function rtAbrir() {
    var ro = (vs.datos || {}).router || {};
    var c = conCaja("router-wireless", ro.modelo || "Router", "al detalle · se actualiza solo",
      '<a class="nx-con-op" target="_blank" rel="noreferrer" href="http://' + escapar(ro.ip || "192.168.1.1") + '/">Abrir su panel ↗</a>');
    c.classList.add("nx-con-rt");
    c.querySelector("#nx-con-cuerpo").innerHTML = '<div id="nx-rt"></div><div class="nx-cp-caja">' +
      rtSec("backup-restore", "Copias de la configuración", "para volver atrás si algo se rompe", '<div id="nx-cp"></div>', "nx-rt-ancha") + "</div>";
    rt.f = "";
    rtPintar();
    delete vs.firmas["nx-cp"];
    cpLeer(true);
  }
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-rt]")) rtAbrir(); });

  // ------------------------------------------------------------ consola: registros y terminal
  var con = { ws: null, term: null, reloj: null, carga: null, alTamano: null };
  var XT = "/cdn/";
  function conCerrar() {
    if (con.ws) { try { con.ws.close(); } catch (e) { /* ya cerrada */ } con.ws = null; }
    if (con.term) { try { con.term.dispose(); } catch (e2) { /* nada */ } con.term = null; }
    if (con.reloj) { clearInterval(con.reloj); con.reloj = null; }
    if (con.alTamano) { window.removeEventListener("resize", con.alTamano); con.alTamano = null; }
    var c = document.getElementById("nx-con");
    if (c) c.remove();
  }
  function conCaja(ico, titulo, sub, herr) {
    conCerrar();
    var c = document.createElement("div");
    c.id = "nx-con";
    c.innerHTML = '<div class="nx-con-v" role="dialog" aria-modal="true" aria-label="' + escapar(titulo) + '"><header>' + exIco(ico) + "<b>" + escapar(titulo) + "</b><i>" + escapar(sub) + "</i>" +
      '<div class="nx-con-herr">' + (herr || "") + '</div><button type="button" class="nx-con-x" data-con="cerrar" aria-label="Cerrar">×</button></header><div id="nx-con-cuerpo"></div></div>';
    document.body.appendChild(c);
    c.addEventListener("mousedown", function (e) { if (e.target === c) conCerrar(); });
    // que lo tecleado aqui no llegue a Homepage (abre su buscador con cualquier tecla)
    ["keydown", "keyup", "keypress"].forEach(function (t) {
      c.addEventListener(t, function (e) { if (t === "keydown" && e.key === "Escape" && !con.term) conCerrar(); e.stopPropagation(); });
    });
    c.addEventListener("click", function (e) { if (e.target.closest('[data-con="cerrar"]')) conCerrar(); });
    return c;
  }
  function palNorm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  var mn = { cerr: null, rec: null, b: {}, ts: 0, ult: "", g: 0 };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
