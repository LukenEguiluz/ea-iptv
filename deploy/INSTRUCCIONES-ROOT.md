# Despliegue backend como root

Guía para levantar **solo el backend** en `api.ea-iptv.leyluz.com`.  
El frontend sigue en **Vercel** (`ea-iptv.leyluz.com`).

---

## Arquitectura

```
ea-iptv.leyluz.com (Vercel)
        │
        │  HTTPS + CORS
        ▼
api.ea-iptv.leyluz.com (este servidor)
        │
        ├── Caddy :443  →  backend :8000  (Django/Gunicorn)
        └── PostgreSQL (volumen Docker postgres_data)
```

**No se usa** `docker-compose.yml` (stack monolítico con frontend).  
**Sí se usa** `docker-compose.backend.prod.yml`.

---

## 1. Entrar como root

```bash
su -
# o SSH directo como root
cd /opt/apps/ea-iptv
```

---

## 2. Instalar Docker (una sola vez)

```bash
apt-get update
apt-get install -y ca-certificates curl gnupg

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

docker --version
docker compose version
```

Opcional — permitir a `lukeneguiluz` usar Docker sin root:

```bash
usermod -aG docker lukeneguiluz
```

---

## 3. Crear `.env` con secretos

```bash
cd /opt/apps/ea-iptv
cp .env.example .env
nano .env   # o vim
```

**Obligatorio rellenar** (copiar del servidor anterior si existe):

- `POSTGRES_PASSWORD`
- `DJANGO_SECRET_KEY` (generar uno nuevo en prod)
- `XTREAM_SERVER_URL`
- `IPTV_ACCOUNT_*_USERNAME` / `PASSWORD` (cuentas Luken, Rebe, etc.)
- `IPTV_USER_*_PASSWORD` (login gateway)
- `IPTV_ENCRYPTION_KEY` (si ya tenías datos cifrados, **usa la misma clave**)

**Dejar así para split deploy** (ya vienen en `.env.example`):

```env
DEBUG=False
DJANGO_ALLOWED_HOSTS=api.ea-iptv.leyluz.com,localhost,127.0.0.1
CSRF_TRUSTED_ORIGINS=https://api.ea-iptv.leyluz.com
CORS_ORIGINS=https://ea-iptv.leyluz.com
GATEWAY_PUBLIC_URL=https://api.ea-iptv.leyluz.com
```

`GATEWAY_PUBLIC_URL` define las URLs de reproducción e imágenes (`/api/proxy/...`).

---

## 4. Desplegar

```bash
cd /opt/apps/ea-iptv
docker compose -f docker-compose.backend.prod.yml up -d --build
```

Primera vez tarda varios minutos (build backend + migrate + seed).

Ver estado:

```bash
docker compose -f docker-compose.backend.prod.yml ps
docker compose -f docker-compose.backend.prod.yml logs -f backend
```

---

## 5. Verificar

```bash
# API responde (401 sin JWT = OK)
curl -sI https://api.ea-iptv.leyluz.com/api/diagnostics/config

# Certificado HTTPS (Caddy + Let's Encrypt)
curl -sI https://api.ea-iptv.leyluz.com | head -5
```

Probar login desde el navegador: `https://ea-iptv.leyluz.com` → debe conectar al API sin errores CORS.

---

## 6. Vercel (frontend)

En el dashboard de Vercel, variable de entorno de **producción**:

```
VITE_API_BASE_URL=https://api.ea-iptv.leyluz.com/api
```

Ya está en `frontend/.env.production` del repo. Tras cambiar la variable, **redeploy** el frontend en Vercel.

---

## Comandos de mantenimiento

```bash
cd /opt/apps/ea-iptv

# Ver logs
docker compose -f docker-compose.backend.prod.yml logs -f

# Reiniciar solo backend (tras cambio de código)
docker compose -f docker-compose.backend.prod.yml up -d --build backend

# Parar todo (frontend en Vercel sigue funcionando, API cae)
docker compose -f docker-compose.backend.prod.yml down

# Parar sin borrar DB
docker compose -f docker-compose.backend.prod.yml stop

# Sync catálogo manual
docker compose -f docker-compose.backend.prod.yml exec backend \
  python manage.py sync_catalog_index --force

# Shell Django
docker compose -f docker-compose.backend.prod.yml exec backend python manage.py shell
```

---

## Migrar DB del servidor anterior

Si tenías PostgreSQL en otro host con el volumen `postgres_data`:

1. Parar el stack viejo.
2. Copiar el volumen o hacer `pg_dump` / `pg_restore`.
3. Levantar aquí con el **mismo** `POSTGRES_PASSWORD` e `IPTV_ENCRYPTION_KEY`.

Si es instalación nueva, el entrypoint hace `migrate` + `seed_initial_data` automáticamente.

---

## Requisitos previos (checklist)

| Item | Estado esperado |
|------|-----------------|
| DNS `api.ea-iptv.leyluz.com` → IP del servidor | `27.0.232.57` |
| Puertos 80 y 443 libres | Sin nginx/apache en el host |
| `.env` con secretos reales | No commitear |
| Vercel con `VITE_API_BASE_URL` | Apuntando al API |

---

## Qué no tocar

| Archivo | Para qué sirve |
|---------|----------------|
| `docker-compose.yml` | Dev local stack completo (:8080) |
| `docker-compose.backend.yml` | Backend sin HTTPS (:8000) |
| `docker-compose.backend.prod.yml` | **Producción** (usar este) |

---

## Problemas frecuentes

**Caddy no obtiene certificado**  
→ DNS no apunta al servidor o puerto 80 bloqueado. Revisar: `docker compose -f docker-compose.backend.prod.yml logs caddy`

**CORS error en el navegador**  
→ Revisar `CORS_ORIGINS=https://ea-iptv.leyluz.com` en `.env` y reiniciar backend.

**Play/imágenes rotas**  
→ `GATEWAY_PUBLIC_URL` debe ser `https://api.ea-iptv.leyluz.com` (sin `/api` al final).

**Contraseñas IPTV no funcionan tras migrar**  
→ Misma `IPTV_ENCRYPTION_KEY` que en el servidor anterior.
