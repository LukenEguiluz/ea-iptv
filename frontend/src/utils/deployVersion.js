export async function fetchDeployVersion() {
  const response = await fetch(`/version.json?_=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return null
  const data = await response.json()
  return data?.version ? String(data.version) : null
}

/** Recarga forzada: limpia caches del navegador y evita assets viejos en memoria. */
export async function reloadAppWithFreshAssets() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch {
    // Sin Cache API o bloqueada — seguir con reload
  }

  const target = new URL(window.location.href)
  target.searchParams.set('_deploy', String(Date.now()))
  window.location.replace(target.toString())
}
