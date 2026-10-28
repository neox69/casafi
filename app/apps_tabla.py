# =============================================================================
# centinela · de qué aplicación es cada dominio (09-10-2026).
#
# El router no mira dentro de los paquetes (no hay inspección profunda como en
# UniFi): se sabe a qué servidor habla cada equipo y, por el registro de
# AdGuard, qué nombre pidió para llegar a él. Esta tabla pone nombre de
# aplicación a esos dominios. Cada fila:
#
#   (nombre, categoría, nombre del icono en la tabla de UniFi o "", dominios)
#
# Gana siempre el dominio más largo que case («drive.google.com» antes que
# «google.com»). Lo que no está aquí sale con su propio dominio.
# =============================================================================

CATS = {
    "video": "Vídeo y música", "social": "Redes sociales", "mensajes": "Mensajería", "juegos": "Juegos",
    "web": "Web y búsquedas", "nube": "Nube y archivos", "trabajo": "Trabajo y desarrollo", "ia": "Inteligencia artificial",
    "compras": "Compras", "hogar": "Hogar conectado", "sistema": "Sistema y actualizaciones", "cdn": "Nubes y redes de contenido",
    "publi": "Publicidad y medición", "p2p": "Descargas P2P", "red": "Servicios de red", "adultos": "Adultos",
    "servidor": "Visitas a este equipo", "otros": "Sin identificar",
}

