import { resolveApiUrl } from '../config'
import { logPlaybackInfo } from './playbackLog'

/** Presenta stream HTTP como HTTPS (mismo host) para evitar mixed content en la web. */
export function presentHttpsStreamUrl(url) {
  if (!url) return url
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return url.replace(/^http:\/\//i, 'https://')
  }
  return url
}

export function isMixedContentUrl(url) {
  if (!url || typeof window === 'undefined') return false
  return window.location.protocol === 'https:' && /^http:\/\//i.test(url)
}

/**
 * URL directa al proveedor con esquema HTTPS en página HTTPS.
 * Si falla la conexión, el reproductor usa proxy_url (túnel HTTPS real vía API).
 */
export function resolvePlaybackUrls(playData) {
  const rawDirect = playData.direct_url
    || (playData.playback_mode === 'direct' ? playData.url : null)
  const proxyUrl = playData.proxy_url ? resolveApiUrl(playData.proxy_url) : null
  const streamUrl = presentHttpsStreamUrl(rawDirect || playData.url)

  if (streamUrl && playData.playback_mode === 'direct') {
    logPlaybackInfo('playback.url', 'Stream directo (HTTPS al proveedor)', {
      playbackMode: 'direct',
      url: streamUrl,
      hasProxyFallback: Boolean(proxyUrl),
    })
    return {
      url: streamUrl,
      fallbackUrl: proxyUrl && proxyUrl !== streamUrl ? proxyUrl : null,
      playbackMode: 'direct',
      directUrl: rawDirect || null,
    }
  }

  const url = proxyUrl || resolveApiUrl(playData.url)
  return {
    url,
    fallbackUrl: null,
    playbackMode: 'proxy',
    directUrl: rawDirect || null,
  }
}

export function isGatewayProxyUrl(url) {
  return Boolean(url && String(url).includes('/api/proxy/play'))
}
