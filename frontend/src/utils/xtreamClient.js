import { apiFetch } from '../api'

/**
 * Cliente Xtream on-demand (estilo Smarters/TiviMate).
 * Una petición API por acción, credenciales de la sesión del usuario en el backend.
 */
export async function xtreamAction(action, params = {}) {
  const query = new URLSearchParams({ action, ...params })
  const response = await apiFetch(`/xtream/player_api?${query.toString()}`)
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || `Error Xtream (${action})`)
  }
  return response.json()
}

export async function fetchXtreamCredentials() {
  const response = await apiFetch('/xtream/credentials')
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'No se pudieron obtener credenciales Xtream')
  }
  return response.json()
}

export function buildLiveStreamUrl(creds, streamId) {
  const base = creds.server.replace(/\/+$/, '')
  return `${base}/live/${creds.username}/${creds.password}/${streamId}.ts`
}

export function buildVodStreamUrl(creds, streamId, ext = 'mp4') {
  const base = creds.server.replace(/\/+$/, '')
  return `${base}/movie/${creds.username}/${creds.password}/${streamId}.${ext.replace(/^\./, '')}`
}

export function buildSeriesStreamUrl(creds, episodeId, ext = 'mp4') {
  const base = creds.server.replace(/\/+$/, '')
  return `${base}/series/${creds.username}/${creds.password}/${episodeId}.${ext.replace(/^\./, '')}`
}