APPS = [
    # ---- vídeo y música
    ("YouTube", "video", "YouTube", "youtube.com googlevideo.com ytimg.com youtu.be youtube-nocookie.com youtubei.googleapis.com youtube.googleapis.com ggpht.com youtubekids.com youtube-ui.l.google.com"),
    ("Netflix", "video", "Netflix", "netflix.com nflxvideo.net nflximg.net nflximg.com nflxext.com nflxso.net netflix.net"),
    ("Prime Video", "video", "Amazon Video", "primevideo.com aiv-cdn.net aiv-delivery.net amazonvideo.com pv-cdn.net atv-ps.amazon.com atv-ext.amazon.com atv-ext-eu.amazon.com atv-ps-eu.amazon.com"),
    ("Disney+", "video", "Disney+", "disneyplus.com disney-plus.net dssott.com bamgrid.com disneystreaming.com dssedge.com"),
    ("HBO Max", "video", "HBO Max", "max.com hbomax.com hbo.com discomax.com hbomaxcdn.com"),
    ("Apple TV+", "video", "Apple TV+", "tv.apple.com play-edge.itunes.apple.com hls.itunes.apple.com"),
    ("Twitch", "video", "Twitch", "twitch.tv ttvnw.net jtvnw.net twitchcdn.net twitchsvc.net live-video.net"),
    ("Kick", "video", "", "kick.com"),
    ("Spotify", "video", "Spotify", "spotify.com scdn.co spotifycdn.com spotifycdn.net spotify.map.fastly.net pscdn.co"),
    ("Apple Music", "video", "Apple Music", "music.apple.com audio-ssl.itunes.apple.com aod.itunes.apple.com streamingaudio.itunes.apple.com aod-ssl.itunes.apple.com"),
    ("SoundCloud", "video", "SoundCloud", "soundcloud.com sndcdn.com soundcloud.cloud"),
    ("Bandcamp", "video", "", "bandcamp.com bcbits.com"),
    ("Beatport", "video", "", "beatport.com beatportcdn.com"),
    ("Mixcloud", "video", "", "mixcloud.com"),
    ("Deezer", "video", "Deezer", "deezer.com dzcdn.net"),
    ("Shazam", "video", "Shazam", "shazam.com"),
    ("Vimeo", "video", "Vimeo", "vimeo.com vimeocdn.com"),
    ("Dailymotion", "video", "Dailymotion", "dailymotion.com dmcdn.net"),
    ("Crunchyroll", "video", "Crunchyroll", "crunchyroll.com vrv.co"),
    ("Plex", "video", "Plex.tv", "plex.tv plex.direct plexapp.com"),
    ("Kodi", "video", "Kodi", "kodi.tv xbmc.org"),
    ("Carátulas y fichas de películas", "video", "", "themoviedb.org tmdb.org thetvdb.com fanart.tv opensubtitles.org opensubtitles.com imdb.com omdbapi.com"),
    ("Filmin", "video", "Filmin", "filmin.es"),
    ("DAZN", "video", "", "dazn.com dazndn.com indazn.com"),
    ("Movistar Plus+", "video", "", "movistarplus.es"),
    ("RTVE Play", "video", "", "rtve.es"),
    ("Atresplayer", "video", "", "atresplayer.com atresmedia.com"),
    ("Mitele", "video", "", "mitele.es mediaset.es"),
    ("Rakuten TV", "video", "", "rakuten.tv"),
    ("Pluto TV", "video", "", "pluto.tv"),
    # ---- redes sociales
    ("TikTok", "social", "TikTok", "tiktok.com tiktokcdn.com tiktokv.com tiktokcdn-eu.com tiktokv.eu tiktokcdn-us.com byteoversea.com ibytedtos.com musical.ly ttwstatic.com bytefcdn-oversea.com ibyteimg.com tiktokw.eu tiktokrow-cdn.com"),
    ("Instagram", "social", "Instagram", "instagram.com cdninstagram.com ig.me igcdn.com"),
    ("Facebook", "social", "Facebook", "facebook.com fbcdn.net fb.com facebook.net fbsbx.com fb.me meta.com"),
    ("Threads", "social", "Threads", "threads.net threads.com"),
    ("X", "social", "X", "twitter.com x.com twimg.com t.co"),
    ("Reddit", "social", "Sync for Reddit Pro", "reddit.com redd.it redditstatic.com redditmedia.com"),
    ("Snapchat", "social", "Snapchat", "snapchat.com sc-cdn.net snap-dev.net snapkit.com"),
    ("Pinterest", "social", "Pinterest", "pinterest.com pinterest.es pinimg.com"),
    ("LinkedIn", "social", "LinkedIn", "linkedin.com licdn.com"),
    ("Tumblr", "social", "Tumblr", "tumblr.com"),
    ("Tinder", "social", "Tinder", "tinder.com gotinder.com tindersparks.com"),
    # ---- mensajería
    ("WhatsApp", "mensajes", "WhatsApp", "whatsapp.com whatsapp.net wa.me"),
    ("Telegram", "mensajes", "Telegram", "telegram.org t.me telegram.me tdesktop.com telesco.pe telegram-cdn.org"),
    ("Messenger", "mensajes", "Facebook Messenger", "messenger.com m.me"),
    ("Discord", "mensajes", "Discord", "discord.com discordapp.com discord.gg discordapp.net discord.media"),
    ("Signal", "mensajes", "", "signal.org whispersystems.org"),
    ("Skype", "mensajes", "Skype", "skype.com skypeassets.com"),
    ("Slack", "mensajes", "Slack", "slack.com slack-edge.com slack-imgs.com slackb.com"),
    ("Zoom", "mensajes", "Zoom", "zoom.us zoom.com zoomgov.com"),
    ("Microsoft Teams", "mensajes", "Microsoft Teams", "teams.microsoft.com teams.live.com teams.cdn.office.net"),
    # ---- juegos
    ("Steam", "juegos", "Valve Steam", "steampowered.com steamcommunity.com steamstatic.com steamcontent.com steamusercontent.com steamserver.net valvesoftware.com steam-chat.com steamgames.com steamcdn-a.akamaihd.net steamdeck.com"),
    ("PlayStation", "juegos", "Sony PlayStation", "playstation.com playstation.net sonyentertainmentnetwork.com sie-rd.com playstation.org"),
    ("Xbox", "juegos", "XBOX", "xbox.com xboxlive.com xboxservices.com gamepass.com xboxab.com"),
    ("Nintendo", "juegos", "Nintendo", "nintendo.com nintendo.net nintendoswitch.com nintendo.es"),
    ("Epic Games", "juegos", "Fortnite", "epicgames.com epicgames.dev unrealengine.com fortnite.com epicgamescdn.com"),
    ("Battle.net", "juegos", "Battle.net", "battle.net blizzard.com blzstatic.com"),
    ("EA", "juegos", "Origin", "ea.com origin.com tnt-ea.com"),
    ("Ubisoft", "juegos", "Ubisoft", "ubisoft.com ubi.com uplay.com"),
    ("Rockstar Games", "juegos", "Rockstar Games", "rockstargames.com"),
    ("Riot Games", "juegos", "", "riotgames.com leagueoflegends.com riotcdn.net pvp.net"),
    ("Roblox", "juegos", "Roblox Game", "roblox.com rbxcdn.com"),
    ("Minecraft", "juegos", "Minecraft", "minecraft.net mojang.com minecraftservices.com"),
    ("Nvidia", "juegos", "", "nvidia.com geforce.com nvidiagrid.net geforcenow.com"),
    ("SteamGridDB", "juegos", "", "steamgriddb.com"),
    ("GOG", "juegos", "", "gog.com gog-statics.com"),
    # ---- web y búsquedas
    ("Google", "web", "Google", "google.com google.es gstatic.com googleusercontent.com googleapis.com google.net 1e100.net googlehosted.com withgoogle.com google"),
    ("Google Maps", "web", "Google Earth", "maps.google.com maps.googleapis.com maps.gstatic.com"),
    ("Bing", "web", "Bing.com", "bing.com bing.net"),
    ("DuckDuckGo", "web", "", "duckduckgo.com duck.com"),
    ("Yahoo", "web", "Yahoo", "yahoo.com yimg.com yahoo.net"),
    ("Wikipedia", "web", "Wikipedia", "wikipedia.org wikimedia.org"),
    ("Firefox", "web", "", "mozilla.org mozilla.com mozilla.net firefox.com"),
    ("Brave", "web", "", "brave.com bravesoftware.com"),
    ("Imgur", "web", "Imgur", "imgur.com"),
    ("Giphy", "web", "Giphy", "giphy.com"),
    ("Tenor", "web", "Tenor", "tenor.com"),
    # ---- nube y archivos
    ("iCloud", "nube", "iCloud", "icloud.com icloud-content.com apple-cloudkit.com me.com"),
    ("Google Drive", "nube", "Google Drive", "drive.google.com docs.google.com drive.usercontent.google.com drivefrontend-pa.googleapis.com"),
    ("Google Fotos", "nube", "Google", "photos.google.com photos.googleapis.com photoslibrary.googleapis.com"),
    ("OneDrive", "nube", "OneDrive", "onedrive.com onedrive.live.com 1drv.com 1drv.ms storage.live.com"),
    ("Dropbox", "nube", "Dropbox", "dropbox.com dropboxapi.com dropboxstatic.com dropboxusercontent.com"),
    ("Mega", "nube", "", "mega.nz mega.co.nz mega.io"),
    # ---- trabajo y desarrollo
    ("Gmail", "trabajo", "Gmail", "mail.google.com gmail.com googlemail.com"),
    ("Microsoft 365", "trabajo", "Microsoft Office 365", "office.com office365.com office.net sharepoint.com outlook.com outlook.office.com onenote.com officeapps.live.com"),
    ("GitHub", "trabajo", "GitHub", "github.com githubusercontent.com github.io githubassets.com ghcr.io"),
    ("Docker", "trabajo", "Docker", "docker.com docker.io"),
    ("Paquetes de desarrollo", "trabajo", "", "npmjs.org npmjs.com pypi.org pythonhosted.org crates.io rubygems.org yarnpkg.com"),
    ("WordPress", "trabajo", "WordPress", "wordpress.com wordpress.org wp.com w.org gravatar.com"),
    ("Adobe", "trabajo", "Adobe.com", "adobe.com adobe.io adobelogin.com adobecc.com typekit.net adobess.com"),
    ("Notion", "trabajo", "", "notion.so notion.com"),
    ("Canva", "trabajo", "", "canva.com"),
    ("Steinberg", "trabajo", "", "steinberg.net steinberg.de"),
    # ---- inteligencia artificial
    ("ChatGPT", "ia", "ChatGPT", "openai.com chatgpt.com oaistatic.com oaiusercontent.com"),
    ("Claude", "ia", "", "anthropic.com claude.ai claude.com claudeusercontent.com"),
    ("Gemini", "ia", "Google", "gemini.google.com generativelanguage.googleapis.com bard.google.com"),
    ("Copilot", "ia", "", "copilot.microsoft.com"),
    ("Perplexity", "ia", "", "perplexity.ai"),
    ("Hugging Face", "ia", "", "huggingface.co hf.co"),
    ("Ollama", "ia", "", "ollama.com ollama.ai"),
    ("LM Studio", "ia", "", "lmstudio.ai"),
    # ---- compras
    ("Amazon", "compras", "Amazon", "amazon.com amazon.es amazon.de amazon.co.uk amazon.fr amazon.it ssl-images-amazon.com images-amazon.com media-amazon.com"),
    ("AliExpress", "compras", "Aliexpress", "aliexpress.com alicdn.com aliexpress-media.com alibaba.com aliexpress.us"),
    ("eBay", "compras", "eBay", "ebay.com ebay.es ebaystatic.com ebayimg.com"),
    ("Temu", "compras", "", "temu.com kwcdn.com"),
    ("SHEIN", "compras", "SHEIN", "shein.com ltwebstatic.com"),
    ("Wallapop", "compras", "", "wallapop.com"),
    ("PayPal", "compras", "PayPal.com", "paypal.com paypalobjects.com"),
    # ---- hogar conectado
    ("Amazon Alexa", "hogar", "Amazon", "amazonalexa.com alexa.amazon.com alexa.amazon.es a2z.com amazon-dss.com amcs-tachyon.com avs-alexa-eu.amazon.com bob-dispatch-prod-eu.amazon.com device-metrics-us.amazon.com device-metrics-us-2.amazon.com"),
    ("Tuya · Smart Life", "hogar", "", "tuya.com tuyaeu.com tuyaus.com tuyacn.com iotbing.com"),
    ("Philips Hue", "hogar", "", "meethue.com philips-hue.com"),
    ("Xiaomi", "hogar", "", "xiaomi.com mi.com miui.com xiaomi.net mi-img.com"),
    ("LG webOS", "hogar", "", "lgtvsdp.com lge.com lgappstv.com lgtvcommon.com lgsmartad.com lg.com lgeapi.com lgthinq.com nextlgsdp.com wiselg.com lgtviot.com"),
    ("Samsung", "hogar", "", "samsung.com samsungcloud.com samsungosp.com samsungapps.com samsungqbe.com samsungcloudsolution.com"),
    ("Home Assistant", "hogar", "", "home-assistant.io nabucasa.com hacs.xyz"),
    ("TP-Link · Tapo", "hogar", "", "tplinkcloud.com tp-link.com tplinknbu.com"),
    ("Meross", "hogar", "", "meross.com"),
    ("Ring", "hogar", "Ring Always Home", "ring.com rings.solutions ring.devices.a2z.com"),
    ("Govee", "hogar", "", "govee.com"),
    ("Broadlink", "hogar", "", "broadlink.com.cn ibroadlink.com"),
    ("Espressif", "hogar", "", "espressif.com"),
    ("Aqara", "hogar", "", "aqara.com aqara.cn"),
    ("Sonos", "hogar", "", "sonos.com"),
    ("Roku", "hogar", "Roku", "roku.com"),
    # ---- sistema y actualizaciones
    ("Apple", "sistema", "Apple.com", "apple.com cdn-apple.com apple-dns.net aaplimg.com apple.news"),
    ("App Store", "sistema", "iTunes/App Store", "apps.apple.com itunes.apple.com mzstatic.com ppq.apple.com"),
    ("Actualizaciones de Apple", "sistema", "Apple.com", "swcdn.apple.com swscan.apple.com mesu.apple.com updates.cdn-apple.com appldnld.apple.com swdist.apple.com gdmf.apple.com"),
    ("Google Play", "sistema", "Google Play", "play.google.com play.googleapis.com android.clients.google.com play-fe.googleapis.com android.com"),
    ("Descargas y actualizaciones de Google", "sistema", "Google", "gvt1.com gvt2.com gvt3.com dl.google.com update.googleapis.com optimizationguide-pa.googleapis.com chromewebstore.googleapis.com clients2.google.com"),
    ("Windows Update", "sistema", "Windows Update", "windowsupdate.com update.microsoft.com delivery.mp.microsoft.com download.windowsupdate.com"),
    ("Microsoft", "sistema", "Microsoft Live.com", "microsoft.com live.com msn.com windows.com windows.net msftncsi.com msftconnecttest.com microsoftonline.com msedge.net s-microsoft.com msauth.net msftauth.net live.net"),
    ("Microsoft Store", "sistema", "Microsoft Store", "storeedgefd.dsx.mp.microsoft.com store.rg-adguard.net displaycatalog.mp.microsoft.com"),
    ("Actualizaciones de Linux", "sistema", "", "debian.org ubuntu.com canonical.com archlinux.org fedoraproject.org openwrt.org alpinelinux.org snapcraft.io"),
    # ---- nubes y redes de contenido
    ("Amazon Web Services", "cdn", "Amazon CloudFront", "amazonaws.com cloudfront.net awsstatic.com"),
    ("Akamai", "cdn", "Akamai.net", "akamai.net akamaiedge.net akamaihd.net akamaized.net akamaitechnologies.com edgekey.net edgesuite.net akadns.net akamai.com"),
    ("Cloudflare", "cdn", "", "cloudflare.com cloudflare.net cloudflare-dns.com cloudflarestorage.com cdnjs.com workers.dev pages.dev r2.dev one.one.one.one"),
    ("Fastly", "cdn", "Fastly", "fastly.net fastlylb.net fastly.com"),
    ("Microsoft Azure", "cdn", "", "azure.com azurewebsites.net azureedge.net trafficmanager.net core.windows.net azurefd.net"),
    ("Google Cloud", "cdn", "Google", "cloud.google.com appspot.com run.app cloudfunctions.net"),
    ("jsDelivr · unpkg", "cdn", "", "jsdelivr.net unpkg.com"),
    # ---- publicidad y medición
    ("Publicidad y medición", "publi", "Google Analytics",
     "doubleclick.net googlesyndication.com googleadservices.com google-analytics.com googletagmanager.com googletagservices.com adservice.google.com app-measurement.com "
     "crashlytics.com scorecardresearch.com adnxs.com criteo.com criteo.net taboola.com outbrain.com amazon-adsystem.com appsflyer.com adjust.com branch.io moatads.com "
     "rubiconproject.com pubmatic.com hotjar.com segment.io mixpanel.com sentry.io newrelic.com nr-data.net datadoghq.com bugsnag.com cloudflareinsights.com "
     "applovin.com unity3d.com unityads.unity3d.com vungle.com adcolony.com chartboost.com mopub.com onesignal.com braze.com yadro.ru yandex.ru demdex.net omtrdc.net "
     "adobedtm.com clarity.ms events.data.microsoft.com vortex.data.microsoft.com telemetry.microsoft.com firebaselogging-pa.googleapis.com"),
    # ---- adultos
    ("Pornhub", "adultos", "PornHub.com", "pornhub.com phncdn.com"),
    ("XVideos", "adultos", "XVideos.com", "xvideos.com xvideos-cdn.com xnxx.com xnxx-cdn.com"),
    ("xHamster", "adultos", "", "xhamster.com xhcdn.com"),
    ("OnlyFans", "adultos", "", "onlyfans.com"),
    # ---- servicios de red
    ("Speedtest", "red", "Speedtest.net", "speedtest.net ooklaserver.net speed.cloudflare.com fast.com"),
    ("Tailscale", "red", "", "tailscale.com tailscale.io"),
    ("Hora de Internet (NTP)", "red", "", "ntp.org time.apple.com time.windows.com time.google.com time.android.com time.cloudflare.com"),
    ("Comprobación de conexión", "red", "", "connectivitycheck.gstatic.com captive.apple.com clients3.google.com detectportal.firefox.com"),
    ("Certificados", "red", "", "letsencrypt.org lencr.org digicert.com sectigo.com pki.goog ocsp.apple.com globalsign.com"),
    ("DuckDNS", "red", "", "duckdns.org"),
    ("Mi dirección pública", "red", "", "ipify.org ifconfig.me icanhazip.com ipinfo.io"),
    ("Immich", "nube", "", "immich.cloud immich.app"),
    ("AdGuard", "red", "", "adguard.com adguard-dns.com adtidy.org"),
]

