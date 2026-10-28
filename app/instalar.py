"""Lo que CasaFi hace con el router la primera vez, y el informe de diagnóstico.

  probar_router(ip, usuario, clave)  ¿contesta su API (ubus, la de LuCI) y acepta la contraseña?
  preparar_router()                  por SSH, instala lo que hace falta para el tráfico por aplicación
  diagnostico(...)                   un texto para mandar cuando algo falla (sin contraseñas)

Todo es OpenWrt estándar: ubus por http://<router>/ubus (lo que usa LuCI) y,
para preparar, el SSH de siempre (dropbear) con el usuario root.
"""
import json
import os
import platform
import socket
import time
import urllib.error
import urllib.request

import config

# El script que lista las conexiones abiertas con sus bytes, una por línea:
#   protocolo origen puerto destino puerto bytes_ida origen_de_vuelta bytes_vuelta
# (lo lee red.leer_flujos). Necesita la contabilidad de conntrack encendida.
FLUJOS = "/usr/libexec/casafi-flujos"
SCRIPT = r"""#!/bin/sh
# CasaFi: las conexiones abiertas del router con sus bytes (la lee la app cada 5 s)
exec awk '{ s=""; d=""; sp=""; dp=""; r=""; b1=""; b2="";
  for (i = 1; i <= NF; i++) { n = index($i, "="); if (!n) continue; k = substr($i, 1, n - 1); v = substr($i, n + 1);
    if (k == "src") { if (s == "") s = v; else if (r == "") r = v }
    else if (k == "dst") { if (d == "") d = v }
    else if (k == "sport") { if (sp == "") sp = v }
    else if (k == "dport") { if (dp == "") dp = v }
    else if (k == "bytes") { if (b1 == "") b1 = v; else if (b2 == "") b2 = v } }
  if (s != "" && b1 != "" && b2 != "") print $3, s, (sp == "" ? 0 : sp), d, (dp == "" ? 0 : dp), b1, r, b2 }' /proc/net/nf_conntrack
"""
# lo que la app puede ejecutar en el router (solo leer): las conexiones, los puertos del switch y su tráfico
ACL = {"casafi": {"description": "CasaFi: leer conexiones, puertos y su tráfico",
                  "read": {"ubus": {"file": ["exec", "read", "list", "stat"]},
                           "file": {FLUJOS: ["exec"], "/usr/sbin/bridge": ["exec"], "/usr/sbin/ethtool": ["exec"]}}}}


def _ubus(ip, sid, obj, met, arg=None, espera=8):
    b = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "call", "params": [sid, obj, met, arg or {}]}).encode()
    req = urllib.request.Request("http://%s/ubus" % ip, data=b, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=espera) as r:
        return json.load(r)


def probar_router(ip, usuario, clave):
    """Devuelve {ok, modelo, version} o lanza ValueError con lo que pasa, en cristiano."""
    ip = (ip or "").strip()
    if not ip:
        raise ValueError("escribe la dirección del router (normalmente 192.168.1.1)")
    try:
        r = _ubus(ip, "0" * 32, "session", "login", {"username": usuario or "root", "password": clave or ""})
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise ValueError("el router contesta, pero no tiene la API de LuCI (ubus). Instala LuCI en el router o el paquete uhttpd-mod-ubus")
        raise ValueError("el router contesta con un error %s" % e.code)
    except (urllib.error.URLError, socket.timeout, OSError):
        raise ValueError("no hay nada en %s. ¿Es la dirección del router? ¿Lleva OpenWrt?" % ip)
    except ValueError:
        raise ValueError("en %s contesta algo que no es un router OpenWrt" % ip)
    res = r.get("result") or []
    if not res or res[0] != 0 or len(res) < 2:
        raise ValueError("el router no acepta ese usuario y contraseña (son los de entrar en LuCI)")
    sid = res[1]["ubus_rpc_session"]
    placa = (_ubus(ip, sid, "system", "board").get("result") or [0, {}])
    placa = placa[1] if len(placa) > 1 else {}
    ver = (placa.get("release") or {})
    return {"ok": True, "modelo": placa.get("model") or "", "version": ("%s %s" % (ver.get("distribution", "OpenWrt"), ver.get("version", ""))).strip()}


def _ssh(ip, usuario, clave):
    import paramiko
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        c.connect(ip, 22, usuario or "root", clave, timeout=10, allow_agent=False, look_for_keys=False)
    except paramiko.AuthenticationException:
        raise ValueError("el router no deja entrar por SSH con esa contraseña")
    except (OSError, paramiko.SSHException):
        raise ValueError("el router no deja entrar por SSH (puerto 22). En LuCI: Sistema → Administración → Acceso SSH")
    return c


def _orden(c, orden, entrada=None, espera=120):
    i, o, e = c.exec_command(orden, timeout=espera)
    if entrada is not None:
        i.write(entrada)
        i.channel.shutdown_write()
    salida = o.read().decode(errors="replace")
    error = e.read().decode(errors="replace")
    return o.channel.recv_exit_status(), (salida + error).strip()


