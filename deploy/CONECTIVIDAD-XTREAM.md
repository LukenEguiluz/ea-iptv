# Conectividad con el proveedor Xtream

Documento de referencia sobre el problema actual entre el servidor del gateway y `line.trxdnscloud.ru`.

---

## Arquitectura actual

```
Usuario (navegador)
    │
    ▼
ea-iptv.leyluz.com          ← Frontend en Vercel
    │
    │  HTTPS + JWT
    ▼
api.ea-iptv.leyluz.com      ← Backend en Docker (este servidor)
    │
    │  HTTP / player_api.php
    ▼
line.trxdnscloud.ru         ← Proveedor IPTV (Xtream Codes)
```

El frontend **no** habla con Xtream directamente. Todo pasa por el backend: catálogo, login de sesión IPTV, reproducción (proxy), sync del índice.

---

## Qué está pasando

| Desde dónde | Prueba | Resultado |
|-------------|--------|-----------|
| **Tu PC** | `curl` a `player_api.php` | ✅ Funciona (JSON con categorías) |
| **Servidor** (`27.0.232.57`) | Misma URL | ❌ Timeout (sin respuesta) |

El gateway, el sync del catálogo y la reproducción **dependen** de que el servidor pueda conectar con el proveedor. Si el servidor no llega, la app no puede indexar ni hacer de proxy aunque el frontend y la API (`api.ea-iptv.leyluz.com`) estén bien.

---

## Por qué funciona en tu PC y no en el servidor

No es un bug del código ni falta de “modo navegador”. Es **filtrado por IP de origen**:

1. **Tu PC** suele tener IP residencial (ISP de casa). Los paneles Xtream la aceptan por defecto.
2. **Este servidor** tiene IP fija de **datacenter** (`27.0.232.57`). Muchos proveedores:
   - Bloquean rangos de hosting (OVH, Hetzner, etc.)
   - Solo permiten conexiones desde IPs **autorizadas en el panel** (whitelist)

Tener IP fija en un servidor es **normal y deseable** para un gateway 24/7. Lo que falta es que el **proveedor autorice esa IP**, no cambiar a IP dinámica.

---

## Síntomas que ves en la app

- Sync del catálogo en **0%** o que falla al poco tiempo
- Mensaje de error: *“No se puede conectar al proveedor Xtream desde este servidor”*
- En el error aparece: **IP pública del servidor: 27.0.232.57**
- TV / películas / series no cargan o no reproducen (el backend no alcanza al proveedor)

Antes el sync intentaba indexar **TV + películas + series** a la vez con muchas conexiones paralelas (5 cuentas × 10 workers), lo que podía empeorar el bloqueo. Eso ya se corrigió (ver abajo).

---

## Qué se hizo en el código (ya desplegado)

### Despliegue split
- Frontend: Vercel → `ea-iptv.leyluz.com`
- Backend: Docker + Caddy → `api.ea-iptv.leyluz.com`

### Sync del catálogo
- **Por defecto solo TV en vivo** (automático al entrar)
- **Películas y series** solo si el usuario acepta indexar (diálogo en esas secciones)
- Modo **suave**: 1 cuenta, 1 categoría a la vez, pausa entre peticiones
- Peticiones con **User-Agent tipo STB** (MAG200), como esperan muchos paneles
- Si el proveedor no responde → **fallo rápido** (~15 s) con mensaje claro, sin quedarse horas en 0%
- Recuperación de sync “colgada” tras reinicio del backend

### Bypass opcional (si no pueden whitelist)
Variable en `.env`:

```env
XTREAM_HTTP_PROXY=http://host:puerto
```

Todo el tráfico Xtream del backend sale por ese proxy (debe ser una IP que el proveedor sí acepte).

---

## Qué tienes que hacer (solución recomendada)

### 1. Autorizar la IP del servidor en el proveedor

En el panel de tu cuenta IPTV (o escribiendo al soporte), pide **whitelist / autorizar IP**:

```
27.0.232.57
```

Es la IP desde la que **sale** todo el tráfico del gateway hacia Xtream.

### 2. Comprobar en el servidor

Cuando te confirmen, en el servidor:

```bash
curl -m 15 \
  'http://line.trxdnscloud.ru/player_api.php?username=TU_USER&password=TU_PASS&action=get_live_categories' \
  | head -c 300
```

Debe devolver JSON (lista de categorías), no timeout.

**Importante:** la URL va **entre comillas** por los `&`:

```bash
# ❌ Mal (bash interpreta & como background)
curl http://...?username=x&password=y&action=...

# ✅ Bien
curl 'http://...?username=x&password=y&action=...'
```

### 3. Revisar URL con puerto (si aplica)

Si tu enlace M3U en el PC lleva puerto, usa la misma base en `.env`:

```env
XTREAM_SERVER_URL=http://line.trxdnscloud.ru:8080
```

(sustituye `8080` por el puerto real de tu proveedor)

### 4. Reiniciar sync de TV

En la app: **Ajustes → Actualizar TV en vivo**, o en el servidor:

```bash
cd /opt/apps/ea-iptv
docker compose -f docker-compose.backend.prod.yml exec backend \
  python manage.py sync_catalog_index --force --types live
```

---

## Alternativas si el proveedor no hace whitelist

| Opción | Idea |
|--------|------|
| **Proxy HTTP en casa** | PC/router con proxy; port forward; `XTREAM_HTTP_PROXY=...` |
| **Túnel SSH SOCKS** | Servidor → SSH `-D` → tu casa; tráfico Xtream por SOCKS |
| **WireGuard a casa** | VPN; salida a internet con IP residencial |
| **Proxy residencial de pago** | Servicio comercial; configurar en `XTREAM_HTTP_PROXY` |

Detalle operativo del bypass: [ZEROTIER-BYPASS.md](./ZEROTIER-BYPASS.md). La opción más limpia sigue siendo whitelist de `27.0.232.57`.

---

## Variables `.env` relevantes

```env
# Proveedor (con puerto si tu M3U lo usa)
XTREAM_SERVER_URL=line.trxdnscloud.ru

# Sync suave (recomendado con IP fija)
CATALOG_SYNC_GENTLE=true
CATALOG_SYNC_ALL_ACCOUNTS=false
CATALOG_SYNC_CATEGORY_DELAY=0.35

# Solo si usas bypass por proxy
# XTREAM_HTTP_PROXY=http://user:pass@host:port
```

---

## Comprobaciones rápidas

```bash
# IP pública del servidor
curl -s https://api.ipify.org

# Estado del stack
cd /opt/apps/ea-iptv
docker compose -f docker-compose.backend.prod.yml ps

# Estado del sync (desde Django)
docker compose -f docker-compose.backend.prod.yml exec backend \
  python manage.py shell -c "from library.catalog_sync import sync_status_payload; print(sync_status_payload())"

# API HTTPS
curl -sI https://api.ea-iptv.leyluz.com/api/diagnostics/config
```

---

## Resumen en una frase

**El gateway y la API están bien; el proveedor IPTV no acepta conexiones desde la IP fija del servidor (`27.0.232.57`) hasta que la autorices (o enrutes el tráfico por otra IP con proxy/VPN).**
