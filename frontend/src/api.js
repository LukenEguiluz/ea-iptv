const API_BASE = '/api'

function getTokens() {
  const raw = localStorage.getItem('iptv_tokens')
  return raw ? JSON.parse(raw) : null
}

function setTokens(tokens) {
  localStorage.setItem('iptv_tokens', JSON.stringify(tokens))
}

function clearTokens() {
  localStorage.removeItem('iptv_tokens')
}

async function refreshAccessToken() {
  const tokens = getTokens()
  if (!tokens?.refresh) return null

  const response = await fetch(`${API_BASE}/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: tokens.refresh }),
  })

  if (!response.ok) {
    clearTokens()
    return null
  }

  const data = await response.json()
  const next = { ...tokens, access: data.access }
  setTokens(next)
  return next.access
}

export async function apiFetch(path, options = {}) {
  const tokens = getTokens()
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  if (tokens?.access) {
    headers.Authorization = `Bearer ${tokens.access}`
  }

  let response = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (response.status === 401 && tokens?.refresh) {
    const access = await refreshAccessToken()
    if (access) {
      headers.Authorization = `Bearer ${access}`
      response = await fetch(`${API_BASE}${path}`, { ...options, headers })
    }
  }

  return response
}

export async function login(username, password) {
  const response = await fetch(`${API_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Credenciales incorrectas')
  }

  const tokens = await response.json()
  setTokens(tokens)
  await apiFetch('/session/start', { method: 'POST', body: '{}' })
  return tokens
}

export function logout() {
  clearTokens()
}

export function isLoggedIn() {
  return Boolean(getTokens()?.access)
}

const CATALOG_PATHS = {
  live: '/catalog/live/streams',
  vod: '/catalog/vod/streams',
  series: '/catalog/series',
}

export async function fetchPaginatedCatalog(catalogType, categoryId, { offset = 0, limit = 300 } = {}) {
  const basePath = CATALOG_PATHS[catalogType]
  if (!basePath) {
    throw new Error('Tipo de catálogo no soportado')
  }
  const params = new URLSearchParams({
    category_id: categoryId,
    paginated: '1',
    offset: String(offset),
    limit: String(limit),
  })
  const response = await apiFetch(`${basePath}?${params}`)
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Error al cargar catálogo')
  }
  return response.json()
}

export async function fetchVodCatalog(categoryId, options = {}) {
  return fetchPaginatedCatalog('vod', categoryId, options)
}

export async function fetchCatalog(path) {
  const response = await apiFetch(path)
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Error al cargar contenido')
  }
  return response.json()
}

export async function fetchPlayUrl(path) {
  const response = await apiFetch(path)
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'No se pudo reproducir')
  }
  return response.json()
}

export async function fetchPlayUrlWithAudio(basePath, audioIndex) {
  const separator = basePath.includes('?') ? '&' : '?'
  return fetchPlayUrl(`${basePath}${separator}audio=${audioIndex}`)
}

export async function heartbeat() {
  await apiFetch('/session/heartbeat', { method: 'POST', body: '{}' })
}

export async function fetchDiagnostics() {
  const response = await apiFetch('/diagnostics/run')
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Error en diagnóstico')
  }
  return response.json()
}

export async function searchCatalog(query, type = '', limit = 40) {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  if (type) params.set('type', type)
  const response = await apiFetch(`/catalog/search?${params}`)
  if (response.status === 503) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Búsqueda no disponible todavía')
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Error en la búsqueda')
  }
  return response.json()
}

export async function fetchSearchStatus() {
  const response = await apiFetch('/catalog/search/status')
  if (!response.ok) return { ready: false, status: 'unknown', counts: {} }
  return response.json()
}

export async function fetchContinueWatching(limit = 12, type = '') {
  const params = new URLSearchParams({ limit: String(limit) })
  if (type) params.set('type', type)
  const response = await apiFetch(`/library/continue?${params}`)
  if (!response.ok) return []
  return response.json()
}

export async function fetchViewHistory(type = '', limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (type) params.set('type', type)
  const response = await apiFetch(`/library/history?${params}`)
  if (!response.ok) return []
  return response.json()
}

export async function fetchWatchProgress(contentType, itemId) {
  const response = await apiFetch(`/library/progress/${contentType}/${itemId}`)
  if (!response.ok) return null
  return response.json()
}

export async function saveWatchProgress(payload) {
  const { content_type: contentType, item_id: itemId, ...rest } = payload
  const response = await apiFetch(`/library/progress/${contentType}/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(rest),
  })
  if (!response.ok) return null
  return response.json()
}

export async function recordViewHistory(payload) {
  await apiFetch('/library/history/record', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function deleteViewHistory(contentType, itemId) {
  const params = new URLSearchParams({ type: contentType, item_id: String(itemId) })
  const response = await apiFetch(`/library/history?${params}`, { method: 'DELETE' })
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'No se pudo borrar del historial')
  }
}

export async function deleteWatchProgress(contentType, itemId) {
  const response = await apiFetch(`/library/progress/${contentType}/${itemId}`, { method: 'DELETE' })
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'No se pudo borrar el progreso')
  }
}

export async function clearViewHistory(contentType) {
  const params = new URLSearchParams({ type: contentType })
  const response = await apiFetch(`/library/history?${params}`, { method: 'DELETE' })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'No se pudo limpiar el historial')
  }
  return response.json()
}

export async function buildPlayerSession(item, options = {}) {
  const contentType = item.content_type || item.type
  const itemId = String(item.item_id || item.stream_id || item.series_id || '')
  const title = item.name || item.title || ''
  const image = item.image || item.stream_icon || item.cover || ''
  const ext = item.container_extension || item.ext || 'mp4'
  const categoryName = item.category_name || ''

  if (contentType === 'series') {
    return { navigate: `/series/${itemId}` }
  }

  if (contentType === 'live') {
    const [playData, epgData] = await Promise.all([
      fetchPlayUrl(`/catalog/live/${itemId}/play`),
      options.withEpg
        ? fetchCatalog(`/catalog/live/${itemId}/epg?limit=8`).catch(() => ({
          has_epg: false,
          listings: [],
          current: null,
        }))
        : Promise.resolve(null),
    ])
    await recordViewHistory({
      content_type: 'live',
      item_id: itemId,
      title,
      image,
      category_name: categoryName,
    })
    return {
      title,
      url: playData.url,
      type: playData.type,
      epg: epgData,
      meta: {
        contentType: 'live',
        itemId,
        title,
        image,
        categoryName,
      },
    }
  }

  const playData = await fetchPlayUrl(`/catalog/vod/${itemId}/play?ext=${ext}`)
  const progress = await fetchWatchProgress('vod', itemId).catch(() => null)
  await recordViewHistory({
    content_type: 'vod',
    item_id: itemId,
    title,
    image,
    category_name: categoryName,
    ext,
  })
  return {
    title,
    url: playData.url,
    type: 'vod',
    durationHint: playData.duration_seconds || progress?.duration_seconds || 0,
    tracks: playData.tracks || null,
    resumeAt: progress?.position_seconds || 0,
    meta: {
      contentType: 'vod',
      itemId,
      title,
      image,
      ext: playData.ext || ext,
      categoryName,
      playPath: `/catalog/vod/${itemId}/play?ext=${ext}`,
    },
  }
}

