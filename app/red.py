#!/usr/bin/env python3
# =============================================================================
# casalab-red · la red de casa al estilo UniFi (fase 1, 28-10-2026).
#
# Trasplante, no reescritura: todo lo que hay debajo es el código de red de
# centinela (~/centinela/centinela.py) copiado tal cual, por tramos, con solo
# estos retoques:
#   - los datos van en /data (CASALAB_DATOS) y las variables se llaman CASALAB_*;
#   - las credenciales (router, AdGuard) llegan por el entorno, desde el .env
#     de la app, no del de Homepage;
#   - SOLO LECTURA mientras no se ponga CASALAB_ESCRITURA=1: ubus solo deja
#     pasar métodos de lectura y no se toca el router, AdGuard ni Tailscale,
#     no se despierta a nadie ni se mide la velocidad (gasta la línea y ya la
#     mide centinela). Ver docs/CORTE.md;
#   - los avisos al móvil: el mismo código, con el bot y el chat del .env de la
#     app; el envío solo arranca en modo propio (hasta el corte los manda centinela).
#
#   - lee el registro de aparatos de Home Assistant (para identificar equipos).
#
# Las rutas de la API son las mismas que las de centinela, para que la
# interfaz de hoy funcione sin tocarla.
# =============================================================================


# ---------------------------------------------------------------- de centinela.py 24-119: comunes

import base64
import collections
import concurrent.futures
import fcntl
import hashlib
import hmac
import html
import http.client
import ipaddress
import json
import os
import pty
import queue
import re
import shutil
import signal
import socket
import ssl
import struct
import subprocess
import termios
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import apps_tabla
import config

BASE = os.path.dirname(os.path.abspath(__file__))
DATOS = os.environ.get("CASALAB_DATOS", "/data")
os.makedirs(DATOS, exist_ok=True)
E = os.environ.get
PORT = int(E("CASALAB_PORT", "8102"))
# El router, este servidor (su IP y su tarjeta de red) y la red de casa salen de
# la configuración (la bienvenida) o se averiguan solos; las variables de
# entorno de siempre mandan si están. aplicar_router() los recalcula cuando
# cambia el router.
ROUTER = HOST = RED = IFAZ = ""
ORIGENES = set()


def aplicar_router():
    global ROUTER, HOST, RED, IFAZ, ORIGENES
    ROUTER = config.router()["ip"] or "192.168.1.1"
    HOST = E("CASALAB_HOST") or config.ip_local(ROUTER)
    RED = E("CASALAB_RED") or ".".join(ROUTER.split(".")[:3]) + "."
    IFAZ = E("CASALAB_IFAZ") or config.interfaz(ROUTER)
    ORIGENES = set(o.strip() for o in E("CASALAB_ORIGINS", "http://%s,http://%s:3001,http://%s:%d" % (HOST, HOST, HOST, PORT)).split(","))
    ubus_sid["sid"] = None


ubus_sid = {"sid": None}
CADDYFILE = os.path.expanduser(E("CASALAB_CADDYFILE", "~/caddy/Caddyfile"))

ENV = dict(os.environ)       # HOMEPAGE_VAR_ROUTER_OPENWRT_PASSWORD y HOMEPAGE_VAR_ADGUARD_HOME_PASSWORD, del .env de la app

# ---- solo lectura hasta el corte (docs/CORTE.md)
ESCRITURA = E("CASALAB_ESCRITURA", "1") == "1"
UBUS_LEER = {("uci", "get"), ("file", "read"), ("log", "read"), ("rc", "list"), ("system", "board"), ("system", "info"),
             ("iwinfo", "assoclist"), ("iwinfo", "freqlist"), ("iwinfo", "survey"), ("iwinfo", "txpowerlist"),
             ("luci", "getMountPoints"), ("luci", "getProcessList"), ("network.device", "status"), ("network.interface", "dump"),
             ("luci-rpc", "getBoardJSON"), ("luci-rpc", "getDHCPLeases"), ("luci-rpc", "getHostHints"), ("luci-rpc", "getWirelessDevices")}
UBUS_ORDENES_LEER = {"/usr/sbin/bridge", "/usr/sbin/ethtool", "/usr/libexec/casafi-flujos", "/usr/libexec/casalab-flujos"}


def escribir(que):
    """Hasta el corte, el panel de siempre es el único que cambia cosas."""
    if not ESCRITURA:
        raise PermissionError("casalab-red va en solo lectura: %s lo sigue haciendo el panel de siempre" % que)

cerrojo = threading.Lock()
ESTADO_F = os.path.join(DATOS, "estado.json")
DISP_F = os.path.join(DATOS, "dispositivos.json")
EVENTOS_F = os.path.join(DATOS, "eventos.jsonl")
OUI_F = os.path.join(DATOS, "oui.json")


def leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return defecto


def guardar_json(ruta, d):
    with open(ruta + ".tmp", "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False)
    os.replace(ruta + ".tmp", ruta)


estado = leer_json(ESTADO_F, {})          # lo que cada recolector ya ha visto
conocidos = leer_json(DISP_F, {})         # {mac: {primera, ultima, alias, tipo, ip, host}}
oui = leer_json(OUI_F, {})


def sh(args, espera=30):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=espera, errors="replace")
        return r.returncode, r.stdout
    except Exception as e:
        return 1, str(e)


def pedir(url, cab=None, datos=None, espera=8):
    req = urllib.request.Request(url, data=datos, headers=cab or {})
    with urllib.request.urlopen(req, timeout=espera) as r:
        return json.load(r)



# ---------------------------------------------------------------- de centinela.py 120-207: actividad (solo el registro; los avisos siguen en centinela)

# ============================================================ actividad
# Un registro único, en un JSON por línea. Cada recolector llama a evento();
# la clave evita repetir lo mismo si el servicio se reinicia.
eventos = collections.deque(maxlen=6000)
claves = set()
try:
    with open(EVENTOS_F, encoding="utf-8") as _f:
        for _l in _f:
            try:
                _e = json.loads(_l)
                eventos.append(_e)
                if _e.get("k"):
                    claves.add(_e["k"])
            except Exception:
                pass
except OSError:
    pass


OLVIDADOS_F = os.path.join(DATOS, "olvidados.json")
claves.update(leer_json(OLVIDADOS_F, []))


def limpiar_actividad(c):
    """Quita sucesos del registro: los avisos, una categoría o todo. Antes
    deja una copia del fichero (eventos.jsonl.antes-de-limpiar)."""
    que = str(c.get("que") or "")
    if que not in ("avisos", "todo") and que not in CATS:
        raise ValueError("no sé qué limpiar")

    def fuera(e):
        return que == "todo" or (que == "avisos" and e["nivel"] in ("aviso", "mal")) or e["cat"] == que
    with cerrojo:
        quitar = [e for e in eventos if fuera(e)]
        quedan = [e for e in eventos if not fuera(e)]
        try:
            shutil.copy2(EVENTOS_F, EVENTOS_F + ".antes-de-limpiar")
        except OSError:
            pass
        viejas = leer_json(OLVIDADOS_F, []) + [e["k"] for e in quitar if e.get("k")]
        guardar_json(OLVIDADOS_F, viejas[-8000:])
        eventos.clear()
        eventos.extend(quedan)
        with open(EVENTOS_F + ".tmp", "w", encoding="utf-8") as f:
            for e in quedan:
                f.write(json.dumps(e, ensure_ascii=False) + "\n")
        os.replace(EVENTOS_F + ".tmp", EVENTOS_F)
    return {"ok": True, "quitados": len(quitar)}


def evento(cat, titulo, detalle="", nivel="info", clave=None, ts=None, avisa=None):
    """cat: contenedores, red, seguridad, descargas, ps5, sistema, apps, acceso.
    nivel: info, bien, aviso, mal. avisa: el ajuste que decide si además se
    manda al móvil (ver «avisos al móvil»)."""
    with cerrojo:
        if clave and clave in claves:
            return
        e = {"ts": int(ts or time.time()), "cat": cat, "nivel": nivel, "t": titulo, "d": detalle}
        if clave:
            e["k"] = clave
            claves.add(clave)
        eventos.append(e)
        try:
            with open(EVENTOS_F, "a", encoding="utf-8") as f:
                f.write(json.dumps(e, ensure_ascii=False) + "\n")
        except OSError:
            pass
    if avisa:
        try:
            avisar(e, avisa)
        except Exception:
            pass


def compactar_eventos():
    """El fichero solo crece: de vez en cuando se reescribe con lo que queda."""
    with cerrojo:
        try:
            if os.path.getsize(EVENTOS_F) < 3_000_000:
                return
            with open(EVENTOS_F + ".tmp", "w", encoding="utf-8") as f:
                for e in sorted(eventos, key=lambda x: x["ts"]):
                    f.write(json.dumps(e, ensure_ascii=False) + "\n")
            os.replace(EVENTOS_F + ".tmp", EVENTOS_F)
        except OSError:
            pass




CATS = ["contenedores", "red", "seguridad", "descargas", "ps5", "sistema", "apps", "acceso"]
# Lo que el PC cuenta de sí mismo (pcagente) se lo manda a centinela, que sigue
# llevando la pestaña PC: aquí se lee de ahí para el tráfico en directo.
pc_ag = {"ts": 0, "d": None, "ip": E("CASALAB_PC_IP", ""), "h": collections.deque(maxlen=150)}
CENTINELA = E("CASALAB_CENTINELA", "")

# ---------------------------------------------------------------- de centinela.py 208-1255: red: equipos, tráfico en directo, cambios en el router, iconos

# ============================================================ red


def ubus(obj, met, arg=None, _otra=True):
    """Una llamada al router por su API (la misma que usa LuCI)."""
    if (obj, met) not in UBUS_LEER and not (obj == "file" and met == "exec" and (arg or {}).get("command") in UBUS_ORDENES_LEER):
        escribir("%s.%s" % (obj, met))
    def llamar(sid, o, m, a):
        b = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "call", "params": [sid, o, m, a or {}]}).encode()
        return pedir("http://%s/ubus" % ROUTER, {"Content-Type": "application/json"}, b, 8)

    if not ubus_sid["sid"]:
        cr = config.router()
        r = llamar("0" * 32, "session", "login", {"username": cr["usuario"], "password": cr["clave"]})
        if not r.get("result") or r["result"][0] != 0 or len(r["result"]) < 2:
            raise PermissionError("el router no acepta el usuario y la contraseña")
        ubus_sid["sid"] = r["result"][1]["ubus_rpc_session"]
    r = llamar(ubus_sid["sid"], obj, met, arg)
    res = r.get("result")
    if (r.get("error") or (res and res[0] == 6)) and _otra:      # sesión caducada
        ubus_sid["sid"] = None
        return ubus(obj, met, arg, False)
    return res[1] if res and len(res) > 1 else None


TIPOS = [
    ("router", r"openwrt|router|gateway"),
    ("luz", r"wled|hue|bulb|lamp|light|yeelight|lifx|tira|barra"),
    ("consola", r"ps5|ps4|playstation|xbox|nintendo|switch|rog-?ally|steamdeck"),
    ("tv", r"\btv|lgwebos|webos|shield|chromecast|firetv|fire-tv|roku|bravia|tvbarra|oled"),
    ("altavoz", r"amazon-|echo|alexa|sonos|homepod|google-home|nest-|speaker|soundbar"),
    ("movil", r"iphone|android|galaxy|pixel|redmi|poco|oneplus|huawei|xiaomi-?\d|moto|samsung$|^samsung|watch"),
    ("tablet", r"ipad|tablet|\btab\b|ftb13"),
    ("pc", r"pc|desktop|laptop|macbook|imac|mac-?mini|macmini|studio|thinkpad|surface|workstation|ally"),
    ("camara", r"cam|ring|doorbell|timbre"),
    ("impresora", r"print|epson|brother|canon|hp[0-9a-f]{6}"),
    ("iot", r"esp|espressif|tasmota|shelly|sonoff|tuya|aqara|hub|plug|switch-|smart|zigbee|matter|broadlink|meross|ewelink|homebridge"),
]
FABRICANTES = [
    ("consola", r"sony interactive|nintendo|microsoft.*xbox"),
    ("altavoz", r"amazon tech|sonos"),
    ("iot", r"espressif|tuya|shelly|itead|lumi|aqara|shenzhen.*smart|hangzhou|ezviz|broadlink|midea|meross|tp-link"),
    ("luz", r"signify|philips lighting|yeelink"),
    ("altavoz", r"amazon"),
    ("tv", r"lg electronics|lg innotek|nvidia|roku|tcl|hisense"),
    ("movil", r"apple|samsung|xiaomi|oneplus|huawei|motorola|google"),
    ("pc", r"intel corp|asustek|micro-star|gigabyte|dell|lenovo|hewlett"),
]
# lo que ya se sabe de esta casa, para que el primer día no salga todo sin nombre
SEMILLA = {ip: tuple(v) for ip, v in config.seccion("semilla").items()}
PERSONALES = {"pc", "movil", "tablet", "tv", "consola"}

red = {"ts": 0, "router": {}, "radios": [], "disp": {}, "error": ""}
wifi_prev = {}                                  # mac -> (ts, rx, tx)
historia_wifi = collections.defaultdict(lambda: collections.deque(maxlen=480))


def fabricante(mac):
    if int(mac[1], 16) & 2:
        return "Dirección privada"
    return oui.get(mac.replace(":", "")[:6].upper(), "")


def adivinar_tipo(nombre, fab):
    n = (nombre or "").lower()
    for t, rx in TIPOS:
        if re.search(rx, n):
            return t
    f = (fab or "").lower()
    for t, rx in FABRICANTES:
        if re.search(rx, f):
            return t
    return "desconocido"


def bajar_oui():
    """La tabla de fabricantes del IEEE, una vez (y cada 60 días)."""
    global oui
    try:
        if oui and time.time() - os.path.getmtime(OUI_F) < 60 * 86400:
            return
    except OSError:
        pass
    try:
        # el IEEE rechaza las descargas automáticas; Wireshark publica la misma tabla
        req = urllib.request.Request("https://www.wireshark.org/download/automated/data/manuf", headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=90) as r:
            texto = r.read().decode("utf-8", "replace")
        d = {}
        for li in texto.splitlines():
            c = li.split("\t")
            if len(c) >= 2 and len(c[0].strip()) == 8 and c[0][2] == ":":
                d[c[0].strip().replace(":", "").upper()] = (c[2] if len(c) > 2 and c[2].strip() else c[1]).strip()
        if len(d) > 10000:
            oui = d
            guardar_json(OUI_F, d)
    except Exception:
        pass


def vecinos():
    """{ip: (mac, estado)} de la tabla de vecinos de este equipo."""
    r = {}
    _, out = sh(["ip", "-4", "neigh", "show", "dev", IFAZ])
    for li in out.splitlines():
        c = li.split()
        if "lladdr" in c:
            r[c[0]] = (c[c.index("lladdr") + 1].upper(), c[-1])
    return r


