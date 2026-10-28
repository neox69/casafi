// ==========================================================================
// Idioma (28-10-2026). La app se pinta en español; con el inglés elegido en
// Ajustes → Aplicación (localStorage «cl-idioma»), esta capa traduce lo que
// aparece en la página: los textos, title, placeholder y aria-label.
//
// Cada texto se busca entero con sus números cambiados por «#» (así «hace 3 h»
// y «hace 12 h» son la misma entrada); si no está, se parte por « · », « → » y
// «: » y se busca cada trozo. Las fechas se traducen aparte. Lo que no está en
// el diccionario (nombres de equipos, dominios, wifis) se queda como está.
// ==========================================================================
(function () {
  var idioma = "es";
  try { idioma = localStorage.getItem("cl-idioma") || "es"; } catch (e) { /* sin almacenamiento */ }
  window.CL_IDIOMA = idioma;
  if (idioma !== "en") return;
  document.documentElement.lang = "en";

  var EN = {
    // ---- barra lateral, páginas y menús
    "Panel": "Dashboard", "Topología": "Topology", "Dispositivos": "Devices", "Clientes": "Clients", "Puertos": "Ports",
    "Radios": "Radios", "Flujos": "Insights", "Registro": "System Log", "Ajustes": "Settings",
    "Panel · Dashboard": "Dashboard", "Topología · Topology": "Topology", "Dispositivos · UniFi Devices": "Devices",
    "Clientes · Client Devices": "Client Devices", "Puertos · Ports": "Ports", "Radios · Radios": "Radios",
    "Flujos · Insights": "Insights", "Registro · System Log": "System Log", "Ajustes · Settings": "Settings",
    "Buscar · Ctrl+K": "Search · Ctrl+K", "Buscar": "Search", "Alarmas": "Alarms", "Claro u oscuro": "Light or dark",
    "Cambiar entre claro y oscuro": "Switch between light and dark", "Estado de la app": "App status", "Navegación": "Navigation",
    "Páginas": "Pages", "Secciones de los ajustes": "Settings sections", "Equipos": "Devices", "Cerrar": "Close",
    "Buscar páginas, ajustes, equipos, IP o MAC…": "Search pages, settings, devices, IP or MAC…",
    "Buscar equipo, IP o MAC…": "Search device, IP or MAC…", "Buscar en el mapa": "Search the map", "Buscar en el mapa…": "Search the map…",
    "Nada con «": "Nothing for «", "Ver el registro": "View the log", "Ver todo": "View all", "Ver todos": "View all", "Ver más": "View more",
    "Ver los #": "View all #", "Aplicación": "Application", "Idioma": "Language", "Idioma de la app": "App language",
    "Idioma · Language": "Language", "Otros": "Other", "Cargando…": "Loading…", "Leyendo el registro…": "Reading the log…",
    "Leer el registro": "Read the log", "Esperando datos de AdGuard…": "Waiting for AdGuard data…", "Leyendo el tráfico…": "Reading traffic…",
    "Todavía no se ha medido.": "Not measured yet.",

    // ---- Panel
    "Clientes · en línea ahora": "Clients · online now", "en línea ahora": "online now", "en línea": "online", "En línea": "Online",
    "de # conocidos": "of # known", "Internet ahora": "Internet now", "Tráfico de la línea": "Internet traffic",
    "router · en directo": "router · live", "en directo": "live", "Bajada": "Download", "Subida": "Upload", "↓ Bajada": "↓ Download",
    "↑ Subida": "↑ Upload", "↓ bajada": "↓ download", "↑ subida": "↑ upload", "Bajada ahora": "Download now", "Subida ahora": "Upload now",
    "Salud de Internet": "Internet health", "cortes, respuesta y velocidad": "outages, latency and speed", "Internet funciona": "Internet is up",
    "Internet no funciona": "Internet is down", "Disponibilidad": "Uptime", "Cortes": "Outages", "Reconexiones": "Reconnections",
    "Respuesta ahora": "Latency now", "Última prueba": "Last test", "Experiencia WiFi": "WiFi experience",
    "según la señal de cada cliente": "based on each client's signal", "Escudo DNS": "DNS shield", "% bloqueado": "% blocked",
    "Consultas hoy": "Queries today", "Bloqueadas": "Blocked", "Latencia": "Latency", "latencia": "latency",
    "Velocidad de la línea": "Line speed", "prueba propia": "own test", "Medir ahora": "Test now", "Clientes más activos": "Most active clients",
    "ahora mismo": "right now", "Ahora mismo": "Right now", "Ahora mismo nadie está usando la red.": "Nobody is using the network right now.",
    "Monitores de Internet": "Internet monitors", "respuesta de cada uno": "latency of each", "VPN": "VPN", "Tailscale": "Tailscale",
    "de # en línea": "of # online", "No hay equipos en Tailscale.": "There are no Tailscale devices.", "este servidor": "this server",
    "en casa": "at home", "fuera": "away", "En casa": "At home", "Fuera": "Away", "directa": "direct", "Directa": "Direct", "directo": "direct",
    "por relé": "via relay", "Por relé (mad)": "Via relay (mad)", "por relé (mad)": "via relay (mad)", "relé · mad": "relay · mad",
    "Toda la red": "Whole network", "quién gasta más y en qué · solo lo que sale a Internet": "who uses the most and on what · Internet traffic only",
    "Resumen": "Summary", "Total": "Total", "Conexiones": "Connections", "Bloqueadas por DNS": "Blocked by DNS", "Sin identificar": "Unidentified",
    "# abiertas": "# open", "Equipos que más gastan": "Top devices", "Aplicaciones principales": "Top applications",
    "Destinos principales": "Top destinations", "Router": "Router", "Router: verlo al detalle": "Router: see details",
    "Conexiones abiertas": "Open connections", "Encendido": "Uptime", "Encendido hace": "Up for", "Carga · memoria": "Load · memory",
    "Carga": "Load", "Memoria": "Memory", "IP pública": "Public IP", "Puerta de enlace del operador": "ISP gateway",
    "Sesión abierta": "Session open", "Clientes VPN": "VPN clients", "Tailscale (Teleport y VPN en UniFi)": "Tailscale (Teleport & VPN in UniFi)",
    "Resumen de la red": "Network summary", "Ayer": "Yesterday", "Hoy": "Today",

    // ---- Clientes, mapa y fichas
    "Todos": "All", "Desconectados": "Offline", "Desconectado": "Offline", "Cable": "Wired", "cable": "wired", "Wifi": "WiFi", "wifi": "WiFi",
    "Por nombre": "By name", "Por tipo": "By type", "Por IP": "By IP", "Mejor señal": "Best signal", "Más actividad": "Most activity",
    "Vistos hace poco": "Recently seen", "Ordenar": "Sort", "Agrupar": "Group", "Equipo": "Device", "IP": "IP", "Conexión": "Connection",
    "Señal": "Signal", "Enlace": "Link", "Actividad": "Activity", "Conectado": "Connected", "Conectada": "Connected",
    "Descargar la lista en CSV": "Download the list as CSV", "Descargar lo filtrado en CSV": "Download the filtered list as CSV",
    "IP fija en el router": "Fixed IP in the router", "Volver al mapa": "Back to the map", "Abrir su página": "Open its page",
    "Aplicaciones que más usa, consumo y actividad": "Top apps, usage and activity", "Estado": "Status", "Red": "Network",
    "Dirección IP": "IP address", "MAC": "MAC", "Fabricante": "Manufacturer", "Modelo": "Model", "Nombre en la red": "Network name",
    "Velocidad del enlace": "Link speed", "Tráfico ahora": "Traffic now", "Bajado en la sesión": "Downloaded this session",
    "Desde que conectó": "Since connected", "Conectado hace": "Connected for", "Conectada hace": "Connected for", "Estándar": "Standard",
    "Primera vez": "First seen", "Primera vez en la red": "First seen on the network", "Nombre y tipo": "Name and type", "Guardar": "Save",
    "Ponerle también este nombre en el router": "Also set this name in the router", "Expulsar": "Kick",
    "Lo desconecta; vuelve a entrar solo. Sirve para que cambie de banda.": "Disconnects it; it reconnects by itself. Useful to make it switch bands.",
    "Bloquear": "Block", "Bloqueado": "Blocked", "Fijar": "Pin", "Quitar": "Remove", "Añadir IP fija": "Add fixed IP", "IP fija": "Fixed IP",
    "fija": "fixed", "Reservada: siempre recibirá #.": "Reserved: it will always get #.", "Icono": "Icon", "Tipo de equipo": "Device type",
    "Tipo de dispositivo": "Device type", "Foto del modelo": "Model photo", "Buscar el modelo exacto": "Find the exact model",
    "Busca tu modelo: «iphone #», «echo dot», «tapo»…": "Search your model: «iphone #», «echo dot», «tapo»…",
    "Ver el catálogo entero · más de # modelos": "See the full catalog · more than # models", "Tu imagen": "Your image",
    "Una foto o un logo tuyo (se recorta en cuadrado)": "A photo or logo of your own (cropped square)",
    "Que lo decida el panel por el nombre y el fabricante": "Let the app decide by name and manufacturer", "Sin nombre": "No name",
    "Ficha del dispositivo": "Device details", "Nombre del dispositivo": "Device name", "Historial": "History", "Línea de tiempo": "Timeline",
    "cuándo ha estado conectado, por dónde y con qué señal": "when it was connected, how and with what signal",
    "Nada apuntado sobre este equipo todavía. Aquí salen sus entradas y salidas de la red y lo que se le cambie en el router.": "Nothing logged for this device yet. Its joins, leaves and router changes will show up here.",
    "Consumo de datos": "Data usage", "Reparto del consumo": "Usage breakdown", "Aplicaciones": "Applications", "Sitios": "Sites",
    "Categorías": "Categories", "Aplicaciones y sitios más usados": "Most used apps and sites", "a dónde habla": "where it talks to",
    "Actividad en directo": "Live activity", "Conexiones en directo": "Live connections", "Ahora mismo no mueve datos hacia Internet.": "It's not sending data to the Internet right now.",
    "Periodo": "Period", "del periodo": "for the period", "por horas": "by hour", "por días": "by day", "por dominio": "by domain",
    "Últimas # horas": "Last # hours", "Últimos # días": "Last # days", "los últimos # días": "the last # days",
    "Últimas # horas · solo lo que sale a Internet": "Last # hours · Internet traffic only", "Últimos # días · solo lo que sale a Internet": "Last # days · Internet traffic only",
    "última hora · hacia Internet": "last hour · to the Internet", "últimos # min": "last # min", "Pico de la hora": "Peak of the hour",
    "Consumo · #D": "Usage · #D", "Consumo · #M": "Usage · #M", "Web de este equipo": "This device's web", "Web sin identificar": "Unidentified web",
    "Web y búsquedas · ahora": "Web and searches · now", "Dirección privada": "Private address", "sitio web": "website",
    "Llamadas y vídeo (STUN)": "Calls and video (STUN)", "Descargas y actualizaciones de Google": "Google downloads and updates",
    "señal y experiencia": "signal and experience", "Calidad": "Quality", "Experiencia": "Experience", "Experiencia # %": "Experience # %",
    "excelente": "excellent", "buena": "good", "regular": "fair", "débil": "weak", "floja": "weak", "Excelente: #": "Excellent: #",
    "Buena: #": "Good: #", "Regular: #": "Fair: #", "Débil: #": "Weak: #", "Cable: #": "Wired: #", "Con señal débil:": "Weak signal:",
    "Con señal débil": "Weak signal", "No hay nadie conectado por wifi.": "Nobody is connected over WiFi.",
    "El aparato": "The device", "del equipo": "of the device", "Equipo wifi": "WiFi device", "Equipo por cable": "Wired device",
    "Conexión wifi": "WiFi connection", "Dónde": "Where", "Dónde estás": "Where you are", "Visto": "Seen", "visto hace # días": "seen # days ago",
    "Recibido": "Received", "Enviado": "Sent", "Recibido en esta sesión": "Received this session", "Enviado en esta sesión": "Sent this session",
    "Sistema": "System", "Salida a Internet": "Exit node", "Quién entra por la VPN se gestiona en": "Who can use the VPN is managed in",
    "Ajustes → VPN": "Settings → VPN", "Ajustes → WiFi": "Settings → WiFi", "Ajustes → Gestor de puertos": "Settings → Port manager",

    // ---- mapa
    "Mapa": "Map", "Topología de la red": "Network topology", "Orientación del mapa": "Map orientation", "En vertical": "Vertical",
    "En horizontal": "Horizontal", "En vertical: de arriba abajo": "Vertical: top to bottom", "En horizontal: de izquierda a derecha": "Horizontal: left to right",
    "Que quepa todo": "Fit everything", "Acercar": "Zoom in", "Alejar": "Zoom out", "Pantalla completa": "Full screen",
    "Plegar o desplegar el menú del mapa": "Collapse or expand the map menu", "Mostrar u ocultar todos los equipos": "Show or hide all devices",
    "Resaltar la selección": "Highlight selection", "Encendido: lo que no coincide se atenúa. Apagado: desaparece del mapa": "On: non-matching items are dimmed. Off: they disappear from the map",
    "Tráfico": "Traffic", "Las partículas y el color de cada enlace según lo que baja y sube": "Particles and link color by download and upload",
    "arrastra para moverte · Ctrl + rueda para ampliar": "drag to move · Ctrl + wheel to zoom", "y gira la rueda para ampliar": "and turn the wheel to zoom",
    "Mantén pulsado": "Hold", "Filtrar…": "Filter…", "Filtrado": "Filtered", "Bandas": "Bands", "Banda": "Band", "Invitados": "Guests",
    "Casa": "Home", "Red de casa": "Home network", "# equipo · canal #": "# device · channel #", "# equipos · canal #": "# devices · channel #",
    "# equipos": "# devices", "# equipos · detrás de un switch": "# devices · behind a switch", "# de # conectados": "# of # connected",
    "# de # con cable": "# of # wired", "# de # equipos en línea": "# of # devices online", "# de #": "# of #",
    "mucho tráfico": "a lot of traffic", "poco": "little", "La red": "The network", "Elegir redes": "Choose networks",
    "Tráfico de red de los últimos minutos": "Network traffic over the last minutes",

    // ---- tipos de equipo
    "Domótica": "Smart home", "Altavoz": "Speaker", "Altavoces": "Speakers", "Ordenador": "Computer", "Ordenadores": "Computers",
    "Móvil": "Phone", "Móviles y tabletas": "Phones and tablets", "Tablet": "Tablet", "Portátil": "Laptop", "Tele y multimedia": "TV and media",
    "Tele y vídeo": "TV and video", "Iluminación": "Lighting", "Consola": "Console", "Consolas": "Consoles", "Servidor": "Server", "servidor": "server",
    "Cámara": "Camera", "Cámara o timbre": "Camera or doorbell", "Timbre": "Doorbell", "Impresora": "Printer", "Enchufe": "Plug",
    "Bombilla": "Bulb", "Tira de luz": "Light strip", "Termostato": "Thermostat", "Aspirador": "Vacuum", "Purificador": "Purifier",
    "Coche": "Car", "Punto wifi": "Access point", "Electrónica y red": "Electronics and network", "Sin clasificar": "Unclassified",
    "Mando IR": "IR remote", "Tele LG": "LG TV", "Tele Samsung": "Samsung TV", "Tele Sony": "Sony TV", "Echo Dot oscuro": "Echo Dot (dark)",
    "Hub Aqara": "Aqara hub", "Puente Hue": "Hue bridge", "Aire": "Air conditioner", "Fabricantes": "Manufacturers",

    // ---- Dispositivos, router
    "Nombre": "Name", "Firmware": "Firmware", "Clientes": "Clients", "Sin respuesta": "No response", "Detalles": "Details",
    "Procesador": "Processor", "Núcleo": "Kernel", "Núcleo · plataforma": "Kernel · platform", "Compilado el": "Built on",
    "Almacenamiento": "Storage", "# % usada": "# % used", "# % usado": "# % used", "# MB de # MB": "# MB of # MB", "Procesos": "Processes",
    "Servicios en marcha": "Running services", "Aceleración del tráfico": "Traffic acceleration", "Aceleración por hardware": "Hardware acceleration",
    "activada": "on", "activado": "on", "activo": "active", "Activo": "Active", "apagado": "off", "En marcha": "Running", "en marcha": "running",
    "Registro del router": "Router log", "Reiniciar el router": "Restart the router", "Abrir LuCI": "Open LuCI",
    "Copias de la configuración": "Configuration backups", "para volver atrás si algo se rompe": "to go back if something breaks",
    "Copiar ahora": "Back up now", "# copias guardadas": "# backups saved",
    "se mira cada # horas y se guarda una nueva solo si algo ha cambiado": "checked every # hours; a new one is saved only if something changed",
    "última comprobación hace # h": "last checked # h ago", "primera copia": "first backup", "# ficheros": "# files", "automática": "automatic",
    "copia guardada": "backup saved", "# líneas nuevas, # quitadas": "# lines added, # removed", "Encendido · memoria": "Uptime · memory",
    "Reiniciar deja la casa sin Internet ni wifi un par de minutos. Hay OpenWrt #: se actualiza desde LuCI (Attended Sysupgrade); después hay que reinstalar": "Restarting leaves the house without Internet or WiFi for a couple of minutes. OpenWrt # is available: update it from LuCI (Attended Sysupgrade); afterwards you need to reinstall",
    "para el tráfico por puerto.": "for per-port traffic.",

    // ---- Puertos y Radios
    "Puertos del router": "Router ports", "Puerto": "Port", "Velocidad": "Speed", "Entra ahora": "In now", "Sale ahora": "Out now",
    "Errores": "Errors", "Descartes": "Drops", "Sin cable": "No cable", "WAN · Internet": "WAN · Internet", "Internet": "Internet",
    "dúplex completo": "full duplex", "medio dúplex": "half duplex", "desde que arrancó": "since boot", "Tráfico desde que arrancó": "Traffic since boot",
    "Qué red (VLAN) va por cada boca se cambia en": "Which network (VLAN) goes on each port is changed in", "Tráfico del puente": "Bridge traffic",
    "Paquetes descartados · errores": "Dropped packets · errors", "clientes": "clients", "Canal": "Channel", "canal #": "channel #",
    "Ancho": "Width", "Potencia": "Power", "Ruido": "Noise", "ruido -#": "noise -#", "automático": "automatic", "auto": "auto", "Auto": "Auto",
    "Wifi (SSID)": "WiFi (SSID)", "Seguridad": "Security", "Velocidad máx.": "Max. speed", "Uso del canal": "Channel utilization",
    "envía": "sends", "recibe": "receives", "otras redes": "other networks", "Envía # %": "Sends # %", "recibe # %": "receives # %",
    "otras redes e interferencias # %": "other networks and interference # %", "máxima": "max", "Ruido del canal": "Channel noise",
    "Potencia de emisión": "Transmit power", "MAC de la radio": "Radio MAC",
    "Los canales, el ancho y la potencia se cambian en": "Channels, width and power are changed in",
    "canal, ancho y potencia de cada banda": "channel, width and power of each band",

    // ---- Flujos
    "Por el mundo": "Around the world", "a qué países va el tráfico de casa · en directo": "which countries the home traffic goes to · live",
    "Países": "Countries", "País": "Country", "# país": "# country", "Fuera de España": "Outside Spain", "Hablando ahora con": "Talking now with",
    "# países": "# countries", "Países según": "Countries according to", "Mapa del mundo con el tráfico por países": "World map with traffic by country",
    "las redes de reparto (CDN) cuentan donde tienen registrada la dirección, no donde está el servidor": "delivery networks (CDN) count where the address is registered, not where the server is",
    "Tráfico por el mundo": "Traffic around the world", "las que más mueven": "the busiest", "Lo que más pregunta": "Top queried",

    // ---- Registro y alarmas
    "Todo": "All", "Cambios": "Changes", "Importantes": "Important", "Nada que contar con este filtro.": "Nothing to show with this filter.",
    "lo último apuntado": "latest entries", "lo último que ha pasado": "what happened lately",
    "se ha conectado": "connected", "se ha desconectado": "disconnected", "El router ha vuelto a conectar con Internet": "The router reconnected to the Internet",
    "El router volvió a conectar": "The router reconnected", "La configuración del router ha cambiado": "The router configuration changed",
    "Conexión a Internet cambiada": "Internet connection changed", "IP pública nueva": "New public IP", "Con IP pública nueva": "With a new public IP",
    "Red creada": "Network created", "Red cambiada": "Network changed", "Red borrada": "Network deleted", "Wifi creada": "WiFi created",
    "Wifi cambiada": "WiFi changed", "Wifi borrada": "WiFi deleted", "Radio cambiada": "Radio changed", "Puerto cambiado": "Port changed",
    "Ruta creada": "Route created", "Ruta borrado": "Route deleted", "Nombre DNS creado": "DNS record created", "Nombre DNS borrado": "DNS record deleted",
    "Reenvío de puertos creado": "Port forward created", "Reenvío de puertos borrado": "Port forward deleted",
    "Regla de tráfico creada": "Traffic rule created", "Regla de tráfico cambiada": "Traffic rule changed", "Regla de tráfico borrada": "Traffic rule deleted",
    "Regla del cortafuegos creada": "Firewall rule created", "Regla del cortafuegos borrado": "Firewall rule deleted",
    "Reserva de IP quitada": "IP reservation removed", "VPN: nodo de salida anunciado": "VPN: exit node advertised",
    "VPN: nodo de salida quitado": "VPN: exit node removed", "VPN: redes visibles desde fuera": "VPN: networks visible from outside",
    "Cortafuegos": "Firewall",

    // ---- Ajustes
    "Ajustes de red": "Network settings", "se aplican de verdad": "applied for real", "Ajustes de red · se aplican de verdad en el router": "Network settings · applied for real on the router",
    "se aplica de verdad": "applied for real", "pide la sesión de mantenimiento": "requires the maintenance session",
    "WiFi": "WiFi", "Nombres, contraseñas y radios": "Names, passwords and radios", "Redes": "Networks", "VLAN, direcciones y DHCP": "VLANs, addresses and DHCP",
    "IP fijas": "Fixed IPs", "Reservas del DHCP": "DHCP reservations", "Gestor de puertos": "Port manager", "Qué red va por cada boca": "Which network goes on each port",
    "La línea, IPv# y MTU": "The line, IPv# and MTU", "Tailscale: entrar desde fuera": "Tailscale: remote access", "CyberSecure": "CyberSecure",
    "Filtrado de contenido": "Content filtering", "Bloquear apps y webs, también por horas": "Block apps and websites, also on a schedule",
    "Motor de políticas": "Policy engine", "Cortafuegos por zonas": "Zone-based firewall", "Quién puede hablar con quién": "Who can talk to whom",
    "Reenvío de puertos": "Port forwarding", "Abrir puertos a Internet": "Open ports to the Internet", "Rutas": "Routes", "Rutas estáticas": "Static routes",
    "Registros DNS": "DNS records", "Nombres propios en casa": "Custom names at home", "Registro, servicios y reinicio": "Log, services and restart",
    "Crear wifi": "Create WiFi", "Crear red": "Create network", "Crear regla": "Create rule", "Crear ruta": "Create route", "Abrir un puerto": "Open a port",
    "Añadir nombre": "Add name", "Cambiar": "Change", "Cambiar…": "Change…", "Activar": "Enable", "QR": "QR", "Código QR para conectarse": "QR code to connect",
    "clientes aislados": "client isolation", "Redes wifi": "WiFi networks", "Redes (VLAN)": "Networks (VLAN)", "Redes de casa": "Home networks",
    "Una red": "One network", "Subred": "Subnet", "Reparto automático (DHCP)": "Automatic assignment (DHCP)", "Duración de cada concesión": "Lease time",
    "concesión #h": "lease #h", "Concesiones activas": "Active leases", "# equipos con IP repartida ahora": "# devices with an assigned IP now",
    "Dirección del router": "Router address", "DNS que reciben los equipos": "DNS given to devices", "DNS que usa el router": "DNS used by the router",
    "DNS del router": "Router DNS", "Filtro DNS": "DNS filter", "AdGuard, en el macmini": "AdGuard, on the Mac mini", "propios, no los de la operadora": "custom, not the ISP's",
    "aislada": "isolated", "Dentro: aislados": "Inside: isolated", "Dentro: libre": "Inside: open", "al router: sí": "to the router: yes",
    "al router: solo lo básico": "to the router: basics only", "sin VLAN": "no VLAN", "nativa": "native", "Nativa": "Native", "etiquetadas": "tagged",
    "Etiquetadas": "Tagged", "Etiquetas": "Tags", "Filtrado por VLAN": "VLAN filtering",
    "va sin etiquetar: es la que recibe cualquier equipo que enchufes. Las": "goes untagged: it's the one any device you plug in gets. The",
    "solo las ven los aparatos que entienden VLAN (un switch gestionable, un punto de acceso, un servidor con VLAN). El puerto del servidor no puede salir de la red de casa.": "are only seen by VLAN-aware devices (a managed switch, an access point, a server with VLANs). The server's port can't leave the home network.",
    "solo sale a Internet: no ve la red de casa ni el panel del router (como la de invitados). Para meterle equipos por cable, ve a": "only goes out to the Internet: it can't see the home network or the router panel (like the guest network). To add wired devices, go to",
    "; por wifi, crea una wifi en esa red.": "; for WiFi, create a WiFi on that network.",
    "IP fijas reservadas": "Reserved fixed IPs", "IP que se le reserva": "IP reserved for it", "IP del Mac mini": "Mac mini IP",
    "Interfaz · MTU": "Interface · MTU", "Modo IPv#": "IPv# mode", "Prefijo que da el operador": "Prefix from the ISP", "Cambiar IPv# o MTU": "Change IPv# or MTU",
    "PPPoE de la línea · no se toca desde aquí": "Line PPPoE · not changed from here", "Reconectar la línea": "Reconnect the line",
    "Cualquier cambio aquí reconecta el PPPoE: unos segundos sin Internet. Si la línea no vuelve a subir en un minuto, el router deshace el cambio solo.": "Any change here reconnects PPPoE: a few seconds without Internet. If the line doesn't come back within a minute, the router undoes the change by itself.",
    "PPPoE abierta hace # h # min": "PPPoE up for # h # min", "PPPoE sobre la VLAN # del puerto WAN": "PPPoE over VLAN # on the WAN port",
    "Por la interfaz wan#": "Through interface wan#", "IPv# solo por wan#": "IPv# only via wan#", "Puerta de enlace": "Gateway",
    "Internet de casa desde fuera": "Home Internet from outside", "Nodo de salida": "Exit node",
    "Con él activo, el móvil o el portátil pueden salir a Internet por tu casa (wifi públicas, contenidos solo de España…).": "With it on, your phone or laptop can go out to the Internet through your home (public WiFi, Spain-only content…).",
    "Red privada": "Private network", "Redes de casa visibles": "Home networks visible", "visible desde fuera": "visible from outside",
    "toda la red de Tailscale": "the whole Tailscale network", "desde fuera": "from outside", "Consola de Tailscale ↗": "Tailscale console ↗",
    "Lo que anuncies (una red o el nodo de salida) hay que": "Whatever you advertise (a network or the exit node) has to be",
    "aprobarlo": "approved",
    "después en la consola de Tailscale, salvo que tengas autoaprobación. «Relé» quiere decir que la conexión no es directa y pasa por un servidor de Tailscale (más lenta).": "afterwards in the Tailscale console, unless you have auto-approval. «Relay» means the connection isn't direct and goes through a Tailscale server (slower).",
    "Compartido": "Shared", "compartido": "shared", "Ofrece": "Offers",
    "Ninguna regla. Con una regla puedes bloquear apps (TikTok, juegos, redes…) o activar el filtrado familiar para un equipo o una red.": "No rules. With a rule you can block apps (TikTok, games, social networks…) or turn on family filtering for a device or a network.",
    "Reglas": "Rules", "familiar": "family", "# servicios": "# services", "Matriz de zonas": "Zone matrix", "De ↓ · A →": "From ↓ · To →",
    "fila = de dónde sale · columna = adónde va · pulsa para cambiar": "row = where it comes from · column = where it goes · click to change",
    "Permitido": "Allowed", "Permitida": "Allowed", "Permitida.": "Allowed.", "permitido": "allowed",
    "Aún no hay reglas tuyas. Las del sistema (DHCP, ping, IPv#…) están escondidas.": "You have no rules yet. System ones (DHCP, ping, IPv#…) are hidden.",
    "Ver las del sistema": "Show system rules", "# tuyas": "# yours", "# del sistema": "# system", "del sistema": "system",
    ". Las reglas de abajo pueden hacer excepciones.": ". The rules below can make exceptions.",
    "De Internet hacia dentro todo está cerrado salvo los": "From the Internet inward everything is closed except the",
    "reenvíos de puertos": "port forwards", "Acción": "Action", "Acciones": "Actions", "Protocolo": "Protocol", "Destino": "Destination",
    "De": "From", "Va a": "Goes to", "Por": "Via", "Puerto de fuera": "External port", "Acceso": "Access", "Acceso remoto": "Remote access",
    "Cada puerto abierto es una puerta desde Internet hasta ese equipo. Los que crees aquí no saltan como alarma en Seguridad; los que aparezcan por otro lado, sí.": "Each open port is a door from the Internet to that device. The ones you create here don't raise alarms in Security; ones that appear any other way do.",
    "abierto": "open", "Sin rutas estáticas: todo sale por Internet o por las redes de casa.": "No static routes: everything goes out through the Internet or the home networks.",
    "Sirven para llegar a redes que están detrás de otro equipo de casa (una VPN en un servidor, otro router…).": "They're used to reach networks behind another device at home (a VPN on a server, another router…).",
    "Métrica": "Metric", "Apunta a": "Points to", "solo nombre": "name only",
    "Los resuelve el router para toda la casa (también los equipos que preguntan a AdGuard, que le pregunta a él por lo local). Los «del sistema» son los de la tienda, que apuntan al servidor sin pasar por Internet.": "The router resolves them for the whole house (also for devices that ask AdGuard, which asks the router for local names). The «system» ones belong to the store and point to the server without going through the Internet.",
    ", por DNS: funcionan con los equipos que le preguntan a él directamente (los de la red de casa por IPv#). Lo que pregunta por el router (IPv#, redes aisladas) le llega como si fuera el router y la regla no lo alcanza. Para que no se escape, ponle IP fija al equipo.": ", via DNS: they work for devices that ask it directly (home network devices over IPv#). Whatever asks through the router (IPv#, isolated networks) reaches it as the router and the rule can't match it. To avoid leaks, give the device a fixed IP.",
    "Cambiar una radio o una wifi reinicia esa emisión: los equipos conectados se caen unos segundos y vuelven solos.": "Changing a radio or a WiFi restarts that broadcast: connected devices drop for a few seconds and come back by themselves.",
    "Se aplican en": "Applied on", "elegido solo": "chosen automatically", "la de siempre (#)": "the usual one (#)", "ninguna": "none",
    "Caduca en": "Expires in", "Equipos conectados": "Connected devices", "Equipos sin salida a Internet": "Devices without Internet access",
    "redes y VLAN, wifi, puertos, cortafuegos…": "networks and VLANs, WiFi, ports, firewall…", "pruebas de velocidad · tope # Mbps": "speed tests · cap # Mbps",
    "Pruebas de velocidad del periodo": "Speed tests for the period", "Lo que tarda en contestar Internet": "How long the Internet takes to respond",
    "# ms en contestar": "# ms to respond", "sin fallos": "no failures", "Consultas": "Queries", "Bloquear apps": "Block apps",
    "Hay #": "There are #", "hay #": "there are #",
    "↑ # GB desde que arrancó": "↑ # GB since boot", "↑ # MB desde que arrancó": "↑ # MB since boot", "↑ # kB desde que arrancó": "↑ # kB since boot",
    "#/# por #": "#/# via #", "En el router": "On the router", "Línea": "Line", "Tráfico de Internet": "Internet traffic",
    "cómo se ve en el mapa y en la lista": "how it looks on the map and in the list", "sin Internet": "no Internet",
    "Comprobación de conexión": "Connectivity check", "ancho": "width",
    "Ampliar el menú": "Expand menu", "Plegar el menú": "Collapse menu", "Ampliar o plegar el menú": "Expand or collapse menu",

    // ---- tiempo
    "ahora": "now", "hace # min": "# min ago", "hace # h": "# h ago", "hace # días": "# days ago", "hace # día": "# day ago",
    "hace # meses": "# months ago", "nunca": "never", "visto hace # min": "seen # min ago", "visto hace # h": "seen # h ago",
    "desconectado": "offline", "desconectada": "offline", "conectado": "connected", "ayer": "yesterday", "hoy": "today",

    // ---- países (Flujos)
    "España": "Spain", "Estados Unidos": "United States", "Alemania": "Germany", "Francia": "France", "Reino Unido": "United Kingdom",
    "Países Bajos": "Netherlands", "Irlanda": "Ireland", "Italia": "Italy", "Portugal": "Portugal", "Bélgica": "Belgium", "Suiza": "Switzerland",
    "Suecia": "Sweden", "Noruega": "Norway", "Dinamarca": "Denmark", "Finlandia": "Finland", "Polonia": "Poland", "Austria": "Austria",
    "República Checa": "Czech Republic", "Hungría": "Hungary", "Rumanía": "Romania", "Bulgaria": "Bulgaria", "Grecia": "Greece",
    "Turquía": "Turkey", "Rusia": "Russia", "Ucrania": "Ukraine", "Bielorrusia": "Belarus", "Canadá": "Canada", "México": "Mexico",
    "Brasil": "Brazil", "Argentina": "Argentina", "Chile": "Chile", "Perú": "Peru", "Colombia": "Colombia", "Japón": "Japan", "China": "China",
    "India": "India", "Singapur": "Singapore", "Australia": "Australia", "Nueva Zelanda": "New Zealand", "Sudáfrica": "South Africa",
    "Israel": "Israel", "República de Corea": "South Korea", "República Popular Democrática de Corea": "North Korea", "Taiwán": "Taiwan",
    "Tailandia": "Thailand", "Filipinas": "Philippines", "Malasia": "Malaysia", "Indonesia": "Indonesia", "Vietnam": "Vietnam",
    "Marruecos": "Morocco", "Argelia": "Algeria", "Túnez": "Tunisia", "Egipto": "Egypt", "Arabia Saudita": "Saudi Arabia",
    "Emiratos Árabes Unidos": "United Arab Emirates", "Catar": "Qatar", "Irán": "Iran", "Iraq": "Iraq", "Jordania": "Jordan", "Líbano": "Lebanon",
    "República Árabe Siria": "Syria", "Kazajistán": "Kazakhstan", "Uzbekistán": "Uzbekistan", "Kirguistán": "Kyrgyzstan", "Tayikistán": "Tajikistan",
    "Turkmenistán": "Turkmenistan", "Azerbaiyán": "Azerbaijan", "Pakistán": "Pakistan", "Bután": "Bhutan", "Camboya": "Cambodia",
    "República Democrática Popular de Lao": "Laos", "Croacia": "Croatia", "Eslovaquia": "Slovakia", "Eslovenia": "Slovenia", "Estonia": "Estonia",
    "Letonia": "Latvia", "Lituania": "Lithuania", "Luxemburgo": "Luxembourg", "Islandia": "Iceland", "Chipre": "Cyprus", "Moldavia": "Moldova",
    "Macedonia del Norte": "North Macedonia", "Bosnia y Herzegovina": "Bosnia and Herzegovina", "Serbia": "Serbia", "Montenegro": "Montenegro",
    "Albania": "Albania", "Groenlandia": "Greenland", "Afganistán": "Afghanistan", "Etiopía": "Ethiopia", "Kenia": "Kenya", "Camerún": "Cameroon",
    "Gabón": "Gabon", "Níger": "Niger", "Malí": "Mali", "Sudán": "Sudan", "Sudán del Sur": "South Sudan", "Libia": "Libya", "Ruanda": "Rwanda",
    "Malaui": "Malawi", "Zimbabue": "Zimbabwe", "Lesoto": "Lesotho", "Yibuti": "Djibouti", "Costa de Marfil": "Ivory Coast", "Guinea Ecuatorial": "Equatorial Guinea",
    "Sierra Leona": "Sierra Leone", "República Centroafricana": "Central African Republic", "Congo (República Democrática del)": "DR Congo",
    "Sahara Occidental": "Western Sahara", "Esuatini": "Eswatini", "Haití": "Haiti", "Panamá": "Panama", "República Dominicana": "Dominican Republic",
    "Trinidad y Tobago": "Trinidad and Tobago", "Belice": "Belize", "Papua Nueva Guinea": "Papua New Guinea", "Nueva Caledonia": "New Caledonia",
    "Islas Salomón": "Solomon Islands", "Islas Malvinas": "Falkland Islands", "Tierras Australes Francesas": "French Southern Territories",
    "Omán": "Oman", "Mongolia": "Mongolia", "Palestina": "Palestine", "Brunei Darussalam": "Brunei"
  };

  var DIA = { lun: "Mon", mar: "Tue", "mié": "Wed", jue: "Thu", vie: "Fri", "sáb": "Sat", dom: "Sun" };
  var DIAL = { lunes: "Monday", martes: "Tuesday", "miércoles": "Wednesday", jueves: "Thursday", viernes: "Friday", "sábado": "Saturday", domingo: "Sunday" };
  var MES = { ene: "Jan", feb: "Feb", mar: "Mar", abr: "Apr", may: "May", jun: "Jun", jul: "Jul", ago: "Aug", sept: "Sep", sep: "Sep", oct: "Oct", nov: "Nov", dic: "Dec" };
  var MESL = { enero: "January", febrero: "February", marzo: "March", abril: "April", mayo: "May", junio: "June", julio: "July", agosto: "August",
    septiembre: "September", octubre: "October", noviembre: "November", diciembre: "December" };
  var RE_NUM = /\d+(?:[.,:]\d+)*/g;

  function fechas(s) {
    return s
      .replace(/\b(lun|mar|mié|jue|vie|sáb|dom), (\d{1,2}) (ene|feb|mar|abr|may|jun|jul|ago|sept|sep|oct|nov|dic)\b/g, function (m, d, n, me) { return DIA[d] + " " + n + " " + MES[me]; })
      .replace(/\b(lunes|martes|miércoles|jueves|viernes|sábado|domingo), (\d{1,2}) de (\w+)/g, function (m, d, n, me) { return DIAL[d] + ", " + n + " " + (MESL[me] || me); })
      .replace(/\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)( de (\d{4}))?/g, function (m, n, me, x, a) { return n + " " + MESL[me] + (a ? " " + a : ""); })
      .replace(/\bdesde el (\d)/g, "since $1")
      .replace(/^(lunes|martes|miércoles|jueves|viernes|sábado|domingo)$/, function (d) { return DIAL[d]; });
  }
  // un trozo: entero en el diccionario (con sus números)
  function uno(c) {
    var nums = [], k = c.replace(RE_NUM, function (n) { nums.push(n); return "#"; });
    var t = EN[k];
    if (t == null) {
      var se = / (se ha (des)?conectado)$/.exec(c);      // «<equipo> se ha conectado»
      return se ? c.slice(0, se.index) + " " + EN[se[1]] : null;
    }
    var i = 0;
    return t.replace(/#/g, function () { return i < nums.length ? nums[i++] : "#"; });
  }
  function frase(c) {
    // «· automática»: el separador va delante del texto
    var pre = /^([·→—,;.]\s+)(.+)$/.exec(c);
    if (pre) { var r = frase(pre[2]); return r == null ? null : pre[1] + r; }
    var t = uno(c);
    if (t != null) return t;
    var f = fechas(c);
    if (f !== c) { t = uno(f); return t != null ? t : partes(f) || f; }
    return partes(c);
  }
  function partes(c) {
    var seps = [" · ", " → ", ": "];
    for (var i = 0; i < seps.length; i++) {
      if (c.indexOf(seps[i]) < 0) continue;
      var cambio = false, p = c.split(seps[i]).map(function (x) { var t = frase(x); if (t != null && t !== x) { cambio = true; return t; } return x; });
      if (cambio) return p.join(seps[i]);
    }
    return null;
  }
  var hecho = new WeakMap();
  function traducir(s) {
    if (!s || !/[a-záéíóúñ]{2}/i.test(s)) return s;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), c = m[2].replace(/\s+/g, " ");
    var t = frase(c);
    return t == null || t === c ? s : m[1] + t + m[3];
  }
  window.CL_TR = traducir;

  var ATR = ["title", "placeholder", "aria-label"];
  function texto(n) {
    if (hecho.get(n) === n.nodeValue) return;
    var p = n.parentNode;
    if (p && (p.nodeName === "SCRIPT" || p.nodeName === "STYLE" || p.nodeName === "TEXTAREA")) return;
    var t = traducir(n.nodeValue);
    if (t !== n.nodeValue) n.nodeValue = t;
    hecho.set(n, n.nodeValue);
  }
  function atributos(e) {
    for (var i = 0; i < ATR.length; i++) {
      var v = e.getAttribute(ATR[i]);
      if (v) { var t = traducir(v); if (t !== v) e.setAttribute(ATR[i], t); }
    }
  }
  function recorrer(n) {
    if (n.nodeType === 3) return texto(n);
    if (n.nodeType !== 1) return;
    atributos(n);
    var w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), x;
    while ((x = w.nextNode())) { if (x.nodeType === 3) texto(x); else atributos(x); }
  }
  function arrancar() {
    recorrer(document.body);
    if (document.title) document.title = traducir(document.title);
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (m.type === "characterData") texto(m.target);
        else if (m.type === "attributes") { var v = m.target.getAttribute(m.attributeName), t = traducir(v); if (t !== v) m.target.setAttribute(m.attributeName, t); }
        else for (var j = 0; j < m.addedNodes.length; j++) recorrer(m.addedNodes[j]);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATR });
    var tit = document.querySelector("title");
    if (tit) new MutationObserver(function () { var t = traducir(document.title); if (t !== document.title) document.title = t; }).observe(tit, { childList: true, characterData: true, subtree: true });
  }
  if (document.body) arrancar(); else document.addEventListener("DOMContentLoaded", arrancar);
})();
