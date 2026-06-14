#!/bin/sh
set -e

python manage.py migrate --noinput
python manage.py seed_initial_data

python manage.py shell -c "
from library.catalog_sync import sync_status_payload, sync_catalog_index
import threading
state = sync_status_payload()
if not state.get('ready') and state.get('status') != 'running':
    threading.Thread(target=sync_catalog_index, kwargs={'force': False}, daemon=True).start()
    print('Catalog index sync started in background')
elif state.get('ready'):
    print('Catalog index already ready')
else:
    print('Catalog index sync already running')
" || true

if [ -n "$DJANGO_SUPERUSER_USERNAME" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
  python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
u, created = User.objects.get_or_create(username='$DJANGO_SUPERUSER_USERNAME', defaults={'email': '${DJANGO_SUPERUSER_EMAIL:-admin@localhost}', 'is_staff': True, 'is_superuser': True})
if created or not u.is_superuser:
    u.is_staff = True
    u.is_superuser = True
    u.set_password('$DJANGO_SUPERUSER_PASSWORD')
    u.save()
    print('Superuser ready')
"
fi

exec gunicorn gateway.wsgi:application --bind 0.0.0.0:8000 --workers 2 --threads 4 --timeout 600
