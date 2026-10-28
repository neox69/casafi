"""CasaFi Network (antes CasaLAB Red): la red de casa (router OpenWrt) al estilo UniFi, en su propio contenedor.

Fase 1: el backend de red de centinela (red.py) con las mismas rutas de su API.
Mientras dure la obra va en solo lectura (CASALAB_ESCRITURA=0): el panel de
siempre (centinela + Homepage) es el único que cambia nada hasta el día del
corte (docs/CORTE.md).

De dónde salen los datos (CASALAB_DATOS_DE):
  espejo  (por defecto hasta el corte) la API de red se pide a centinela, que ya
          lee el router: así el router, AdGuard e Internet no reciben cada
          consulta dos veces. Los bucles propios no arrancan.
  propio  el backend de red.py lee el router él mismo (el día del corte, o para
          probarlo un rato con tools/comparar.py).
"""
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import config
import instalar
import red as r

VERSION = "0.4.0"
FASE = 3


# Lo que la app escribe (y los errores de sus hilos) va también a /data/casafi.log,
# que se descarga con el diagnóstico (Ajustes → Aplicación). Hasta 2 MB y una copia.
REGISTRO_F = os.path.join(r.DATOS, "casafi.log")


class _Doble:
    def __init__(self, orig):
        self.orig = orig
        self.cerrojo = threading.Lock()

    def write(self, t):
        self.orig.write(t)
        if not t:
            return
        with self.cerrojo:
            try:
                if os.path.exists(REGISTRO_F) and os.path.getsize(REGISTRO_F) > 2_000_000:
                    os.replace(REGISTRO_F, REGISTRO_F + ".1")
                with open(REGISTRO_F, "a", encoding="utf-8") as f:
                    if t.strip():
                        f.write(time.strftime("[%Y-%m-%d %H:%M:%S] ") + t if not t.startswith((" ", "\t", "Traceback")) else t)
                    else:
                        f.write(t)
            except OSError:
                pass

    def flush(self):
        self.orig.flush()


sys.stdout, sys.stderr = _Doble(sys.stdout), _Doble(sys.stderr)
WEB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
ARRANQUE = int(time.time())
DATOS_DE = os.environ.get("CASALAB_DATOS_DE", "propio")
ESPEJO = DATOS_DE == "espejo"
# lo que en modo espejo se pide a centinela tal cual (misma API)
DEL_ESPEJO = re.compile(r"^/(api/red(/.*)?|api/router/.+|api/velocidad|api/ufp(/indice)?|api/sesion|ufp/\d+\.png|dpi/[^/]+\.png|icono/[^/]+)$")
# La Red (la interfaz de hoy en su armazón) y la página de estado
PAGINAS = {"/": ("index.html", "text/html; charset=utf-8"), "/estado": ("estado.html", "text/html; charset=utf-8"),
           }


TIPOS = {"css": "text/css; charset=utf-8", "js": "text/javascript; charset=utf-8", "svg": "image/svg+xml"}
# Lo que antes se bajaba de jsDelivr: se pide una vez y se guarda en /data/cdn.
CDN_MDI = "https://cdn.jsdelivr.net/npm/@mdi/svg@7.4.47/svg/%s.svg"
CDN_LIBRES = re.compile(r"^(qrcode-generator@1\.4\.4/qrcode\.js|@fontsource/(inter@5\.0\.18|ibm-plex-mono@5\.0\.13)/files/[a-z-]+-latin-\d00-normal\.woff2)$")
# Las fotos de los equipos: los iconos propios (app/web/equipos/<id>.png, hechos a
# imagen de las de UniFi) y, si falta alguno, la foto de UniFi. CASALAB_FOTOS=unifi
# las deja todas como antes.
FOTOS_PROPIAS = os.environ.get("CASALAB_FOTOS", "propias") != "unifi"
cerrojo_cdn = threading.Lock()


def de_cdn(nombre, url):
    ruta = os.path.join(r.DATOS, "cdn", nombre.replace("/", "_"))
    try:
        with open(ruta, "rb") as f:
            return f.read()
    except OSError:
        pass
    with cerrojo_cdn:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "casalab-red"}), timeout=15) as x:
            b = x.read(2_000_000)
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta + ".tmp", "wb") as f:
            f.write(b)
        os.replace(ruta + ".tmp", ruta)
    return b