# Sin nombre de dominio: se dice lo que se puede por el puerto.
PUERTOS = {
    53: ("DNS", "red", "DNS"), 853: ("DNS cifrado (DoT)", "red", "DNS over TLS"), 123: ("Hora de Internet (NTP)", "red", ""),
    22: ("SSH", "red", "Secure Shell (SSH)"), 5228: ("Google", "web", "Google"), 5229: ("Google", "web", "Google"), 5230: ("Google", "web", "Google"),
    5223: ("Apple", "sistema", "Apple.com"), 1883: ("MQTT", "hogar", "MQTT"), 8883: ("MQTT", "hogar", "MQTT"),
    3478: ("Llamadas y vídeo (STUN)", "mensajes", "STUN"), 3479: ("Llamadas y vídeo (STUN)", "mensajes", "STUN"), 3480: ("Llamadas y vídeo (STUN)", "mensajes", "STUN"),
    51820: ("WireGuard", "red", ""), 41641: ("Tailscale", "red", ""), 1194: ("OpenVPN", "red", "OpenVPN"),
    4662: ("eMule", "p2p", "eMule"), 4672: ("eMule", "p2p", "eMule"), 4665: ("eMule", "p2p", "eMule"),
    993: ("Correo", "trabajo", ""), 995: ("Correo", "trabajo", ""), 587: ("Correo", "trabajo", ""), 465: ("Correo", "trabajo", ""), 25: ("Correo", "trabajo", ""), 143: ("Correo", "trabajo", ""),
    27015: ("Steam", "juegos", "Valve Steam"), 27036: ("Steam", "juegos", "Valve Steam"), 3074: ("Xbox", "juegos", "XBOX"),
    9293: ("PlayStation", "juegos", "Sony PlayStation"), 9295: ("PlayStation", "juegos", "Sony PlayStation"), 9296: ("PlayStation", "juegos", "Sony PlayStation"), 9297: ("PlayStation", "juegos", "Sony PlayStation"),
}
# servidores de nombres conocidos: por el 443 es DNS cifrado, no una web
DNS_PUBLICOS = {"8.8.8.8", "8.8.4.4", "1.1.1.1", "1.0.0.1", "9.9.9.9", "9.9.9.10", "9.9.9.11", "149.112.112.112", "149.112.112.10", "149.112.112.11",
                "94.140.14.14", "94.140.15.15", "208.67.222.222", "208.67.220.220", "2001:4860:4860::8888", "2001:4860:4860::8844",
                "2606:4700:4700::1111", "2606:4700:4700::1001", "2620:fe::fe", "2620:fe::9", "2620:fe::10", "2620:fe::fe:10"}
