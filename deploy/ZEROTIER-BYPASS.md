# Bypass Xtream vía ZeroTier

Cuando el proveedor bloquea la IP del datacenter (`27.0.232.57`) pero acepta una IP residencial, el servidor sale a Xtream **a través de un nodo ZeroTier** en la red `EA_VPN`.

---

## Red configurada

| Rol | IP ZeroTier | Notas |
|-----|-------------|--------|
| **Servidor (VM ea-iptv)** | `10.234.232.149` | Nodo `793e52a90c`, interfaz `zt3hhc2ue3` |
| **Salida 1** | `10.234.232.218` | Windows (TTL 128), ping OK |
| **Salida 2** | `10.234.232.58` | Linux, SSH `:22`, ping OK |

| Campo | Valor |
|-------|--------|
| Network ID | `b9a18a606fa730f4` |
| Nombre red | `EA_VPN` |

```bash
zerotier-cli listnetworks   # status OK, IP 10.234.232.149/24
ping -c 2 10.234.232.218
ping -c 2 10.234.232.58
```

---

## Arquitectura

```
Servidor VM                         Nodo salida (218 o 58)
10.234.232.149                      10.234.232.218 / .58
      │                                      │
      │  ZeroTier EA_VPN (cifrado)           │
      └────────────► proxy HTTP :8888 ───────┘
                              │
                              ▼ IP residencial
                    line.trxdnscloud.ru ✅
```

El backend **solo** envía tráfico Xtream al proxy; API, HTTPS y DB siguen directos desde el servidor.

---

## Paso 1 — Proxy en el nodo de salida

Elige **218** o **58** (el que tenga IP residencial que Xtream acepte). Debe escuchar en su **IP ZeroTier**, no en `127.0.0.1`.

### Linux (`10.234.232.58`)

```bash
sudo apt install -y tinyproxy
sudo tee /etc/tinyproxy/tinyproxy.conf <<'EOF'
User tinyproxy
Group tinyproxy
Port 8888
Listen 10.234.232.58
Allow 10.234.232.0/24
Timeout 600
EOF
sudo systemctl enable --now tinyproxy
```

Comprobar desde el nodo:

```bash
curl -m 15 'http://line.trxdnscloud.ru/player_api.php?username=USER&password=PASS&action=get_live_categories' | head -c 200
```

### Windows (`10.234.232.218`) — Python en el host (recomendado)

Evita problemas de red de Docker. Doble clic en **`Iniciar-Bypass-Python.bat`** (requiere Python 3).

El tráfico a Xtream sale con la IP residencial del PC. URL del proveedor **sin puerto**:

`http://line.trxdnscloud.ru/player_api.php`

### Windows — Docker (alternativa)

Carpeta lista para copiar al PC: **`deploy/windows-bypass/`**

| Archivo | Uso |
|---------|-----|
| `Iniciar-Bypass-IPTV.bat` | Doble clic — levanta el proxy en Docker |
| `Detener-Bypass-IPTV.bat` | Para el contenedor |
| `Configurar-Firewall.bat` | Una vez, como admin, si el servidor no conecta |
| `Probar-Bypass-IPTV.bat` | Prueba Xtream vía proxy local |

Requisitos: **Docker Desktop** + **ZeroTier** en la red `EA_VPN` (`b9a18a606fa730f4`).

```text
1. Copiar carpeta windows-bypass al PC Windows
2. Abrir Docker Desktop
3. Doble clic en Iniciar-Bypass-IPTV.bat
4. En el servidor: XTREAM_HTTP_PROXY=http://10.234.232.218:8888
```

Empaquetar para enviar al PC:

```bash
cd /opt/apps/ea-iptv/deploy
zip -r windows-bypass.zip windows-bypass/
```

### Windows — otras opciones

1. **WSL2** con `setup-tinyproxy-zt.sh` (`Listen 10.234.232.218`).
2. **CCProxy** u otro proxy HTTP en `10.234.232.218:8888`.
3. Firewall: permitir TCP **8888** desde `10.234.232.0/24`.

### Alternativa: SOCKS vía SSH (solo `.58`)

En el nodo Linux, si prefieres SOCKS en lugar de HTTP:

```bash
# Escuchar en la IP ZeroTier (requiere acceso SSH desde el servidor)
ssh -N -D 10.234.232.58:1080 localhost
```

En el servidor hará falta `PySocks` en el backend y:

```env
XTREAM_HTTP_PROXY=socks5://10.234.232.58:1080
```

---

## Paso 2 — Activar proxy en el servidor

En `/opt/apps/ea-iptv/.env` (usa el nodo que tenga el proxy levantado):

```env
# HTTP (recomendado, no requiere PySocks)
XTREAM_HTTP_PROXY=http://10.234.232.218:8888
# o
# XTREAM_HTTP_PROXY=http://10.234.232.58:8888
```

Reiniciar backend:

```bash
cd /opt/apps/ea-iptv
docker compose -f docker-compose.backend.prod.yml up -d backend
```

---

## Paso 3 — Probar desde el servidor

Sustituye la IP por la del nodo con proxy activo:

```bash
# Conectividad ZeroTier
ping -c 2 10.234.232.218
ping -c 2 10.234.232.58

# Xtream vía proxy HTTP
curl -m 20 -x http://10.234.232.58:8888 \
  'http://line.trxdnscloud.ru/player_api.php?username=USER&password=PASS&action=get_live_categories' \
  | head -c 200

# Sync TV en vivo
docker compose -f docker-compose.backend.prod.yml exec backend \
  python manage.py sync_catalog_index --force --types live
```

Si el JSON de Xtream responde, en la app: **Ajustes → Actualizar TV en vivo**.

---

## Estado actual

| Comprobación | Resultado |
|--------------|-----------|
| ZeroTier servidor | ✅ OK (`10.234.232.149`) |
| Ping a `.218` y `.58` | ✅ OK |
| Xtream directo desde servidor | ❌ Timeout (IP datacenter bloqueada) |
| Proxy HTTP en `.218:8888` | ⏳ Pendiente (levantar en el nodo) |
| Proxy HTTP en `.58:8888` | ⏳ Pendiente (levantar en el nodo) |
| SSH servidor → `.58` | ❌ Sin clave (solo acceso desde tu lado) |

**Falta:** instalar y arrancar `tinyproxy` (u otro proxy) en **218** o **58**. Cuando esté escuchando, avisa y se activa `XTREAM_HTTP_PROXY` en `.env`.

---

## Notas

- Usa **218** y **58** como nodos fijos de la red; no cambian salvo reasignación en ZeroTier Central.
- El nodo de salida debe estar encendido para sync y reproducción.
- Cuando el proveedor whitelistee `27.0.232.57`, quita `XTREAM_HTTP_PROXY` del `.env` y reinicia el backend.

---

## Relacionado

- [CONECTIVIDAD-XTREAM.md](./CONECTIVIDAD-XTREAM.md) — diagnóstico del bloqueo por IP
