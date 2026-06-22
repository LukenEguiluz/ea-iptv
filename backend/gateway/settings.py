import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'dev-secret-change-in-production-iptv-gateway')

DEBUG = os.environ.get('DEBUG', 'True').lower() == 'true'

_hosts_env = os.environ.get('DJANGO_ALLOWED_HOSTS', '').strip()
if _hosts_env:
    ALLOWED_HOSTS = [h.strip() for h in _hosts_env.split(',') if h.strip()]
elif DEBUG:
    ALLOWED_HOSTS = ['localhost', '127.0.0.1', '*']
else:
    ALLOWED_HOSTS = ['localhost', '127.0.0.1']

_csrf_origins = os.environ.get('CSRF_TRUSTED_ORIGINS', '').strip()
CSRF_TRUSTED_ORIGINS = [x.strip() for x in _csrf_origins.split(',') if x.strip()]

SESSION_INACTIVITY_MINUTES = int(os.environ.get('SESSION_INACTIVITY_MINUTES', '5'))

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'accounts',
    'sessions.apps.IptvSessionsConfig',
    'library.apps.LibraryConfig',
    'api',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'gateway.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'gateway.wsgi.application'

if os.environ.get('POSTGRES_DB'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('POSTGRES_DB'),
            'USER': os.environ.get('POSTGRES_USER', 'postgres'),
            'PASSWORD': os.environ.get('POSTGRES_PASSWORD', ''),
            'HOST': os.environ.get('POSTGRES_HOST', 'localhost'),
            'PORT': os.environ.get('POSTGRES_PORT', '5432'),
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
TIME_ZONE = 'America/Mexico_City'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=12),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
}

_cors_origins = os.environ.get('CORS_ORIGINS', '').strip()
if _cors_origins:
    CORS_ALLOWED_ORIGINS = [x.strip() for x in _cors_origins.split(',') if x.strip()]
else:
    CORS_ALLOW_ALL_ORIGINS = DEBUG

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = (
    'accept',
    'authorization',
    'content-type',
    'origin',
    'user-agent',
    'x-requested-with',
)

GATEWAY_PUBLIC_URL = os.environ.get('GATEWAY_PUBLIC_URL', '').strip().rstrip('/')

IPTV_ENCRYPTION_KEY = os.environ.get('IPTV_ENCRYPTION_KEY', '')

XTREAM_SERVER_URL = os.environ.get('XTREAM_SERVER_URL', '').strip().rstrip('/')
if XTREAM_SERVER_URL and not XTREAM_SERVER_URL.startswith(('http://', 'https://')):
    XTREAM_SERVER_URL = f'http://{XTREAM_SERVER_URL}'

CATALOG_SYNC_INTERVAL_HOURS = float(os.environ.get('CATALOG_SYNC_INTERVAL_HOURS', '4'))
CATALOG_SYNC_CATEGORY_WORKERS = int(os.environ.get('CATALOG_SYNC_CATEGORY_WORKERS', '2'))
CATALOG_SYNC_ACCOUNT_WORKERS = int(os.environ.get('CATALOG_SYNC_ACCOUNT_WORKERS', '1'))
CATALOG_SYNC_TYPE_WORKERS = int(os.environ.get('CATALOG_SYNC_TYPE_WORKERS', '1'))
CATALOG_SYNC_GENTLE = os.environ.get('CATALOG_SYNC_GENTLE', 'true').lower() == 'true'
CATALOG_SYNC_ALL_ACCOUNTS = os.environ.get('CATALOG_SYNC_ALL_ACCOUNTS', 'false').lower() == 'true'
CATALOG_SYNC_CATEGORY_DELAY = float(os.environ.get('CATALOG_SYNC_CATEGORY_DELAY', '0.35'))
CATALOG_SYNC_XTREAM_MAX_RETRIES = int(os.environ.get('CATALOG_SYNC_XTREAM_MAX_RETRIES', '8'))
CATALOG_SYNC_XTREAM_RETRY_BACKOFF = os.environ.get('CATALOG_SYNC_XTREAM_RETRY_BACKOFF', '2,5,10')
CATALOG_SYNC_XTREAM_CONNECT_TIMEOUT = float(os.environ.get('CATALOG_SYNC_XTREAM_CONNECT_TIMEOUT', '20'))
CATALOG_SYNC_XTREAM_READ_TIMEOUT = float(os.environ.get('CATALOG_SYNC_XTREAM_READ_TIMEOUT', '90'))
XTREAM_HTTP_PROXY = os.environ.get('XTREAM_HTTP_PROXY', '').strip()
# Reproducción directa navegador → proveedor (estilo TiviMate). El proxy VM solo como fallback.
CLIENT_DIRECT_PLAYBACK = os.environ.get('CLIENT_DIRECT_PLAYBACK', 'true').lower() == 'true'
# URLs de stream al navegador con https:// aunque el panel use http:// (evita mixed content).
XTREAM_CLIENT_STREAM_HTTPS = os.environ.get('XTREAM_CLIENT_STREAM_HTTPS', 'true').lower() == 'true'
CATALOG_ENRICH_CAST_ON_SYNC = os.environ.get('CATALOG_ENRICH_CAST_ON_SYNC', 'true').lower() == 'true'
CATALOG_ENRICH_BATCH_LIMIT = int(os.environ.get('CATALOG_ENRICH_BATCH_LIMIT', '300'))

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{levelname}] {asctime} {name}: {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'library.catalog_sync': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'api.xtream': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}
