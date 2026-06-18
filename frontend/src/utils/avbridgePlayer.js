import { createPlayer } from 'avbridge'

const LOG_PREFIX = '[IPTV Avbridge]'

export function logAvbridge(phase, message, data = {}) {
  console.info(LOG_PREFIX, message, {
    phase,
    timestamp: new Date().toISOString(),
    crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : null,
    ...data,
  })
}

export function logAvbridgeWarn(phase, message, data = {}) {
  console.warn(LOG_PREFIX, message, {
    phase,
    timestamp: new Date().toISOString(),
    ...data,
  })
}

export function logAvbridgeError(phase, message, data = {}) {
  console.error(LOG_PREFIX, message, {
    phase,
    timestamp: new Date().toISOString(),
    ...data,
  })
}

export function appendClientDecode(url) {
  if (!url) return url
  if (url.includes('client_decode=1')) return url
  const joiner = url.includes('?') ? '&' : '?'
  return `${url}${joiner}client_decode=1`
}

export function stripClientDecode(url) {
  if (!url) return url
  return url
    .replace(/([?&])client_decode=1(?=&|$)/g, (_, prefix) => (prefix === '?' ? '?' : ''))
    .replace(/\?&/, '?')
    .replace(/[?&]$/, '')
}

export function shouldUseAvbridgeForVod(playbackUrl, isVodLike) {
  return Boolean(isVodLike && playbackUrl.includes('/api/proxy/play'))
}

/**
 * Reproductor avbridge con logging detallado en consola.
 */
export async function attachAvbridgePlayer(video, sourceUrl, {
  resumeAt = 0,
  initialMuted = false,
  context = {},
} = {}) {
  logAvbridge('init', 'Iniciando avbridge', { sourceUrl, resumeAt, initialMuted, context })

  if (!crossOriginIsolated) {
    logAvbridgeWarn(
      'environment',
      'crossOriginIsolated=false — los codecs legacy (HEVC/DivX/AC3) pueden fallar en modo fallback WASM',
    )
  }

  const player = await createPlayer({
    source: sourceUrl,
    target: video,
    autoEscalate: true,
    requestInit: {
      credentials: 'same-origin',
    },
    fetchFn: async (input, init) => {
      const started = performance.now()
      logAvbridge('fetch', 'HTTP request', {
        url: String(input),
        method: init?.method || 'GET',
        headers: init?.headers || null,
      })
      try {
        const response = await fetch(input, init)
        logAvbridge('fetch', 'HTTP response', {
          url: String(input),
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get('content-type'),
          acceptRanges: response.headers.get('accept-ranges'),
          contentLength: response.headers.get('content-length'),
          ms: Math.round(performance.now() - started),
        })
        return response
      } catch (err) {
        logAvbridgeError('fetch', 'HTTP falló', {
          url: String(input),
          error: err?.message || String(err),
          ms: Math.round(performance.now() - started),
        })
        throw err
      }
    },
  })

  const unsubscribers = []

  const bind = (event, handler) => {
    const unsub = player.on(event, handler)
    unsubscribers.push(unsub)
  }

  bind('strategy', (payload) => {
    logAvbridge('strategy', `Estrategia: ${payload.strategy}`, {
      reason: payload.reason,
      diagnostics: player.getDiagnostics(),
      context,
    })
  })

  bind('strategychange', (payload) => {
    logAvbridgeWarn('strategychange', `Cambio ${payload.from} → ${payload.to}`, {
      reason: payload.reason,
      currentTime: payload.currentTime,
      diagnostics: player.getDiagnostics(),
      context,
    })
  })

  bind('tracks', (payload) => {
    logAvbridge('tracks', 'Pistas detectadas', {
      video: payload.video?.length || 0,
      audio: payload.audio?.length || 0,
      subtitle: payload.subtitle?.length || 0,
      payload,
      context,
    })
  })

  bind('timeupdate', (payload) => {
    if (Math.floor(payload.currentTime) % 30 === 0) {
      logAvbridge('timeupdate', `Posición ~${Math.floor(payload.currentTime)}s`, {
        currentTime: payload.currentTime,
        strategy: player.getDiagnostics()?.strategy,
      })
    }
  })

  bind('ended', () => {
    logAvbridge('ended', 'Reproducción terminada', { diagnostics: player.getDiagnostics(), context })
  })

  bind('ready', () => {
    logAvbridge('ready', 'Reproductor listo', {
      diagnostics: player.getDiagnostics(),
      context,
    })
  })

  bind('error', (err) => {
    logAvbridgeError('error', err?.message || 'Error avbridge', {
      error: err,
      diagnostics: player.getDiagnostics(),
      context,
    })
  })

  const diagTimer = window.setInterval(() => {
    try {
      logAvbridge('diagnostics', 'Estado periódico', {
        diagnostics: player.getDiagnostics(),
        videoState: {
          paused: video.paused,
          muted: video.muted,
          currentTime: video.currentTime,
          duration: video.duration,
          readyState: video.readyState,
          networkState: video.networkState,
        },
      })
    } catch (err) {
      logAvbridgeWarn('diagnostics', 'No se pudo leer diagnóstico', { error: err?.message })
    }
  }, 15000)

  video.muted = initialMuted
  video.volume = 1

  if (resumeAt > 0) {
    try {
      await player.seek(resumeAt)
      logAvbridge('seek', `Posición restaurada a ${resumeAt}s`)
    } catch (err) {
      logAvbridgeWarn('seek', 'No se pudo restaurar posición', { resumeAt, error: err?.message })
    }
  }

  const tryPlay = async (muted) => {
    video.muted = muted
    await player.play()
    logAvbridge('play', muted ? 'Play OK (mute)' : 'Play OK', { diagnostics: player.getDiagnostics() })
  }

  try {
    await tryPlay(initialMuted)
  } catch (err) {
    if (!initialMuted) {
      try {
        await tryPlay(true)
      } catch (mutedErr) {
        logAvbridgeError('play', 'Fallo al reproducir', { error: mutedErr?.message || err?.message })
        throw mutedErr
      }
    } else {
      logAvbridgeError('play', 'Fallo al reproducir', { error: err?.message })
      throw err
    }
  }

  return {
    player,
    destroy: async () => {
      logAvbridge('destroy', 'Destruyendo sesión avbridge', { context })
      window.clearInterval(diagTimer)
      unsubscribers.forEach((fn) => fn())
      await player.destroy()
    },
  }
}