def ping(ip):
    return subprocess.call(["ping", "-c", "1", "-W", "1", ip], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0


def leer_router_mas(placa, info, ifaces):
    """Todo lo demás que el router sabe de sí mismo, para la ficha «Router al
    detalle». A propósito NO se lee la sección wan de la configuración: lleva
    el usuario y la contraseña del PPPoE."""
    def seguro(f, defecto=None):
        try:
            return f()
        except Exception:
            return defecto
    disp = seguro(lambda: ubus("network.device", "status"), {}) or {}

    def puerto(n):
        v = disp.get(n) or {}
        e = v.get("statistics") or {}
        vel = str(v.get("speed") or "")
        return {"nombre": n, "enlace": bool(v.get("carrier")), "velocidad": int(vel[:-1]) if vel[:-1].isdigit() else None,
                "duplex": {"F": "completo", "H": "medio"}.get(vel[-1:], ""), "mtu": v.get("mtu"), "mac": (v.get("macaddr") or "").upper(),
                "rx": e.get("rx_bytes", 0), "tx": e.get("tx_bytes", 0), "errores": (e.get("rx_errors") or 0) + (e.get("tx_errors") or 0),
                "descartes": (e.get("rx_dropped") or 0) + (e.get("tx_dropped") or 0)}
    por = {i.get("interface"): i for i in ifaces}
    wan, wan6, lan = por.get("wan") or {}, por.get("wan6") or {}, por.get("lan") or {}
    v4 = (wan.get("ipv4-address") or [{}])[0]
    fis = str(wan.get("device") or "")                      # «wan.20»: puerto y VLAN
    tunel = puerto(wan.get("l3_device") or "pppoe-wan")
    pref = (wan6.get("ipv6-prefix") or [{}])[0]
    internet = {
        "proto": {"pppoe": "PPPoE", "dhcp": "DHCP", "static": "IP fija"}.get(wan.get("proto"), wan.get("proto") or ""),
        "activa": bool(wan.get("up")), "desde": wan.get("uptime"), "ip": v4.get("address", ""), "puerta": v4.get("ptpaddress") or next(
            (r.get("nexthop") for r in wan.get("route") or [] if r.get("target") == "0.0.0.0"), ""),
        "vlan": fis.split(".")[1] if "." in fis else "", "puerto": fis.split(".")[0], "ifaz": wan.get("l3_device") or "",
        "mtu": tunel["mtu"], "dns": wan.get("dns-server") or [], "rx": tunel["rx"], "tx": tunel["tx"], "descartes": tunel["descartes"], "errores": tunel["errores"],
        "v6": {"activa": bool(wan6.get("up")), "ip": ((wan6.get("ipv6-address") or [{}])[0]).get("address", ""),
               "prefijo": "%s/%s" % (pref["address"], pref["mask"]) if pref.get("address") else "", "dns": wan6.get("dns-server") or [],
               "desde": wan6.get("uptime")},
    }
    tablero = seguro(lambda: ubus("luci-rpc", "getBoardJSON"), {}) or {}
    nombres = ["wan"] + sorted((((tablero.get("network") or {}).get("lan") or {}).get("ports")) or [k for k in disp if re.match(r"^lan\d+$", k)])
    puertos = [puerto(n) for n in nombres if n in disp]
    radios = []
    cfgw = seguro(lambda: ubus("luci-rpc", "getWirelessDevices"), {}) or {}
    for nombre, r in sorted(cfgw.items()):
        c = r.get("config") or {}
        for i in r.get("interfaces") or []:
            iw = i.get("iwinfo") or {}
            enc = iw.get("encryption") or {}
            p = puerto(i.get("ifname") or "")
            radios.append({"ssid": iw.get("ssid"), "banda": "5 GHz" if (iw.get("frequency") or 0) > 4000 else "2,4 GHz", "canal": iw.get("channel"),
                           "canal_cfg": c.get("channel"), "frecuencia": iw.get("frequency"), "modo": c.get("htmode"), "potencia": iw.get("txpower"),
                           "ruido": iw.get("noise"), "pais": iw.get("country") or c.get("country"), "mac": p["mac"], "rx": p["rx"], "tx": p["tx"],
                           "cifrado": ("WPA%s" % "/".join(str(x) for x in enc.get("wpa") or []) + " " + "/".join(enc.get("authentication") or []).upper()).strip()
                           if enc.get("enabled") else "abierta", "tasa": iw.get("bitrate")})
    lan4 = (lan.get("ipv4-address") or [{}])[0]
    dh = (seguro(lambda: ubus("uci", "get", {"config": "dhcp", "section": "lan"}), {}) or {}).get("values") or {}
    base = ".".join(str(lan4.get("address", "192.168.1.1")).split(".")[:3])
    try:
        ini, lim = int(dh.get("start", 100)), int(dh.get("limit", 150))
        rango = "%s.%d – %s.%d" % (base, ini, base, ini + lim - 1)
    except ValueError:
        rango = ""
    asig = lan.get("ipv6-prefix-assignment") or []
    local = {"ip": "%s/%s" % (lan4.get("address", ""), lan4.get("mask", "")), "rango": rango, "plazo": dh.get("leasetime", ""),
             "dns": ", ".join(o.split(",", 1)[1] for o in dh.get("dhcp_option") or [] if o.startswith("6,")),
             "v6": ["%s/%s" % (a.get("address"), a.get("mask")) for a in asig if a.get("address")],
             "puente": puerto(lan.get("l3_device") or "br-lan")}
    rel, mem = placa.get("release") or {}, info.get("memory") or {}
    montajes = {m.get("mount"): m for m in (seguro(lambda: ubus("luci", "getMountPoints"), {}) or {}).get("result") or []}
    flash = montajes.get("/overlay") or {}

    def numero(ruta):
        return seguro(lambda: int((ubus("file", "read", {"path": ruta}) or {}).get("data", "").strip()))
    servicios = seguro(lambda: ubus("rc", "list"), {}) or {}
    sistema = {
        "modelo": (placa.get("model") or "").replace(" (OpenWrt U-Boot layout)", ""), "nombre": placa.get("hostname"), "placa": placa.get("board_name"),
        "procesador": placa.get("system"), "nucleo": placa.get("kernel"), "version": rel.get("version"), "revision": rel.get("revision"),
        "plataforma": rel.get("target"), "compilado": int(rel["builddate"]) if str(rel.get("builddate", "")).isdigit() else None,
        "encendido": info.get("uptime"), "carga": [round(x / 65536, 2) for x in info.get("load") or []],
        "mem_total": mem.get("total"), "mem_libre": mem.get("available"), "flash_total": flash.get("size"), "flash_libre": flash.get("avail"),
        "conexiones": numero("/proc/sys/net/netfilter/nf_conntrack_count"), "conexiones_max": numero("/proc/sys/net/netfilter/nf_conntrack_max"),
        "procesos": len((seguro(lambda: ubus("luci", "getProcessList"), {}) or {}).get("result") or []) or None,
        "aceleracion": bool((seguro(lambda: ubus("uci", "get", {"config": "firewall", "type": "defaults"}), {}) or {}).get("values") and any(
            v.get("flow_offloading") == "1" for v in (ubus("uci", "get", {"config": "firewall", "type": "defaults"}) or {}).get("values", {}).values())),
        "servicios": sorted(k for k, v in servicios.items() if v.get("running")),
    }
    return {"internet": internet, "puertos": puertos, "radios": radios, "local": local, "sistema": sistema, "ts": int(time.time())}


def leer_red(completo):
    ahora = time.time()
    d = red["disp"]
    if completo or not red["router"]:
        placa = ubus("system", "board") or {}
        info = ubus("system", "info") or {}
        mem = info.get("memory") or {}
        wan, ifaces = {}, []
        try:
            ifaces = (ubus("network.interface", "dump") or {}).get("interface", [])
            subredes = []
            for i in ifaces:
                for a in i.get("ipv4-address") or []:
                    if i.get("interface") not in ("wan", "loopback") and a.get("address"):
                        try:
                            subredes.append((ipaddress.ip_network("%s/%s" % (a["address"], a.get("mask", 24)), strict=False), i["interface"],
                                             _vid_de(i.get("device"), i.get("interface"))))
                        except (ValueError, IndexError):
                            pass
            red["subredes"] = subredes
            for i in ifaces:
                if i.get("interface") == "wan":
                    wan = {"ip": ((i.get("ipv4-address") or [{}])[0]).get("address", ""), "desde": i.get("uptime"),
                           "proto": i.get("proto", "")}
        except Exception:
            pass
        red["router"] = {
            "modelo": (placa.get("model") or "Router").replace(" (OpenWrt U-Boot layout)", ""),
            "version": "OpenWrt " + str((placa.get("release") or {}).get("version", "")),
            "encendido": info.get("uptime"), "carga": round((info.get("load") or [0])[0] / 65536, 2),
            "memoria": round(100 - 100 * mem.get("available", 0) / mem["total"]) if mem.get("total") else None,
            "wan": wan, "ip": ROUTER,
        }
        try:
            red["router"]["mas"] = leer_router_mas(placa, info, ifaces)
        except Exception as e:
            red["router"]["mas"] = {"error": str(e)[:160]}
        radios = []
        for nombre, r in (ubus("luci-rpc", "getWirelessDevices") or {}).items():
            for i in r.get("interfaces") or []:
                iw = i.get("iwinfo") or {}
                if i.get("ifname"):
                    # la red a la que cuelga esa wifi: todo lo que no sea «lan» es de invitados
                    de = (i.get("config") or {}).get("network") or ["lan"]
                    de = de if isinstance(de, list) else str(de).split()
                    radios.append({"ifaz": i["ifname"], "ssid": iw.get("ssid"), "canal": iw.get("channel"),
                                   "banda": "5" if (iw.get("frequency") or 0) > 4000 else "2.4",
                                   "invitados": "guest" in de, "red": de[0]})
        red["radios"] = radios
        try:
            leer_router_cfg()
        except Exception:
            pass
        try:
            salud_wan(wan.get("ip"), wan.get("desde"))
        except Exception:
            pass
        try:
            leer_vpn()
        except Exception:
            pass

        concesiones = {x["macaddr"].upper(): x for x in (ubus("luci-rpc", "getDHCPLeases") or {}).get("dhcp_leases", [])}
        pistas = {k.upper(): v for k, v in (ubus("luci-rpc", "getHostHints") or {}).items()}
        ips = set()
        for mac in set(concesiones) | set(pistas):
            c, p = concesiones.get(mac, {}), pistas.get(mac, {})
            ip = c.get("ipaddr") or next((i for i in p.get("ipaddrs") or [] if i.startswith(RED)), "")
            if not ip:
                continue
            x = d.setdefault(mac, {"mac": mac})
            x["ip"] = ip
            x["host"] = (c.get("hostname") or (p.get("name") or "").replace(".lan", "")) or x.get("host", "")
            x["fija"] = mac in pistas and mac not in concesiones
            ips.add(ip)
        # sondeo: un ping a cada dirección conocida y luego la tabla de vecinos
        with concurrent.futures.ThreadPoolExecutor(32) as ex:
            responde = dict(zip(ips, ex.map(ping, ips)))
        tabla = vecinos()
        for ip, (mac, est) in tabla.items():
            if not ip.startswith(RED) or ip == ROUTER:
                continue
            x = d.setdefault(mac, {"mac": mac})
            x.setdefault("ip", ip)
            x["_vivo"] = bool(responde.get(ip)) or est in ("REACHABLE", "DELAY")
        for mac, x in d.items():
            if x.get("ip") in responde and responde[x["ip"]]:
                x["_vivo"] = True
            elif x.get("ip") not in tabla:
                x["_vivo"] = False
        # este mismo equipo no sale en su propia tabla
        _, out = sh(["cat", "/sys/class/net/%s/address" % IFAZ])
        if out.strip():
            x = d.setdefault(out.strip().upper(), {"mac": out.strip().upper()})
            x.update(ip=HOST, _vivo=True, host=x.get("host") or socket.gethostname())

    # el wifi, en cada pasada: señal, velocidades y tráfico de cada cliente
    asociados = {}
    for r in red["radios"]:
        for c in (ubus("iwinfo", "assoclist", {"device": r["ifaz"]}) or {}).get("results", []):
            asociados[c["mac"].upper()] = (r, c)
    for mac, (r, c) in asociados.items():
        x = d.setdefault(mac, {"mac": mac})
        rx, tx = c.get("rx") or {}, c.get("tx") or {}
        previo = wifi_prev.get(mac)
        baja = sube = 0
        if previo and ahora > previo[0] and tx.get("bytes", 0) >= previo[2] and rx.get("bytes", 0) >= previo[1]:
            baja = (tx.get("bytes", 0) - previo[2]) / (ahora - previo[0])
            sube = (rx.get("bytes", 0) - previo[1]) / (ahora - previo[0])
        wifi_prev[mac] = (ahora, rx.get("bytes", 0), tx.get("bytes", 0))
        gen = 6 if (tx.get("he") or rx.get("he")) else 5 if (tx.get("vht") or rx.get("vht")) else 4 if (tx.get("ht") or rx.get("ht")) else 0
        x["wifi"] = {"banda": r["banda"], "ssid": r["ssid"], "invitados": bool(r.get("invitados")), "red": r.get("red", "lan"), "canal": r["canal"], "senal": c.get("signal"),
                     "ruido": c.get("noise"), "enlace_baja": round(tx.get("rate", 0) / 1000), "enlace_sube": round(rx.get("rate", 0) / 1000),
                     "gen": gen, "conectado": c.get("connected_time"), "baja": int(baja), "sube": int(sube),
                     "total_baja": tx.get("bytes", 0), "total_sube": rx.get("bytes", 0), "ancho": tx.get("mhz")}
        historia_wifi[mac].append([int(ahora), c.get("signal"), int(baja), int(sube)])
    for mac, x in d.items():
        if mac not in asociados:
            x.pop("wifi", None)

    try:
        heredar_privadas(asociados, ahora)
    except Exception:
        pass
    # las direcciones que un equipo dejó atrás siguen un tiempo en las tablas del
    # router: que no vuelvan a salir como equipos nuevos
    for m in {m for kk in conocidos.values() for m in kk.get("antes") or []}:
        if m not in conocidos and m not in asociados and not (d.get(m) or {}).get("_vivo"):
            d.pop(m, None)
    # se consolida: en línea, nombre, fabricante, tipo, primera y última vez
    cambios = False
    for mac, x in d.items():
        k = conocidos.get(mac)
        vivo = mac in asociados or bool(x.get("_vivo"))
        if k is None:
            sem = SEMILLA.get(x.get("ip"), ("", ""))
            k = conocidos[mac] = {"primera": int(ahora), "ultima": 0, "alias": sem[0], "tipo": sem[1]}
            cambios = True
            if estado.get("red_sembrada"):
                evento("red", "Dispositivo nuevo en la red", "%s · %s · %s" % (x.get("host") or "sin nombre", x.get("ip", "?"), fabricante(mac) or mac),
                       "aviso", "nuevo:" + mac, avisa="avDispositivo")
        if vivo:
            if ahora - k.get("ultima", 0) > 300:
                cambios = True
            k["ultima"] = int(ahora)
        if x.get("ip"):
            k["ip"] = x["ip"]
        if x.get("host"):
            k["host"] = x["host"]
        fab = fabricante(mac)
        tipo = k.get("tipo") or adivinar_tipo((k.get("alias") or "") + " " + (x.get("host") or "") + " " + (k.get("modelo") or ""), fab)
        en_linea = vivo or ahora - k.get("ultima", 0) < 150
        # entradas y salidas de los equipos de las personas (los cacharros no: parpadean)
        if tipo in PERSONALES and estado.get("red_sembrada"):
            antes = k.get("_dentro")
            dentro = ahora - k.get("ultima", 0) < 600
            if antes is not None and antes != dentro:
                evento("red", "%s %s" % (k.get("alias") or x.get("host") or mac, "se ha conectado" if dentro else "se ha desconectado"),
                       x.get("ip", ""), "info")
            k["_dentro"] = dentro
        # Por dónde está: mientras se le ve, lo que sea ahora; en los 150 s de gracia
        # tras dejar de verlo, lo último que fue (un móvil que sale del wifi no pasa
        # a «cable» por el camino)
        # «Cable» solo si el router lo ve por una de sus bocas. Que conteste al ping
        # sin estar en la lista del wifi no basta: `_vivo` es de la última pasada
        # completa (hasta un minuto atrás) y un equipo que acaba de salir del wifi
        # o de cambiar de red pasaba por «cable» mientras tanto.
        fdb_al_dia = bool(tr_fdb["d"]) and ahora - tr_fdb["ts"] < 120
        # Lo último que fue se guarda (`con`), para que tampoco se pierda al reiniciar.
        era = k.get("con")
        if x.get("wifi"):
            k["con"] = ["wifi" + x["wifi"]["banda"], bool(x["wifi"].get("invitados"))]
        elif x.get("_vivo") and (mac in tr_fdb["d"] or k.get("puerto") or not fdb_al_dia):
            k["con"] = ["cable", False]
        if k.get("con") != era:
            cambios = True
        con, invitado = k.get("con") or ("cable", False)
        x.update(nombre=k.get("alias") or x.get("host") or k.get("host") or fab or mac, alias=k.get("alias", ""), fabricante=fab, icono=k.get("icono", ""), tipo=tipo,
                 tipo_fijo=bool(k.get("tipo")), en_linea=en_linea, primera=k.get("primera"), ultima=k.get("ultima"),
                 conexion=con if en_linea else "", invitado=bool(en_linea and invitado),
                 puerto=k.get("puerto", ""), puerto_auto=tr_fdb["d"].get(mac, ""), modelo=k.get("modelo", ""), icono_auto=k.get("icono_auto"))
    if not estado.get("red_sembrada") and len(d) > 3:
        estado["red_sembrada"] = True
        guardar_json(ESTADO_F, estado)
        cambios = True
    if cambios:
        guardar_json(DISP_F, {m: {a: b for a, b in k.items() if not a.startswith("_")} for m, k in conocidos.items()})
    red["ts"] = int(ahora)
    red["error"] = ""
    try:
        hi_anotar(ahora)
    except Exception:
        pass


# ------------------------------------------------------------ tráfico en directo
# Lo que cada equipo baja y sube AHORA, cada dos segundos, para que el flujo
# del mapa sea el de verdad. El router acelera el tráfico por hardware y sus
# contadores normales no lo ven, así que se leen los del propio conmutador
# (ethtool -S, permitido solo para eso por /usr/share/rpcd/acl.d/casalab.json
# en el router) y la tabla que dice por qué puerto se ve cada equipo
# (bridge fdb). De dónde sale cada cifra («fuente»):
#   wifi     los contadores que el router lleva de cada cliente wifi
#   agente   el propio PC, que lo manda con pcagente
#   propio   este servidor, de sus contadores
#   puerto   equipo por cable solo en su puerto del router: el contador del puerto
#   reparto  varios equipos sin medida propia en el mismo puerto (cuelgan de un
#            switch): lo que sobra del puerto, repartido según lo que cada uno
#            mueve con Internet (las conexiones del router, que sí van por
#            equipo). Solo si ninguno tiene conexiones con tráfico —lo que pasa
#            entre equipos de casa no las abre— se reparte a partes iguales
trafico = {"ts": 0, "wan": [0, 0], "puertos": {}, "d": {}}
tr_prev = {}
tr_fdb = {"ts": 0, "d": {}}
tr_pico = collections.deque(maxlen=1440)         # un día: [minuto, mayor bajada, mayor subida] de la línea
POCO_TRAFICO = {"luz", "iot", "impresora"}       # en un reparto no se llevan parte si hay otros


def _ritmo(clave, rx, tx, ahora):
    p = tr_prev.get(clave)
    tr_prev[clave] = (ahora, rx, tx)
    if not p or ahora - p[0] < 0.3 or ahora - p[0] > 30 or rx < p[1] or tx < p[2]:
        return None
    return (rx - p[1]) / (ahora - p[0]), (tx - p[2]) / (ahora - p[0])


def _en_router(orden, *args):
    r = ubus("file", "exec", {"command": orden, "params": list(args)}) or {}
    return r.get("stdout", "") if r.get("code") == 0 else ""


def leer_fdb():
    """Por qué puerto del router se ve cada equipo por cable."""
    d = {}
    for li in _en_router("/usr/sbin/bridge", "fdb", "show", "br", "br-lan").splitlines():
        p = li.split()
        if len(p) >= 4 and p[1] == "dev" and re.match(r"^lan\d+$", p[2]) and "permanent" not in p and "master" in p:
            d[p[0].upper()] = p[2]
    if d:
        tr_fdb.update(ts=time.time(), d=d)


def leer_trafico():
    ahora = time.time()
    if ahora - tr_fdb["ts"] > 30:
        tr_fdb["ts"] = ahora
        try:
            leer_fdb()
        except Exception:
            pass
    d = {}
    for r in list(red["radios"]):
        for c in (ubus("iwinfo", "assoclist", {"device": r["ifaz"]}) or {}).get("results", []):
            mac = c["mac"].upper()
            v = _ritmo("w" + mac, (c.get("rx") or {}).get("bytes", 0), (c.get("tx") or {}).get("bytes", 0), ahora)
            if v:                                  # lo que el router RECIBE del cliente es lo que el cliente sube
                d[mac] = [int(v[1]), int(v[0]), "wifi"]
    puertos, wan = {}, trafico["wan"]
    nombres = [p["nombre"] for p in ((red["router"].get("mas") or {}).get("puertos") or []) if p.get("enlace")] or ["wan", "lan2", "lan3", "lan4"]
    for n in nombres:
        m = dict(re.findall(r"^\s*(TxBytes|RxBytes):\s*(\d+)", _en_router("/usr/sbin/ethtool", "-S", n), re.M))
        if len(m) < 2:
            continue
        rit = _ritmo("p" + n, int(m["RxBytes"]), int(m["TxBytes"]), ahora)
        if not rit:
            continue
        if n == "wan":
            wan = [int(rit[0]), int(rit[1])]       # lo que entra por el puerto de Internet es la bajada de la casa
        else:
            puertos[n] = [int(rit[1]), int(rit[0])]   # lo que el puerto TRANSMITE es lo que bajan los de ese cable
    por_ip = {x.get("ip"): mac for mac, x in red["disp"].items() if x.get("ip")}
    try:                                           # este servidor
        with open("/sys/class/net/%s/statistics/rx_bytes" % IFAZ) as a, open("/sys/class/net/%s/statistics/tx_bytes" % IFAZ) as b:
            rit = _ritmo("propio", int(a.read()), int(b.read()), ahora)
        if rit and por_ip.get(HOST):
            d[por_ip[HOST]] = [int(rit[0]), int(rit[1]), "propio"]
    except (OSError, ValueError):
        pass
    if pc_ag["d"] and ahora - pc_ag["ts"] < 8 and por_ip.get(pc_ag.get("ip")):
        r = pc_ag["d"].get("red") or {}
        d[por_ip[pc_ag["ip"]]] = [int(r.get("baja") or 0), int(r.get("sube") or 0), "agente"]
    cable = [mac for mac, x in red["disp"].items() if x.get("conexion") == "cable" and x.get("en_linea") and x.get("tipo") != "router"]

    def puerto_de(mac):
        return (conocidos.get(mac) or {}).get("puerto") or tr_fdb["d"].get(mac)
    for n, (pb, ps) in puertos.items():
        suyos = [mac for mac in cable if puerto_de(mac) == n]
        resto = [mac for mac in suyos if mac not in d]
        if not resto:
            continue
        # Lo que sobra del puerto tras quitar a los que tienen medida propia. Las dos
        # lecturas no se toman en el mismo instante: un resto pequeño frente a lo
        # ya medido es desfase, no tráfico de nadie.
        mb, ms = sum(d[m][0] for m in suyos if m in d), sum(d[m][1] for m in suyos if m in d)
        rb, rs = pb - mb, ps - ms
        rb = rb if rb > 0.15 * mb + 20_000 else 0
        rs = rs if rs > 0.15 * ms + 20_000 else 0
        gordos = [mac for mac in resto if red["disp"][mac].get("tipo") not in POCO_TRAFICO] or resto
        fuente = "puerto" if len(resto) == 1 else "reparto"
        rit = ap.get("ritmo") or {} if len(resto) > 1 and ahora - ap["ts"] < 20 else {}
        for i, total in ((0, rb), (1, rs)):
            pesos = {mac: rit[mac][i] for mac in resto if mac in rit and rit[mac][i] > 2_000}
            if not pesos:
                pesos = {mac: 1 for mac in gordos}
            todo = sum(pesos.values())
            for mac in resto:
                d.setdefault(mac, [0, 0, fuente])[i] = int(total * pesos.get(mac, 0) / todo)
    minuto = int(ahora // 60)
    if tr_pico and tr_pico[-1][0] == minuto:
        tr_pico[-1][1], tr_pico[-1][2] = max(tr_pico[-1][1], wan[0]), max(tr_pico[-1][2], wan[1])
    else:
        tr_pico.append([minuto, wan[0], wan[1]])
    desde = minuto - 1440
    pico = [max((p[i] for p in tr_pico if p[0] > desde), default=0) for i in (1, 2)]
    with cerrojo:
        trafico.update(ts=round(ahora, 1), wan=wan, puertos=puertos, d=d, pico=pico)


def bucle_trafico():
    time.sleep(12)
    while True:
        try:
            leer_trafico()
        except Exception:
            ubus_sid["sid"] = None
            time.sleep(4)
        time.sleep(2)


def _privada(mac):
    return bool(int(mac[1], 16) & 2)


def fusionar(nuevo, viejo, motivo="a mano"):
    """`nuevo` pasa a ser `viejo`: hereda nombre, tipo, foto y fecha de alta, y la ficha vieja desaparece."""
    k_v = conocidos.get(viejo)
    if not k_v or nuevo == viejo:
        raise ValueError("ese equipo no existe")
    k_n = conocidos.get(nuevo) or {}
    k = {a: b for a, b in k_v.items() if not a.startswith("_") and a not in ("con", "puerto", "icono_no")}
    k.update(ultima=max(k_n.get("ultima", 0), k_v.get("ultima", 0)), primera=min(k_n.get("primera") or k_v.get("primera") or 0, k_v.get("primera") or 0) or int(time.time()),
             antes=(k_v.get("antes") or []) + [viejo])
    for campo in ("ip", "host", "con"):
        if k_n.get(campo):
            k[campo] = k_n[campo]
    if not k.get("icono") and k_n.get("icono"):
        k["icono"] = k_n["icono"]
        if k_n.get("icono_auto"):
            k["icono_auto"] = k_n["icono_auto"]
    conocidos[nuevo] = k
    conocidos.pop(viejo, None)
    red["disp"].pop(viejo, None)
    hi["previo"].pop(viejo, None)
    guardar_json(DISP_F, {m: {a: b for a, b in kk.items() if not a.startswith("_")} for m, kk in conocidos.items()})
    evento("red", "%s ha vuelto con otra dirección" % (k.get("alias") or k.get("host") or nuevo),
           "Es el mismo equipo (%s): conserva su nombre y su foto. Antes %s, ahora %s" % (motivo, viejo, nuevo), "info")


def heredar_privadas(asociados, ahora):
    """Los móviles y relojes usan una MAC inventada distinta para cada wifi: al
    cambiar el nombre de la red (o al «olvidarla») vuelven como si fueran
    nuevos. Si aparece uno así y hay UNA sola ficha con su mismo nombre de red,
    también de MAC privada, apagada y ya bautizada, es el mismo: la hereda."""
    for mac, x in list(red["disp"].items()):
        host = (x.get("host") or "").lower()
        if not host or not _privada(mac) or not (mac in asociados or x.get("_vivo")):
            continue
        k = conocidos.get(mac) or {}
        if k.get("alias") or k.get("tipo") or (k.get("icono") and not k.get("icono_auto")):
            continue
        cand = [m for m, kk in conocidos.items() if m != mac and _privada(m) and (kk.get("host") or "").lower() == host and m not in asociados
                and ahora - kk.get("ultima", 0) > 120 and (kk.get("alias") or (kk.get("icono") and not kk.get("icono_auto")))]
        if len(cand) == 1:
            try:
                fusionar(mac, cand[0], "mismo nombre en la red")
            except ValueError:
                pass


def pedir_fusion(c):
    nuevo, viejo = str(c.get("mac") or "").upper(), str(c.get("con") or "").upper()
    if not MAC.match(nuevo) or not MAC.match(viejo) or nuevo not in conocidos:
        raise ValueError("dispositivo desconocido")
    with cerrojo_red:
        fusionar(nuevo, viejo)
        try:
            leer_red(False)
        except Exception:
            pass
    return {"ok": True}


def bucle_red():
    bajar_oui()
    try:
        leer_fdb()                                 # antes de la primera pasada: decide quién va por cable
    except Exception:
        pass
    n = 0
    while True:
        try:
            with cerrojo_red:
                leer_red(n % 4 == 0)
        except Exception as e:
            red["error"] = str(e)[:160]
            ubus_sid["sid"] = None
        n += 1
        time.sleep(15)


cerrojo_red = threading.Lock()


def _vid_de(dev, iface=""):
    m = re.match(r"^br-(?:lan\.|cl)(\d+)$", str(dev or ""))
    return int(m.group(1)) if m else (1 if iface == "lan" or dev == "br-lan" else None)


def red_de(ip):
    """{id, nombre, vlan} de la red (VLAN) a la que pertenece una IP."""
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return None
    nombres = dict(AX_NOMBRE_DEF, **leer_json(AX_NOMBRES_F, {}))
    for n, ident, vid in red.get("subredes") or []:
        if a in n:
            return {"id": ident, "nombre": nombres.get(ident, ident), "vlan": vid}
    return None


def redes_lista():
    nombres = dict(AX_NOMBRE_DEF, **leer_json(AX_NOMBRES_F, {}))
    return [{"id": i, "nombre": nombres.get(i, i), "vlan": v, "cidr": str(n)} for n, i, v in red.get("subredes") or []]


def api_red():
    ahora = time.time()
    lista = []
    for mac, x in red["disp"].items():
        y = {k: v for k, v in x.items() if not k.startswith("_")}
        if y.get("wifi"):
            y["historia"] = list(historia_wifi[mac])[-60:]
        y["reserva"] = router_cfg["reservas"].get(mac)
        y["bloqueado"] = mac in router_cfg["bloqueos"]
        y["red"] = red_de(y.get("ip"))
        y["nuevo"] = ahora - (y.get("primera") or 0) < 86400 and bool(estado.get("red_sembrada_ts")) and y.get("primera", 0) > estado["red_sembrada_ts"] + 300
        lista.append(y)
    vivos = [x for x in lista if x.get("en_linea")]
    radios = []
    for r in red["radios"]:
        radios.append(dict(r, clientes=sum(1 for x in vivos if (x.get("wifi") or {}).get("banda") == r["banda"] and (x.get("wifi") or {}).get("ssid") == r["ssid"])))
    return {"ts": red["ts"], "error": red["error"], "router": red["router"], "radios": radios,
            "resumen": {"total": len(lista), "en_linea": len(vivos),
                        "wifi5": sum(1 for x in vivos if x.get("conexion") == "wifi5" and not x.get("invitado")),
                        "wifi24": sum(1 for x in vivos if x.get("conexion") == "wifi2.4" and not x.get("invitado")),
                        "invitados": sum(1 for x in vivos if x.get("invitado")),
                        "cable": sum(1 for x in vivos if x.get("conexion") == "cable"),
                        "nuevos": sum(1 for x in lista if x.get("nuevo")),
                        "baja": sum((x.get("wifi") or {}).get("baja", 0) for x in vivos),
                        "sube": sum((x.get("wifi") or {}).get("sube", 0) for x in vivos)},
            "latencia": latencia["l"], "vpn": vpn["l"], "dispositivos": lista, "redes": redes_lista(),
            "operador": {k: operador.get(k, "") for k in ("nombre", "asn", "ciudad", "region", "pais", "host")}}


MAC = re.compile(r"^([0-9A-F]{2}:){5}[0-9A-F]{2}$")

# ------------------------------------------------------------ cambios en el router
# Esto sí toca el router: reservas de IP (con su nombre), bloqueo de salida a
# Internet y expulsión del wifi. Por eso estas órdenes, además de venir del
# panel, exigen la sesión de mantenimiento (la cookie de maintd, igual que la
# tienda de aplicaciones). Cada cambio se hace como lo hace LuCI: se anota en
# una sesión nueva, se aplica con vuelta atrás automática y se confirma; si
# algo falla a medias, el router se queda como estaba.
try:
    with open(E("CASALAB_TOKEN_F", "/config/maint_token")) as _f:
        TOKEN = _f.read().strip()
except OSError:
    TOKEN = ""
PREFIJO_BLOQUEO = "casalab-bloqueo-"
router_cfg = {"reservas": {}, "bloqueos": {}, "ts": 0}


def _mac_de(v):
    return str(v[0] if isinstance(v, list) and v else v or "").upper()


def leer_router_cfg():
    res, blo = {}, {}
    for sec, v in ((ubus("uci", "get", {"config": "dhcp", "type": "host"}) or {}).get("values") or {}).items():
        m = _mac_de(v.get("mac"))
        if MAC.match(m):
            res[m] = {"sec": sec, "ip": v.get("ip", ""), "nombre": v.get("name", "")}
    for sec, v in ((ubus("uci", "get", {"config": "firewall", "type": "rule"}) or {}).get("values") or {}).items():
        if str(v.get("name", "")).startswith(PREFIJO_BLOQUEO):
            m = _mac_de(v.get("src_mac"))
            if MAC.match(m):
                blo[m] = sec
    router_cfg.update(reservas=res, bloqueos=blo, ts=int(time.time()))


def router_cambiar(pasos, espera=0, plazo=25, comprobar=None):
    """pasos(llamar) anota los cambios; aquí se abre la sesión, se aplican con
    vuelta atrás y se confirman. Con `espera` (cambios de red o de wifi, que
    reinician interfaces) se deja que el router los ponga en marcha y solo se
    confirma si sigue contestando; si no contesta, al pasar `plazo` segundos
    el router lo deshace él solo, como LuCI. `comprobar(llamar)` devuelve
    None si todo ha quedado bien, «esperar» si aún está arrancando o el
    motivo para no confirmar (y entonces el router lo deshace)."""
    escribir("cambiar la configuración del router")
    def crudo(sid, o, m, a):
        b = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "call", "params": [sid, o, m, a or {}]}).encode()
        return pedir("http://%s/ubus" % ROUTER, {"Content-Type": "application/json"}, b, 25)

    cr = config.router()
    r = crudo("0" * 32, "session", "login", {"username": cr["usuario"], "password": cr["clave"]})
    sid = r["result"][1]["ubus_rpc_session"]

    def llamar(o, m, a=None, tolerar=()):
        r = crudo(sid, o, m, a)
        if r.get("error"):
            raise RuntimeError("el router no lo permite: %s" % r["error"].get("message", "?"))
        cod = (r.get("result") or [1])[0]
        if cod != 0 and cod not in tolerar:
            raise RuntimeError("el router ha respondido con el código %s en %s.%s" % (cod, o, m))
        return (r["result"][1] if len(r.get("result") or []) > 1 else None)

    try:
        pasos(llamar)
        llamar("uci", "apply", {"rollback": True, "timeout": plazo}, tolerar=(5,))
        if espera:
            time.sleep(espera)
            hasta = time.time() + plazo - espera - 5
            while True:
                try:
                    mal = comprobar(llamar) if comprobar else None
                    if mal == "esperar" and time.time() < hasta:
                        time.sleep(2)
                        continue
                    if mal:
                        raise PermissionError(mal if mal != "esperar" else "no ha terminado de arrancar a tiempo")
                    llamar("uci", "confirm", {}, tolerar=(5,))
                    break
                except PermissionError as e:
                    raise RuntimeError("el router ha quedado mal (%s): lo deshace él solo en unos segundos" % e)
                except Exception as e:
                    if time.time() > hasta:
                        raise RuntimeError("el router no ha vuelto a contestar tras el cambio (%s): lo deshará él solo en unos segundos" % str(e)[:80])
                    time.sleep(2)
        else:
            llamar("uci", "confirm", {}, tolerar=(5,))
    finally:
        try:
            crudo(sid, "session", "destroy", {})
        except Exception:
            pass
    ubus_sid["sid"] = None
    leer_router_cfg()


def nombre_de_red(texto):
    """«Tele del salón» -> «Tele-del-salon»: lo que dnsmasq admite como nombre."""
    t = str(texto or "")
    for a, b in zip("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN"):
        t = t.replace(a, b)
    return re.sub(r"-+", "-", re.sub(r"[^A-Za-z0-9-]", "-", t)).strip("-")[:32]


def _equipo(c):
    mac = str(c.get("mac") or "").upper()
    if not MAC.match(mac) or mac not in conocidos:
        raise ValueError("dispositivo desconocido")
    return mac


def reservar(c, _mac=None):
    """Fija la IP de un equipo (y su nombre) en el DHCP del router."""
    mac = _mac or _equipo(c)
    ip = str(c.get("ip") or "").strip()
    nombre = nombre_de_red(c.get("nombre"))
    m = re.match(r"^" + re.escape(RED) + r"(\d{1,3})$", ip)
    if not m or not 2 <= int(m.group(1)) <= 254 or ip == ROUTER:
        raise ValueError("la IP tiene que ser %s2 a %s254" % (RED, RED))
    leer_router_cfg()
    for otra, r in router_cfg["reservas"].items():
        if otra != mac and r["ip"] == ip:
            raise ValueError("esa IP ya está reservada para %s" % (r["nombre"] or otra))
    for otra, x in red["disp"].items():
        if otra != mac and x.get("ip") == ip and x.get("en_linea"):
            raise ValueError("esa IP la está usando ahora %s" % (x.get("nombre") or otra))
    actual = router_cfg["reservas"].get(mac)
    valores = {"mac": mac, "ip": ip}
    if nombre:
        valores["name"] = nombre

    def pasos(ll):
        if actual:
            ll("uci", "set", {"config": "dhcp", "section": actual["sec"], "values": valores})
        else:
            ll("uci", "add", {"config": "dhcp", "type": "host", "values": valores})
    router_cambiar(pasos)
    evento("red", "IP fija en el router", "%s → %s%s" % ((conocidos.get(mac) or {}).get("alias") or nombre or mac, ip, " (%s)" % nombre if nombre else ""), "info")
    return {"ok": True, "nota": "El equipo la cogerá la próxima vez que se conecte o renueve."}


def nombrar(c, _mac=None):
    """Pone nombre a un equipo en el router sin fijarle la IP."""
    mac = _mac or _equipo(c)
    nombre = nombre_de_red(c.get("nombre"))
    if not nombre:
        raise ValueError("ese nombre no vale para la red: usa letras, números y guiones")
    leer_router_cfg()
    actual = router_cfg["reservas"].get(mac)

    def pasos(ll):
        if actual:
            ll("uci", "set", {"config": "dhcp", "section": actual["sec"], "values": {"name": nombre}})
        else:
            ll("uci", "add", {"config": "dhcp", "type": "host", "values": {"mac": mac, "name": nombre}})
    router_cambiar(pasos)
    evento("red", "Nombre puesto en el router", "%s (%s)" % (nombre, mac), "info")
    return {"ok": True, "nombre": nombre}


def liberar(c, _mac=None):
    mac = _mac or _equipo(c)
    leer_router_cfg()
    actual = router_cfg["reservas"].get(mac)
    if not actual:
        raise ValueError("ese equipo no tiene IP reservada")
    router_cambiar(lambda ll: ll("uci", "delete", {"config": "dhcp", "section": actual["sec"]}))
    evento("red", "Reserva de IP quitada", "%s (%s)" % ((conocidos.get(mac) or {}).get("alias") or actual["nombre"] or mac, actual["ip"]), "info")
    return {"ok": True}


def bloquear(c, _mac=None, _desde=""):
    """Corta (o devuelve) la salida a Internet de un equipo. Sigue en la red de casa."""
    mac = _mac or _equipo(c)
    si = bool(c.get("si"))
    leer_router_cfg()
    actual = router_cfg["bloqueos"].get(mac)
    if si:
        propio = (red["disp"].get(mac) or {}).get("ip")
        if propio in (HOST, ROUTER):
            raise ValueError("ese es el servidor: no se bloquea")
        if _desde and propio == _desde:
            raise ValueError("es el equipo desde el que estás: te quedarías sin Internet")
        if actual:
            return {"ok": True}
        valores = {"name": PREFIJO_BLOQUEO + mac.replace(":", "").lower(), "src": "lan", "dest": "wan",
                   "src_mac": mac, "proto": "all", "target": "REJECT"}
        router_cambiar(lambda ll: ll("uci", "add", {"config": "firewall", "type": "rule", "values": valores}))
    else:
        if not actual:
            return {"ok": True}
        router_cambiar(lambda ll: ll("uci", "delete", {"config": "firewall", "section": actual}))
    evento("red", "Salida a Internet %s" % ("bloqueada" if si else "permitida de nuevo"),
           (conocidos.get(mac) or {}).get("alias") or (red["disp"].get(mac) or {}).get("nombre") or mac, "aviso" if si else "info")
    return {"ok": True}