# El «Escudo DNS» de la Red: las cifras del día de AdGuard (antes las leía de
# la tarjeta de AdGuard de Homepage). Con 30 s de caché para no cargarlo.
dns_cache = {"ts": 0, "d": None}


def dns_resumen():
    if time.time() - dns_cache["ts"] < 30 and dns_cache["d"]:
        return dns_cache["d"]
    st = r.adg("/control/stats")
    miles = lambda n: "{:,}".format(int(n or 0)).replace(",", ".")
    d = {"consultas": miles(st.get("num_dns_queries")), "bloqueado": miles(st.get("num_blocked_filtering")),
         "latencia": ("%.1f ms" % ((st.get("avg_processing_time") or 0) * 1000)).replace(".", ",")}
    dns_cache.update(ts=time.time(), d=d)
    return d


def adguard_ok():
    if not config.adguard(r.HOST)["url"]:
        return False
    try:
        r.adg("/control/status")
        return True
    except Exception:
        return False


def integracion(c):
    """Conecta (o desconecta) una integración opcional, probándola antes."""
    n = c.get("nombre")
    if c.get("quitar"):
        config.guardar(n, None) if n != "tailscale" else config.guardar("tailscale", {"activo": False})
        return {"ok": True}
    if n == "adguard":
        url = (c.get("url") or "").strip().rstrip("/")
        if not url:
            raise ValueError("escribe la dirección de AdGuard Home (por ejemplo http://192.168.1.10:3000)")
        if not url.startswith("http"):
            url = "http://" + url
        viejo = config.seccion("adguard")
        config.guardar("adguard", {"url": url, "usuario": c.get("usuario") or "", "clave": c.get("clave") if c.get("clave") is not None else viejo.get("clave", "")})
        try:
            r.adg("/control/status")
        except Exception as e:
            config.guardar("adguard", None) if not viejo else config.guardar("adguard", viejo)
            raise ValueError("AdGuard Home no contesta o no acepta el usuario y la contraseña (%s)" % str(e)[:80])
        dns_cache["ts"] = 0
        return {"ok": True}
    if n == "telegram":
        tok, chat = (c.get("token") or "").strip(), str(c.get("chat") or "").strip()
        if not tok or not chat:
            raise ValueError("hacen falta el token del bot y tu número de chat")
        d = r.pedir("https://api.telegram.org/bot%s/sendMessage" % tok, {"Content-Type": "application/json"},
                    json.dumps({"chat_id": chat, "text": "🟢 CasaFi: los avisos de la red te llegarán aquí."}).encode(), 15)
        if not d.get("ok"):
            raise ValueError("Telegram no lo acepta: revisa el token y el chat (escríbele antes al bot)")
        config.guardar("telegram", {"token": tok, "chat": chat})
        return {"ok": True}
    if n == "home_assistant":
        url, tok = (c.get("url") or "").strip().rstrip("/"), (c.get("token") or "").strip()
        if not url or not tok:
            raise ValueError("hacen falta la dirección de Home Assistant y un token de acceso de larga duración")
        if not url.startswith("http"):
            url = "http://" + url
        d = r.pedir(url + "/api/", {"Authorization": "Bearer " + tok}, espera=10)
        if not isinstance(d, dict) or "message" not in d:
            raise ValueError("Home Assistant no acepta ese token")
        config.guardar("home_assistant", {"url": url, "token": tok})
        return {"ok": True}
    if n == "tailscale":
        if not r.tailscale_hay():
            raise ValueError("este servidor no tiene Tailscale: instálalo en él y monta su orden y su socket en el contenedor (README)")
        config.guardar("tailscale", {"activo": True})
        return {"ok": True}
    raise ValueError("integración desconocida")


_bucles = {"en_marcha": False}


def arrancar_bucles():
    """Los hilos que leen el router y lo demás; solo cuando ya hay router configurado."""
    if _bucles["en_marcha"] or ESPEJO or not config.configurado():
        return
    _bucles["en_marcha"] = True
    for f in (r.bucle_trafico, r.bucle_red, r.bucle_velocidad, r.bucle_adg, r.bucle_apps, r.bucle_latencia,
              r.bucle_geo, r.bucle_identificar, r.bucle_copias, bucle_casa):
        threading.Thread(target=f, daemon=True).start()
    if r.ESCRITURA:
        threading.Thread(target=r.bucle_avisos, daemon=True).start()


