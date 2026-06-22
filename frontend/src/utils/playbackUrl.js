import { resolveApiUrl } from '../config'
import { logPlaybackInfo, logPlaybackWarn } from './playbackLog'

export function isMixedContentUrl(url) {
  if (!url || typeof window === 'undefined') return false
  return window.location.protocol === 'https:' && /^http:\/\//i.test(url)
}

/**
 * Elige URL directa al proveedor (navegador → CDN) o proxy VM como fallback.
 * En HTTPS + stream HTTP el navegador bloquea mixed content → usa proxy.
 */
export function resolvePlaybackUrls(playData) {
  const directUrl = playData.direct_url
    || (playData.playback_mode === 'direct' ? playData.url : null)
  const proxyUrl = playData.proxy_url ? resolveApiUrl(playData.proxy_url) : null
  const forceDirect = import.meta.env.VITE_FORCE_DIRECT_STREAMS === 'true'
  const canUseDirect = Boolean(directUrl)
    && (forceDirect || !isMixedContentUrl(directUrl))

  if (canUseDirect) {
    logPlaybackInfo('playback.url', 'Reproducción directa al proveedor (sin proxy VM)', {
      playbackMode: 'direct',
      url: directUrl,
    })
    return {
      url: directUrl,
      fallbackUrl: proxyUrl && proxyUrl !== directUrl ? proxyUrl : null,
      playbackMode: 'direct',
      directUrl,
    }
  }

  if (directUrl && isMixedContentUrl(directUrl)) {
    logPlaybackWarn('playback.url', 'Stream HTTP bloqueado en página HTTPS — usando proxy VM', {
      directUrl,
      proxyUrl,
    })
  }

  const url = proxyUrl || resolveApiUrl(playData.url)
  return {
    url,
    fallbackUrl: null,
    playbackMode: 'proxy',
    directUrl: directUrl || null,
  }
}

export function isGatewayProxyUrl(url) {
  return Boolean(url && String(url).includes('/api/proxy/play'))
}