def expulsar(c):
    """Desconecta un equipo del wifi. No lo veta: volverá a conectarse solo."""
    mac = _equipo(c)
    w = (red["disp"].get(mac) or {}).get("wifi")
    if not w:
        raise ValueError("ese equipo no está en el wifi")
    ifaz = next((r["ifaz"] for r in red["radios"] if r["banda"] == w["banda"] and r["ssid"] == w.get("ssid")), None)
    if not ifaz:
        raise ValueError("no encuentro su radio")
    ubus("hostapd." + ifaz, "del_client", {"addr": mac.lower(), "reason": 5, "deauth": True, "ban_time": 0})
    evento("red", "Equipo expulsado del wifi", (conocidos.get(mac) or {}).get("alias") or mac, "info")
    return {"ok": True}
TIPOS_OK = {t for t, _ in TIPOS} | {"servidor", "desconocido", ""}


def poner_dispositivo(c):
    mac = str(c.get("mac") or "").upper()
    if not MAC.match(mac) or mac not in conocidos:
        raise ValueError("dispositivo desconocido")
    tipo = str(c.get("tipo") or "")
    if tipo not in TIPOS_OK:
        raise ValueError("tipo no válido")
    with cerrojo_red:
        conocidos[mac]["alias"] = re.sub(r"[<>\"]", "", str(c.get("alias") or "")).strip()[:40]
        conocidos[mac]["tipo"] = tipo
        if "puerto" in c:
            puerto = str(c.get("puerto") or "")
            if not re.match(r"^(lan\d{1,2})?$", puerto):
                raise ValueError("puerto no válido")
            conocidos[mac]["puerto"] = puerto
        guardar_json(DISP_F, {m: {a: b for a, b in k.items() if not a.startswith("_")} for m, k in conocidos.items()})
        try:
            leer_red(False)
        except Exception:
            pass
    return {"ok": True}


# El icono de cada equipo: automático (lo decide el panel por el nombre y el
# fabricante), uno de la carta («mdi:<nombre>») o una imagen subida desde el
# panel, que se guarda aquí con el nombre de su MAC.
ICONOS_D = os.path.join(DATOS, "iconos")
os.makedirs(ICONOS_D, exist_ok=True)
FIRMAS_IMG = {"png": b"\x89PNG", "jpg": b"\xff\xd8", "webp": b"RIFF"}


# Fotos de producto: el catálogo público con el que UniFi reconoce los equipos
# (unos 6.000 modelos, cada uno con su imagen recortada). El índice y las
# imágenes se bajan de static.ui.com la primera vez que hacen falta y se
# guardan aquí; el icono de un equipo puede ser entonces «ufp:<id>».
UFP_D = os.path.join(DATOS, "ufp")
os.makedirs(UFP_D, exist_ok=True)
UFP_URL = "https://static.ui.com/fingerprint/0/"
ufp = {"ts": 0, "l": []}


def ufp_catalogo():
    if ufp["l"] and time.time() - ufp["ts"] < 86400:
        return ufp["l"]
    ruta = os.path.join(UFP_D, "devicelist.json")
    try:
        viejo = time.time() - os.path.getmtime(ruta) > 30 * 86400
    except OSError:
        viejo = True
    if viejo:
        try:
            with urllib.request.urlopen(urllib.request.Request(UFP_URL + "devicelist.json", headers={"User-Agent": "Mozilla/5.0"}), timeout=40) as r:
                datos = r.read(8_000_000)
            json.loads(datos)
            with open(ruta + ".tmp", "wb") as o:
                o.write(datos)
            os.replace(ruta + ".tmp", ruta)
        except Exception:
            pass
    d = leer_json(ruta, {})
    clases, marcas = d.get("dev_type_ids") or {}, d.get("vendor_ids") or {}
    ufp["l"] = [{"id": int(k), "nombre": " ".join(v.get("name", "").split()), "clase": " ".join(clases.get(str(v.get("dev_type_id")), "").split()),
                 "marca": " ".join(marcas.get(str(v.get("vendor_id")), "").split()),
                 "_b": sin_tildes(v.get("name", ""))} for k, v in (d.get("dev_ids") or {}).items() if str(k).isdigit()]
    ufp["l"].sort(key=lambda x: x["nombre"].lower())
    ufp["ts"] = time.time()
    return ufp["l"]


def sin_tildes(t):
    return "".join(c for c in unicodedata.normalize("NFD", str(t).lower()) if unicodedata.category(c) != "Mn")


def ufp_buscar(q):
    """Modelos del catálogo: por palabras, por clase y por marca, de `n` en `n`.
    Sin palabras ni filtros (y sin `todo=1`) no devuelve nada."""
    pal = sin_tildes((q.get("q") or [""])[0])[:60].split()
    clase, marca = (q.get("clase") or [""])[0][:60], (q.get("marca") or [""])[0][:80]
    try:
        desde = max(0, int((q.get("desde") or ["0"])[0]))
        n = max(1, min(240, int((q.get("n") or ["60"])[0])))
    except ValueError:
        desde, n = 0, 60
    if not pal and not clase and not marca and not q.get("todo"):
        return {"modelos": [], "total": 0}
    r = [x for x in ufp_catalogo() if all(p in x["_b"] for p in pal) and (not clase or x["clase"] == clase) and (not marca or x["marca"] == marca)]
    if pal:
        r.sort(key=lambda x: (not x["_b"].startswith(pal[0]), len(x["nombre"]), x["nombre"]))
    return {"modelos": [{"id": x["id"], "nombre": x["nombre"], "clase": x["clase"], "marca": x["marca"]} for x in r[desde:desde + n]], "total": len(r)}


def ufp_indice():
    l = ufp_catalogo()
    c, m = collections.Counter(x["clase"] for x in l if x["clase"]), collections.Counter(x["marca"] for x in l if x["marca"] and x["marca"] != "Others")
    return {"total": len(l), "clases": sorted(c.items(), key=lambda kv: -kv[1]), "marcas": sorted(m.items(), key=lambda kv: kv[0].lower())}


def ufp_imagen(ident, mini=False):
    """La foto de un modelo; `mini` es la de 129 px, para las rejillas."""
    ruta = os.path.join(UFP_D, "%d%s.png" % (ident, "_m" if mini else ""))
    if not os.path.exists(ruta):
        if not any(x["id"] == ident for x in ufp_catalogo()):
            raise ValueError("ese modelo no existe")
        datos = b""
        for tam in (("129x129", "257x257") if mini else ("257x257", "129x129")):
            try:
                with urllib.request.urlopen(urllib.request.Request("%s%d_%s.png" % (UFP_URL, ident, tam), headers={"User-Agent": "Mozilla/5.0"}), timeout=15) as r:
                    datos = r.read(600_000)
                if datos.startswith(b"\x89PNG"):
                    break
            except Exception:
                datos = b""
        if not datos.startswith(b"\x89PNG"):
            raise ValueError("ese modelo no tiene imagen")
        with open(ruta + ".tmp", "wb") as o:
            o.write(datos)
        os.replace(ruta + ".tmp", ruta)
    with open(ruta, "rb") as o:
        return o.read()


def poner_icono(c):
    mac = str(c.get("mac") or "").upper()
    if not MAC.match(mac) or mac not in conocidos:
        raise ValueError("dispositivo desconocido")
    icono, imagen = str(c.get("icono") or ""), str(c.get("imagen") or "")
    if imagen:
        m = re.match(r"^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$", imagen)
        if not m:
            raise ValueError("la imagen tiene que ser PNG, JPG o WebP")
        ext = {"jpeg": "jpg"}.get(m.group(1), m.group(1))
        datos = base64.b64decode(m.group(2))
        if len(datos) > 300_000 or not datos.startswith(FIRMAS_IMG[ext]):
            raise ValueError("la imagen no vale o pesa demasiado")
        for viejo in os.listdir(ICONOS_D):
            if viejo.startswith(mac.replace(":", "") + "."):
                os.remove(os.path.join(ICONOS_D, viejo))
        with open(os.path.join(ICONOS_D, "%s.%s" % (mac.replace(":", ""), ext)), "wb") as o:
            o.write(datos)
        icono = "img:%s:%d" % (ext, int(time.time()))
    elif icono and not re.match(r"^(mdi:[a-z0-9-]{2,40}|ufp:\d{1,6})$", icono):
        raise ValueError("icono no válido")
    with cerrojo_red:
        if conocidos[mac].pop("icono_auto", None) and not icono:
            conocidos[mac]["icono_no"] = True              # lo puso centinela y no gustó: que no vuelva
        elif icono:
            conocidos[mac].pop("icono_no", None)
        conocidos[mac]["icono"] = icono
        guardar_json(DISP_F, {m2: {a: b for a, b in k.items() if not a.startswith("_")} for m2, k in conocidos.items()})
        try:
            leer_red(False)
        except Exception:
            pass
    return {"ok": True, "icono": icono}


def despertar(c):
    escribir("mandar paquetes de despertar")
    mac = str(c.get("mac") or "").upper()
    if not MAC.match(mac) or mac not in conocidos:
        raise ValueError("dispositivo desconocido")
    paquete = b"\xff" * 6 + bytes.fromhex(mac.replace(":", "")) * 16
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        s.bind((HOST, 0))
        for puerto in (9, 7):
            s.sendto(paquete, (RED + "255", puerto))
    evento("red", "Paquete de despertar enviado", conocidos[mac].get("alias") or conocidos[mac].get("host") or mac)
    return {"ok": True}



# ---------------------------------------------------------------- de centinela.py 1795-1816: ajustes del panel (se leen de paneld)

# ============================================================ ajustes del panel
# Lo que se elige en Configuración › Avisos al móvil vive con el resto de
# ajustes del panel (paneld). Aquí solo se leen, una vez por minuto; lo que no
# esté guardado vale lo de esta tabla, que es la misma «de fábrica» del panel.
AJ_DEF = {"avisos": True, "avDispositivo": True, "avContenedor": True, "avDescarga": True, "avSeguridad": True,
          "avBloqueos": False, "avDisco": True, "avSmart": True, "avSistema": True, "avVelocidad": 0,
          "avSilencio": "noche", "velCada": 12, "discoGrave": 90}
aj_panel = {"ts": 0, "v": {}}


def aj(k):
    if time.time() - aj_panel["ts"] > 60:
        aj_panel["ts"] = time.time()
        try:
            if not E("CASALAB_PANEL_AJUSTES"):
                raise RuntimeError("sin panel")
            d = pedir(E("CASALAB_PANEL_AJUSTES"), espera=4)
            aj_panel["v"] = d.get("ajustes", d) if isinstance(d, dict) else {}
        except Exception:
            pass
    v = aj_panel["v"].get(k)
    return AJ_DEF.get(k) if v is None else v



# ---------------------------------------------------------------- de centinela.py 1817-1942: avisos al móvil (Telegram): solo salen en modo propio, a partir del corte

# ============================================================ avisos al móvil
# Por Telegram, con el bot que ya tiene Hermes: se usa su token y el chat del
# dueño, y se habla con la API de Telegram directamente (no pasa por el
# modelo de Hermes, así que funciona aunque este no tenga sesión). Los sucesos
# que llegan juntos salen en un solo mensaje, y uno repetido calla media hora.
HERMES_ENV = E("CASALAB_TELEGRAM_F", "/config/hermes.env")
cola_avisos = queue.Queue()
av = {"enviados": 0, "ultimo": 0, "error": "", "recientes": collections.deque(maxlen=12), "bot": "", "callados": {}}
SIGNO = {"mal": "🔴", "aviso": "🟠", "bien": "🟢", "info": "🔵"}


def telegram_cred():
    tok, chat = config.telegram()
    if tok and chat:
        return tok, chat
    if E("TELEGRAM_BOT_TOKEN") and E("TELEGRAM_ALLOWED_USERS"):
        return E("TELEGRAM_BOT_TOKEN"), E("TELEGRAM_ALLOWED_USERS").split(",")[0].strip()
    tok = chat = ""
    try:
        with open(HERMES_ENV, encoding="utf-8") as f:
            for li in f:
                k, _, v = li.strip().partition("=")
                v = v.strip().strip("'\"")
                if k == "TELEGRAM_BOT_TOKEN":
                    tok = v
                elif k == "TELEGRAM_ALLOWED_USERS":
                    chat = v.split(",")[0].strip()
    except OSError:
        pass
    return tok, chat


def telegram(metodo, **campos):
    tok, chat = telegram_cred()
    if not tok or not chat:
        raise RuntimeError("falta el bot de Telegram (TELEGRAM_BOT_TOKEN y TELEGRAM_ALLOWED_USERS en ~/.hermes/.env)")
    if metodo == "sendMessage":
        campos.setdefault("chat_id", chat)
    try:
        return pedir("https://api.telegram.org/bot%s/%s" % (tok, metodo), {"Content-Type": "application/json"},
                     json.dumps(campos).encode(), espera=15)
    except urllib.error.HTTPError as e:
        raise RuntimeError("Telegram contesta %d" % e.code)      # sin la URL: lleva el token
    except Exception as e:
        raise RuntimeError("Telegram no responde (%s)" % type(e).__name__)


def en_silencio():
    h = time.localtime().tm_hour
    return {"noche": h >= 23 or h < 8, "manana": h < 10}.get(aj("avSilencio"), False)


