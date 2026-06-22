import { resolveApiUrl } from '../config'
import { isNativeApp } from './platform'
import { logPlaybackInfo } from './playbackLog'

/** Presenta stream HTTP como HTTPS (solo web HTTPS; en app nativa se usa HTTP real). */
export function presentHttpsStreamUrl(url) {
  if (!url) return url
  if (isNativeApp()) return url
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return url.replace(/^http:\/\//i, 'https://')
  }
  return url
}

export function isMixedContentUrl(url) {
  if (!url || typeof window === 'undefined') return false
  if (isNativeApp()) return false
  return window.location.protocol === 'https:' && /^http:\/\//i.test(url)
}

/**
 * URL directa al proveedor; en web HTTPS usa proxy como fallback si hay mixed content.
 */
export function resolvePlaybackUrls(playData) {
  const rawDirect = playData.direct_url
    || (playData.playback_mode === 'direct' ? playData.url : null)
  const proxyUrl = playData.proxy_url ? resolveApiUrl(playData.proxy_url) : null

  if (playData.playback_mode === 'direct' && rawDirect) {
    if (isNativeApp()) {
      logPlaybackInfo('playback.url', 'Stream directo (app nativa → proveedor)', {
        playbackMode: 'direct',
      })
      return {
        url: rawDirect,
        fallbackUrl: null,
        playbackMode: 'direct',
        directUrl: rawDirect,
      }
    }

    if (isMixedContentUrl(rawDirect) && proxyUrl) {
      logPlaybackInfo('playback.url', 'Proxy VM (panel HTTP, web HTTPS)', {
        playbackMode: 'proxy',
      })
      return {
        url: proxyUrl,
        fallbackUrl: null,
        playbackMode: 'proxy',
        directUrl: rawDirect,
      }
    }

    const streamUrl = presentHttpsStreamUrl(rawDirect)
    logPlaybackInfo('playback.url', 'Stream directo con fallback proxy', {
      playbackMode: 'direct',
      url: streamUrl,
      hasProxyFallback: Boolean(proxyUrl),
    })
    return {
      url: streamUrl,
      fallbackUrl: proxyUrl && proxyUrl !== streamUrl ? proxyUrl : null,
      playbackMode: 'direct',
      directUrl: rawDirect,
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
