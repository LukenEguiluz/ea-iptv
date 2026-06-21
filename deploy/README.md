# Despliegue backend (api.ea-iptv.leyluz.com)

Arquitectura split: **frontend en Vercel** (`ea-iptv.leyluz.com`) + **backend en Docker** (`api.ea-iptv.leyluz.com`).

El stack monolítico (`docker-compose.yml` con nginx + frontend) sigue intacto para desarrollo local.

## Requisitos

1. **DNS**: registro `A` de `api.ea-iptv.leyluz.com` → IP pública de este servidor.
2. **Puertos 80 y 443** libres (Caddy obtiene certificado Let's Encrypt).
3. **Docker** instalado (`./scripts/install-docker.sh`).

## Variables de entorno

```bash
cp .env.example .env
# Editar .env con secretos reales (Xtream, contraseñas, DJANGO_SECRET_KEY)
```

Claves para split deploy:

| Variable | Valor producción |
|----------|------------------|
| `DJANGO_ALLOWED_HOSTS` | `api.ea-iptv.leyluz.com,localhost,127.0.0.1` |
| `CORS_ORIGINS` | `https://ea-iptv.leyluz.com` |
| `CSRF_TRUSTED_ORIGINS` | `https://api.ea-iptv.leyluz.com` |
| `GATEWAY_PUBLIC_URL` | `https://api.ea-iptv.leyluz.com` |
| `DEBUG` | `False` |

`GATEWAY_PUBLIC_URL` es crítico: las URLs de play/imágenes (`/api/proxy/...`) se firman con este dominio.

## Frontend (Vercel)

En `frontend/.env.production` (o variable en dashboard Vercel):

```
VITE_API_BASE_URL=https://api.ea-iptv.leyluz.com/api
```

El frontend resuelve play/media con `resolveApiUrl()` hacia el origen del backend.

## Desplegar

```bash
./scripts/install-docker.sh   # una vez
./scripts/deploy-backend.sh   # build + up
```

Compose usado: `docker-compose.backend.prod.yml` (db + backend + caddy).

## Verificación

```bash
curl -sI https://api.ea-iptv.leyluz.com/api/diagnostics/config
# Debe responder 401 (sin JWT) o 200 — no connection refused

docker compose -f docker-compose.backend.prod.yml logs -f backend
```

## Comandos útiles

```bash
# Rebuild solo backend
docker compose -f docker-compose.backend.prod.yml up -d --build backend

# Sync catálogo manual
docker compose -f docker-compose.backend.prod.yml exec backend python manage.py sync_catalog_index --force

# Stack dev sin HTTPS (puerto 8000)
docker compose -f docker-compose.backend.yml up -d --build
```

## Qué NO se rompe

| Archivo | Uso |
|---------|-----|
| `docker-compose.yml` | Stack completo local (nginx :8080) |
| `docker-compose.backend.yml` | Backend dev sin Caddy |
| `docker-compose.backend.prod.yml` | **Producción** split con HTTPS |

Los tres comparten el volumen `postgres_data` si usas el mismo nombre de proyecto Compose en el mismo directorio.