def _html(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _uptime():
    try:
        with open("/proc/uptime") as f:
            return float(f.read().split()[0])
    except Exception:
        return 1e9


def _salud_sigue_mal(n):
    """Un «unhealthy» suelto (arranque lento, un pico) no es noticia: solo se
    avisa si a los 5 minutos sigue igual."""
    _, out = sh(["docker", "inspect", "-f", "{{if .State.Health}}{{.State.Health.Status}}{{end}}", n])
    if out.strip() == "unhealthy":
        evento("contenedores", "%s lleva 5 min sin pasar su comprobación de salud" % n, "", "aviso",
               avisa="avContenedor")


def avisar(e, regla):
    """Lo llama evento(): decide si ese suceso merece un mensaje."""
    if not aj("avisos") or not aj(regla):
        return
    if abs(time.time() - e["ts"]) > 900:           # historia que se rellena, no algo que pase ahora
        return
    # Los primeros 10 min tras arrancar todo se esta levantando: los contenedores
    # pasan por «unhealthy» o se reinician mientras esperan a sus discos. Ruido.
    if regla == "avContenedor" and _uptime() < 600:
        return
    ahora = time.time()
    if ahora - av["callados"].get(e["t"], 0) < 1800:
        return
    av["callados"][e["t"]] = ahora
    cola_avisos.put(e)


def bucle_avisos():
    while True:
        lote = [cola_avisos.get()]
        time.sleep(8)                              # lo que llega junto, en un solo mensaje
        while not cola_avisos.empty() and len(lote) < 12:
            lote.append(cola_avisos.get())
        texto = "\n\n".join("%s <b>%s</b>%s" % (SIGNO.get(e["nivel"], "🔵"), _html(e["t"]), "\n" + _html(e["d"]) if e.get("d") else "")
                            for e in lote)
        grave = any(e["nivel"] == "mal" for e in lote)
        try:
            telegram("sendMessage", text=texto, parse_mode="HTML", disable_notification=en_silencio() and not grave)
            av["enviados"] += len(lote)
            av["ultimo"] = int(time.time())
            av["error"] = ""
            for e in lote:
                av["recientes"].append({"ts": e["ts"], "t": e["t"], "nivel": e["nivel"]})
        except Exception as x:
            av["error"] = str(x)[:160]


def api_avisos():
    tok, chat = telegram_cred()
    if tok and chat and not av["bot"]:
        try:
            av["bot"] = (telegram("getMe").get("result") or {}).get("username", "")
        except Exception as x:
            av["error"] = str(x)[:160]
    return {"listo": bool(tok and chat), "bot": av["bot"], "enviados": av["enviados"], "ultimo": av["ultimo"],
            "error": av["error"], "recientes": list(av["recientes"]), "activo": bool(aj("avisos")), "silencio": en_silencio()}


def probar_aviso(c):
    if time.time() - av.get("prueba", 0) < 10:
        raise ValueError("espera unos segundos entre prueba y prueba")
    av["prueba"] = time.time()
    telegram("sendMessage", parse_mode="HTML",
             text="🟢 <b>CasaLAB: los avisos funcionan</b>\nAsí te llegará lo que pase en el servidor. Qué avisa y qué no se elige en Configuración › Avisos al móvil.")
    av["ultimo"], av["error"] = int(time.time()), ""
    return {"ok": True}



# ---------------------------------------------------------------- de centinela.py 1943-2096: velocidad de la línea

# ============================================================ velocidad de la línea
# Una prueba propia contra Cloudflare (varias conexiones a la vez durante unos
# segundos), sin instalar nada. Se repite sola cada tantas horas y se guarda.
VEL_F = os.path.join(DATOS, "velocidad.jsonl")
vel = {"midiendo": False, "error": "", "historia": collections.deque(maxlen=600)}
try:
    with open(VEL_F, encoding="utf-8") as _f:
        for _l in _f:
            try:
                vel["historia"].append(json.loads(_l))
            except Exception:
                pass
except OSError:
    pass
CF = "speed.cloudflare.com"
CAB_VEL = {"User-Agent": "Mozilla/5.0 (CasaLAB)", "Referer": "https://speed.cloudflare.com/"}


def _latencia():
    c = http.client.HTTPSConnection(CF, timeout=6)
    ms = []
    try:
        for i in range(8):
            t0 = time.perf_counter()
            c.request("GET", "/__down?bytes=0", headers=CAB_VEL)
            c.getresponse().read()
            if i:                                  # la primera lleva el saludo TLS
                ms.append((time.perf_counter() - t0) * 1000)
    finally:
        c.close()
    ms.sort()
    med = ms[len(ms) // 2]
    return round(med, 1), round(sum(abs(x - med) for x in ms) / len(ms), 1)


def _caudal(obrero, hilos, dura):
    """Lanza `hilos` obreros que suman bytes en su casilla y mide el ritmo
    cuando ya han cogido velocidad (se descarta el primer segundo y medio)."""
    cuenta, fin = [0] * hilos, time.time() + dura
    hs = [threading.Thread(target=obrero, args=(i, cuenta, fin), daemon=True) for i in range(hilos)]
    for h in hs:
        h.start()
    time.sleep(1.5)
    b0, t0 = sum(cuenta), time.perf_counter()
    time.sleep(max(0.5, fin - time.time()))
    b1, t1 = sum(cuenta), time.perf_counter()
    for h in hs:
        h.join(3)
    return (b1 - b0) * 8 / (t1 - t0) / 1e6


def _bajar_de(host, ruta):
    def obrero(i, cuenta, fin):
        while time.time() < fin:
            try:
                c = http.client.HTTPSConnection(host, timeout=8)
                c.request("GET", ruta, headers=CAB_VEL)
                r = c.getresponse()
                if r.status != 200:
                    return
                while time.time() < fin:
                    b = r.read(262144)
                    if not b:
                        break
                    cuenta[i] += len(b)
                c.close()
            except Exception:
                time.sleep(0.2)
    return obrero


def _subir(i, cuenta, fin):
    trozo = bytes(131072)

    def cuerpo():
        for _ in range(400):                       # 50 MB como mucho por conexión
            if time.time() >= fin:
                return
            cuenta[i] += len(trozo)
            yield trozo
    while time.time() < fin:
        try:
            c = http.client.HTTPSConnection(CF, timeout=8)
            c.request("POST", "/__up", body=cuerpo(), headers=dict(CAB_VEL, **{"Content-Length": str(400 * len(trozo)), "Content-Type": "application/octet-stream"}))
            if time.time() < fin:
                c.getresponse().read()
            c.close()
        except Exception:
            time.sleep(0.2)


def medir_velocidad(motivo="programada"):
    with cerrojo:
        if vel["midiendo"]:
            return
        vel["midiendo"] = True
    try:
        r = {"ts": int(time.time()), "motivo": motivo, "servidor": "Cloudflare"}
        try:
            r["ping"], r["jitter"] = _latencia()
        except Exception:
            r["ping"] = r["jitter"] = None
        baja = _caudal(_bajar_de(CF, "/__down?bytes=100000000"), 6, 8)
        if baja < 1:                               # Cloudflare no contesta: se intenta con OVH (solo bajada)
            baja = _caudal(_bajar_de("proof.ovh.net", "/files/1Gb.dat"), 6, 8)
            r["servidor"] = "OVH"
        r["baja"] = round(baja, 1)
        r["sube"] = round(_caudal(_subir, 4, 7), 1) if r["servidor"] == "Cloudflare" else None
        if r["baja"] < 1:
            raise RuntimeError("ningún servidor de prueba contesta")
        vel["historia"].append(r)
        vel["error"] = ""
        with open(VEL_F, "a", encoding="utf-8") as f:
            f.write(json.dumps(r) + "\n")
        minimo = float(aj("avVelocidad") or 0)
        if minimo and r["baja"] < minimo:
            evento("red", "La línea va lenta", "%s Mbps de bajada (aviso por debajo de %d) · %s Mbps de subida" %
                   (str(r["baja"]).replace(".", ","), minimo, str(r["sube"]).replace(".", ",")), "aviso", avisa="avisos")
    except Exception as e:
        vel["error"] = str(e)[:160]
    finally:
        vel["midiendo"] = False


def bucle_velocidad():
    time.sleep(90)
    while True:
        try:
            cada = float(aj("velCada") or 0)
            ult = vel["historia"][-1]["ts"] if vel["historia"] else 0
            if ESCRITURA and cada and time.time() - ult >= cada * 3600:     # en solo lectura la mide centinela
                medir_velocidad()
        except Exception as e:
            vel["error"] = str(e)[:160]
        time.sleep(120)


def api_velocidad():
    h = list(vel["historia"])
    sem = [x for x in h if x["ts"] > time.time() - 7 * 86400 and x.get("baja")]
    return {"midiendo": vel["midiendo"], "error": vel["error"], "ultima": h[-1] if h else None, "cada": aj("velCada"),
            "historia": [[x["ts"], x.get("baja"), x.get("sube"), x.get("ping")] for x in h[-120:]],
            "semana": {"n": len(sem), "baja": round(sum(x["baja"] for x in sem) / len(sem), 1),
                       "min": min(x["baja"] for x in sem), "max": max(x["baja"] for x in sem)} if sem else None}


def pedir_medida(c):
    ult = vel["historia"][-1]["ts"] if vel["historia"] else 0
    if vel["midiendo"] or time.time() - ult < 45:
        raise ValueError("ya hay una medida en curso o recién hecha")
    threading.Thread(target=medir_velocidad, args=("a mano",), daemon=True).start()
    return {"ok": True}



# ---------------------------------------------------------------- de centinela.py 2494-2546: Home Assistant por WebSocket (para identificar equipos)

def ha_ws(orden):
    """Una orden por el WebSocket de Home Assistant (lo que su API normal no
    deja hacer: tocar el registro de aparatos). Devuelve su resultado."""
    ha = config.home_assistant(HOST)
    if not ha["url"]:
        raise RuntimeError("Home Assistant no está conectado")
    hu = urlparse(ha["url"])
    s = socket.create_connection((hu.hostname, hu.port or 8123), timeout=10)
    try:
        clave = base64.b64encode(os.urandom(16)).decode()
        s.sendall(("GET /api/websocket HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\n"
                   "Sec-WebSocket-Version: 13\r\n\r\n" % (hu.netloc, clave)).encode())
        f = s.makefile("rb")
        if b" 101 " not in f.readline():
            raise RuntimeError("Home Assistant no acepta la conexión")
        while f.readline() not in (b"\r\n", b""):
            pass

        def manda(obj):
            d, m = json.dumps(obj).encode(), os.urandom(4)
            n = len(d)
            cab = bytes([0x81]) + (bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n) if n < 65536 else bytes([0x80 | 127]) + struct.pack(">Q", n))
            s.sendall(cab + m + bytes(x ^ m[i & 3] for i, x in enumerate(d)))

        def recibe():
            trozos = b""
            while True:
                b = f.read(2)
                if len(b) < 2:
                    raise RuntimeError("Home Assistant ha cortado")
                fin, op, n = b[0] & 0x80, b[0] & 0x0F, b[1] & 0x7F
                if n == 126:
                    n = struct.unpack(">H", f.read(2))[0]
                elif n == 127:
                    n = struct.unpack(">Q", f.read(8))[0]
                d = f.read(n)
                if op == 8:
                    raise RuntimeError("Home Assistant ha cerrado")
                if op in (0, 1, 2):
                    trozos += d
                    if fin:
                        return json.loads(trozos)
        recibe()                                   # auth_required
        manda({"type": "auth", "access_token": ha["token"]})
        if recibe().get("type") != "auth_ok":
            raise RuntimeError("Home Assistant no acepta la clave")
        manda(dict(orden, id=1))
        for _ in range(20):
            r = recibe()
            if r.get("id") == 1 and r.get("type") == "result":
                if not r.get("success"):
                    raise RuntimeError((r.get("error") or {}).get("message", "Home Assistant lo rechaza"))
                return r.get("result")
        raise RuntimeError("sin respuesta de Home Assistant")
    finally:
        s.close()


# ---------------------------------------------------------------- de centinela.py 2868-4328: aplicaciones por equipo, mundo, salud de Internet, historial, identificación, VPN, copias

# ============================================================ aplicaciones por equipo
# Qué usa cada equipo y cuánto gasta en ello, como la página de cliente de
# UniFi. El router no inspecciona paquetes, así que se cruzan dos cosas:
#
#   · las conexiones que tiene abiertas (su tabla de seguimiento, con los bytes
#     de cada una; la da /usr/libexec/casalab-flujos, lo único que se le deja
#     ejecutar para esto), leídas cada cinco segundos, y
#   · el registro de AdGuard, que dice qué nombre pidió cada equipo para llegar
#     a cada dirección.
#
# Con eso cada byte se apunta a un dominio y, por apps_tabla.py, a una
# aplicación. Límites que conviene saber: solo se ve lo que sale a Internet
# (lo que va de un equipo a otro de casa no pasa por el router); una dirección
# que nadie ha preguntado a AdGuard (DNS propio del equipo, VPN, P2P) queda
# «sin identificar»; y nlbwmon, en el router, pone a cero los contadores cada
# medio minuto, con lo que se pierde lo que cae entre mi última lectura y su
# puesta a cero (un 8 % de media).
# Se guarda un fichero por día en datos/apps/, 35 días.
APPS_D = os.path.join(DATOS, "apps")
DPI_D = os.path.join(DATOS, "dpi")
os.makedirs(APPS_D, exist_ok=True)
os.makedirs(DPI_D, exist_ok=True)
DPI_URL = "https://static.ui.com/dpi/"
DPI = leer_json(os.path.join(BASE, "apps_iconos.json"), {})      # nombre de la app → fichero de su icono
DPI_FICHEROS = set(DPI.values())
def adg_cfg():
    return config.adguard(HOST)
AP_CADA = 5
AP_DIAS = 35

cerrojo_ap = threading.Lock()
ap = {"dns": {}, "dns_c": {}, "flujos": {}, "primera": True, "ips": {}, "ips_ts": 0, "dia": "", "d": {}, "sucio": False,
      "vivo": {}, "adg_ts": 0.0, "adg_ok": False, "ts": 0, "guardado": 0, "error": ""}
ap_min = collections.defaultdict(lambda: collections.deque(maxlen=720))      # una hora, de 5 en 5 s
ap_dias = {}                                                               # los días ya cerrados que se han pedido
_ip_norm = {}


def _ip(t):
    """Las direcciones IPv6, siempre escritas igual (el router las da enteras y AdGuard abreviadas)."""
    if ":" not in t:
        return t
    v = _ip_norm.get(t)
    if v is None:
        if len(_ip_norm) > 20000:
            _ip_norm.clear()
        try:
            v = ipaddress.ip_address(t).compressed
        except ValueError:
            v = t
        _ip_norm[t] = v
    return v


def _ap_ruta(dia):
    return os.path.join(APPS_D, dia + ".json")


def _ap_equipo(mac):
    return ap["d"].setdefault(mac, {"h": {}, "dom": {}, "u": {}, "q": 0, "qb": 0, "bloq": {}, "qa": {}})


def ap_guardar():
    with cerrojo_ap:
        if not ap["dia"]:
            return
        for x in ap["d"].values():                 # que la lista de sitios de un día no crezca sin fin
            for k in ("dom", "bloq"):
                if len(x[k]) > 400:
                    gordo = sorted(x[k].items(), key=lambda kv: -(sum(kv[1]) if isinstance(kv[1], list) else kv[1]))[:250]
                    x[k] = dict(gordo)
        copia = json.dumps({"_adg": ap["adg_ts"], "d": ap["d"]}, ensure_ascii=False, separators=(",", ":"))
        ap["sucio"] = False
        ap["guardado"] = time.time()
    with open(_ap_ruta(ap["dia"]) + ".tmp", "w", encoding="utf-8") as o:
        o.write(copia)
    os.replace(_ap_ruta(ap["dia"]) + ".tmp", _ap_ruta(ap["dia"]))


def ap_rodar():
    """Al cambiar de día se cierra el fichero y se empieza otro."""
    hoy = time.strftime("%Y-%m-%d")
    if ap["dia"] == hoy:
        return
    if ap["dia"]:
        ap_guardar()
    with cerrojo_ap:
        if ap["dia"]:
            ap_dias[ap["dia"]] = ap["d"]
        guardado = leer_json(_ap_ruta(hoy), {})
        ap["d"] = guardado.get("d") or {}
        medianoche = time.mktime(time.strptime(hoy, "%Y-%m-%d"))
        ap["adg_ts"] = max(ap["adg_ts"], float(guardado.get("_adg") or 0), medianoche)
        ap["dia"] = hoy
    limite = time.strftime("%Y-%m-%d", time.localtime(time.time() - AP_DIAS * 86400))
    for f in os.listdir(APPS_D):
        if re.match(r"^\d{4}-\d\d-\d\d\.json$", f) and f[:10] < limite:
            try:
                os.remove(os.path.join(APPS_D, f))
            except OSError:
                pass


def ap_dia(dia):
    if dia == ap["dia"]:
        return ap["d"]
    if dia not in ap_dias:
        if len(ap_dias) > 40:
            ap_dias.clear()
        ap_dias[dia] = leer_json(_ap_ruta(dia), {}).get("d") or {}
    return ap_dias[dia]


def ap_mapa_ips():
    """A qué equipo pertenece cada dirección de casa, las IPv6 también."""
    ips = {x["ip"]: mac for mac, x in list(red["disp"].items()) if x.get("ip") and x["ip"] != ROUTER}
    try:
        for mac, v in (ubus("luci-rpc", "getHostHints") or {}).items():
            if mac.upper() in red["disp"]:
                for a in v.get("ip6addrs") or []:
                    if not a.lower().startswith("fe80"):
                        ips[_ip(a)] = mac.upper()
    except Exception:
        pass
    if ips:
        ap["ips"] = ips
    ap["ips_ts"] = time.time()


# ---- AdGuard: qué nombre hay detrás de cada dirección
def adg(ruta):
    a = adg_cfg()
    if not a["url"]:
        raise RuntimeError("AdGuard Home no está conectado (Ajustes → Integraciones)")
    cred = base64.b64encode(("%s:%s" % (a["usuario"], a["clave"])).encode()).decode()
    return pedir(a["url"] + ruta, {"Authorization": "Basic " + cred}, espera=20)


_ADG_HORA = re.compile(r"^(.{19})(\.\d+)?(Z|[+-]\d\d:\d\d)$")


def _adg_hora(t):
    m = _ADG_HORA.match(t or "")
    if not m:
        return 0.0
    try:
        return datetime.fromisoformat(m.group(1) + (m.group(2) or "")[:7] + ("+00:00" if m.group(3) == "Z" else m.group(3))).timestamp()
    except ValueError:
        return 0.0


def adg_procesar(entradas, pisar):
    """`entradas`, de la más vieja a la más nueva. Devuelve la hora de la última."""
    ultima = ap["adg_ts"]
    with cerrojo_ap:
        for e in entradas:
            ts = _adg_hora(e.get("time"))
            dom = ((e.get("question") or {}).get("name") or "").lower().rstrip(".")
            if not dom or not ts:
                continue
            mac = ap["ips"].get(_ip(e.get("client") or ""))
            for a in e.get("answer") or []:
                if a.get("type") in ("A", "AAAA") and a.get("value") not in ("0.0.0.0", "::", None):
                    ip = _ip(str(a["value"]))
                    if pisar or ip not in ap["dns"]:
                        ap["dns"][ip] = dom
                    if mac and (pisar or (mac, ip) not in ap["dns_c"]):
                        ap["dns_c"][(mac, ip)] = dom
            if ts > ap["adg_ts"] and mac and ap["dia"] and time.strftime("%Y-%m-%d", time.localtime(ts)) == ap["dia"]:
                x = _ap_equipo(mac)
                x["q"] += 1
                if str(e.get("reason") or "").startswith("Filtered"):
                    x["qb"] += 1
                    x["bloq"][dom] = x["bloq"].get(dom, 0) + 1
                else:
                    n = apps_tabla.de_dominio(dom)
                    x["qa"][n] = x["qa"].get(n, 0) + 1
                ap["sucio"] = True
            ultima = max(ultima, ts)
        for k in ("dns", "dns_c"):                 # tope de memoria: fuera la mitad más vieja
            if len(ap[k]) > 120000:
                ap[k] = dict(list(ap[k].items())[60000:])
    return ultima


def bucle_adg():
    time.sleep(14)
    # al arrancar, hacia atrás: para saber ya de quién es cada dirección
    try:
        ap_rodar()
        ap_mapa_ips()
        mas_vieja, tope = "", ap["adg_ts"]
        for _ in range(12):
            r = adg("/control/querylog?limit=1000" + ("&older_than=" + urllib.parse.quote(mas_vieja) if mas_vieja else ""))
            datos = r.get("data") or []
            if not datos:
                break
            tope = max(tope, adg_procesar(reversed(datos), False))
            mas_vieja = r.get("oldest") or ""
            if not mas_vieja:
                break
        ap["adg_ts"] = tope
        ap["adg_ok"] = True
    except Exception as e:
        ap["error"] = "AdGuard: " + str(e)[:120]
    while True:
        time.sleep(20)
        try:
            datos = [e for e in (adg("/control/querylog?limit=500").get("data") or []) if _adg_hora(e.get("time")) > ap["adg_ts"]]
            ap["adg_ts"] = adg_procesar(reversed(datos), True)
            ap["adg_ok"] = True
            if ap["error"].startswith("AdGuard"):
                ap["error"] = ""
        except Exception as e:
            ap["adg_ok"] = False
            ap["error"] = "AdGuard: " + str(e)[:120]


# ---- el router: cuánto lleva cada conexión
def _de_casa(ip):
    return ip.startswith(RED) or ip.startswith(("fe80", "ff0", "fd", "fc", "224.", "239.", "255.", "127.", "169.254.", "0.")) or ip in ("::1", "::")


def leer_flujos():
    ahora = time.time()
    if ahora - ap["ips_ts"] > 60:
        ap_mapa_ips()
    ap_rodar()
    # lo instala «Preparar el router» (instalar.py); casalab-flujos es el nombre de antes
    salida = _en_router("/usr/libexec/casafi-flujos") or _en_router("/usr/libexec/casalab-flujos")
    if not salida:
        raise RuntimeError("el router no da las conexiones: falta prepararlo (Ajustes → Aplicación → Preparar el router)")
    dt = ahora - ap["ts"] if ap["ts"] else 0
    primera = ap["primera"] or not 0.5 < dt < 60
    tope = 190_000_000 * max(dt, 1)                # más que eso en una conexión no cabe por la línea
    previos, nuevos, ips = ap["flujos"], {}, ap["ips"]
    suma, sitios, vivo, nuevas = {}, {}, {}, {}
    porpais, gl = {}, {}
    hora = time.strftime("%H", time.localtime(ahora))
    for li in salida.splitlines():
        p = li.split(" ")
        if len(p) != 8:
            continue
        proto, s, sp, d, dp, b1, r, b2 = p
        try:
            b1, b2, dp = int(b1), int(b2), int(dp)
        except ValueError:
            continue
        clave = (proto, s, sp, d, dp)
        nuevos[clave] = (b1, b2)
        s, d, r = _ip(s), _ip(d), _ip(r)
        mac = ips.get(s)
        if mac:
            if _de_casa(d):
                continue
            remoto, entrante = d, False
        else:
            mac = ips.get(r)                       # alguien de fuera entra a un equipo de casa (puerto abierto)
            if not mac or _de_casa(s):
                continue
            remoto, entrante = s, True
        ant = previos.get(clave)
        if primera:
            du = dd = 0
        elif ant is None:
            du, dd = b1, b2
            nuevas[mac] = nuevas.get(mac, 0) + 1
        else:
            # si baja, es que nlbwmon lo ha puesto a cero: lo que hay es lo nuevo
            du = b1 - ant[0] if b1 >= ant[0] else b1
            dd = b2 - ant[1] if b2 >= ant[1] else b2
        if du > tope or dd > tope:
            du = dd = 0
        sube, baja = (dd, du) if entrante else (du, dd)
        v = vivo.setdefault(mac, {"n": 0, "f": {}})
        v["n"] += 1
        if not (baja or sube):
            continue
        dom = "" if entrante else (ap["dns_c"].get((mac, remoto)) or ap["dns"].get(remoto) or "")
        app = apps_tabla.de_dominio(dom) if dom else apps_tabla.de_puerto(proto, dp, entrante, remoto)
        a = suma.setdefault((mac, app), [0, 0])
        a[0] += baja
        a[1] += sube
        if dom:
            a = sitios.setdefault((mac, dom), [0, 0])
            a[0] += baja
            a[1] += sube
        a = v["f"].setdefault((app, dom or remoto), [0, 0, 0])
        a[0] += baja
        a[1] += sube
        a[2] += 1
        pais = geo_pais(remoto)
        a = porpais.setdefault((mac, pais), [0, 0])
        a[0] += baja
        a[1] += sube
        a = gl.setdefault((mac, app, dom or remoto, pais), [0, 0, 0])
        a[0] += baja
        a[1] += sube
        a[2] += 1
    with cerrojo_ap:
        for (mac, app), (baja, sube) in suma.items():
            x = _ap_equipo(mac)
            a = x["h"].setdefault(hora, {}).setdefault(app, [0, 0])
            a[0] += baja
            a[1] += sube
            x["u"][app] = int(ahora)
        for (mac, dom), (baja, sube) in sitios.items():
            a = _ap_equipo(mac)["dom"].setdefault(dom, [0, 0])
            a[0] += baja
            a[1] += sube
        for mac, n in nuevas.items():
            x = _ap_equipo(mac)
            x["f"] = x.get("f", 0) + n
        vp = {}
        for (mac, pais), (baja, sube) in porpais.items():
            a = _ap_equipo(mac).setdefault("hp", {}).setdefault(hora, {}).setdefault(pais, [0, 0])
            a[0] += baja
            a[1] += sube
            a = vp.setdefault(pais, [0, 0, 0])
            a[0] += baja / dt if dt else 0
            a[1] += sube / dt if dt else 0
        for (_, _, _, pais), f in gl.items():
            vp[pais][2] += f[2]
        ap["mundo"] = {"ts": ahora, "paises": vp, "flujos": [[k[0], k[1], k[2], k[3], int(f[0] / dt) if dt else 0, int(f[1] / dt) if dt else 0, f[2]]
                                                          for k, f in sorted(gl.items(), key=lambda kv: -(kv[1][0] + kv[1][1]))[:60]]}
        if suma:
            ap["sucio"] = True
        total = {}
        for (mac, _), (baja, sube) in suma.items():
            t = total.setdefault(mac, [0, 0])
            t[0] += baja
            t[1] += sube
        if not primera:
            for mac in set(total) | set(ap_min):
                t = total.get(mac, (0, 0))
                ap_min[mac].append([int(ahora), int(t[0] / dt), int(t[1] / dt)])
            ap["ritmo"] = {mac: (t[0] / dt, t[1] / dt) for mac, t in total.items()}
        ap["vivo"] = {mac: {"n": v["n"], "l": [[k[0], k[1], int(f[0] / dt) if dt else 0, int(f[1] / dt) if dt else 0, f[2]]
                                               for k, f in sorted(v["f"].items(), key=lambda kv: -(kv[1][0] + kv[1][1]))[:12]]}
                      for mac, v in vivo.items()}
        ap["flujos"], ap["ts"], ap["primera"] = nuevos, ahora, False
    if ap["error"].startswith("Router"):
        ap["error"] = ""


def bucle_apps():
    time.sleep(20)
    while True:
        try:
            leer_flujos()
            if ap["sucio"] and time.time() - ap["guardado"] > 120:
                ap_guardar()
        except Exception as e:
            ap["error"] = "Router: " + str(e)[:120]
            ap["primera"] = True
            time.sleep(10)
        time.sleep(AP_CADA)


def _ap_app(nombre):
    cat, ico, sitio = apps_tabla.info(nombre)
    return {"nombre": nombre, "cat": cat, "icono": DPI.get(ico, ""), "sitio": sitio}


RANGOS = {"24h": 1, "7d": 7, "30d": 30}


def api_equipo(q):
    mac = (q.get("mac") or [""])[0].upper()
    rango = (q.get("rango") or ["24h"])[0]
    if not MAC.match(mac) or mac not in red["disp"]:
        raise ValueError("ese equipo no existe")
    if rango not in RANGOS:
        rango = "24h"
    ahora = time.time()
    x = red["disp"][mac]
    eq = {k: v for k, v in x.items() if not k.startswith("_")}
    eq["historia"] = list(historia_wifi[mac]) if eq.get("wifi") else []
    eq["reserva"] = router_cfg["reservas"].get(mac)
    eq["bloqueado"] = mac in router_cfg["bloqueos"]
    apps, serie, sitios, bloq, ultima, consultas = {}, [], {}, {}, {}, {}
    q_total = q_bloq = 0
    with cerrojo_ap:
        if rango == "24h":
            base = int(ahora // 3600) * 3600
            horas = [base - 3600 * i for i in range(23, -1, -1)]
            dias = sorted({time.strftime("%Y-%m-%d", time.localtime(t)) for t in horas})
            for t in horas:
                lt = time.localtime(t)
                h = ((ap_dia(time.strftime("%Y-%m-%d", lt)).get(mac) or {}).get("h") or {}).get(time.strftime("%H", lt)) or {}
                b = s = 0
                for n, v in h.items():
                    a = apps.setdefault(n, [0, 0])
                    a[0] += v[0]
                    a[1] += v[1]
                    b += v[0]
                    s += v[1]
                serie.append([t, b, s])
        else:
            dias = [time.strftime("%Y-%m-%d", time.localtime(ahora - 86400 * i)) for i in range(RANGOS[rango] - 1, -1, -1)]
            for dia in dias:
                b = s = 0
                for h in ((ap_dia(dia).get(mac) or {}).get("h") or {}).values():
                    for n, v in h.items():
                        a = apps.setdefault(n, [0, 0])
                        a[0] += v[0]
                        a[1] += v[1]
                        b += v[0]
                        s += v[1]
                serie.append([int(time.mktime(time.strptime(dia, "%Y-%m-%d"))), b, s])
        for dia in dias:
            e = ap_dia(dia).get(mac) or {}
            for dom, v in (e.get("dom") or {}).items():
                a = sitios.setdefault(dom, [0, 0])
                a[0] += v[0]
                a[1] += v[1]
            for dom, n in (e.get("bloq") or {}).items():
                bloq[dom] = bloq.get(dom, 0) + n
            for n, t in (e.get("u") or {}).items():
                ultima[n] = max(ultima.get(n, 0), t)
            for n, c in (e.get("qa") or {}).items():
                consultas[n] = consultas.get(n, 0) + c
            q_total += e.get("q", 0)
            q_bloq += e.get("qb", 0)
        vivo = ap["vivo"].get(mac) or {"n": 0, "l": []}
        minutos = list(ap_min[mac]) if mac in ap_min else []
        desde = min([f[:10] for f in os.listdir(APPS_D) if re.match(r"^\d{4}-\d\d-\d\d\.json$", f)] or [ap["dia"]])
    lista = []
    for n, (b, s) in apps.items():
        if b + s < 1:
            continue
        lista.append(dict(_ap_app(n), baja=b, sube=s, ultima=ultima.get(n, 0), consultas=consultas.get(n, 0)))
    lista.sort(key=lambda a: -(a["baja"] + a["sube"]))
    cats = {}
    for a in lista:
        c = cats.setdefault(a["cat"], {"cat": a["cat"], "nombre": apps_tabla.CATS.get(a["cat"], a["cat"]), "baja": 0, "sube": 0, "apps": 0})
        c["baja"] += a["baja"]
        c["sube"] += a["sube"]
        c["apps"] += 1
    nombre = eq.get("nombre") or ""
    suyos = [e for e in list(eventos) if e.get("cat") == "red" and (mac in (e.get("k") or "") or (nombre and (e.get("t", "").startswith(nombre + " ") or nombre in e.get("d", ""))))]
    with cerrojo:
        ahora_tr = (trafico["d"].get(mac) or [0, 0, ""])
    return {
        "ts": int(ahora), "rango": rango, "equipo": eq, "apps": lista[:80], "cats": sorted(cats.values(), key=lambda c: -(c["baja"] + c["sube"])),
        "total": [sum(a["baja"] for a in lista), sum(a["sube"] for a in lista)], "serie": serie,
        "sitios": [dict(_ap_app(apps_tabla.de_dominio(d)), dominio=d, baja=v[0], sube=v[1]) for d, v in sorted(sitios.items(), key=lambda kv: -(kv[1][0] + kv[1][1]))[:40]],
        "dns": {"consultas": q_total, "bloqueadas": q_bloq, "top": sorted(bloq.items(), key=lambda kv: -kv[1])[:15],
                "pedidas": [dict(_ap_app(n), consultas=c) for n, c in sorted(consultas.items(), key=lambda kv: -kv[1])[:15]]},
        "vivo": {"conexiones": vivo["n"], "flujos": [dict(_ap_app(f[0]), destino=f[1], baja=f[2], sube=f[3], n=f[4]) for f in vivo["l"]]},
        "historial": hi_equipo(mac, rango, ahora), "minutos": minutos, "ahora": ahora_tr, "eventos": suyos[-14:][::-1], "desde": desde, "dias": dias,
        "fuente": {"adguard": ap["adg_ok"], "router": bool(ap["ts"]) and ahora - ap["ts"] < 60, "error": ap["error"]},
    }


# ---- lo de toda la red: quién gasta más y en qué
def api_resumen(q):
    rango = (q.get("rango") or ["24h"])[0]
    if rango not in RANGOS:
        rango = "24h"
    ahora = time.time()
    apps, clientes, sitios = {}, {}, {}
    flujos = consultas = bloqueadas = 0
    with cerrojo_ap:
        if rango == "24h":
            base = int(ahora // 3600) * 3600
            horas = [time.localtime(base - 3600 * i) for i in range(24)]
            trozos = [(time.strftime("%Y-%m-%d", t), time.strftime("%H", t)) for t in horas]
            dias = sorted({d for d, _ in trozos})
        else:
            dias = [time.strftime("%Y-%m-%d", time.localtime(ahora - 86400 * i)) for i in range(RANGOS[rango])]
            trozos = [(d, None) for d in dias]
        for dia, hora in trozos:
            for mac, e in ap_dia(dia).items():
                for h, porapp in (e.get("h") or {}).items():
                    if hora is not None and h != hora:
                        continue
                    for n, v in porapp.items():
                        a = apps.setdefault(n, [0, 0])
                        a[0] += v[0]
                        a[1] += v[1]
                        c = clientes.setdefault(mac, [0, 0])
                        c[0] += v[0]
                        c[1] += v[1]
        for dia in dias:
            for mac, e in ap_dia(dia).items():
                for dom, v in (e.get("dom") or {}).items():
                    a = sitios.setdefault(dom, [0, 0])
                    a[0] += v[0]
                    a[1] += v[1]
                flujos += e.get("f", 0)
                consultas += e.get("q", 0)
                bloqueadas += e.get("qb", 0)
        abiertas = sum(v["n"] for v in ap["vivo"].values())
    total = [sum(v[0] for v in apps.values()), sum(v[1] for v in apps.values())]
    sin = sum(sum(v) for n, v in apps.items() if apps_tabla.info(n)[0] == "otros")

    def cliente(mac, v):
        x = red["disp"].get(mac) or {}
        k = conocidos.get(mac) or {}
        return {"mac": mac, "nombre": x.get("nombre") or k.get("alias") or k.get("host") or mac, "tipo": x.get("tipo") or k.get("tipo") or "", "icono": k.get("icono", ""),
                "host": x.get("host") or "", "fabricante": x.get("fabricante") or "", "en_linea": bool(x.get("en_linea")), "baja": v[0], "sube": v[1]}
    gordo = lambda d: sorted(d.items(), key=lambda kv: -(kv[1][0] + kv[1][1]))[:15]
    return {"ts": int(ahora), "rango": rango, "total": total, "flujos": flujos, "abiertas": abiertas, "consultas": consultas, "bloqueadas": bloqueadas,
            "sin_identificar": sin, "equipos": sum(1 for v in clientes.values() if v[0] + v[1] > 0),
            "apps": [dict(_ap_app(n), baja=v[0], sube=v[1]) for n, v in gordo(apps)],
            "clientes": [cliente(m, v) for m, v in gordo(clientes)],
            "destinos": [dict(_ap_app(apps_tabla.de_dominio(d)), dominio=d, baja=v[0], sube=v[1]) for d, v in gordo(sitios)],
            "fuente": {"adguard": ap["adg_ok"], "router": bool(ap["ts"]) and ahora - ap["ts"] < 60, "error": ap["error"]}}


# ---- cuánto tarda en contestar Internet (como las tres cifras del panel de UniFi)
LATENCIA = [("Microsoft", "www.microsoft.com"), ("Google", "www.google.com"), ("Cloudflare", "1.1.1.1")]
latencia = {"ts": 0, "l": []}


def _tarda(host):
    """Milisegundos en abrir una conexión al 443: funciona también con quien no contesta al ping."""
    try:
        ip = socket.getaddrinfo(host, 443, socket.AF_INET, socket.SOCK_STREAM)[0][4]
    except OSError:
        return None
    mejor = None
    for _ in range(3):
        t = time.perf_counter()
        try:
            with socket.create_connection(ip, timeout=2):
                ms = (time.perf_counter() - t) * 1000
            mejor = ms if mejor is None else min(mejor, ms)
        except OSError:
            pass
        time.sleep(0.15)
    return None if mejor is None else round(mejor, 1)


# Quién da la línea (para ponerle su logo al nudo «Internet» del mapa, como hace
# UniFi) y desde dónde sale, según ipinfo.io. Se pregunta al cambiar la IP
# pública o una vez por semana; la ciudad es la del registro de la dirección,
# no necesariamente la de casa.
OPERADOR_F = os.path.join(DATOS, "operador.json")
operador = leer_json(OPERADOR_F, {})


def leer_operador():
    ip = (red["router"].get("wan") or {}).get("ip") or ""
    if not ip or (operador.get("ip") == ip and time.time() - operador.get("ts", 0) < 7 * 86400):
        return
    if time.time() - operador.get("intento", 0) < 600:
        return
    operador["intento"] = time.time()
    d = json.loads(_bajar("https://ipinfo.io/json", 20_000, 10))
    org = re.sub(r"^AS\d+\s+", "", d.get("org") or "")
    operador.update(ip=ip, ts=int(time.time()), nombre=org.title() if org.isupper() else org, asn=(re.match(r"AS\d+", d.get("org") or "") or [""])[0],
                    ciudad=d.get("city") or "", region=d.get("region") or "", pais=d.get("country") or "", host=d.get("hostname") or "")
    guardar_json(OPERADOR_F, operador)


def bucle_latencia():
    time.sleep(8)
    while True:
        try:
            leer_operador()
        except Exception:
            pass
        try:
            latencia.update(ts=int(time.time()), l=[{"nombre": n, "host": h, "ms": _tarda(h)} for n, h in LATENCIA])
            salud_muestra(time.time(), latencia["l"])
        except Exception:
            pass
        time.sleep(5 if sal["fallos"] else 30)


def dpi_icono(fichero):
    """El icono oficial de UniFi de una aplicación; se baja una vez y se guarda."""
    if fichero not in DPI_FICHEROS:
        raise ValueError("ese icono no existe")
    ruta = os.path.join(DPI_D, fichero)
    if not os.path.exists(ruta):
        with urllib.request.urlopen(urllib.request.Request(DPI_URL + urllib.parse.quote(fichero), headers={"User-Agent": "Mozilla/5.0"}), timeout=15) as r:
            datos = r.read(600_000)
        if r.status != 200 or not datos.startswith(b"\x89PNG"):
            raise ValueError("ese icono no tiene imagen")
        with open(ruta + ".tmp", "wb") as o:
            o.write(datos)
        os.replace(ruta + ".tmp", ruta)
    with open(ruta, "rb") as o:
        return o.read()


# ============================================================================
# Más de UniFi (10-10-2026): el mapa del mundo, la salud de Internet, el
# historial de cada equipo, la identificación automática, la rama de la VPN
# y las copias de la configuración del router.
# ============================================================================
import array
import bisect
import csv
import difflib
import gzip
import io
import math
import tarfile

NAVEGADOR = {"User-Agent": "Mozilla/5.0 (CasaLAB)"}


def _bajar(url, tope=60_000_000, espera=120):
    with urllib.request.urlopen(urllib.request.Request(url, headers=NAVEGADOR), timeout=espera) as r:
        return r.read(tope)


def _cuanto(seg):
    seg = int(seg)
    if seg < 90:
        return "%d s" % seg
    if seg < 5400:
        return "%d min" % round(seg / 60)
    return ("%.1f h" % (seg / 3600)).replace(".", ",")


# ---- de qué país es cada dirección ------------------------------------------
# La tabla gratuita de DB-IP (IP to Country Lite, licencia CC BY 4.0: hay que
# citarla, y el panel lo hace). Un fichero al mes; se guarda en datos/geo/ y
# se busca por bisección, sin dependencias.
GEO_D = os.path.join(DATOS, "geo")
os.makedirs(GEO_D, exist_ok=True)
GEO_URL = "https://download.db-ip.com/free/dbip-country-lite-%s.csv.gz"
GEO_F = os.path.join(GEO_D, "paises.csv.gz")
geo = {"v4i": None, "v4f": None, "v4c": None, "v6i": [], "v6f": [], "v6c": None, "cod": [], "ts": 0, "error": ""}
_geo_visto = {}


def geo_bajar():
    try:
        if time.time() - os.path.getmtime(GEO_F) < 32 * 86400:
            return
    except OSError:
        pass
    t = time.localtime()
    for mes in ("%d-%02d" % (t.tm_year, t.tm_mon), "%d-%02d" % ((t.tm_year, t.tm_mon - 1) if t.tm_mon > 1 else (t.tm_year - 1, 12))):
        try:
            datos = _bajar(GEO_URL % mes)
            if datos[:2] != b"\x1f\x8b":
                continue
            with open(GEO_F + ".tmp", "wb") as o:
                o.write(datos)
            os.replace(GEO_F + ".tmp", GEO_F)
            geo["error"] = ""
            return
        except Exception as e:
            geo["error"] = str(e)[:120]


def geo_cargar():
    geo_bajar()
    try:
        mt = os.path.getmtime(GEO_F)
    except OSError:
        return
    if geo["ts"] == mt:
        return
    cod, idx = [], {}
    v4i, v4f, v4c = array.array("I"), array.array("I"), array.array("H")
    v6i, v6f, v6c = [], [], array.array("H")
    with gzip.open(GEO_F, "rt", encoding="ascii", errors="replace") as f:
        for fila in csv.reader(f):
            if len(fila) < 3:
                continue
            a, b, c = fila[0], fila[1], fila[2]
            n = idx.get(c)
            if n is None:
                n = idx[c] = len(cod)
                cod.append(c)
            try:
                if ":" in a:
                    v6i.append(int.from_bytes(socket.inet_pton(socket.AF_INET6, a), "big"))
                    v6f.append(int.from_bytes(socket.inet_pton(socket.AF_INET6, b), "big"))
                    v6c.append(n)
                else:
                    v4i.append(struct.unpack("!I", socket.inet_aton(a))[0])
                    v4f.append(struct.unpack("!I", socket.inet_aton(b))[0])
                    v4c.append(n)
            except (OSError, struct.error):
                pass
    if len(v4i) > 1000:
        geo.update(v4i=v4i, v4f=v4f, v4c=v4c, v6i=v6i, v6f=v6f, v6c=v6c, cod=cod, ts=mt)
        _geo_visto.clear()


def geo_pais(ip):
    """«ES», «US»… o "" si no se sabe (o la tabla aún no está cargada)."""
    if geo["v4i"] is None:
        return ""
    v = _geo_visto.get(ip)
    if v is not None:
        return v
    v = ""
    try:
        if ":" in ip:
            n = int.from_bytes(socket.inet_pton(socket.AF_INET6, ip), "big")
            i = bisect.bisect_right(geo["v6i"], n) - 1
            if i >= 0 and n <= geo["v6f"][i]:
                v = geo["cod"][geo["v6c"][i]]
        else:
            n = struct.unpack("!I", socket.inet_aton(ip))[0]
            i = bisect.bisect_right(geo["v4i"], n) - 1
            if i >= 0 and n <= geo["v4f"][i]:
                v = geo["cod"][geo["v4c"][i]]
    except (OSError, struct.error, ValueError):
        pass
    if v == "ZZ":
        v = ""
    if len(_geo_visto) > 60000:
        _geo_visto.clear()
    _geo_visto[ip] = v
    return v


# ---- el dibujo del mundo -----------------------------------------------------
# Las fronteras son las de Natural Earth a 1:110 M (paquete world-atlas, de
# dominio público) y los nombres en castellano y los códigos, del paquete
# i18n-iso-countries. Se bajan una vez y aquí se convierten en trazos SVG ya
# proyectados (Equal Earth), para que el panel solo tenga que pintarlos.
MUNDO_F = os.path.join(GEO_D, "mundo.json")
MUNDO_V = 3
MUNDO_ATLAS = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json"
MUNDO_COD = "https://cdn.jsdelivr.net/npm/i18n-iso-countries@7.14.0/codes.json"
MUNDO_ES = "https://cdn.jsdelivr.net/npm/i18n-iso-countries@7.14.0/langs/es.json"
# sitios con mucho tráfico que a esa escala no tienen dibujo: (latitud, longitud)
MUNDO_PEQUES = {"SG": (1.35, 103.82), "HK": (22.32, 114.17), "MO": (22.2, 113.55), "MT": (35.9, 14.45), "BH": (26.07, 50.55), "MU": (-20.2, 57.5),
                "SC": (-4.68, 55.49), "LI": (47.16, 9.55), "MC": (43.74, 7.42), "AD": (42.55, 1.6), "SM": (43.94, 12.46), "GI": (36.14, -5.35),
                "IM": (54.24, -4.55), "JE": (49.21, -2.13), "GG": (49.46, -2.59), "BB": (13.19, -59.54), "KY": (19.31, -81.25), "BM": (32.31, -64.75),
                "CW": (12.17, -68.99), "AW": (12.52, -69.97), "MV": (3.2, 73.22), "RE": (-21.12, 55.54), "GP": (16.25, -61.58), "MQ": (14.64, -61.02),
                "FO": (61.89, -6.91), "CV": (15.12, -23.6), "KM": (-11.65, 43.33), "ST": (0.19, 6.61), "TO": (-21.18, -175.2), "WS": (-13.76, -172.1),
                "PF": (-17.68, -149.41), "GU": (13.44, 144.79), "VG": (18.42, -64.64), "VI": (18.34, -64.9), "AG": (17.06, -61.8), "LC": (13.91, -60.98),
                "GD": (12.12, -61.68), "DM": (15.41, -61.37), "KN": (17.36, -62.78), "VC": (13.25, -61.2), "TC": (21.69, -71.8), "AI": (18.22, -63.07),
                "SX": (18.04, -63.06), "MF": (18.08, -63.05), "BQ": (12.18, -68.24), "NR": (-0.52, 166.93), "TV": (-7.11, 177.65), "PW": (7.51, 134.58),
                "MH": (7.13, 171.18), "FM": (6.92, 158.25), "KI": (1.87, -157.36), "AX": (60.18, 19.92), "VA": (41.9, 12.45), "AS": (-14.27, -170.13)}
mundo = {"d": None}
_EE = (1.340264, -0.081106, 0.000893, 0.003796, math.sqrt(3) / 2)
_EE_K = 1000 / (2 * 2.7066297)


def _tierra(lon, lat):
    """Equal Earth, sobre un lienzo de 1000 de ancho (el norte, arriba)."""
    a1, a2, a3, a4, m = _EE
    t = math.asin(m * math.sin(math.radians(lat)))
    t2 = t * t
    t6 = t2 * t2 * t2
    x = math.radians(lon) * math.cos(t) / (m * (a1 + 3 * a2 * t2 + t6 * (7 * a3 + 9 * a4 * t2)))
    y = t * (a1 + a2 * t2 + t6 * (a3 + a4 * t2))
    return 500 + x * _EE_K, (1.3173628 - y) * _EE_K


def _mundo_hacer():
    topo = json.loads(_bajar(MUNDO_ATLAS))
    num_a = {str(c[2]).zfill(3): c[0] for c in json.loads(_bajar(MUNDO_COD))}
    nombres = json.loads(_bajar(MUNDO_ES)).get("countries") or {}
    nombres = {k: (v[0] if isinstance(v, list) else v) for k, v in nombres.items()}
    esc, tras = topo["transform"]["scale"], topo["transform"]["translate"]
    arcos = []
    for a in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in a:
            x += dx
            y += dy
            pts.append((x * esc[0] + tras[0], y * esc[1] + tras[1]))
        arcos.append(pts)

    def anillo(ids):
        pts = []
        for i in ids:
            a = arcos[i] if i >= 0 else arcos[~i][::-1]
            pts.extend(a[1:] if pts else a)
        return pts
    paises, sin = {}, 0
    for g in topo["objects"]["countries"]["geometries"]:
        cod = num_a.get(str(g.get("id") or "").zfill(3))
        if cod == "AQ":
            continue
        if not cod:
            sin += 1
            cod = "_%d" % sin
        polis = [g["arcs"]] if g["type"] == "Polygon" else g["arcs"]
        trazo, mejor = [], (0, None)
        for poli in polis:
            for j, ids in enumerate(poli):
                geo_pts = anillo(ids)
                if max(p[0] for p in geo_pts) - min(p[0] for p in geo_pts) > 300:
                    geo_pts = [(lon + 360 if lon < 0 else lon, lat) for lon, lat in geo_pts]
                pts = [_tierra(lon, lat) for lon, lat in geo_pts]
                if len(pts) < 3:
                    continue
                trazo.append("M" + "L".join("%.1f,%.1f" % p for p in pts) + "Z")
                if j == 0:
                    ar = cx = cy = 0.0
                    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
                        f = x0 * y1 - x1 * y0
                        ar += f
                        cx += (x0 + x1) * f
                        cy += (y0 + y1) * f
                    if abs(ar) > mejor[0] and ar:
                        mejor = (abs(ar), (round(cx / (3 * ar), 1), round(cy / (3 * ar), 1)))
        if trazo and mejor[1]:
            paises[cod] = {"d": "".join(trazo), "c": list(mejor[1]), "n": nombres.get(cod) or (g.get("properties") or {}).get("name") or cod}
    for cod, (lat, lon) in MUNDO_PEQUES.items():
        if cod not in paises:
            x, y = _tierra(lon, lat)
            paises[cod] = {"d": "", "c": [round(x, 1), round(y, 1)], "n": nombres.get(cod, cod)}
    alto = round(_tierra(0, -58)[1], 1)
    return {"v": MUNDO_V, "ancho": 1000, "alto": alto, "paises": paises, "nombres": nombres}


def mundo_mapa():
    if not mundo["d"]:
        d = leer_json(MUNDO_F, None)
        if not d or d.get("v") != MUNDO_V:
            d = _mundo_hacer()
            guardar_json(MUNDO_F, d)
        mundo["d"] = d
    return mundo["d"]


def bucle_geo():
    time.sleep(3)
    while True:
        try:
            mundo_mapa()
        except Exception as e:
            geo["error"] = "mapa: " + str(e)[:100]
        try:
            geo_cargar()
        except Exception as e:
            geo["error"] = str(e)[:120]
        time.sleep(86400 if geo["v4i"] is not None and mundo["d"] else 600)


def api_mundo(q):
    rango = (q.get("rango") or ["24h"])[0]
    if rango not in RANGOS:
        rango = "24h"
    ahora = time.time()
    acum = {}
    with cerrojo_ap:
        if rango == "24h":
            base = int(ahora // 3600) * 3600
            trozos = [(time.strftime("%Y-%m-%d", t), time.strftime("%H", t)) for t in (time.localtime(base - 3600 * i) for i in range(24))]
        else:
            trozos = [(time.strftime("%Y-%m-%d", time.localtime(ahora - 86400 * i)), None) for i in range(RANGOS[rango])]
        for dia, hora in trozos:
            for e in ap_dia(dia).values():
                for h, pp in (e.get("hp") or {}).items():
                    if hora is not None and h != hora:
                        continue
                    for c, v in pp.items():
                        a = acum.setdefault(c, [0, 0])
                        a[0] += v[0]
                        a[1] += v[1]
        vivo = ap.get("mundo") or {}
        fresco = ahora - vivo.get("ts", 0) < 30
        vp = dict(vivo.get("paises") or {}) if fresco else {}
        vf = list(vivo.get("flujos") or []) if fresco else []
    nombres = (mundo["d"] or {}).get("nombres") or {}

    def nombre(c):
        return nombres.get(c) or ("Sin localizar" if not c else c)
    paises = [{"c": c, "nombre": nombre(c), "baja": acum.get(c, [0, 0])[0], "sube": acum.get(c, [0, 0])[1],
               "ahora": [int(vp[c][0]), int(vp[c][1])] if c in vp else [0, 0], "n": vp[c][2] if c in vp else 0} for c in set(acum) | set(vp)]
    paises.sort(key=lambda p: -(p["baja"] + p["sube"]))

    def flujo(f):
        mac, app, destino, pais, baja, sube, n = f
        x, k = red["disp"].get(mac) or {}, conocidos.get(mac) or {}
        return dict(_ap_app(app), mac=mac, equipo=x.get("nombre") or k.get("alias") or k.get("host") or mac, tipo=x.get("tipo") or "", ico_eq=k.get("icono", ""),
                    destino=destino, pais=pais, pais_n=nombre(pais), baja=baja, sube=sube, n=n)
    return {"ts": int(ahora), "rango": rango, "casa": geo_pais(((red["router"].get("wan") or {}).get("ip")) or "") or "ES",
            "paises": paises, "flujos": [flujo(f) for f in vf], "total": [sum(p["baja"] for p in paises), sum(p["sube"] for p in paises)],
            "geo": geo["v4i"] is not None, "error": geo["error"]}


# ---- la salud de Internet ------------------------------------------------------
# Cada medida de respuesta (cada 30 s; cada 5 s mientras falla) se apunta en
# datos/salud/AAAA-MM-DD.jsonl. Dos fallos seguidos de los tres destinos son
# un corte. Aparte, sucesos.jsonl guarda cortes, reconexiones del router y
# cambios de IP pública. Lo que no puede saber: lo que pase con este servidor
# apagado (esos ratos salen como «sin datos»).
SALUD_D = os.path.join(DATOS, "salud")
os.makedirs(SALUD_D, exist_ok=True)
SUCESOS_F = os.path.join(SALUD_D, "sucesos.jsonl")
SALUD_DIAS = 35
SALUD_CUBO = {"24h": 300, "7d": 1800, "30d": 7200}
sal = {"fallos": 0, "caido": 0, "primer": 0, "det": "", "dia": ""}
cerrojo_sal = threading.Lock()


def salud_suceso(tipo, ts, detalle="", fin=0):
    with cerrojo_sal, open(SUCESOS_F, "a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": int(ts), "tipo": tipo, "d": detalle, "fin": int(fin)}, ensure_ascii=False) + "\n")


def salud_muestra(ts, l):
    ms = [x.get("ms") for x in l]
    dia = time.strftime("%Y-%m-%d", time.localtime(ts))
    with cerrojo_sal:
        with open(os.path.join(SALUD_D, dia + ".jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps([int(ts)] + ms) + "\n")
    if sal["dia"] != dia:
        sal["dia"] = dia
        limite = time.strftime("%Y-%m-%d", time.localtime(ts - SALUD_DIAS * 86400))
        for n in os.listdir(SALUD_D):
            if re.match(r"^\d{4}-\d\d-\d\d\.jsonl$", n) and n[:10] < limite:
                try:
                    os.remove(os.path.join(SALUD_D, n))
                except OSError:
                    pass
    if any(m is not None for m in ms):
        if sal["caido"]:
            dur = ts - sal["caido"]
            salud_suceso("corte", sal["caido"], sal["det"], ts)
            evento("red", "Internet ha vuelto", "El corte ha durado %s (%s)" % (_cuanto(dur), sal["det"]), "bien", avisa="avSistema")
            sal["caido"] = 0
        sal["fallos"] = 0
        return
    sal["fallos"] += 1
    if sal["fallos"] == 1:
        sal["primer"] = ts
    if sal["fallos"] >= 2 and not sal["caido"]:
        sal["caido"] = sal["primer"]
        sal["det"] = "el router contesta: falla la línea" if ping(ROUTER) else "el router tampoco contesta"
        evento("red", "Internet se ha caído", sal["det"], "mal")


def salud_wan(ip, desde):
    """Reconexiones del router y cambios de IP pública, vistos en cada pasada completa."""
    if not ip or desde is None:
        return
    ahora = time.time()
    ini = int(ahora - desde)
    ant_ip, ant_ini = estado.get("wan_ip"), estado.get("wan_ini")
    if ant_ini and ini - ant_ini > 90:
        cambia = bool(ant_ip) and ip != ant_ip
        salud_suceso("reconexion", ini, "IP pública nueva" if cambia else "misma IP pública")
        evento("red", "El router ha vuelto a conectar con Internet", "Con IP pública nueva" if cambia else "Con la misma IP pública", "info", "reco:%d" % (ini // 120))
    elif ant_ip and ip != ant_ip:
        salud_suceso("ip", ahora, "IP pública nueva")
    if ip != ant_ip or not ant_ini or abs(ini - ant_ini) > 90:
        estado["wan_ip"], estado["wan_ini"] = ip, ini
        guardar_json(ESTADO_F, estado)


def api_salud(q):
    rango = (q.get("rango") or ["24h"])[0]
    if rango not in RANGOS:
        rango = "24h"
    ahora = time.time()
    cubo = SALUD_CUBO[rango]
    fin = int(ahora // cubo + 1) * cubo
    ini = fin - RANGOS[rango] * 86400
    n = (fin - ini) // cubo
    cubos = [[0, 0, 0.0, 0] for _ in range(n)]          # muestras, fallos, suma de ms, lecturas con ms
    hosts = [[0.0, 0] for _ in LATENCIA]
    total = fallos = 0
    dias = sorted({time.strftime("%Y-%m-%d", time.localtime(t)) for t in range(ini, fin + 86400, 86400)})
    with cerrojo_sal:
        for dia in dias:
            try:
                with open(os.path.join(SALUD_D, dia + ".jsonl"), encoding="utf-8") as f:
                    lineas = f.readlines()
            except OSError:
                continue
            for li in lineas:
                try:
                    m = json.loads(li)
                except ValueError:
                    continue
                if not ini <= m[0] < fin:
                    continue
                c = cubos[(m[0] - ini) // cubo]
                vivos = [v for v in m[1:] if v is not None]
                c[0] += 1
                total += 1
                if vivos:
                    c[2] += sum(vivos) / len(vivos)
                    c[3] += 1
                else:
                    c[1] += 1
                    fallos += 1
                for i, v in enumerate(m[1:1 + len(hosts)]):
                    if v is not None:
                        hosts[i][0] += v
                        hosts[i][1] += 1
        sucesos = []
        try:
            with open(SUCESOS_F, encoding="utf-8") as f:
                for li in f.readlines()[-800:]:
                    try:
                        s = json.loads(li)
                    except ValueError:
                        continue
                    if s["ts"] >= ini or s.get("fin", 0) >= ini:
                        sucesos.append(s)
        except OSError:
            pass
    if sal["caido"]:
        sucesos.append({"ts": int(sal["caido"]), "tipo": "corte", "d": sal["det"], "fin": 0})
    cortes = [s for s in sucesos if s["tipo"] == "corte"]
    serie = [[ini + i * cubo, round(c[2] / c[3], 1) if c[3] else None, round(100 * c[1] / c[0], 1) if c[0] else None, c[0]] for i, c in enumerate(cubos)]
    medidos = sum(1 for c in cubos if c[0])
    vels = []
    try:
        with open(VEL_F, encoding="utf-8") as f:
            for li in f:
                try:
                    v = json.loads(li)
                    if v["ts"] >= ini:
                        vels.append([v["ts"], v.get("baja"), v.get("sube"), v.get("ping")])
                except (ValueError, KeyError):
                    pass
    except OSError:
        pass
    mi = (red["router"].get("mas") or {}).get("internet") or {}
    return {"ts": int(ahora), "rango": rango, "ini": ini, "fin": fin, "cubo": cubo, "serie": serie,
            "disponibilidad": round(100 * (total - fallos) / total, 3) if total else None, "cobertura": round(100 * medidos / n) if n else 0,
            "cortes": len(cortes), "caido_s": int(sum((s.get("fin") or ahora) - s["ts"] for s in cortes)), "caido": bool(sal["caido"]),
            "reconexiones": sum(1 for s in sucesos if s["tipo"] == "reconexion"),
            "hosts": [{"nombre": LATENCIA[i][0], "ms": round(h[0] / h[1], 1) if h[1] else None} for i, h in enumerate(hosts)],
            "ahora": latencia["l"], "sucesos": sorted(sucesos, key=lambda s: -s["ts"])[:60], "velocidad": vels[-200:],
            "linea": {"ip": mi.get("ip", ""), "desde": mi.get("desde"), "proto": mi.get("proto", ""), "activa": mi.get("activa")}}


# ---- el historial de cada equipo -----------------------------------------------
# Cada cinco minutos, un punto por equipo en línea: la señal media y por dónde
# estaba («5», «2», «c» de cable, «i» de invitados). Y cada cambio (entra,
# sale, cambia de banda), con su hora. Un fichero por día en datos/historia/.
HIST_D = os.path.join(DATOS, "historia")
os.makedirs(HIST_D, exist_ok=True)
HIST_DIAS = 35
hi = {"dia": "", "d": {}, "sucio": False, "guardado": 0.0, "acum": {}, "previo": {}, "cubo": 0}
hi_dias = {}
cerrojo_hi = threading.Lock()


def _hi_ruta(dia):
    return os.path.join(HIST_D, dia + ".json")


def hi_guardar():
    with cerrojo_hi:
        if not hi["dia"]:
            return
        copia = json.dumps(hi["d"], separators=(",", ":"))
        dia = hi["dia"]
        hi["sucio"] = False
        hi["guardado"] = time.time()
    with open(_hi_ruta(dia) + ".tmp", "w", encoding="utf-8") as o:
        o.write(copia)
    os.replace(_hi_ruta(dia) + ".tmp", _hi_ruta(dia))


def hi_dia(dia):
    if dia == hi["dia"]:
        return hi["d"]
    if dia not in hi_dias:
        if len(hi_dias) > 40:
            hi_dias.clear()
        hi_dias[dia] = leer_json(_hi_ruta(dia), {})
    return hi_dias[dia]


def hi_anotar(ahora):
    hoy = time.strftime("%Y-%m-%d", time.localtime(ahora))
    if hi["dia"] != hoy:
        if hi["dia"]:
            hi_guardar()
        with cerrojo_hi:
            if hi["dia"]:
                hi_dias[hi["dia"]] = hi["d"]
            hi["d"] = leer_json(_hi_ruta(hoy), {})
            hi["dia"] = hoy
        limite = time.strftime("%Y-%m-%d", time.localtime(ahora - HIST_DIAS * 86400))
        for f in os.listdir(HIST_D):
            if re.match(r"^\d{4}-\d\d-\d\d\.json$", f) and f[:10] < limite:
                try:
                    os.remove(os.path.join(HIST_D, f))
                except OSError:
                    pass
    with cerrojo_hi:
        for mac, x in red["disp"].items():
            cod = ""
            if x.get("en_linea"):
                cod = "i" if x.get("invitado") else {"wifi5": "5", "wifi2.4": "2", "cable": "c"}.get(x.get("conexion"), "")
            previo = hi["previo"].get(mac)
            if previo is not None and previo != cod:
                hi["d"].setdefault(mac, {"s": [], "e": []})["e"].append([int(ahora), cod, previo])
                hi["sucio"] = True
            hi["previo"][mac] = cod
            if cod:
                a = hi["acum"].setdefault(mac, [0, 0, cod])
                senal = (x.get("wifi") or {}).get("senal")
                if senal is not None:
                    a[0] += senal
                    a[1] += 1
                a[2] = cod
        cubo = int(ahora // 300)
        if cubo != hi["cubo"]:
            if hi["cubo"]:
                for mac, a in hi["acum"].items():
                    hi["d"].setdefault(mac, {"s": [], "e": []})["s"].append([cubo * 300, round(a[0] / a[1]) if a[1] else None, a[2]])
                hi["sucio"] = True
            hi["acum"], hi["cubo"] = {}, cubo
    if hi["sucio"] and time.time() - hi["guardado"] > 300:
        hi_guardar()


def hi_equipo(mac, rango, ahora):
    ini = ahora - RANGOS[rango] * 86400
    dias = sorted({time.strftime("%Y-%m-%d", time.localtime(ini + 86400 * i)) for i in range(RANGOS[rango] + 1)})
    pts, cambios = [], []
    with cerrojo_hi:
        for dia in dias:
            e = hi_dia(dia).get(mac) or {}
            pts += [p for p in e.get("s") or [] if p[0] >= ini]
            cambios += [c for c in e.get("e") or [] if c[0] >= ini]
        primero = min([f[:10] for f in os.listdir(HIST_D) if re.match(r"^\d{4}-\d\d-\d\d\.json$", f)] or [hi["dia"] or time.strftime("%Y-%m-%d")])
    pts.sort()
    tramos = []
    for ts, _, cod in pts:
        if tramos and tramos[-1][2] == cod and ts - tramos[-1][1] <= 660:
            tramos[-1][1] = ts
        else:
            tramos.append([ts - 300, ts, cod])
    desde = max(ini, time.mktime(time.strptime(primero, "%Y-%m-%d")))
    dentro = sum(min(t[1], ahora) - max(t[0], desde) for t in tramos if t[1] > desde)
    paso = {"24h": 300, "7d": 3600, "30d": 14400}[rango]
    if paso > 300:
        grupos = {}
        for ts, s, cod in pts:
            g = grupos.setdefault(ts // paso, [0, 0, cod])
            if s is not None:
                g[0] += s
                g[1] += 1
            g[2] = cod
        pts = [[k * paso + paso, round(g[0] / g[1]) if g[1] else None, g[2]] for k, g in sorted(grupos.items())]
    return {"ini": int(ini), "fin": int(ahora), "paso": paso, "puntos": pts, "tramos": tramos, "cambios": cambios[-120:][::-1],
            "en_linea": round(100 * dentro / (ahora - desde), 1) if ahora > desde else None, "desde": primero}


# ---- qué es cada equipo, sin preguntar ----------------------------------------
# Tres pistas: lo que Home Assistant sabe del aparato (por su MAC), lo que el
# propio equipo anuncia en la red (mDNS: «AudioAccessory5,1», «Chromecast»…) y
# su nombre en la red. Con eso se busca su foto en el catálogo de UniFi. Solo
# se toca a quien no tiene icono puesto a mano, y queda apuntado quién lo puso
# (`icono_auto`) para que se vea y se pueda cambiar.
ident = {"ts": 0, "mdns": {}, "ha": {}, "error": ""}
APPLE = [("audioaccessory5", "HomePod mini"), ("audioaccessory", "HomePod"), ("appletv", "Apple TV 4K"), ("macbookpro", "MacBook Pro"),
         ("macbookair", "MacBook Air"), ("macmini", "Mac mini"), ("macstudio", "Mac Studio"), ("imac", "iMac"), ("mac", "MacBook Pro"),
         ("ipad", "iPad"), ("iphone", "iPhone"), ("watch", "Apple Watch")]
ID_PARTIR = [("macbookpro", "macbook pro"), ("macbookair", "macbook air"), ("macmini", "mac mini"), ("homepod", "homepod "), ("appletv", "apple tv"),
             ("lgwebostv", "lg webos tv"), ("playstation", "playstation "), ("galaxy", "galaxy ")]
ID_VACIAS = {"de", "del", "la", "el", "the", "of", "and", "y", "local", "lan", "home", "casa", "wifi", "android",
             "device", "unknown", "none", "inc", "ltd", "co", "llc", "corp", "technologies", "electronics", "amazon", "com"}


ID_SOSAS = {"smart", "mini", "plus", "pro", "max", "tv", "air", "ultra", "lite", "one", "go", "box", "hub", "plug", "light", "phone", "tablet"}


def _mdns_texto(t):
    t = re.sub(r"\\(\d{3})", lambda m: chr(int(m.group(1))) if int(m.group(1)) < 256 else "", t).replace("\\.", ".")
    try:
        return t.encode("latin-1").decode("utf-8", "replace")
    except UnicodeError:
        return t


def leer_mdns():
    _, out = sh(["avahi-browse", "-a", "-r", "-t", "-p", "-k"], 45)
    r = {}
    for li in out.splitlines():
        p = li.split(";", 9)
        if len(p) < 10 or p[0] != "=" or p[2] != "IPv4" or not p[7].startswith(RED):
            continue
        x = r.setdefault(p[7], {"modelo": "", "nombre": ""})
        txt = {}
        for trozo in re.findall(r'"((?:[^"\\]|\\.)*)"', p[9]):
            k, _, v = trozo.partition("=")
            txt[k.lower()] = _mdns_texto(v)
        modelo = txt.get("rpmd") or txt.get("am") or txt.get("model") or ""
        if p[4] in ("_googlecast._tcp", "_hap._tcp"):
            modelo = modelo or txt.get("md") or ""
        if p[4] in ("_ipp._tcp", "_ipps._tcp", "_printer._tcp", "_pdl-datastream._tcp"):
            modelo = modelo or txt.get("ty") or ""
        if modelo and not x["modelo"]:
            x["modelo"] = modelo[:80]
        if p[4] in ("_companion-link._tcp", "_airplay._tcp", "_googlecast._tcp", "_device-info._tcp") and not x["nombre"]:
            x["nombre"] = (txt.get("fn") or _mdns_texto(p[3]))[:60]
    return r


def _id_apple(modelo):
    m = sin_tildes(modelo).replace(" ", "")
    if re.match(r"^[a-z]+\d+,\d+", m):
        for pre, nombre in APPLE:
            if m.startswith(pre):
                return nombre
    return modelo


def _id_palabras(texto):
    t = sin_tildes(texto)
    for a, b in ID_PARTIR:
        t = t.replace(a, b)
    return [w for w in re.findall(r"[a-z0-9]+", t) if w not in ID_VACIAS and not re.match(r"^[0-9a-f]{6,}$", w) and len(w) > 1]


def ufp_mejor(texto, marca=""):
    """El modelo del catálogo que mejor casa con ese texto, o None. Tienen que
    estar todas las palabras; si no hay ninguno, se van quitando por el final."""
    pal = _id_palabras(texto)
    marca = sin_tildes(marca).split(" ")[0] if marca else ""
    cat = ufp_catalogo()
    while pal and (len(pal) > 1 or len(pal[0]) >= 4) and not all(p in ID_SOSAS for p in pal):
        hits = []
        for x in cat:
            suyas = x.get("_p")
            if suyas is None:
                suyas = x["_p"] = set(re.findall(r"[a-z0-9]+", x["_b"] + " " + sin_tildes(x["marca"])))
            if all(p in suyas for p in pal):
                hits.append(x)
        if hits:
            hits.sort(key=lambda x: (bool(marca) and marca not in sin_tildes(x["marca"]), len(x["nombre"]), x["nombre"]))
            return hits[0]
        pal = pal[:-1]
    return None


def identificar():
    try:
        ha = {}
        for dv in ha_ws({"type": "config/device_registry/list"}) or []:
            for tipo, valor in dv.get("connections") or []:
                if tipo == "mac":
                    ha[str(valor).upper()] = {"marca": dv.get("manufacturer") or "", "modelo": dv.get("model") or "", "nombre": dv.get("name_by_user") or dv.get("name") or ""}
        ident["ha"] = ha
    except Exception as e:
        ident["error"] = "Home Assistant: " + str(e)[:100]
    try:
        ident["mdns"] = leer_mdns() or ident["mdns"]
    except Exception as e:
        ident["error"] = "mDNS: " + str(e)[:100]
    cambios = []
    with cerrojo_red:
        for mac, x in list(red["disp"].items()):
            k = conocidos.get(mac)
            if not k:
                continue
            h, m = ident["ha"].get(mac) or {}, ident["mdns"].get(x.get("ip")) or {}
            fab = fabricante(mac)
            pistas = []
            if m.get("modelo"):
                pistas.append((_id_apple(m["modelo"]), "lo que anuncia en la red", "Apple" if _id_apple(m["modelo"]) != m["modelo"] else ""))
            if h.get("modelo") and not re.match(r"^[\w.-]{0,3}$", h["modelo"]):
                pistas.append(((h["marca"] + " " + h["modelo"]).strip(), "Home Assistant", h["marca"]))
                pistas.append((h["modelo"], "Home Assistant", h["marca"]))
            if x.get("host"):
                pistas.append((x["host"], "su nombre en la red", "" if fab == "Dirección privada" else fab))
            modelo = pistas[0][0] if pistas and pistas[0][1] != "su nombre en la red" else ""
            if modelo and k.get("modelo") != modelo:
                k["modelo"] = modelo[:80]
                cambios.append(None)
            if k.get("icono") or k.get("icono_no"):
                continue
            for texto, fuente, marca in pistas:
                hit = ufp_mejor(texto, marca)
                if hit:
                    k["icono"] = "ufp:%d" % hit["id"]
                    k["icono_auto"] = {"de": fuente, "modelo": hit["nombre"], "ts": int(time.time())}
                    cambios.append("%s → %s (por %s)" % (k.get("alias") or x.get("host") or mac, hit["nombre"], fuente))
                    break
        if cambios:
            guardar_json(DISP_F, {m2: {a: b for a, b in k.items() if not a.startswith("_")} for m2, k in conocidos.items()})
            try:
                leer_red(False)
            except Exception:
                pass
    for c in cambios:
        if c:
            evento("red", "Equipo identificado", c, "info")
    ident["ts"] = int(time.time())
    return {"ok": True, "identificados": [c for c in cambios if c]}


def bucle_identificar():
    time.sleep(75)
    while True:
        try:
            identificar()
        except Exception as e:
            ident["error"] = str(e)[:120]
        time.sleep(1800)


# ---- la VPN (Tailscale): los equipos de fuera, para el mapa ----------------
vpn = {"ts": 0, "l": []}


def leer_vpn():
    _, out = sh(["tailscale", "status", "--json"], 10)
    try:
        d = json.loads(out)
    except ValueError:
        return
    yo = d.get("Self") or {}

    def nodo(p, propio=False):
        visto = p.get("LastSeen") or ""
        try:
            ts = int(datetime.fromisoformat(visto.replace("Z", "+00:00")).timestamp()) if visto and not visto.startswith("0001") else 0
        except ValueError:
            ts = 0
        nombre = p.get("HostName") or ""
        if not nombre or nombre == "localhost":
            nombre = (p.get("DNSName") or "").split(".")[0] or nombre or "?"
        return {"id": p.get("ID") or nombre, "nombre": nombre, "so": p.get("OS") or "", "en_linea": bool(p.get("Online")) or propio, "visto": ts,
                "ip": (p.get("TailscaleIPs") or [""])[0], "directo": bool(p.get("CurAddr")), "rele": p.get("Relay") or "",
                "en_casa": bool(re.match(r"^\[?(192\.168\.|10\.|fd|fc)", p.get("CurAddr") or "")), "rx": p.get("RxBytes") or 0, "tx": p.get("TxBytes") or 0,
                "salida": bool(p.get("ExitNode")), "yo": propio}
    vpn.update(ts=int(time.time()), l=[nodo(yo, True)] + sorted((nodo(p) for p in (d.get("Peer") or {}).values()), key=lambda n: (not n["en_linea"], n["nombre"].lower())))


# ---- copias de la configuración del router -------------------------------------
# La misma copia que hace LuCI en «Copia de seguridad» (un .tar.gz que se puede
# restaurar allí), pedida con la sesión de centinela. Se guarda solo cuando
# algo ha cambiado, con qué ficheros y qué líneas. Las copias llevan dentro
# las claves del wifi y del PPPoE: se quedan en datos/router/ con permisos
# cerrados, las diferencias salen con los secretos tapados y bajar una copia
# entera pide la sesión de mantenimiento.
COPIAS_D = os.path.join(DATOS, "router")
os.makedirs(COPIAS_D, mode=0o700, exist_ok=True)
COPIAS_F = os.path.join(COPIAS_D, "indice.json")
COPIAS_MAX = 40
SECRETO = re.compile(r"^(\s*(?:option|list)\s+\S*(?:key|password|passwd|secret|token|psk|username|private|auth)\S*\s+).*$", re.I)
ID_COPIA = re.compile(r"^\d{8}-\d{6}$")
cerrojo_cop = threading.Lock()
copias = {"comprobada": 0, "error": ""}


def _copia_cfg(datos):
    """{fichero: texto} de lo que hay en etc/config dentro de la copia, y la lista de todo lo demás."""
    cfg, otros = {}, []
    with tarfile.open(fileobj=io.BytesIO(datos), mode="r:gz") as t:
        for m in t.getmembers():
            if not m.isfile():
                continue
            n = m.name.lstrip("./")
            if n.startswith("etc/config/") and m.size < 400_000:
                cfg[n[11:]] = t.extractfile(m).read().decode("utf-8", "replace")
            else:
                otros.append(n)
    return cfg, sorted(otros)


def _copia_leer(ident_):
    if not ID_COPIA.match(ident_ or ""):
        raise ValueError("esa copia no existe")
    try:
        with open(os.path.join(COPIAS_D, ident_ + ".tar.gz"), "rb") as o:
            return o.read()
    except OSError:
        raise ValueError("esa copia no existe")


def router_copiar(motivo="programada"):
    with cerrojo_cop:
        ubus("system", "board")                                # deja una sesión viva
        req = urllib.request.Request("http://%s/cgi-bin/cgi-backup" % ROUTER, data=urllib.parse.urlencode({"sessionid": ubus_sid["sid"]}).encode())
        with urllib.request.urlopen(req, timeout=40) as r:
            datos = r.read(8_000_000)
        if datos[:2] != b"\x1f\x8b":
            raise RuntimeError("el router no ha dado la copia")
        cfg, _ = _copia_cfg(datos)
        huella = hashlib.sha256(json.dumps(sorted(cfg.items())).encode()).hexdigest()
        indice = leer_json(COPIAS_F, [])
        copias["comprobada"] = int(time.time())
        copias["error"] = ""
        if indice and indice[-1]["huella"] == huella and motivo == "programada":
            return {"ok": True, "nueva": False}
        cambiados, mas, menos = [], 0, 0
        if indice:
            try:
                antes, _ = _copia_cfg(_copia_leer(indice[-1]["id"]))
            except ValueError:
                antes = {}
            for n in sorted(set(cfg) | set(antes)):
                if cfg.get(n) != antes.get(n):
                    cambiados.append(n)
                    for li in difflib.unified_diff((antes.get(n) or "").splitlines(), (cfg.get(n) or "").splitlines(), lineterm="", n=0):
                        mas += li.startswith("+") and not li.startswith("+++")
                        menos += li.startswith("-") and not li.startswith("---")
        ident_ = time.strftime("%Y%m%d-%H%M%S")
        ruta = os.path.join(COPIAS_D, ident_ + ".tar.gz")
        with open(os.open(ruta, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "wb") as o:
            o.write(datos)
        primera = not indice
        indice.append({"id": ident_, "ts": int(time.time()), "tam": len(datos), "huella": huella, "motivo": motivo, "cambios": cambiados,
                       "mas": int(mas), "menos": int(menos), "ficheros": len(cfg)})
        for viejo in indice[:-COPIAS_MAX]:
            try:
                os.remove(os.path.join(COPIAS_D, viejo["id"] + ".tar.gz"))
            except OSError:
                pass
        indice = indice[-COPIAS_MAX:]
        guardar_json(COPIAS_F, indice)
        os.chmod(COPIAS_F, 0o600)
    if cambiados and not primera:
        evento("sistema", "La configuración del router ha cambiado", "%s · %d líneas nuevas, %d quitadas · copia guardada" % (", ".join(cambiados), mas, menos), "info", "rcfg:" + huella[:16])
    return {"ok": True, "nueva": True, "id": ident_, "cambios": cambiados}


def api_copias():
    indice = leer_json(COPIAS_F, [])
    return {"copias": [{k: v for k, v in c.items() if k != "huella"} for c in indice[::-1]], "comprobada": copias["comprobada"], "error": copias["error"],
            "max": COPIAS_MAX}


def api_copia(q):
    ident_ = (q.get("id") or [""])[0]
    indice = leer_json(COPIAS_F, [])
    pos = next((i for i, c in enumerate(indice) if c["id"] == ident_), -1)
    if pos < 0:
        raise ValueError("esa copia no existe")
    cfg, otros = _copia_cfg(_copia_leer(ident_))
    antes = _copia_cfg(_copia_leer(indice[pos - 1]["id"]))[0] if pos > 0 else None

    def tapar(li):
        m = SECRETO.match(li[1:] if li[:1] in "+- " else li)
        return (li[:1] if li[:1] in "+- " else "") + m.group(1) + "••••••" if m else li
    difs = []
    if antes is not None:
        for n in sorted(set(cfg) | set(antes)):
            if cfg.get(n) == antes.get(n):
                continue
            lineas = [tapar(li) for li in difflib.unified_diff((antes.get(n) or "").splitlines(), (cfg.get(n) or "").splitlines(), lineterm="", n=2)
                      if not li.startswith(("---", "+++"))]
            difs.append({"fichero": n, "estado": "nuevo" if n not in antes else "quitado" if n not in cfg else "cambiado", "lineas": lineas[:400]})
    return {"copia": {k: v for k, v in indice[pos].items() if k != "huella"}, "anterior": indice[pos - 1]["id"] if pos > 0 else None, "difs": difs,
            "ficheros": sorted(cfg), "otros": otros[:200]}


def pedir_copia(c):
    r = router_copiar("a mano")
    evento("sistema", "Copia de la configuración del router", "Hecha a mano desde el panel", "info")
    return r


def bucle_copias():
    time.sleep(100)
    while True:
        try:
            router_copiar()
        except Exception as e:
            copias["error"] = str(e)[:160]
        time.sleep(6 * 3600)



# ---------------------------------------------------------------- de centinela.py 4329-5608: ajustes de red al estilo UniFi

# ============================================================================
# Ajustes de red al estilo UniFi (28-10-2026)
#
# Lo que en UniFi está en «Ajustes»: redes con su VLAN, wifi, radios, puertos
# (qué red va por cada boca), cortafuegos por zonas (la matriz), reglas,
# reenvío de puertos, rutas, DNS local, IP fijas, el registro y el reinicio
# del router. Se lee de la configuración del router (uci por ubus) y se cambia
# con router_cambiar (vuelta atrás automática si el router deja de contestar).
# Leer es libre (salvo las claves del wifi); cambiar pide la sesión de
# mantenimiento, como el resto de órdenes al router.
#
# Modelo de VLAN (el de LuCI con DSA): la red de casa es la VLAN 1 del puente
# br-lan; cada red nueva es otra VLAN del mismo puente (br-lan.N) con su
# interfaz «clN», su DHCP y su zona «clN» en el cortafuegos. La interfaz no
# va directa sobre br-lan.N sino sobre un puente propio «br-clN» que lo
# contiene: hostapd solo sabe meter una wifi en un puente, y con br-lan.N
# la radio entera dejaba de arrancar (probado el 28-10-2026: se cayó el 5 GHz). La primera vez
# que se crea una, el puente pasa a filtrar VLAN (lan pasa a br-lan.1, todas
# las bocas siguen en la 1 sin etiquetar). La de invitados sigue en su
# puente propio y no lleva VLAN.
# ============================================================================
AX_PREF = "cl"
AX_FIJAS = {"lan", "guest"}
AX_REGLA_FIJA = re.compile(r"^(Allow-|Invitados-|casalab-bloqueo-|casalab-red-)")
AX_NOMBRES_F = os.path.join(DATOS, "ax_redes.json")
AX_NOMBRE_DEF = {"lan": "Casa", "guest": "Invitados"}
AX_ANCHOS = {"2g": ["HE20", "HE40"], "5g": ["HE20", "HE40", "HE80", "HE160"]}
AX_SEGURIDAD = {"psk2": "WPA2", "sae-mixed": "WPA2/WPA3", "sae": "WPA3", "none": "Abierta"}
ax_cache = {"radio": {}, "ts": 0}


def _uci(config):
    return (ubus("uci", "get", {"config": config}) or {}).get("values") or {}


def _lista(v):
    if v is None or v == "":
        return []
    return [str(x) for x in v] if isinstance(v, list) else str(v).split()


def _de_tipo(vals, tipo):
    return sorted(((s, v) for s, v in vals.items() if v.get(".type") == tipo), key=lambda kv: kv[1].get(".index", 0))


def _cidr(v):
    ips = _lista(v.get("ipaddr"))
    if not ips:
        return None
    try:
        return ipaddress.ip_interface(ips[0] if "/" in ips[0] else "%s/%s" % (ips[0], v.get("netmask") or "255.255.255.0"))
    except ValueError:
        return None


def _en_red(ip, red_):
    try:
        return ipaddress.ip_address(ip) in red_
    except ValueError:
        return False


def _servidor_boca():
    """Por qué boca del router cuelga el macmini (no se le puede quitar la red de casa)."""
    mia = next((m for m, x in red["disp"].items() if x.get("ip") == HOST), "")
    return tr_fdb["d"].get(mia, "") or (red["disp"].get(mia) or {}).get("puerto", "")


def _bocas_de(net, devst):
    br = next((v for _, v in _de_tipo(net, "device") if v.get("name") == "br-lan"), {})
    return [p for p in _lista(br.get("ports"))] or sorted(k for k in devst if re.match(r"^lan\d+$", k))


def _bvlan(net):
    """vid -> {sec, puertos: {boca: "u"|"t"}} de las VLAN del puente br-lan."""
    d = {}
    for s, v in _de_tipo(net, "bridge-vlan"):
        if v.get("device") != "br-lan":
            continue
        ps = {}
        for p in _lista(v.get("ports")):
            boca, _, marca = p.partition(":")
            ps[boca] = "t" if "t" in marca else "u"
        try:
            d[int(v.get("vlan"))] = {"sec": s, "puertos": ps}
        except (TypeError, ValueError):
            pass
    return d


def _radio_listas(ifaz):
    """Canales y potencias que admite una radio (no cambian: se guardan una hora)."""
    c = ax_cache["radio"].get(ifaz)
    if c and time.time() - c["ts"] < 3600:
        return c
    fr = (ubus("iwinfo", "freqlist", {"device": ifaz}) or {}).get("results") or []
    tx = (ubus("iwinfo", "txpowerlist", {"device": ifaz}) or {}).get("results") or []
    c = {"canales": [f["channel"] for f in fr if not f.get("restricted") and not f.get("no_ir")] or [f["channel"] for f in fr],
         "dfs": [f["channel"] for f in fr if f.get("dfs")], "potencias": sorted({t["dbm"] for t in tx}), "ts": time.time()}
    ax_cache["radio"][ifaz] = c
    return c


def ajustes_leer(con_claves=False):
    net, wl, fw, dh = _uci("network"), _uci("wireless"), _uci("firewall"), _uci("dhcp")
    devst = ubus("network.device", "status") or {}
    dump = {i.get("interface"): i for i in (ubus("network.interface", "dump") or {}).get("interface", [])}
    nombres = dict(AX_NOMBRE_DEF, **leer_json(AX_NOMBRES_F, {}))
    bocas = _bocas_de(net, devst)
    bv = _bvlan(net)
    filtra = bool(bv)
    vivos = [x for x in red["disp"].values() if x.get("en_linea")]

    # ---- zonas y la matriz de quién puede hablar con quién
    zonas = []
    for s, v in _de_tipo(fw, "zone"):
        zonas.append({"id": s, "nombre": v.get("name", s), "redes": _lista(v.get("network")), "entrada": v.get("input", "ACCEPT"),
                      "reenvio": v.get("forward", "ACCEPT"), "masq": v.get("masq") == "1"})
    reenv = [{"id": s, "de": v.get("src"), "a": v.get("dest")} for s, v in _de_tipo(fw, "forwarding") if v.get("enabled", "1") != "0"]
    zona_de = {r: z["nombre"] for z in zonas for r in z["redes"]}

    # ---- wifi: un SSID puede estar en varias radios; en UniFi es una sola fila
    radios_cfg = dict(_de_tipo(wl, "wifi-device"))
    vivo_wl = ubus("luci-rpc", "getWirelessDevices") or {}
    ifaz_de = {}
    for rn, r in vivo_wl.items():
        for i in r.get("interfaces") or []:
            if i.get("section"):
                ifaz_de[i["section"]] = (i.get("ifname"), i.get("iwinfo") or {})
    wifis = collections.OrderedDict()
    for s, v in _de_tipo(wl, "wifi-iface"):
        if v.get("mode", "ap") != "ap":
            continue
        rd_ = (_lista(v.get("network")) or ["lan"])[0]
        k = (v.get("ssid", ""), rd_)
        w = wifis.get(k)
        if not w:
            w = wifis[k] = {"id": s, "secciones": [], "ssid": v.get("ssid", ""), "red": rd_, "bandas": [], "seguridad": v.get("encryption", "none"),
                            "oculta": v.get("hidden") == "1", "aislar": v.get("isolate") == "1", "activa": False, "equipos": 0,
                            "rapida": v.get("ieee80211r") == "1", "pmf": v.get("ieee80211w", ""), "filtro": v.get("macfilter", "disable"),
                            "macs": [m.upper() for m in _lista(v.get("maclist"))], "ifaces": []}
            if con_claves:
                w["clave"] = v.get("key", "")
        w["secciones"].append(s)
        w["bandas"].append((radios_cfg.get(v.get("device")) or {}).get("band", ""))
        w["activa"] = w["activa"] or (v.get("disabled") != "1" and (radios_cfg.get(v.get("device")) or {}).get("disabled") != "1")
        if ifaz_de.get(s):
            w["ifaces"].append(ifaz_de[s][0])
    for w in wifis.values():
        w["equipos"] = sum(1 for x in vivos if (x.get("wifi") or {}).get("ssid") == w["ssid"] and ((x.get("wifi") or {}).get("red") or "lan") == w["red"])

    radios = []
    for s, v in radios_cfg.items():
        iw, ifaz = {}, ""
        for i in (vivo_wl.get(s) or {}).get("interfaces") or []:
            if i.get("ifname") and (i.get("iwinfo") or {}).get("channel"):
                ifaz, iw = i["ifname"], i.get("iwinfo") or {}
                break
        lst = {}
        if ifaz:
            try:
                lst = _radio_listas(ifaz)
            except Exception:
                lst = {}
        banda = v.get("band", "")
        ch = iw.get("channel")
        mhz = iw.get("frequency") or ((2484 if ch == 14 else 2407 + 5 * ch) if banda == "2g" else 5000 + 5 * ch) if isinstance(ch, int) else None
        uso = ax_uso_canal(ifaz, mhz) if ifaz and mhz else None
        radios.append({"id": s, "banda": banda, "canal": v.get("channel", "auto"), "canal_ahora": iw.get("channel"), "uso": uso, "ancho": v.get("htmode", ""),
                       "potencia": v.get("txpower", ""), "potencia_ahora": iw.get("txpower"), "pais": v.get("country", ""),
                       "activa": v.get("disabled") != "1", "emite": bool((vivo_wl.get(s) or {}).get("up")), "ruido": iw.get("noise"), "calidad": iw.get("quality"), "calidad_max": iw.get("quality_max"),
                       "canales": lst.get("canales", []), "dfs": lst.get("dfs", []), "potencias": lst.get("potencias", []), "anchos": AX_ANCHOS.get(banda, []),
                       "equipos": sum(1 for x in vivos if (x.get("wifi") or {}).get("banda") == ("5" if banda == "5g" else "2.4"))})
    radios.sort(key=lambda r: r["banda"])

    # ---- redes (las interfaces con IP fija del router: casa, invitados y las VLAN)
    redes = []
    for s, v in _de_tipo(net, "interface"):
        if v.get("proto") != "static" or s == "loopback":
            continue
        cidr = _cidr(v)
        if not cidr:
            continue
        dev = v.get("device", "")
        vid = _vid_de(dev, s)
        d = next((x for _, x in _de_tipo(dh, "dhcp") if x.get("interface") == s), None)
        z = zona_de.get(s, "")
        try:
            ini, lim = int((d or {}).get("start", 100)), int((d or {}).get("limit", 150))
        except ValueError:
            ini, lim = 100, 150
        base = int(cidr.network.network_address)
        if vid and filtra:
            puertos = {b: m for b, m in (bv.get(vid) or {}).get("puertos", {}).items()}
        elif vid == 1:
            puertos = {b: "u" for b in bocas}
        else:
            puertos = {}
        estado = dump.get(s) or {}
        redes.append({
            "id": s, "nombre": nombres.get(s) or s, "vlan": vid, "dispositivo": dev, "ip": str(cidr.ip), "cidr": str(cidr.network),
            "prefijo": cidr.network.prefixlen, "zona": z, "fija": s in AX_FIJAS, "activa": bool(estado.get("up")),
            "dhcp": {"activo": bool(d) and d.get("ignore") != "1", "sec": d[".name"] if d else "", "inicio": ini, "limite": lim,
                     "desde": str(ipaddress.ip_address(base + ini)), "hasta": str(ipaddress.ip_address(base + ini + lim - 1)),
                     "plazo": (d or {}).get("leasetime", "12h"), "dns": [o.split(",", 1)[1] for o in _lista((d or {}).get("dhcp_option")) if o.startswith("6,")]},
            "internet": any(r["de"] == z and r["a"] == "wan" for r in reenv),
            "aislada": bool(z) and z != "lan" and not any((r["de"] == z and r["a"] == "lan") or (r["de"] == "lan" and r["a"] == z) for r in reenv),
            "puertos": puertos, "ssids": [w["ssid"] for w in wifis.values() if w["red"] == s],
            "equipos": sum(1 for x in vivos if _en_red(x.get("ip"), cidr.network)),
        })

    # ---- puertos físicos y qué VLAN lleva cada uno
    srv = _servidor_boca()
    puertos = []
    for b in ["wan"] + bocas:
        st = devst.get(b) or {}
        vel = str(st.get("speed") or "")
        p = {"boca": b, "enlace": bool(st.get("carrier")), "velocidad": int(vel[:-1]) if vel[:-1].isdigit() else None,
             "duplex": {"F": "completo", "H": "medio"}.get(vel[-1:], ""), "wan": b == "wan", "servidor": b == srv,
             "equipos": sorted({(conocidos.get(m) or {}).get("alias") or x.get("nombre") or m for m, x in red["disp"].items()
                                if x.get("en_linea") and (x.get("puerto") or tr_fdb["d"].get(m)) == b})}
        if b == "wan":
            p["nativa"], p["etiquetadas"] = None, []
        elif filtra:
            p["nativa"] = next((vid for vid, x in bv.items() if x["puertos"].get(b) == "u"), None)
            p["etiquetadas"] = sorted(vid for vid, x in bv.items() if x["puertos"].get(b) == "t")
        else:
            p["nativa"], p["etiquetadas"] = 1, []
        puertos.append(p)

    # ---- reglas, reenvíos, rutas, DNS local, IP fijas
    reglas = []
    for s, v in _de_tipo(fw, "rule"):
        nombre = v.get("name", "")
        reglas.append({"id": s, "nombre": nombre, "origen": v.get("src", ""), "destino": v.get("dest", ""),
                       "ip_origen": " ".join(_lista(v.get("src_ip"))), "ip_destino": " ".join(_lista(v.get("dest_ip"))),
                       "mac_origen": " ".join(_lista(v.get("src_mac"))).upper(), "puerto": " ".join(_lista(v.get("dest_port"))),
                       "proto": " ".join(_lista(v.get("proto"))) or "tcp udp", "accion": v.get("target", "ACCEPT"), "familia": v.get("family", ""),
                       "activa": v.get("enabled", "1") != "0", "fija": bool(AX_REGLA_FIJA.match(nombre)) or not nombre})
    reenvios = [{"id": s, "nombre": v.get("name", ""), "proto": " ".join(_lista(v.get("proto"))) or "tcp udp", "externo": v.get("src_dport", ""),
                 "ip": v.get("dest_ip", ""), "interno": v.get("dest_port", ""), "origen": " ".join(_lista(v.get("src_ip"))),
                 "activa": v.get("enabled", "1") != "0"} for s, v in _de_tipo(fw, "redirect") if v.get("src", "wan") == "wan"]
    rutas = [{"id": s, "interfaz": v.get("interface", ""), "destino": v.get("target", "") + ("/" + str(ipaddress.ip_network("0.0.0.0/" + v["netmask"]).prefixlen)
              if v.get("netmask") and "/" not in v.get("target", "") else ""), "puerta": v.get("gateway", ""), "metrica": v.get("metric", ""),
              "activa": v.get("disabled") != "1"} for s, v in _de_tipo(net, "route")]
    dns = [{"id": s, "nombre": v.get("name", ""), "ip": v.get("ip", "")} for s, v in _de_tipo(dh, "domain")]
    for _, v in _de_tipo(dh, "dnsmasq"):
        for a in _lista(v.get("address")):
            m = re.match(r"^/([^/]+)/(.+)$", a)
            if m:
                dns.append({"id": "", "nombre": m.group(1), "ip": m.group(2), "fija": True})
    fijas = []
    for s, v in _de_tipo(dh, "host"):
        mac = _mac_de(v.get("mac"))
        fijas.append({"id": s, "mac": mac, "ip": v.get("ip", ""), "nombre": v.get("name", ""), "alias": (conocidos.get(mac) or {}).get("alias", ""),
                      "en_linea": bool((red["disp"].get(mac) or {}).get("en_linea"))})
    sistema = dict(((red.get("router") or {}).get("mas") or {}).get("sistema") or {})
    try:
        sistema["firmware"] = ax_firmware(sistema.get("version"))
    except Exception:
        pass
    fijas_mac = {f["mac"] for f in fijas}
    concesiones = sorted(({"mac": x["macaddr"].upper(), "ip": x.get("ipaddr", ""), "nombre": (conocidos.get(x["macaddr"].upper()) or {}).get("alias") or x.get("hostname") or "",
                           "expira": x.get("expires"), "fija": x["macaddr"].upper() in fijas_mac}
                          for x in (ubus("luci-rpc", "getDHCPLeases") or {}).get("dhcp_leases", []) if x.get("macaddr")),
                         key=lambda f: tuple(int(t) if t.isdigit() else 0 for t in f["ip"].split(".")))
    try:
        trafico = {"reglas": ax_trafico_leer(), "ok": True}
    except Exception as e:
        trafico = {"reglas": [], "ok": False, "error": str(e)[:120]}
    w = net.get("wan") or {}
    hijos = [i for n, i in dump.items() if n and n.startswith("wan_")]
    internet = {"proto": w.get("proto", ""), "ipv6": w.get("ipv6", "auto"), "mtu": w.get("mtu", ""), "vlan": (w.get("device") or "").partition(".")[2],
                "dns_propios": w.get("peerdns") == "0", "dns": _lista(w.get("dns")), "arriba": bool((dump.get("wan") or {}).get("up")),
                "desde": (dump.get("wan") or {}).get("uptime"), "v6_arriba": bool((dump.get("wan6") or {}).get("up")),
                "v6_prefijo": next(("%s/%s" % (a["address"], a["mask"]) for a in (dump.get("wan6") or {}).get("ipv6-prefix") or []), ""),
                "dhcpv6_doble": bool(hijos) and "wan6" in dump, "hijos": [{"nombre": i.get("interface"), "arriba": bool(i.get("up")), "pendiente": bool(i.get("pending"))} for i in hijos],
                "ip": next((a["address"] for a in (dump.get("wan") or {}).get("ipv4-address") or []), "")}
    try:
        vpn_ = ax_vpn()
    except Exception as e:
        vpn_ = {"ok": False, "error": str(e)[:120]}
    return {"ts": int(time.time()), "filtra_vlan": filtra, "internet": internet, "vpn": vpn_, "concesiones": concesiones, "trafico": trafico, "redes": redes, "wifi": list(wifis.values()), "radios": radios, "puertos": puertos,
            "zonas": zonas, "reenvio_zonas": reenv, "reglas": reglas, "reenvios": reenvios, "rutas": rutas, "dns": dns,
            "fijas": sorted(fijas, key=lambda f: tuple(int(x) if x.isdigit() else 0 for x in f["ip"].split("."))), "sistema": sistema,
            "seguridades": AX_SEGURIDAD, "claves": con_claves}


# ---- comprobaciones de lo que llega del panel --------------------------------
def _texto(v, tope=32):
    t = str(v or "").strip()
    if len(t) > tope:
        raise ValueError("demasiado largo (máximo %d)" % tope)
    return t


def _si(v):
    return v in (True, 1, "1", "true", "si", "on")


def _ip4(v, que="la IP"):
    try:
        return str(ipaddress.IPv4Address(str(v or "").strip()))
    except ValueError:
        raise ValueError("%s no es válida" % que)


def _puertos_txt(v, que="el puerto", vacio=False):
    t = re.sub(r"\s+", "", str(v or ""))
    if not t and vacio:
        return ""
    if not re.match(r"^\d{1,5}([-:]\d{1,5})?$", t) or not all(1 <= int(x) <= 65535 for x in re.split(r"[-:]", t)):
        raise ValueError("%s tiene que ser un número (1-65535) o un rango como 8000-8010" % que)
    return t.replace(":", "-")


def _proto(v, permitidos=("tcp udp", "tcp", "udp")):
    t = " ".join(str(v or "tcp udp").lower().split())
    if t not in permitidos:
        raise ValueError("protocolo no válido")
    return t.split()


def _vigilar_radios():
    """Comprobación para router_cambiar: ninguna radio que estaba emitiendo
    puede quedarse caída (una wifi mal aceptada por hostapd tumba la radio
    entera, con todas sus wifis)."""
    antes = {}
    try:
        antes = {r: bool(v.get("up")) for r, v in (ubus("luci-rpc", "getWirelessDevices") or {}).items()}
    except Exception:
        pass

    def comprobar(ll):
        st = ll("luci-rpc", "getWirelessDevices") or {}
        for r, v in st.items():
            if not antes.get(r) or v.get("disabled"):
                continue
            if v.get("retry_setup_failed"):
                return "la radio %s no arranca con la configuración nueva" % r
            if v.get("pending") or not v.get("up"):
                return "esperar"
        return None
    return comprobar


AX_FIRMA = {"reglas": "nombre", "reenvios": "nombre", "rutas": "destino", "dns": "nombre", "fijas": "mac", "wifi": "ssid"}


def _el_mismo(c, x, lista):
    """Las secciones sin nombre de uci (cfgXXXXXX) cambian de nombre cuando se
    borra otra del mismo fichero: el panel manda, con el id, lo que vio
    (`firma`), y si ya no coincide no se toca nada."""
    campo = AX_FIRMA[lista]
    if str(c.get("firma", "")).upper() != str(x.get(campo, "")).upper():
        raise ValueError("la lista ha cambiado mientras tanto: vuelve a abrirlo")


def _aplicar(pasos, que, detalle="", espera=8, radios=False):
    """Cambio del router con espera: se confirma solo si el router sigue
    contestando unos segundos después (si no, se deshace él solo). Con
    `radios`, además, si alguna radio no vuelve a emitir."""
    router_cambiar(pasos, espera=espera, plazo=60 if radios else 45, comprobar=_vigilar_radios() if radios else None)
    evento("red", que, detalle, "info")
    ax_cache["ts"] = 0
    return {"ok": True}


def _vlan_activar(ll, net, devst):
    """La primera VLAN: el puente pasa a filtrar y la red de casa es la 1."""
    bocas = _bocas_de(net, devst)
    ll("uci", "add", {"config": "network", "type": "bridge-vlan", "values": {"device": "br-lan", "vlan": "1", "ports": [b + ":u*" for b in bocas]}})
    ll("uci", "set", {"config": "network", "section": "lan", "values": {"device": "br-lan.1"}})


def ax_red(c):
    ident = str(c.get("id") or "")
    nombre = _texto(c.get("nombre"), 32)
    net, dh, fw = _uci("network"), _uci("dhcp"), _uci("firewall")
    devst = ubus("network.device", "status") or {}
    actual = ajustes_leer()
    redes = {r["id"]: r for r in actual["redes"]}
    if ident and ident not in redes:
        raise ValueError("esa red no existe")
    r0 = redes.get(ident)
    # el DHCP (igual para todas)
    dh_on = _si(c.get("dhcp", True))
    if ident in AX_FIJAS:
        cidr = ipaddress.ip_network(r0["cidr"])
        gw = ipaddress.ip_address(r0["ip"])
    else:
        gw = ipaddress.ip_address(_ip4(c.get("ip"), "la puerta de enlace"))
        try:
            pref = int(c.get("prefijo") or 24)
        except ValueError:
            raise ValueError("máscara no válida")
        if not 16 <= pref <= 29:
            raise ValueError("la máscara tiene que ir de /16 a /29")
        cidr = ipaddress.ip_network("%s/%d" % (gw, pref), strict=False)
        if not cidr.is_private or gw in (cidr.network_address, cidr.broadcast_address):
            raise ValueError("usa una red privada (192.168.x.1, 10.x.x.1…) y que la puerta no sea la primera ni la última dirección")
        for o in actual["redes"]:
            if o["id"] != ident and ipaddress.ip_network(o["cidr"]).overlaps(cidr):
                raise ValueError("ese rango se pisa con la red «%s» (%s)" % (o["nombre"], o["cidr"]))
    try:
        ini = int(c.get("inicio") or 100)
        fin = int(c.get("fin") or (ini + 149))
    except ValueError:
        raise ValueError("el rango del DHCP no es válido")
    hosts = cidr.num_addresses - 2
    if dh_on and not (1 <= ini <= fin <= hosts):
        raise ValueError("el rango del DHCP tiene que ir de 1 a %d" % hosts)
    plazo = _texto(c.get("plazo") or "12h", 8)
    if not re.match(r"^\d+[mhd]?$", plazo):
        raise ValueError("el plazo de la concesión es como 12h, 30m o 1d")
    gw_n = int(gw) - int(cidr.network_address)
    if dh_on and ini <= gw_n <= fin:
        raise ValueError("el rango del DHCP no puede incluir la dirección del router (.%d)" % gw_n)
    dvals = {"interface": ident or "", "start": str(ini), "limit": str(fin - ini + 1), "leasetime": plazo}
    dns_rep = [_ip4(x, "el DNS") for x in re.split(r"[\s,;]+", str(c.get("dns") or "").strip()) if x]

    def nombre_guardar(iface):
        n = leer_json(AX_NOMBRES_F, {})
        if nombre:
            n[iface] = nombre
        guardar_json(AX_NOMBRES_F, n)

    if ident == "lan" and not dh_on:
        raise ValueError("sin DHCP en la red de casa nadie nuevo podría entrar: no lo apago desde aquí")
    if ident in AX_FIJAS:
        def pasos_dhcp(ll):
            sec = r0["dhcp"]["sec"]
            vals = dict(dvals, interface=ident)
            if not dh_on:
                vals["ignore"] = "1"
            if sec:
                ll("uci", "set", {"config": "dhcp", "section": sec, "values": vals})
                if dh_on:
                    ll("uci", "delete", {"config": "dhcp", "section": sec, "option": "ignore"}, tolerar=(4, 5))
            else:
                ll("uci", "add", {"config": "dhcp", "type": "dhcp", "name": ident, "values": vals})
        cambia_dhcp = (r0["dhcp"]["activo"] != dh_on or r0["dhcp"]["inicio"] != ini or r0["dhcp"]["inicio"] + r0["dhcp"]["limite"] - 1 != fin
                       or r0["dhcp"]["plazo"] != plazo)
        r = {"ok": True}
        if cambia_dhcp:
            r = _aplicar(pasos_dhcp, "DHCP de la red cambiado", "%s: %s–%s, %s" % (nombre or ident, ini, fin, plazo), espera=3)
        nombre_guardar(ident)
        return r

    # ---- las redes con VLAN
    aislada, internet = _si(c.get("aislada")), _si(c.get("internet", True))
    if r0:
        vid = r0["vlan"]
        iface = ident
    else:
        try:
            vid = int(c.get("vlan"))
        except (TypeError, ValueError):
            raise ValueError("falta el número de VLAN")
        if not 2 <= vid <= 4094:
            raise ValueError("la VLAN va de 2 a 4094 (la 1 es la red de casa)")
        if any(o["vlan"] == vid for o in actual["redes"]):
            raise ValueError("esa VLAN ya la usa otra red")
        iface = "%s%d" % (AX_PREF, vid)
        if iface in net:
            raise ValueError("ya hay algo llamado %s en el router" % iface)
    zona = (r0 or {}).get("zona") or iface
    puente = "br-cl%d" % vid
    psec = next((k for k, x in _de_tipo(net, "device") if x.get("name") == puente), None)
    ivals = {"proto": "static", "device": puente, "ipaddr": str(gw), "netmask": str(cidr.netmask)}
    dvals["interface"] = iface
    if dns_rep:
        dvals["dhcp_option"] = ["6," + ",".join(dns_rep)]

    def pasos(ll):
        if not actual["filtra_vlan"]:
            _vlan_activar(ll, net, devst)
        if not psec:
            ll("uci", "add", {"config": "network", "type": "device", "values": {"name": puente, "type": "bridge", "bridge_empty": "1", "ports": ["br-lan.%d" % vid]}})
        if not r0:
            ll("uci", "add", {"config": "network", "type": "bridge-vlan", "values": {"device": "br-lan", "vlan": str(vid)}})
            ll("uci", "add", {"config": "network", "type": "interface", "name": iface, "values": ivals})
            ll("uci", "add", {"config": "dhcp", "type": "dhcp", "name": iface, "values": dict(dvals, **({} if dh_on else {"ignore": "1"}))})
            ll("uci", "add", {"config": "firewall", "type": "zone", "name": iface,
                              "values": {"name": zona, "network": [iface], "input": "REJECT" if aislada else "ACCEPT", "output": "ACCEPT", "forward": "REJECT"}})
        else:
            ll("uci", "set", {"config": "network", "section": iface, "values": ivals})
            dsec = r0["dhcp"]["sec"]
            if dsec:
                ll("uci", "set", {"config": "dhcp", "section": dsec, "values": dict(dvals, **({} if dh_on else {"ignore": "1"}))})
                if dh_on:
                    ll("uci", "delete", {"config": "dhcp", "section": dsec, "option": "ignore"}, tolerar=(4, 5))
                if not dns_rep:
                    ll("uci", "delete", {"config": "dhcp", "section": dsec, "option": "dhcp_option"}, tolerar=(4, 5))
            else:
                ll("uci", "add", {"config": "dhcp", "type": "dhcp", "name": iface, "values": dvals})
            zsec = next((z["id"] for z in actual["zonas"] if z["nombre"] == zona), None)
            if zsec:
                ll("uci", "set", {"config": "firewall", "section": zsec, "values": {"input": "REJECT" if aislada else "ACCEPT"}})
            # los permisos con casa y con Internet se rehacen enteros más abajo
            for f in actual["reenvio_zonas"]:
                if (f["de"] == zona and f["a"] in ("lan", "wan")) or (f["a"] == zona and f["de"] == "lan"):
                    ll("uci", "delete", {"config": "firewall", "section": f["id"]})
            for rg in actual["reglas"]:
                if rg["nombre"].startswith("casalab-red-%s-" % iface):
                    ll("uci", "delete", {"config": "firewall", "section": rg["id"]})
        if internet:
            ll("uci", "add", {"config": "firewall", "type": "forwarding", "values": {"src": zona, "dest": "wan"}})
        if not aislada:
            ll("uci", "add", {"config": "firewall", "type": "forwarding", "values": {"src": "lan", "dest": zona}})
            ll("uci", "add", {"config": "firewall", "type": "forwarding", "values": {"src": zona, "dest": "lan"}})
        else:
            # aislada: del router solo el DHCP y el DNS (como la de invitados)
            ll("uci", "add", {"config": "firewall", "type": "rule", "values": {"name": "casalab-red-%s-dhcp" % iface, "src": zona, "proto": "udp",
                                                                                "dest_port": "67-68", "target": "ACCEPT"}})
            ll("uci", "add", {"config": "firewall", "type": "rule", "values": {"name": "casalab-red-%s-dns" % iface, "src": zona, "proto": ["tcp", "udp"],
                                                                                "dest_port": "53", "target": "ACCEPT"}})
    r = _aplicar(pasos, "Red %s" % ("cambiada" if r0 else "creada"),
                 "%s · VLAN %d · %s%s%s" % (nombre or iface, vid, cidr, " · aislada" if aislada else "", "" if internet else " · sin Internet"), espera=10)
    nombre_guardar(iface)
    return r


def ax_red_borrar(c):
    ident = str(c.get("id") or "")
    actual = ajustes_leer()
    r = next((x for x in actual["redes"] if x["id"] == ident), None)
    if not r:
        raise ValueError("esa red no existe")
    if r["fija"]:
        raise ValueError("la red de casa y la de invitados no se borran desde aquí")
    if r["ssids"]:
        raise ValueError("antes pasa a otra red o borra su wifi: %s" % ", ".join(r["ssids"]))
    net = _uci("network")
    bv = _bvlan(net)

    def pasos(ll):
        ll("uci", "delete", {"config": "network", "section": ident})
        for k, x in _de_tipo(net, "device"):
            if x.get("name") == "br-cl%s" % r["vlan"]:
                ll("uci", "delete", {"config": "network", "section": k})
        if r["vlan"] in bv:
            ll("uci", "delete", {"config": "network", "section": bv[r["vlan"]]["sec"]})
        if r["dhcp"]["sec"]:
            ll("uci", "delete", {"config": "dhcp", "section": r["dhcp"]["sec"]})
        for z in actual["zonas"]:
            if z["nombre"] == r["zona"] and z["redes"] == [ident]:
                ll("uci", "delete", {"config": "firewall", "section": z["id"]})
                for f in actual["reenvio_zonas"]:
                    if z["nombre"] in (f["de"], f["a"]):
                        ll("uci", "delete", {"config": "firewall", "section": f["id"]})
                for rg in actual["reglas"]:
                    if rg["origen"] == z["nombre"] or rg["destino"] == z["nombre"]:
                        ll("uci", "delete", {"config": "firewall", "section": rg["id"]})
    n = leer_json(AX_NOMBRES_F, {})
    n.pop(ident, None)
    guardar_json(AX_NOMBRES_F, n)
    return _aplicar(pasos, "Red borrada", "%s · VLAN %s" % (r["nombre"], r["vlan"]), espera=8)


def ax_wifi(c):
    ident = str(c.get("id") or "")
    actual = ajustes_leer(True)
    w0 = next((w for w in actual["wifi"] if ident and ident in w["secciones"]), None)
    if ident and not w0:
        raise ValueError("esa wifi no existe")
    if w0:
        _el_mismo(c, w0, "wifi")
    ssid = _texto(c.get("ssid"), 32)
    if not ssid:
        raise ValueError("falta el nombre de la wifi")
    seg_ = str(c.get("seguridad") or "psk2")
    if seg_ not in AX_SEGURIDAD:
        raise ValueError("seguridad no válida")
    clave = str(c.get("clave") or "")
    if seg_ != "none":
        if not clave and w0:
            clave = w0.get("clave", "")
        if not 8 <= len(clave) <= 63:
            raise ValueError("la contraseña tiene que tener de 8 a 63 caracteres")
    red_ = str(c.get("red") or "lan")
    if red_ not in {r["id"] for r in actual["redes"]}:
        raise ValueError("esa red no existe")
    bandas = [b for b in (c.get("bandas") or []) if b in ("2g", "5g")]
    if not bandas:
        raise ValueError("elige al menos una banda")
    radio_de = {r["banda"]: r["id"] for r in actual["radios"]}
    for o in actual["wifi"]:
        if o is not w0 and o["ssid"] == ssid and o["red"] != red_ and set(o["bandas"]) & set(bandas):
            raise ValueError("ya hay una wifi «%s» en esa banda" % ssid)
    filtro = str(c.get("filtro") or "disable")
    if filtro not in ("disable", "allow", "deny"):
        raise ValueError("filtro de MAC no válido")
    macs = [m.upper() for m in re.split(r"[\s,;]+", str(c.get("macs") or "")) if m]
    if any(not MAC.match(m) for m in macs):
        raise ValueError("hay una MAC mal escrita en la lista")
    if filtro == "allow" and not macs:
        raise ValueError("con «solo estas» y la lista vacía no entraría nadie")
    vals = {"mode": "ap", "network": red_, "ssid": ssid, "encryption": seg_, "hidden": "1" if _si(c.get("oculta")) else "0",
            "isolate": "1" if _si(c.get("aislar")) else "0", "disabled": "0" if _si(c.get("activa", True)) else "1",
            "ieee80211w": "2" if seg_ == "sae" else ("1" if seg_ == "sae-mixed" else "0")}
    if seg_ != "none":
        vals["key"] = clave
    # sin filtro, la opción ni se escribe: OpenWrt 25.12 solo admite allow/deny
    # y con «disable» la radio entera deja de arrancar (pasó el 28-10-2026)
    if filtro != "disable":
        vals["macfilter"] = filtro
    secciones = {}
    if w0:
        wl = _uci("wireless")
        banda_de = {r["id"]: r["banda"] for r in actual["radios"]}
        for s in w0["secciones"]:
            secciones[banda_de.get(wl.get(s, {}).get("device"), "")] = s

    def pasos(ll):
        for b in ("2g", "5g"):
            s = secciones.get(b)
            if b in bandas:
                v = dict(vals, device=radio_de[b])
                if s:
                    ll("uci", "set", {"config": "wireless", "section": s, "values": v})
                    if seg_ == "none":
                        ll("uci", "delete", {"config": "wireless", "section": s, "option": "key"}, tolerar=(4, 5))
                    ll("uci", "delete", {"config": "wireless", "section": s, "option": "maclist"}, tolerar=(4, 5))
                    if filtro == "disable":
                        ll("uci", "delete", {"config": "wireless", "section": s, "option": "macfilter"}, tolerar=(4, 5))
                    if macs:
                        ll("uci", "set", {"config": "wireless", "section": s, "values": {"maclist": macs}})
                else:
                    ll("uci", "add", {"config": "wireless", "type": "wifi-iface", "values": dict(v, **({"maclist": macs} if macs else {}))})
            elif s:
                ll("uci", "delete", {"config": "wireless", "section": s})
    return _aplicar(pasos, "Wifi %s" % ("cambiada" if w0 else "creada"), "%s · %s · %s" % (ssid, AX_SEGURIDAD[seg_], "+".join("2,4" if b == "2g" else "5" for b in bandas)),
                    espera=6, radios=True)


def ax_wifi_borrar(c):
    ident = str(c.get("id") or "")
    actual = ajustes_leer()
    w = next((x for x in actual["wifi"] if ident in x["secciones"]), None)
    if not w:
        raise ValueError("esa wifi no existe")
    _el_mismo(c, w, "wifi")
    if w["red"] == "lan" and sum(1 for x in actual["wifi"] if x["red"] == "lan") == 1:
        raise ValueError("es la única wifi de la red de casa: no la borro (puedes desactivarla)")

    def pasos(ll):
        for s in w["secciones"]:
            ll("uci", "delete", {"config": "wireless", "section": s})
    return _aplicar(pasos, "Wifi borrada", w["ssid"], espera=6, radios=True)


def ax_radio(c):
    actual = ajustes_leer()
    r = next((x for x in actual["radios"] if x["id"] == c.get("id")), None)
    if not r:
        raise ValueError("esa radio no existe")
    canal = str(c.get("canal") or "auto")
    if canal != "auto" and (not canal.isdigit() or (r["canales"] and int(canal) not in r["canales"])):
        raise ValueError("ese canal no lo admite la radio")
    ancho = str(c.get("ancho") or r["ancho"])
    if ancho not in r["anchos"]:
        raise ValueError("ancho no válido")
    pot = str(c.get("potencia") or "")
    if pot and (not pot.isdigit() or (r["potencias"] and int(pot) not in r["potencias"])):
        raise ValueError("potencia no válida")
    vals = {"channel": canal, "htmode": ancho, "disabled": "0" if _si(c.get("activa", True)) else "1"}

    def pasos(ll):
        ll("uci", "set", {"config": "wireless", "section": r["id"], "values": vals})
        if pot:
            ll("uci", "set", {"config": "wireless", "section": r["id"], "values": {"txpower": pot}})
        else:
            ll("uci", "delete", {"config": "wireless", "section": r["id"], "option": "txpower"}, tolerar=(4, 5))
    return _aplicar(pasos, "Radio cambiada", "%s GHz · canal %s · %s%s" % ("5" if r["banda"] == "5g" else "2,4", canal, ancho, " · %s dBm" % pot if pot else ""), espera=8, radios=vals["disabled"] == "0")


def ax_puerto(c, desde=""):
    boca = str(c.get("boca") or "")
    net = _uci("network")
    devst = ubus("network.device", "status") or {}
    bocas = _bocas_de(net, devst)
    if boca not in bocas:
        raise ValueError("ese puerto no existe")
    actual = ajustes_leer()
    vids = {r["vlan"] for r in actual["redes"] if r["vlan"]}
    try:
        nativa = int(c.get("nativa") or 0)
        etiq = sorted({int(x) for x in c.get("etiquetadas") or []})
    except (TypeError, ValueError):
        raise ValueError("VLAN no válida")
    if (nativa and nativa not in vids) or any(v not in vids for v in etiq):
        raise ValueError("hay una VLAN que no es de ninguna red")
    etiq = [v for v in etiq if v != nativa]
    if boca == _servidor_boca() and nativa != 1:
        raise ValueError("por ese puerto va el servidor: tiene que seguir en la red de casa sin etiquetar")
    quien = next((m for m, x in red["disp"].items() if x.get("ip") == desde), "")
    if quien and tr_fdb["d"].get(quien) == boca and nativa != 1:
        raise ValueError("es el puerto del equipo desde el que estás: te quedarías fuera")

    if not actual["filtra_vlan"]:
        # primero el puente pasa a filtrar VLAN (todas las bocas en la 1); luego se reparte
        router_cambiar(lambda ll: _vlan_activar(ll, net, devst), espera=10, plazo=45)
    bv = _bvlan(_uci("network"))

    def pasos(ll):
        for vid in sorted(vids):
            x = bv.get(vid)
            if not x:
                continue
            ps = dict(x["puertos"])
            ps.pop(boca, None)
            if vid == nativa:
                ps[boca] = "u"
            elif vid in etiq:
                ps[boca] = "t"
            ll("uci", "delete", {"config": "network", "section": x["sec"], "option": "ports"}, tolerar=(4, 5))
            if ps:
                ll("uci", "set", {"config": "network", "section": x["sec"], "values": {"ports": [b + (":u*" if m == "u" else ":t") for b, m in sorted(ps.items())]}})
    return _aplicar(pasos, "Puerto cambiado", "%s · nativa %s%s" % (boca, nativa or "ninguna", " · etiquetadas " + ", ".join(map(str, etiq)) if etiq else ""), espera=10)


def ax_matriz(c):
    de, a = str(c.get("de") or ""), str(c.get("a") or "")
    si = _si(c.get("si"))
    actual = ajustes_leer()
    zn = {z["nombre"] for z in actual["zonas"]}
    if de not in zn or a not in zn or de == a:
        raise ValueError("zonas no válidas")
    if de == "wan":
        raise ValueError("abrir Internet hacia dentro es un reenvío de puertos, no esto")
    if de == "lan" and a == "wan" and not si:
        raise ValueError("eso deja a toda la casa sin Internet: no lo hago desde aquí")
    ya = [f for f in actual["reenvio_zonas"] if f["de"] == de and f["a"] == a]
    if si == bool(ya):
        return {"ok": True}

    def pasos(ll):
        if si:
            ll("uci", "add", {"config": "firewall", "type": "forwarding", "values": {"src": de, "dest": a}})
        for f in ya:
            ll("uci", "delete", {"config": "firewall", "section": f["id"]})
    return _aplicar(pasos, "Cortafuegos: %s → %s %s" % (de, a, "permitido" if si else "bloqueado"), "", espera=4)


def ax_regla(c):
    ident = str(c.get("id") or "")
    actual = ajustes_leer()
    r0 = next((x for x in actual["reglas"] if x["id"] == ident), None)
    if ident and not r0:
        raise ValueError("esa regla no existe")
    if r0:
        _el_mismo(c, r0, "reglas")
    if r0 and r0["fija"]:
        raise ValueError("esa regla es del sistema o del panel: no se cambia desde aquí")
    nombre = _texto(c.get("nombre"), 48)
    if not nombre or AX_REGLA_FIJA.match(nombre):
        raise ValueError("ponle un nombre (que no empiece por Allow- ni casalab-)")
    zn = {z["nombre"] for z in actual["zonas"]}
    org, dst = str(c.get("origen") or ""), str(c.get("destino") or "")
    if org not in zn or (dst and dst not in zn and dst != "*"):
        raise ValueError("elige de dónde viene y adónde va")
    accion = str(c.get("accion") or "REJECT").upper()
    if accion not in ("ACCEPT", "REJECT", "DROP"):
        raise ValueError("acción no válida")
    proto = _proto(c.get("proto"), ("tcp udp", "tcp", "udp", "icmp", "all"))
    vals = {"name": nombre, "src": org, "target": accion, "proto": proto, "enabled": "1" if _si(c.get("activa", True)) else "0"}
    if dst:
        vals["dest"] = dst
    for k, cl in (("ip_origen", "src_ip"), ("ip_destino", "dest_ip")):
        t = str(c.get(k) or "").strip()
        if t:
            try:
                vals[cl] = [str(ipaddress.ip_network(x, strict=False)) for x in t.split()]
            except ValueError:
                raise ValueError("dirección no válida: %s" % t)
    mac = str(c.get("mac_origen") or "").strip().upper()
    if mac:
        if not MAC.match(mac):
            raise ValueError("MAC no válida")
        vals["src_mac"] = mac
    pto = _puertos_txt(c.get("puerto"), vacio=True)
    if pto:
        if proto not in (["tcp", "udp"], ["tcp"], ["udp"]):
            raise ValueError("el puerto solo vale con TCP o UDP")
        vals["dest_port"] = pto

    def pasos(ll):
        if r0:
            for o in ("dest", "src_ip", "dest_ip", "src_mac", "dest_port"):
                ll("uci", "delete", {"config": "firewall", "section": ident, "option": o}, tolerar=(4, 5))
            ll("uci", "set", {"config": "firewall", "section": ident, "values": vals})
        else:
            ll("uci", "add", {"config": "firewall", "type": "rule", "values": vals})
    return _aplicar(pasos, "Regla del cortafuegos %s" % ("cambiada" if r0 else "creada"), "%s · %s %s → %s" % (nombre, accion, org, dst or "router"), espera=3)


def ax_reenvio(c):
    ident = str(c.get("id") or "")
    actual = ajustes_leer()
    r0 = next((x for x in actual["reenvios"] if x["id"] == ident), None)
    if ident and not r0:
        raise ValueError("ese reenvío no existe")
    if r0:
        _el_mismo(c, r0, "reenvios")
    nombre = _texto(c.get("nombre"), 48) or "reenvio"
    proto = _proto(c.get("proto"))
    ext = _puertos_txt(c.get("externo"), "el puerto de fuera")
    ip = _ip4(c.get("ip"), "la IP del equipo")
    ipa = ipaddress.ip_address(ip)
    red_ = next((r for r in actual["redes"] if ipa in ipaddress.ip_network(r["cidr"])), None)
    if not red_ or ip == red_["ip"]:
        raise ValueError("la IP tiene que ser de un equipo de una red de casa")
    inte = _puertos_txt(c.get("interno"), "el puerto de dentro", vacio=True)
    for o in actual["reenvios"]:
        if o["id"] != ident and o["activa"] and o["externo"] == ext and set(o["proto"].split()) & set(proto):
            raise ValueError("ese puerto ya se reenvía a %s (%s)" % (o["ip"], o["nombre"]))
    vals = {"name": nombre, "src": "wan", "dest": red_["zona"] or "lan", "proto": proto, "src_dport": ext, "dest_ip": ip, "target": "DNAT",
            "enabled": "1" if _si(c.get("activa", True)) else "0"}
    if inte:
        vals["dest_port"] = inte
    org = str(c.get("origen") or "").strip()
    if org:
        try:
            vals["src_ip"] = [str(ipaddress.ip_network(x, strict=False)) for x in org.split()]
        except ValueError:
            raise ValueError("origen no válido")

    def pasos(ll):
        if r0:
            for o in ("dest_port", "src_ip"):
                ll("uci", "delete", {"config": "firewall", "section": ident, "option": o}, tolerar=(4, 5))
            ll("uci", "set", {"config": "firewall", "section": ident, "values": vals})
        else:
            ll("uci", "add", {"config": "firewall", "type": "redirect", "values": vals})
    r = _aplicar(pasos, "Reenvío de puertos %s" % ("cambiado" if r0 else "creado"), "%s · %s %s → %s:%s" % (nombre, "/".join(proto).upper(), ext, ip, inte or ext), espera=3)
    # lo ha abierto el usuario a propósito: que Seguridad no lo cuente como intruso
    base = estado.get("puertos_base")
    if base is not None:
        for p in proto:
            f = "%s/%s>%s:%s" % (p if len(proto) == 1 else " ".join(proto), ext, ip, inte)
            if f not in base:
                base.append(f)
        guardar_json(ESTADO_F, estado)
    return r


def _borrar_sec(config, lista, que):
    def hacer(c):
        actual = ajustes_leer()
        x = next((y for y in actual[lista] if y.get("id") and y["id"] == c.get("id")), None)
        if not x:
            raise ValueError("no existe")
        _el_mismo(c, x, lista)
        if x.get("fija"):
            raise ValueError("es del sistema o del panel: no se borra desde aquí")
        return _aplicar(lambda ll: ll("uci", "delete", {"config": config, "section": x["id"]}), que + " borrado",
                        x.get("nombre") or x.get("destino") or x["id"], espera=3)
    return hacer


def ax_ruta(c):
    ident = str(c.get("id") or "")
    actual = ajustes_leer()
    r0 = next((x for x in actual["rutas"] if x["id"] == ident), None)
    if ident and not r0:
        raise ValueError("esa ruta no existe")
    if r0:
        _el_mismo(c, r0, "rutas")
    try:
        dst = ipaddress.ip_network(str(c.get("destino") or "").strip(), strict=False)
    except ValueError:
        raise ValueError("el destino es una red como 10.8.0.0/24")
    if dst.version != 4 or dst.prefixlen == 0:
        raise ValueError("solo rutas IPv4 y nunca la de por defecto")
    gw = _ip4(c.get("puerta"), "la puerta de enlace")
    iface = str(c.get("interfaz") or "lan")
    red_ = next((r for r in actual["redes"] if r["id"] == iface), None)
    if not red_ or ipaddress.ip_address(gw) not in ipaddress.ip_network(red_["cidr"]):
        raise ValueError("la puerta tiene que estar dentro de la red elegida")
    vals = {"interface": iface, "target": str(dst.network_address), "netmask": str(dst.netmask), "gateway": gw}
    met = str(c.get("metrica") or "").strip()
    if met:
        if not met.isdigit():
            raise ValueError("la métrica es un número")
        vals["metric"] = met

    def pasos(ll):
        if r0:
            ll("uci", "delete", {"config": "network", "section": ident, "option": "metric"}, tolerar=(4, 5))
            ll("uci", "set", {"config": "network", "section": ident, "values": vals})
        else:
            ll("uci", "add", {"config": "network", "type": "route", "values": vals})
    return _aplicar(pasos, "Ruta %s" % ("cambiada" if r0 else "creada"), "%s por %s" % (dst, gw), espera=5)


def ax_dns(c):
    ident = str(c.get("id") or "")
    actual = ajustes_leer()
    r0 = next((x for x in actual["dns"] if x["id"] and x["id"] == ident), None)
    if ident and not r0:
        raise ValueError("ese nombre no existe")
    if r0:
        _el_mismo(c, r0, "dns")
    nombre = _texto(c.get("nombre"), 120).lower()
    if not re.match(r"^(?=.{1,120}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$", nombre):
        raise ValueError("el nombre es como nas, nas.lan o impresora.casa")
    ip = _ip4(c.get("ip"))
    for o in actual["dns"]:
        if o.get("id") != ident and o["nombre"] == nombre:
            raise ValueError("ese nombre ya apunta a %s" % o["ip"])

    def pasos(ll):
        if r0:
            ll("uci", "set", {"config": "dhcp", "section": ident, "values": {"name": nombre, "ip": ip}})
        else:
            ll("uci", "add", {"config": "dhcp", "type": "domain", "values": {"name": nombre, "ip": ip}})
    return _aplicar(pasos, "Nombre DNS %s" % ("cambiado" if r0 else "creado"), "%s → %s" % (nombre, ip), espera=2)


def ax_fija(c):
    """IP fija por MAC, también para equipos que el panel aún no ha visto."""
    mac = str(c.get("mac") or "").strip().upper()
    if not MAC.match(mac):
        raise ValueError("MAC no válida")
    ip = _ip4(c.get("ip"))
    actual = ajustes_leer()
    ipa = ipaddress.ip_address(ip)
    red_ = next((r for r in actual["redes"] if ipa in ipaddress.ip_network(r["cidr"])), None)
    if not red_ or ip == red_["ip"]:
        raise ValueError("esa IP no es de ninguna red de casa")
    for f in actual["fijas"]:
        if f["mac"] != mac and f["ip"] == ip:
            raise ValueError("esa IP ya es de %s" % (f["alias"] or f["nombre"] or f["mac"]))
    if red_["id"] == "lan" and mac in conocidos:
        return reservar({"ip": ip, "nombre": c.get("nombre")}, _mac=mac)
    nombre = nombre_de_red(c.get("nombre"))
    actual_f = next((f for f in actual["fijas"] if f["mac"] == mac), None)
    vals = {"mac": mac, "ip": ip}
    if nombre:
        vals["name"] = nombre

    def pasos(ll):
        if actual_f:
            ll("uci", "set", {"config": "dhcp", "section": actual_f["id"], "values": vals})
        else:
            ll("uci", "add", {"config": "dhcp", "type": "host", "values": vals})
    return _aplicar(pasos, "IP fija en el router", "%s → %s" % (nombre or mac, ip), espera=2)


def ax_fija_borrar(c):
    actual = ajustes_leer()
    f = next((x for x in actual["fijas"] if x["id"] == c.get("id")), None)
    if not f:
        raise ValueError("no existe")
    _el_mismo(c, f, "fijas")
    return _aplicar(lambda ll: ll("uci", "delete", {"config": "dhcp", "section": f["id"]}), "Reserva de IP quitada",
                    "%s (%s)" % (f["alias"] or f["nombre"] or f["mac"], f["ip"]), espera=2)


# ---- Reglas de tráfico y filtrado de contenido (UniFi «Traffic Management» y
# «Content Filtering»), hechas con los clientes persistentes de AdGuard Home:
# cada regla es un cliente «CasaLAB · …» con sus servicios bloqueados, su
# horario de pausa y su filtrado familiar. Ojo: AdGuard solo ve al equipo si
# le pregunta él directamente; lo que llega por el DNS del router (IPv6, redes
# aisladas) le llega como 192.168.1.1 y la regla no le alcanza.
AX_TR_PREF = "CasaLAB · "
AX_DIAS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
ax_srv = {"d": None, "ts": 0}


def adg_post(ruta, cuerpo):
    escribir("cambiar AdGuard")
    a = adg_cfg()
    if not a["url"]:
        raise ValueError("AdGuard Home no está conectado: ve a Ajustes → Integraciones")
    cred = base64.b64encode(("%s:%s" % (a["usuario"], a["clave"])).encode()).decode()
    req = urllib.request.Request(a["url"] + ruta, data=json.dumps(cuerpo).encode(), headers={"Authorization": "Basic " + cred, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise ValueError("AdGuard no lo acepta: %s" % e.read().decode("utf-8", "replace")[:160])


def ax_servicios():
    """Los servicios que AdGuard sabe bloquear, con su icono (cambian poco)."""
    if not ax_srv["d"] or time.time() - ax_srv["ts"] > 86400:
        d = adg("/control/blocked_services/all")
        ax_srv["d"] = {"grupos": [g["id"] for g in d.get("groups") or []],
                       "servicios": [{"id": x["id"], "nombre": x.get("name", x["id"]), "grupo": x.get("group_id", ""), "icono": x.get("icon_svg", "")}
                                     for x in d.get("blocked_services") or []]}
        ax_srv["ts"] = time.time()
    return ax_srv["d"]


def _ms_hora(ms):
    m = int(ms or 0) // 60000
    return "%02d:%02d" % (m // 60, m % 60)


def ax_trafico_leer():
    reglas = []
    for x in (adg("/control/clients") or {}).get("clients") or []:
        n = x.get("name", "")
        if not n.startswith(AX_TR_PREF):
            continue
        h = x.get("blocked_services_schedule") or {}
        dias = [d for d in AX_DIAS if h.get(d)]
        pausa = {"dias": dias, "desde": _ms_hora(h[dias[0]].get("start")), "hasta": _ms_hora(h[dias[0]].get("end"))} if dias else None
        ss = x.get("safe_search") or {}
        reglas.append({"nombre": n[len(AX_TR_PREF):], "ids": x.get("ids") or [], "servicios": x.get("blocked_services") or [], "pausa": pausa,
                       "familia": bool(x.get("parental_enabled")), "busquedas": bool(ss.get("enabled")), "malware": bool(x.get("safebrowsing_enabled")),
                       "anuncios": bool(x.get("filtering_enabled"))})
    return reglas


def _hora_ms(t):
    m = re.match(r"^(\d{1,2}):(\d{2})$", str(t or ""))
    if not m or int(m.group(1)) > 24 or int(m.group(2)) > 59:
        raise ValueError("hora no válida (HH:MM)")
    return (int(m.group(1)) * 60 + int(m.group(2))) * 60000


def ax_trafico(c):
    nombre = _texto(c.get("nombre"), 40)
    if not nombre:
        raise ValueError("ponle un nombre a la regla")
    antes = str(c.get("antes") or "")
    ids = []
    for t in re.split(r"[\s,;]+", str(c.get("ids") or "").strip()):
        if not t:
            continue
        try:
            ids.append(str(ipaddress.ip_network(t, strict=False)) if "/" in t else str(ipaddress.ip_address(t)))
        except ValueError:
            if MAC.match(t.upper()):
                ids.append(t.lower())
            else:
                raise ValueError("«%s» no es una IP, una red ni una MAC" % t)
    if not ids:
        raise ValueError("elige a quién se aplica")
    cat = {x["id"] for x in ax_servicios()["servicios"]}
    srv = [x for x in c.get("servicios") or [] if x in cat]
    familia, busq, malware = _si(c.get("familia")), _si(c.get("busquedas")), _si(c.get("malware", True))
    if not srv and not familia and not busq:
        raise ValueError("la regla no bloquea nada: elige servicios o el filtrado")
    horario = {"time_zone": "Europe/Madrid"}
    if _si(c.get("pausa")):
        dias = [d for d in c.get("dias") or [] if d in AX_DIAS]
        ini, fin = _hora_ms(c.get("desde")), _hora_ms(c.get("hasta"))
        if not dias or fin <= ini:
            raise ValueError("la pausa necesita días y una hora de fin posterior a la de inicio")
        for d in dias:
            horario[d] = {"start": ini, "end": fin}
    datos = {"name": AX_TR_PREF + nombre, "ids": ids, "use_global_settings": False, "filtering_enabled": True, "parental_enabled": familia,
             "safebrowsing_enabled": malware, "safe_search": {k: busq for k in ("enabled", "bing", "duckduckgo", "ecosia", "google", "pixabay", "yandex", "youtube")},
             "use_global_blocked_services": False, "blocked_services": srv, "blocked_services_schedule": horario, "upstreams": [], "tags": [],
             "ignore_querylog": False, "ignore_statistics": False}
    existentes = {r["nombre"] for r in ax_trafico_leer()}
    if antes:
        if antes not in existentes:
            raise ValueError("esa regla ya no existe")
        adg_post("/control/clients/update", {"name": AX_TR_PREF + antes, "data": datos})
    else:
        if nombre in existentes:
            raise ValueError("ya hay una regla con ese nombre")
        adg_post("/control/clients/add", datos)
    evento("red", "Regla de tráfico %s" % ("cambiada" if antes else "creada"), "%s · %d servicios%s" % (nombre, len(srv), " · familiar" if familia else ""), "info")
    return {"ok": True}


def ax_trafico_borrar(c):
    nombre = str(c.get("nombre") or "")
    if nombre not in {r["nombre"] for r in ax_trafico_leer()}:
        raise ValueError("esa regla ya no existe")
    adg_post("/control/clients/delete", {"name": AX_TR_PREF + nombre})
    evento("red", "Regla de tráfico borrada", nombre, "info")
    return {"ok": True}


# ---- utilización del canal (busy/active de la radio entre dos lecturas)
ax_survey = {}


def ax_uso_canal(ifaz, mhz):
    try:
        res = (ubus("iwinfo", "survey", {"device": ifaz}) or {}).get("results") or []
    except Exception:
        return None
    f = next((x for x in res if x.get("mhz") == mhz), None)
    if not f:
        return None
    prev, ax_survey[ifaz] = ax_survey.get(ifaz), f
    if not prev or f["active_time"] <= prev["active_time"]:
        return None
    act = f["active_time"] - prev["active_time"]
    q = lambda k: max(0, min(100, round((f[k] - prev[k]) * 100 / act)))
    return {"ocupado": q("busy_time"), "envia": q("tx_time"), "recibe": q("rx_time"),
            "otros": max(0, q("busy_time") - q("tx_time") - q("rx_time"))}


# ---- firmware nuevo para el router
ax_fw = {"d": None, "ts": 0}


def ax_firmware(actual):
    if not ax_fw["d"] or time.time() - ax_fw["ts"] > 43200:
        try:
            ax_fw["d"] = pedir("https://downloads.openwrt.org/.versions.json", {"User-Agent": "casalab-centinela"}, espera=10)
        except Exception:
            ax_fw["d"] = ax_fw["d"] or {}
        ax_fw["ts"] = time.time()
    nueva = (ax_fw["d"] or {}).get("stable_version", "")

    def v(t):
        return [int(x) if x.isdigit() else 0 for x in re.split(r"[.-]", t or "0")]
    return {"estable": nueva, "hay": bool(nueva and actual and v(nueva) > v(actual))}



# ---- VPN: el Tailscale del macmini (lo que en UniFi es «VPN Server» /
# Teleport). El macmini ya es «subnet router» de la red de casa; aquí se ve
# toda la tailnet y se puede anunciar también como nodo de salida o anunciar
# las VLAN. Cambiar algo pide que el usuario macmini sea «operador» de
# Tailscale (una vez: sudo tailscale set --operator=macmini), y lo anunciado
# hay que aprobarlo en la consola de Tailscale si no hay autoaprobación.
AX_SALIDA = {"0.0.0.0/0", "::/0"}


def _ts_hora(t):
    try:
        return int(datetime.fromisoformat(str(t).replace("Z", "+00:00")).timestamp()) if t and not str(t).startswith("0001") else 0
    except Exception:
        return 0


def ax_vpn():
    cod, out = sh(["tailscale", "status", "--json"], 10)
    try:
        d = json.loads(out)
    except Exception:
        return {"ok": False, "error": (out or "tailscale no contesta")[:160]}
    cod2, out2 = sh(["tailscale", "debug", "prefs"], 10)
    try:
        pr = json.loads(out2)
    except Exception:
        pr = {}
    yo = d.get("Self") or {}
    usuarios = {str(k): v for k, v in (d.get("User") or {}).items()}
    anunciadas = pr.get("AdvertiseRoutes") or []
    permitidas = set(yo.get("AllowedIPs") or [])

    def nodo(x, es_yo=False):
        u = usuarios.get(str(x.get("UserID"))) or {}
        directo = bool(x.get("CurAddr"))
        return {"nombre": x.get("HostName") or "?", "dns": (x.get("DNSName") or "").rstrip("."), "so": x.get("OS") or "",
                "ip": (x.get("TailscaleIPs") or [""])[0], "en_linea": bool(x.get("Online")) or es_yo, "visto": _ts_hora(x.get("LastSeen")),
                "yo": es_yo, "activo": bool(x.get("Active")), "conexion": "" if es_yo else ("directa" if directo else ("relé " + x["Relay"] if x.get("Relay") else "")),
                "baja": x.get("RxBytes") or 0, "sube": x.get("TxBytes") or 0, "salida_ofrece": bool(x.get("ExitNodeOption")), "usa_salida": bool(x.get("ExitNode")),
                "rutas": [r for r in x.get("PrimaryRoutes") or [] if r not in AX_SALIDA], "usuario": u.get("DisplayName") or u.get("LoginName") or "",
                "caduca": _ts_hora(x.get("KeyExpiry")), "compartido": x.get("ShareeNode") is not None and bool(x.get("ShareeNode"))}
    nodos = [nodo(yo, True)] + sorted((nodo(x) for x in (d.get("Peer") or {}).values()), key=lambda n: (not n["en_linea"], n["nombre"].lower()))
    rutas = [{"red": r, "aprobada": r in permitidas} for r in anunciadas if r not in AX_SALIDA]
    return {"ok": True, "estado": d.get("BackendState"), "version": (d.get("Version") or "").split("-")[0], "tailnet": (d.get("CurrentTailnet") or {}).get("Name", ""),
            "dominio": (d.get("CurrentTailnet") or {}).get("MagicDNSSuffix", ""), "operador": bool(pr.get("OperatorUser")),
            "rutas": rutas, "salida": {"anunciada": AX_SALIDA <= set(anunciadas), "aprobada": AX_SALIDA <= permitidas},
            "dns_tailscale": bool(pr.get("CorpDNS")), "nodos": nodos}


def _ts_set(*args):
    escribir("cambiar Tailscale")
    cod, out = sh(["tailscale", "set"] + list(args), 30)
    if cod != 0:
        if "access denied" in out.lower() or "operator" in out.lower() or "permission" in out.lower():
            raise ValueError("Tailscale no deja cambiarlo todavía: hace falta «sudo tailscale set --operator=$USER» una vez en este servidor")
        raise ValueError("Tailscale: %s" % out.strip()[:160])


def ax_vpn_rutas(c):
    v = ax_vpn()
    if not v.get("ok"):
        raise ValueError("Tailscale no contesta")
    redes = []
    for t in c.get("redes") or []:
        try:
            n = ipaddress.ip_network(str(t), strict=False)
        except ValueError:
            raise ValueError("red no válida: %s" % t)
        if n.version != 4 or not n.is_private:
            raise ValueError("solo redes privadas de casa")
        redes.append(str(n))
    if RED + "0/24" not in redes:
        raise ValueError("la red de casa tiene que seguir siendo accesible desde fuera (es por donde entras al panel)")
    if v["salida"]["anunciada"]:
        redes += sorted(AX_SALIDA)
    _ts_set("--advertise-routes=" + ",".join(redes))
    evento("red", "VPN: redes visibles desde fuera", ", ".join(r for r in redes if r not in AX_SALIDA), "aviso")
    return {"ok": True, "nota": "Si alguna red es nueva, apruébala en la consola de Tailscale."}


def ax_vpn_salida(c):
    si = _si(c.get("si"))
    _ts_set("--advertise-exit-node=" + ("true" if si else "false"))
    evento("red", "VPN: nodo de salida %s" % ("anunciado" if si else "quitado"), "", "aviso")
    return {"ok": True, "nota": "Apruébalo en la consola de Tailscale para poder usarlo." if si else ""}



def _wan_vuelve():
    """Comprobación para router_cambiar: la línea tiene que volver a subir."""
    def comprobar(ll):
        d = {i.get("interface"): i for i in (ll("network.interface", "dump") or {}).get("interface", [])}
        w = d.get("wan") or {}
        return None if w.get("up") else "esperar"
    return comprobar


def ax_internet(c):
    """Lo que en UniFi es «Internet»: modo IPv6 del PPPoE y MTU. Cualquier
    cambio aquí reconecta la línea (unos segundos sin Internet); si no vuelve
    a subir en un minuto, el router lo deshace."""
    ipv6 = str(c.get("ipv6") or "auto")
    if ipv6 not in ("auto", "1", "0"):
        raise ValueError("modo IPv6 no válido")
    mtu = str(c.get("mtu") or "").strip()
    if mtu and (not mtu.isdigit() or not 1280 <= int(mtu) <= 1500):
        raise ValueError("la MTU va de 1280 a 1500 (vacía = la de siempre)")
    w = _uci("network").get("wan") or {}
    if w.get("proto") != "pppoe":
        raise ValueError("solo sé tocar conexiones PPPoE")
    vals = {"ipv6": ipv6}
    if mtu:
        vals["mtu"] = mtu

    def pasos(ll):
        ll("uci", "set", {"config": "network", "section": "wan", "values": vals})
        if not mtu:
            ll("uci", "delete", {"config": "network", "section": "wan", "option": "mtu"}, tolerar=(4, 5))
    router_cambiar(pasos, espera=12, plazo=90, comprobar=_wan_vuelve())
    evento("red", "Conexión a Internet cambiada", "IPv6 %s%s" % ({"auto": "automático", "1": "solo por wan6", "0": "apagado"}[ipv6], " · MTU " + mtu if mtu else ""), "aviso")
    return {"ok": True, "nota": "La línea se ha reconectado."}


def ax_reconectar(c):
    evento("red", "Línea reconectada desde el panel", "", "aviso")
    ubus("network.interface.wan", "up", {})
    return {"ok": True, "nota": "Unos segundos sin Internet mientras vuelve a marcar."}


def ax_reiniciar(c):
    if c.get("seguro") != "REINICIAR":
        raise ValueError("falta la confirmación")
    evento("red", "Router reiniciado desde el panel", "", "aviso")
    ubus("system", "reboot", {})
    return {"ok": True, "nota": "Tarda un par de minutos en volver; mientras, la casa se queda sin Internet."}


def ax_registro(q):
    n = max(50, min(1000, int((q.get("n") or ["300"])[0] or 300)))
    lineas = (ubus("log", "read", {"lines": n, "stream": False}) or {}).get("log") or []
    return {"lineas": [{"t": int(x.get("time", 0) / 1000), "nivel": int(x.get("priority", 6)) & 7, "msg": x.get("msg", "")} for x in lineas]}


AX_ACCIONES = {"red": ax_red, "red_borrar": ax_red_borrar, "wifi": ax_wifi, "wifi_borrar": ax_wifi_borrar, "radio": ax_radio,
               "matriz": ax_matriz, "regla": ax_regla, "regla_borrar": _borrar_sec("firewall", "reglas", "Regla del cortafuegos"),
               "reenvio": ax_reenvio, "reenvio_borrar": _borrar_sec("firewall", "reenvios", "Reenvío de puertos"),
               "ruta": ax_ruta, "ruta_borrar": _borrar_sec("network", "rutas", "Ruta"), "dns": ax_dns, "dns_borrar": _borrar_sec("dhcp", "dns", "Nombre DNS"),
               "fija": ax_fija, "fija_borrar": ax_fija_borrar, "reiniciar": ax_reiniciar,
               "internet": ax_internet, "reconectar": ax_reconectar, "trafico": ax_trafico, "trafico_borrar": ax_trafico_borrar,
               "vpn_rutas": ax_vpn_rutas, "vpn_salida": ax_vpn_salida}


def ajustes_cambiar(c, desde=""):
    que = str(c.get("que") or "")
    f = (lambda x: ax_puerto(x, desde)) if que == "puerto" else AX_ACCIONES.get(que)
    if not f:
        raise ValueError("orden desconocida")
    with cerrojo_ax:            # una orden al router cada vez
        return f(c)


cerrojo_ax = threading.Lock()




def tailscale_hay():
    """¿Tiene este servidor Tailscale (su orden y su socket, montados en el contenedor)?"""
    return bool(shutil.which("tailscale")) and os.path.exists("/var/run/tailscale/tailscaled.sock") and config.tailscale()["activo"]


aplicar_router()