def salud():
    s = {"app": "casalab-red", "version": VERSION, "fase": FASE, "router": r.ROUTER, "escritura": r.ESCRITURA,
         "datos": DATOS_DE, "arranque": ARRANQUE}
    if ESPEJO:
        try:
            d = r.pedir(r.CENTINELA + "/api/red", espera=5)
            s.update(red=d.get("ts"), equipos=len(d.get("dispositivos") or []), error=d.get("error") or "")
        except Exception as e:
            s.update(red=0, equipos=None, error="centinela no contesta: %s" % str(e)[:80])
        return s
    s.update(red=r.red["ts"], equipos=len(r.red["disp"]), error=r.red.get("error") or "", trafico=r.trafico["ts"])
    return s


# El «Registro» de la Red (el System Log de UniFi): los sucesos de red y los
# del router. En espejo salen de la Actividad de centinela (que ya los apunta),
# con 15 s de caché; en propio, del registro de esta app.
registro_cache = {"ts": 0, "d": []}


def es_de_red(e):
    return e.get("cat") == "red" or (e.get("cat") == "sistema" and "router" in (e.get("t") or "").lower())


def registro():
    if ESPEJO:
        if time.time() - registro_cache["ts"] > 15:
            registro_cache["ts"] = time.time()
            try:
                d = r.pedir(r.CENTINELA + "/api/actividad", espera=5)
                registro_cache["d"] = [e for e in d.get("eventos") or [] if es_de_red(e)]
            except Exception:
                pass
        ev = registro_cache["d"]
    else:
        with r.cerrojo:
            ev = [{k: v for k, v in e.items() if k != "k"} for e in r.eventos if es_de_red(e)]
        ev.sort(key=lambda e: -e["ts"])
    return {"eventos": ev[:1000]}


def espejo(h, ruta):
    """Pide la ruta a centinela, con la sesión de quien pregunta, y la devuelve igual."""
    cab = {k: h.headers[k] for k in ("Cookie", "X-Auth-Token") if h.headers.get(k)}
    try:
        with urllib.request.urlopen(urllib.request.Request(r.CENTINELA + ruta, headers=cab), timeout=60) as x:
            cod, cuerpo, cabs = x.status, x.read(), x.headers
    except urllib.error.HTTPError as e:
        cod, cuerpo, cabs = e.code, e.read(), e.headers
    extra = {k: cabs[k] for k in ("Content-Disposition",) if cabs.get(k)}
    h._bytes(cod, cuerpo, cabs.get("Content-Type") or "application/octet-stream", cabs.get("Cache-Control") or "no-store", extra)


def bucle_casa():
    """Lo que en centinela hacía su recolector general y aquí no tiene otro sitio:
    guardar el estado, compactar el registro y traer lo que el PC cuenta de sí mismo."""
    n = 0
    while True:
        try:
            if n % 30 == 0:
                r.guardar_json(r.ESTADO_F, r.estado)
            if n % 1800 == 0:
                r.compactar_eventos()
        except Exception:
            pass
        try:
            d = r.pedir(r.CENTINELA + "/api/pc", espera=3).get("agente")
            if d:
                r.pc_ag["ts"], r.pc_ag["d"] = time.time(), d
        except Exception:
            pass
        n += 1
        time.sleep(2)


