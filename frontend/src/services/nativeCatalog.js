/**
 * Catálogo Xtream directo desde el dispositivo (Capacitor Android/iOS).
 * Sin CORS: cada petición sale con la IP del móvil, estilo Smarters/TiviMate.
 */
import { CapacitorHttp } from '@capacitor/core'
import { API_BASE } from '../config'
import { getTokens } from '../auth/tokens'
import {
  buildLiveStreamUrl,
  buildSeriesStreamUrl,
  buildVodStreamUrl,
} from '../utils/xtreamClient'
import { isNativeApp } from '../utils/platform'

const MAG_UA = (
  'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 '
  + '(KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3'
)

let credsCache = null
let credsCacheAt = 0
const CREDS_TTL_MS = 5 * 60 * 1000

export function canUseNativeXtream() {
  return isNativeApp()
}

async function gatewayFetch(path) {
  const tokens = getTokens()
  const headers = { 'Content-Type': 'application/json' }
  if (tokens?.access) headers.Authorization = `Bearer ${tokens.access}`
  const response = await fetch(`${API_BASE}${path}`, { headers })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || `Error gateway (${path})`)
  }
  return response.json()
}

export async function getNativeCredentials(force = false) {
  if (!force && credsCache && Date.now() - credsCacheAt < CREDS_TTL_MS) {
    return credsCache
  }
  const creds = await gatewayFetch('/xtream/credentials')
  credsCache = creds
  credsCacheAt = Date.now()
  return creds
}

export function clearNativeCredentials() {
  credsCache = null
  credsCacheAt = 0
}

async function xtreamAction(action, params = {}) {
  const creds = await getNativeCredentials()
  const base = creds.server.replace(/\/+$/, '')
  const query = new URLSearchParams({
    username: creds.username,
    password: creds.password,
    action,
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ),
  })
  const url = `${base}/player_api.php?${query.toString()}`
  const response = await CapacitorHttp.get({
    url,
    headers: { 'User-Agent': MAG_UA },
  })
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Xtream ${action}: HTTP ${response.status}`)
  }
  const data = typeof response.data === 'string'
    ? JSON.parse(response.data)
    : response.data
  return data
}

function paginate(items, offset, limit) {
  const list = Array.isArray(items) ? items : []
  const slice = list.slice(offset, offset + limit)
  return { total: list.length, offset, limit, items: slice }
}

function parseCatalogPath(path) {
  const [pathname, search = ''] = path.split('?')
  const params = Object.fromEntries(new URLSearchParams(search))
  return { pathname, params }
}

export async function fetchCatalogNative(path) {
  const { pathname, params } = parseCatalogPath(path)

  if (pathname === '/catalog/live/categories') {
    return xtreamAction('get_live_categories')
  }
  if (pathname === '/catalog/vod/categories') {
    return xtreamAction('get_vod_categories')
  }
  if (pathname === '/catalog/series/categories') {
    return xtreamAction('get_series_categories')
  }

  if (pathname === '/catalog/live/streams') {
    const categoryId = params.category_id
    if (!categoryId) throw new Error('category_id requerido')
    const items = await xtreamAction('get_live_streams', { category_id: categoryId })
    if (params.paginated === '1') {
      return paginate(items, Number(params.offset || 0), Number(params.limit || 300))
    }
    const limit = Number(params.limit || items.length)
    return (Array.isArray(items) ? items : []).slice(0, limit)
  }

  if (pathname === '/catalog/vod/streams') {
    const categoryId = params.category_id
    if (!categoryId) throw new Error('category_id requerido')
    const items = await xtreamAction('get_vod_streams', { category_id: categoryId })
    if (params.paginated === '1') {
      return paginate(items, Number(params.offset || 0), Number(params.limit || 300))
    }
    const limit = Number(params.limit || items.length)
    return (Array.isArray(items) ? items : []).slice(0, limit)
  }

  if (pathname === '/catalog/series') {
    const categoryId = params.category_id
    if (!categoryId) throw new Error('category_id requerido')
    const items = await xtreamAction('get_series', { category_id: categoryId })
    if (params.paginated === '1') {
      return paginate(items, Number(params.offset || 0), Number(params.limit || 300))
    }
    const limit = Number(params.limit || items.length)
    return (Array.isArray(items) ? items : []).slice(0, limit)
  }

  const seriesMatch = pathname.match(/^\/catalog\/series\/([^/]+)$/)
  if (seriesMatch) {
    return xtreamAction('get_series_info', { series_id: seriesMatch[1] })
  }

  throw new Error(`Ruta nativa no soportada: ${pathname}`)
}

export async function fetchLiveEpgNative(itemId, limit = 8) {
  try {
    const data = await xtreamAction('get_short_epg', {
      stream_id: itemId,
      limit: String(limit),
    })
    const listings = data?.epg_listings || (Array.isArray(data) ? data : [])
    const current = listings[0] || null
    return {
      stream_id: itemId,
      listings,
      current,
      has_epg: listings.length > 0,
    }
  } catch {
    return { has_epg: false, listings: [], current: null }
  }
}

export async function fetchPlayUrlNative(path) {
  const creds = await getNativeCredentials()
  const liveMatch = path.match(/^\/catalog\/live\/([^/]+)\/play/)
  if (liveMatch) {
    const direct = buildLiveStreamUrl(creds, liveMatch[1])
    return {
      type: 'live',
      stream_id: liveMatch[1],
      url: direct,
      direct_url: direct,
      proxy_url: null,
      playback_mode: 'direct',
    }
  }

  const vodMatch = path.match(/^\/catalog\/vod\/([^/?]+)\/play(?:\?(.*))?$/)
  if (vodMatch) {
    const ext = vodMatch[2]
      ? (new URLSearchParams(vodMatch[2]).get('ext') || 'mp4')
      : 'mp4'
    const direct = buildVodStreamUrl(creds, vodMatch[1], ext)
    return {
      type: 'vod',
      stream_id: vodMatch[1],
      ext,
      url: direct,
      direct_url: direct,
      proxy_url: null,
      playback_mode: 'direct',
      duration_seconds: 0,
      tracks: { audio: [], subtitles: [] },
    }
  }

  const epMatch = path.match(/^\/catalog\/series\/episode\/([^/?]+)\/play(?:\?(.*))?$/)
  if (epMatch) {
    const ext = epMatch[2]
      ? (new URLSearchParams(epMatch[2]).get('ext') || 'mp4')
      : 'mp4'
    const direct = buildSeriesStreamUrl(creds, epMatch[1], ext)
    return {
      type: 'series',
      stream_id: epMatch[1],
      ext,
      url: direct,
      direct_url: direct,
      proxy_url: null,
      playback_mode: 'direct',
      duration_seconds: 0,
      tracks: { audio: [], subtitles: [] },
    }
  }

  throw new Error(`Play nativo no soportado: ${path}`)
}
