/** Base API: `/api` (mismo origen) o `https://tu-backend.com/api` (Vercel + backend separado). */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

/** Origen del backend sin `/api` — para URLs relativas `/api/proxy/...` en play e imágenes. */
export const API_ORIGIN = API_BASE.startsWith('http')
  ? API_BASE.replace(/\/api\/?$/i, '')
  : ''

export function resolveApiUrl(pathOrUrl) {
  if (!pathOrUrl) return pathOrUrl
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  if (!pathOrUrl.startsWith('/')) return pathOrUrl

  if (API_ORIGIN) {
    return `${API_ORIGIN}${pathOrUrl}`
  }

  if (pathOrUrl.startsWith('/api/')) {
    return `${API_BASE}${pathOrUrl.slice(4)}`
  }

  return pathOrUrl
}
