export async function fetchDeployVersion() {
  const response = await fetch(`/version.json?_=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return null
  const data = await response.json()
  return data?.version ? String(data.version) : null
}