def preparar_router():
    """Instala en el router lo de los flujos (script, permiso y contabilidad) y
    los paquetes que faltan. Devuelve una lista de pasos [texto, bien?]."""
    cr = config.router()
    pasos = []
    c = _ssh(cr["ip"], cr["usuario"], cr["clave"])
    try:
        _orden(c, "mkdir -p /usr/libexec /usr/share/rpcd/acl.d")
        cod, out = _orden(c, "cat > %s && chmod 755 %s" % (FLUJOS, FLUJOS), SCRIPT)
        pasos.append(["Script de conexiones (%s)" % FLUJOS, cod == 0])
        cod, out = _orden(c, "cat > /usr/share/rpcd/acl.d/casafi.json", json.dumps(ACL, indent=1))
        pasos.append(["Permiso para leerlo (rpcd)", cod == 0])
        # la contabilidad de bytes de cada conexión, también tras reiniciar
        cod, out = _orden(c, "sysctl -w net.netfilter.nf_conntrack_acct=1 >/dev/null; "
                             "grep -q nf_conntrack_acct /etc/sysctl.conf || echo 'net.netfilter.nf_conntrack_acct=1' >> /etc/sysctl.conf")
        pasos.append(["Contar los bytes de cada conexión", cod == 0])
        # que una actualización del router no lo borre
        cod, out = _orden(c, "for f in %s /usr/share/rpcd/acl.d/casafi.json; do grep -qx \"$f\" /etc/sysupgrade.conf || echo \"$f\" >> /etc/sysupgrade.conf; done" % FLUJOS)
        pasos.append(["Que sobreviva a las actualizaciones", cod == 0])
        # bridge y ethtool: qué equipo va por cada puerto y su tráfico (apk en OpenWrt 25, opkg antes)
        falta = [p for p, b in (("ip-bridge", "/usr/sbin/bridge"), ("ethtool", "/usr/sbin/ethtool")) if _orden(c, "test -x " + b)[0] != 0]
        if falta:
            cod, out = _orden(c, "if command -v apk >/dev/null; then apk update >/dev/null 2>&1; apk add %s; else opkg update >/dev/null 2>&1; opkg install %s; fi" % (" ".join(falta), " ".join(falta)), espera=300)
            pasos.append(["Instalar " + ", ".join(falta), cod == 0])
        else:
            pasos.append(["bridge y ethtool ya estaban", True])
        cod, out = _orden(c, "/etc/init.d/rpcd reload")
        pasos.append(["Recargar rpcd", cod == 0])
    finally:
        c.close()
    config.guardar("router", {"preparado": int(time.time())})
    return pasos


def diagnostico(red, version, registro_f):
    """Un informe en texto para mandar cuando algo falla. Sin contraseñas."""
    ahora = time.strftime("%Y-%m-%d %H:%M:%S")
    lineas = ["CasaFi Network · diagnóstico", "=" * 40, "fecha: " + ahora, "versión: " + version,
              "python: %s · %s" % (platform.python_version(), platform.platform()), ""]
    pub = config.publico(red.HOST)
    lineas += ["== configuración (sin contraseñas)", json.dumps(pub, ensure_ascii=False, indent=1), ""]
    lineas += ["== este servidor", "ip: %s · tarjeta: %s · red: %s* · escritura: %s" % (red.HOST, red.IFAZ, red.RED, red.ESCRITURA), ""]
    try:
        d = red.api_red()
        ro = d.get("router") or {}
        lineas += ["== router", "modelo: %s · versión: %s · error: %s" % (ro.get("modelo"), ro.get("version"), d.get("error") or "ninguno"),
                   "equipos: %s · en línea: %s · radios: %d · vpn: %d" % (d["resumen"].get("total"), d["resumen"].get("en_linea"), len(d.get("radios") or []), len(d.get("vpn") or [])),
                   "puertos: %s" % ", ".join(p.get("nombre", "?") for p in ((ro.get("mas") or {}).get("puertos") or [])), ""]
    except Exception as e:
        lineas += ["== router", "no se ha podido leer: %s" % e, ""]
    try:
        with open(registro_f, encoding="utf-8", errors="replace") as f:
            ultimas = f.readlines()[-3000:]
    except OSError:
        ultimas = ["(no hay registro todavía)\n"]
    # por si acaso: nada que parezca una contraseña o un token
    claves = [v for v in (config.router()["clave"], config.adguard(red.HOST)["clave"], config.telegram()[0], config.home_assistant(red.HOST)["token"]) if v and len(v) > 3]
    texto = "".join(ultimas)
    for v in claves:
        texto = texto.replace(v, "••••")
    lineas += ["== registro de la app (lo último)", texto]
    return "\n".join(lineas)
