"""La configuración de CasaFi: /data/config.json.

Se rellena desde la bienvenida (el router) y desde Ajustes → Integraciones (lo
opcional: AdGuard Home, Tailscale, Telegram, Home Assistant). Lo que no está en
el fichero se busca en las variables de entorno de las instalaciones de antes
(HOMEPAGE_VAR_ROUTER_OPENWRT_PASSWORD, CASALAB_ROUTER…), así que una instalación
vieja sigue funcionando sin tocar nada.

El fichero lleva contraseñas: se guarda con permisos 600 y la API nunca las
devuelve (publico() las tapa).
"""
import hashlib
import hmac
import json
import os
import secrets
import socket
import subprocess
import threading

DATOS = os.environ.get("CASALAB_DATOS", "/data")
F = os.path.join(DATOS, "config.json")
E = os.environ.get
_cerrojo = threading.Lock()
_c = {}


def _leer():
    try:
        with open(F, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


_c = _leer()


def guardar(seccion, valores):
    """Mezcla `valores` en `seccion` (None la borra) y lo deja en disco."""
    with _cerrojo:
        if valores is None:
            _c.pop(seccion, None)
        else:
            _c.setdefault(seccion, {}).update({k: v for k, v in valores.items()})
        os.makedirs(DATOS, exist_ok=True)
        tmp = F + ".tmp"
        with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
            json.dump(_c, f, ensure_ascii=False, indent=1)
        os.replace(tmp, F)


def seccion(nombre):
    return dict(_c.get(nombre) or {})


# ---------------------------------------------------------------- el router
def router():
    s = seccion("router")
    clave = s.get("clave") if "clave" in s else E("HOMEPAGE_VAR_ROUTER_OPENWRT_PASSWORD", "")
    # las instalaciones de antes no decían la IP: era 192.168.1.1 por defecto
    viejo = "192.168.1.1" if "clave" not in s and E("HOMEPAGE_VAR_ROUTER_OPENWRT_PASSWORD") else ""
    return {"ip": s.get("ip") or E("CASALAB_ROUTER") or viejo, "usuario": s.get("usuario") or "root", "clave": clave}


def configurado():
    """Hay router al que hablar (la bienvenida ya se ha hecho)."""
    r = router()
    return bool(r["ip"] and r["clave"])


# ---------------------------------------------------------------- este servidor
def ip_local(hacia):
    """La IP de este equipo con la que se llega a `hacia` (el router)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect((hacia or "192.168.1.1", 9))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


def interfaz(hacia):
    """La tarjeta de red por la que se llega al router (para la tabla de vecinos)."""
    try:
        out = subprocess.run(["ip", "-4", "route", "get", hacia or "192.168.1.1"], capture_output=True, text=True, timeout=5).stdout
        partes = out.split()
        return partes[partes.index("dev") + 1]
    except (OSError, ValueError, IndexError, subprocess.SubprocessError):
        return "eth0"


# ---------------------------------------------------------------- integraciones (todas opcionales)
def adguard(host):
    s = seccion("adguard")
    clave = s.get("clave") if "clave" in s else E("HOMEPAGE_VAR_ADGUARD_HOME_PASSWORD", "")
    url = s.get("url") or E("CASALAB_ADGUARD") or ("http://%s:3000" % host if clave else "")
    return {"url": url.rstrip("/"), "usuario": s.get("usuario") or E("CASALAB_ADGUARD_USER", ""), "clave": clave or ""}


def telegram():
    s = seccion("telegram")
    if s.get("token") and s.get("chat"):
        return s["token"], str(s["chat"])
    return "", ""


def home_assistant(host):
    s = seccion("home_assistant")
    token = s.get("token") or E("HOMEPAGE_VAR_HOME_ASSISTANT_KEY", "")
    return {"url": (s.get("url") or ("http://%s:8123" % host if token else "")).rstrip("/"), "token": token}


def tailscale():
    """Tailscale se usa con la orden del propio servidor (montada en el contenedor)."""
    s = seccion("tailscale")
    return {"activo": s.get("activo", True)}


# ---------------------------------------------------------------- el acceso a la app
# Los cambios (en el router y en los equipos) piden sesión. La da la contraseña
# de CasaFi, que se pone en la bienvenida; la cookie «casafi» lleva un token
# firmado con un secreto que solo está en config.json.
def _secreto():
    s = seccion("acceso")
    if not s.get("secreto"):
        guardar("acceso", {"secreto": secrets.token_hex(32)})
        s = seccion("acceso")
    return s["secreto"]


def _resumen(clave, sal):
    return hashlib.pbkdf2_hmac("sha256", clave.encode(), bytes.fromhex(sal), 200_000).hex()


def poner_clave(clave):
    if len(clave or "") < 6:
        raise ValueError("la contraseña tiene que tener al menos 6 caracteres")
    sal = secrets.token_hex(16)
    # cambiar la contraseña cierra las sesiones abiertas (secreto nuevo)
    guardar("acceso", {"sal": sal, "clave": _resumen(clave, sal), "secreto": secrets.token_hex(32)})


def hay_clave():
    return bool(seccion("acceso").get("clave"))


def comprobar_clave(clave):
    s = seccion("acceso")
    return bool(s.get("clave")) and hmac.compare_digest(_resumen(clave or "", s["sal"]), s["clave"])


def token_sesion():
    return hmac.new(_secreto().encode(), b"casafi-sesion", hashlib.sha256).hexdigest()


def sesion_valida(token):
    return bool(token) and hay_clave() and hmac.compare_digest(token, token_sesion())


# ---------------------------------------------------------------- lo que ve la interfaz
def publico(host):
    """El estado de la configuración, sin contraseñas."""
    r, a, h = router(), adguard(host), home_assistant(host)
    tok, chat = telegram()
    return {
        "configurado": configurado(),
        "clave_app": hay_clave(),
        "router": {"ip": r["ip"], "usuario": r["usuario"], "clave": bool(r["clave"])},
        "adguard": {"url": a["url"], "usuario": a["usuario"], "clave": bool(a["clave"]), "activo": bool(a["url"])},
        "telegram": {"activo": bool(tok and chat), "chat": chat},
        "home_assistant": {"url": h["url"], "activo": bool(h["url"] and h["token"])},
        "tailscale": tailscale(),
    }