DOH = ("DNS cifrado (DoH)", "red", "DNS over HTTPS (DoH)")
SIN_NOMBRE = ("Sin identificar", "otros", "")
WEB_SIN_NOMBRE = ("Web sin identificar", "otros", "SSL/TLS")
P2P = ("Descargas P2P", "p2p", "BitTorrent Series")

# dominios de segundo nivel que no son de nadie («algo.co.uk»)
_DOBLES = {"co.uk", "com.es", "org.es", "com.br", "com.ar", "com.mx", "co.jp", "com.au", "com.cn", "com.tr", "co.kr", "org.uk", "com.co", "co.in"}

_por_dominio = {}
INFO = {}                          # nombre → (categoría, icono de UniFi)
for _n, _c, _i, _d in APPS:
    INFO[_n] = (_c, _i)
    for _x in _d.split():
        _por_dominio[_x] = _n
for _t in list(PUERTOS.values()) + [SIN_NOMBRE, WEB_SIN_NOMBRE, P2P, DOH]:
    INFO.setdefault(_t[0], (_t[1], _t[2]))


def raiz(dominio):
    """«a.b.ejemplo.com» → «ejemplo.com»."""
    p = dominio.split(".")
    if len(p) <= 2:
        return dominio
    return ".".join(p[-3:]) if ".".join(p[-2:]) in _DOBLES else ".".join(p[-2:])


def de_dominio(dominio):
    """La aplicación de un dominio. Si no está en la tabla, su dominio raíz."""
    d = dominio.lower().rstrip(".")
    p = d.split(".")
    for i in range(len(p)):
        n = _por_dominio.get(".".join(p[i:]))
        if n:
            return n
    return raiz(d)


def de_puerto(proto, puerto, entrante=False, ip=""):
    if ip in DNS_PUBLICOS and puerto in (443, 853, 53):
        return DOH[0] if puerto == 443 else PUERTOS[puerto][0]
    t = PUERTOS.get(puerto)
    if t:
        return t[0]
    if entrante:
        return "Web de este equipo" if puerto in (80, 443) else "Conexiones entrantes"
    if puerto in (80, 443, 8080, 8443):
        return WEB_SIN_NOMBRE[0]
    if 6881 <= puerto <= 6999 or puerto == 6969:
        return P2P[0]
    return SIN_NOMBRE[0]


INFO["Web de este equipo"] = ("servidor", "HTTP")
INFO["Conexiones entrantes"] = ("servidor", "")


def info(nombre):
    """(categoría, icono de UniFi, es_un_sitio_suelto)"""
    t = INFO.get(nombre)
    return (t[0], t[1], False) if t else ("web", "", True)