class H(BaseHTTPRequestHandler):
    server_version = "casalab-red/" + VERSION
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _cors(self, credenciales=True):
        o = self.headers.get("Origin")
        if o in r.ORIGENES:
            self.send_header("Access-Control-Allow-Origin", o)
            if credenciales:
                self.send_header("Access-Control-Allow-Credentials", "true")
        # siempre: la misma respuesta guardada en caché no vale para otro origen
        # (sin esto, lo que CasaFi pidió para sí misma le llegaba al panel sin permiso)
        self.send_header("Vary", "Origin")

    def _bytes(self, cod, b, tipo, cache="no-store", extra=None):
        self.send_response(cod)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", cache)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self._cors()
        self.end_headers()
        self.wfile.write(b)

    def _enviar(self, cod, obj):
        self._bytes(cod, json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def _imagen(self, b, tipo, cache):
        self._bytes(200, b, tipo, cache, {"X-Content-Type-Options": "nosniff"})

    def _sesion(self):
        dadas = [self.headers.get("X-Auth-Token") or ""]
        for trozo in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = trozo.strip().partition("=")
            if k == "maint":
                dadas.append(v)
            elif k == "casafi" and config.sesion_valida(v):
                return True
        return bool(r.TOKEN) and any(t and t == r.TOKEN for t in dadas)

    def _app(self, ruta, crudo):
        """La bienvenida, la sesión y las integraciones (Ajustes → Aplicación)."""
        origen = self.headers.get("Origin")
        if self.headers.get("X-NX-Panel") != "1" or (origen and origen not in r.ORIGENES and origen != "http://%s" % self.headers.get("Host")):
            return self._enviar(403, {"error": "origen no permitido"})
        try:
            c = json.loads(crudo or b"{}")
            if not isinstance(c, dict):
                raise ValueError("cuerpo no válido")
            primera = not config.configurado()
            if ruta == "/api/app/entrar":
                if not config.comprobar_clave(c.get("clave")):
                    time.sleep(1)
                    return self._enviar(401, {"error": "contraseña incorrecta"})
                return self._galleta({"ok": True}, config.token_sesion())
            if ruta == "/api/app/salir":
                return self._galleta({"ok": True}, "", 0)
            if ruta == "/api/app/probar-router":
                if not primera and not self._sesion():
                    return self._enviar(401, {"error": "hace falta entrar"})
                return self._enviar(200, instalar.probar_router(c.get("ip"), c.get("usuario") or "root", c.get("clave")))
            if ruta == "/api/app/bienvenida":
                if not primera and not self._sesion():
                    return self._enviar(401, {"error": "hace falta entrar"})
                info = instalar.probar_router(c.get("ip"), c.get("usuario") or "root", c.get("clave"))
                if primera or c.get("clave_app"):
                    config.poner_clave(c.get("clave_app"))
                config.guardar("router", {"ip": c["ip"].strip(), "usuario": c.get("usuario") or "root", "clave": c.get("clave")})
                r.aplicar_router()
                arrancar_bucles()
                return self._galleta(dict(info, ok=True), config.token_sesion())
            if ruta == "/api/app/clave" and not config.hay_clave():
                # la primera contraseña (instalaciones de antes, sin bienvenida)
                config.poner_clave(c.get("clave"))
                return self._galleta({"ok": True}, config.token_sesion())
            if not self._sesion():
                return self._enviar(401, {"error": "hace falta entrar con la contraseña de CasaFi"})
            if ruta == "/api/app/preparar":
                return self._enviar(200, {"pasos": instalar.preparar_router()})
            if ruta == "/api/app/clave":
                config.poner_clave(c.get("clave"))
                return self._galleta({"ok": True}, config.token_sesion())
            if ruta == "/api/app/integracion":
                return self._enviar(200, integracion(c))
            return self._enviar(404, {"error": "no existe"})
        except ValueError as e:
            return self._enviar(400, {"error": str(e)})
        except Exception as e:
            print("app %s: %s" % (ruta, e), flush=True)
            return self._enviar(502, {"error": str(e)[:200]})

    def _galleta(self, obj, valor, edad=31536000):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self._bytes(200, b, "application/json; charset=utf-8", "no-store",
                    {"Set-Cookie": "casafi=%s; Path=/; Max-Age=%d; HttpOnly; SameSite=Lax" % (valor, edad)})

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-NX-Panel")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        try:
            pagina = PAGINAS.get(u.path)
            if pagina:
                with open(os.path.join(WEB, pagina[0]), "rb") as f:
                    return self._bytes(200, f.read(), pagina[1], "no-cache")
            m = re.match(r"^/red/([a-z0-9-]+\.(css|js|svg))$", u.path)
            if m:
                with open(os.path.join(WEB, "red", m.group(1)), "rb") as f:
                    return self._bytes(200, f.read(), TIPOS[m.group(2)], "no-cache")
            m = re.match(r"^/mdi/([a-z0-9-]{1,80})\.svg$", u.path)
            if m:
                return self._bytes(200, de_cdn("mdi-" + m.group(1) + ".svg", CDN_MDI % m.group(1)), "image/svg+xml", "public, max-age=2592000")
            m = re.match(r"^/cdn/(.+)$", u.path)
            if m and CDN_LIBRES.match(m.group(1)):
                tipo = "font/woff2" if m.group(1).endswith(".woff2") else "text/javascript; charset=utf-8"
                return self._bytes(200, de_cdn(m.group(1), "https://cdn.jsdelivr.net/npm/" + m.group(1)), tipo, "public, max-age=2592000")
            m = re.match(r"^/ufp/(\d{1,6})\.png$", u.path)
            propia = m and FOTOS_PROPIAS and os.path.join(WEB, "equipos", "%d.png" % int(m.group(1)))
            if propia and os.path.exists(propia):
                with open(propia, "rb") as f:
                    return self._bytes(200, f.read(), "image/png", "public, max-age=86400")
            if u.path == "/api/red/dns":
                if not config.adguard(r.HOST)["url"]:
                    return self._enviar(200, {"conectado": False})
                return self._enviar(200, dns_resumen())
            if u.path == "/api/red/sucesos":
                # los sucesos de red que apunta esta app, para la pestaña Actividad de centinela
                desde = int((q.get("desde") or ["0"])[0] or 0)
                with r.cerrojo:
                    ev = [{k: v for k, v in e.items() if k != "k"} for e in r.eventos if e.get("cat") == "red" and e["ts"] >= desde]
                return self._enviar(200, {"eventos": ev[-500:]})
            if u.path == "/api/red/registro":
                return self._enviar(200, registro())
            if u.path == "/api/services":
                # custom.js pide a Homepage su lista de servicios (paleta Ctrl+K y
                # tarjetas); aquí no hay ninguno
                return self._enviar(200, [])
            if u.path == "/api/salud":
                return self._enviar(200, salud())
            if u.path == "/api/app/estado":
                e = config.publico(r.HOST)
                e.update(version=VERSION, sesion=self._sesion(), router_sugerido=".".join(r.HOST.split(".")[:3]) + ".1", tailscale_hay=r.tailscale_hay(), adguard_ok=adguard_ok(),
                         preparado=bool(config.seccion("router").get("preparado")))
                return self._enviar(200, e)
            if u.path == "/api/app/diagnostico":
                if not self._sesion():
                    return self._enviar(401, {"error": "hace falta entrar con la contraseña de CasaFi"})
                texto = instalar.diagnostico(r, VERSION, REGISTRO_F).encode()
                return self._bytes(200, texto, "text/plain; charset=utf-8", "no-store",
                                   {"Content-Disposition": 'attachment; filename="casafi-diagnostico-%s.txt"' % time.strftime("%Y%m%d-%H%M")})
            if not config.configurado() and u.path.startswith("/api/") and u.path != "/api/sesion":
                return self._enviar(503, {"error": "sin configurar", "bienvenida": True})
            if ESPEJO and DEL_ESPEJO.match(u.path):
                return espejo(self, self.path)
            if u.path == "/api/sesion":
                return self._enviar(200, {"ok": self._sesion()})
            if u.path == "/api/red":
                return self._enviar(200, r.api_red())
            if u.path == "/api/red/resumen":
                return self._enviar(200, r.api_resumen(q))
            if u.path == "/api/red/equipo":
                return self._enviar(200, r.api_equipo(q))
            if u.path == "/api/red/trafico":
                with r.cerrojo:
                    return self._enviar(200, dict(r.trafico))
            if u.path == "/api/red/mundo":
                return self._enviar(200, r.api_mundo(q))
            if u.path == "/api/red/mundo/mapa":
                b = json.dumps(r.mundo_mapa(), ensure_ascii=False, separators=(",", ":")).encode()
                return self._bytes(200, b, "application/json; charset=utf-8", "public, max-age=604800")
            if u.path == "/api/red/salud":
                return self._enviar(200, r.api_salud(q))
            if u.path == "/api/velocidad":
                return self._enviar(200, r.api_velocidad())
            if u.path == "/api/router/copias":
                return self._enviar(200, r.api_copias())
            if u.path == "/api/router/copia":
                return self._enviar(200, r.api_copia(q))
            if u.path == "/api/router/servicios":
                return self._enviar(200, r.ax_servicios())
            if u.path == "/api/router/ajustes":
                return self._enviar(200, r.ajustes_leer(self._sesion()))
            if u.path in ("/api/router/registro", "/api/router/copia/descargar"):
                if not self._sesion():
                    return self._enviar(401, {"error": "hace falta la sesión de mantenimiento"})
                if u.path == "/api/router/registro":
                    return self._enviar(200, r.ax_registro(q))
                ident_ = (q.get("id") or [""])[0]
                return self._bytes(200, r._copia_leer(ident_), "application/gzip", "no-store",
                                   {"Content-Disposition": 'attachment; filename="router-%s.tar.gz"' % ident_})
            if u.path == "/api/ufp/indice":
                return self._enviar(200, r.ufp_indice())
            if u.path == "/api/ufp":
                return self._enviar(200, r.ufp_buscar(q))
            m = re.match(r"^/ufp/(\d{1,6})\.png$", u.path)
            if m:
                return self._imagen(r.ufp_imagen(int(m.group(1)), "m=1" in u.query), "image/png", "public, max-age=2592000")
            m = re.match(r"^/dpi/([A-Za-z0-9_.+-]{1,120}\.png)$", u.path)
            if m:
                return self._imagen(r.dpi_icono(m.group(1)), "image/png", "public, max-age=2592000")
            m = re.match(r"^/icono/([0-9A-F]{12})\.(png|jpg|webp)$", u.path)
            if m:
                with open(os.path.join(r.ICONOS_D, "%s.%s" % m.groups()), "rb") as o:
                    b = o.read()
                return self._imagen(b, {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}[m.group(2)],
                                    "public, max-age=31536000, immutable")
        except ValueError as e:
            return self._enviar(400, {"error": str(e)})
        except Exception as e:
            return self._enviar(500, {"error": str(e)[:200]})
        self._enviar(404, {"error": "no existe"})

    def do_POST(self):
        ruta = urlparse(self.path).path
        n = int(self.headers.get("Content-Length") or 0)
        tope = 450_000 if ruta == "/api/red/icono" else 4096
        if n >= tope:
            self.rfile.read(n)
            return self._enviar(413, {"error": "demasiado grande"})
        crudo = self.rfile.read(n) if n > 0 else b""
        if ruta.startswith("/api/app/"):
            return self._app(ruta, crudo)
        if not r.ESCRITURA:
            # Hasta el corte, los cambios (también los nombres e iconos de los
            # equipos) se hacen en el panel de siempre; aquí se importan el día del corte.
            return self._enviar(403, {"error": "casalab-red va en solo lectura hasta el corte"})
        origen = self.headers.get("Origin")
        if self.headers.get("X-NX-Panel") != "1" or (origen and origen not in r.ORIGENES and origen != "http://%s" % self.headers.get("Host")):
            return self._enviar(403, {"error": "origen no permitido"})
        hacer = {"/api/red/dispositivo": r.poner_dispositivo, "/api/red/despertar": r.despertar, "/api/red/icono": r.poner_icono,
                 "/api/red/identificar": lambda c: r.identificar(), "/api/red/fusionar": r.pedir_fusion,
                 "/api/velocidad/medir": r.pedir_medida}.get(ruta)
        del_router = {"/api/router/ajustes": lambda c: r.ajustes_cambiar(c, self.client_address[0]), "/api/router/copiar": r.pedir_copia,
                      "/api/router/reservar": r.reservar, "/api/router/liberar": r.liberar, "/api/router/expulsar": r.expulsar,
                      "/api/router/nombrar": r.nombrar, "/api/router/bloquear": lambda c: r.bloquear(c, _desde=self.client_address[0])}.get(ruta)
        if del_router:
            # cambia la configuración del router: solo con la sesión de mantenimiento
            if not self._sesion():
                return self._enviar(401, {"error": "hace falta la sesión de mantenimiento"})
            hacer = del_router
        if not hacer:
            return self._enviar(404, {"error": "no existe"})
        try:
            c = json.loads(crudo or b"{}")
            if not isinstance(c, dict):
                raise ValueError("cuerpo no válido")
            res = hacer(c)
            if del_router:
                with r.cerrojo_red:
                    try:
                        r.leer_red(True)
                    except Exception:
                        pass
            self._enviar(200, res)
        except PermissionError as e:
            self._enviar(401, {"error": str(e)})
        except ValueError as e:
            self._enviar(400, {"error": str(e)})
        except Exception as e:
            self._enviar(502, {"error": str(e)[:200]})


if __name__ == "__main__":
    print("CasaFi %s en %s:%d · router %s · datos %s · escritura %s" % (VERSION, r.HOST, r.PORT, r.ROUTER, DATOS_DE, "sí" if r.ESCRITURA else "no"), flush=True)
    if not config.configurado():
        print("sin configurar: abre http://%s:%d para la bienvenida" % (r.HOST, r.PORT), flush=True)
    arrancar_bucles()
    ThreadingHTTPServer((os.environ.get("CASALAB_ESCUCHA", "0.0.0.0"), r.PORT), H).serve_forever()
