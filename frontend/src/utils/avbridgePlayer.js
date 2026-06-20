import { createPlayer } from 'avbridge'

const LOG_PREFIX = '[IPTV Avbridge]'
const SEEK_CACHE_BYTES = 32 * 1024 * 1024

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

const SERVER_FIRST_CONTAINERS = new Set([
  'mkv', 'avi', 'wmv', 'flv', 'ts', 'm2ts', 'mpeg', 'mpg', 'webm',
])

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} superó ${Math.round(ms / 1000)}s`))
    }, ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        window.clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export function shouldUseAvbridgeForVod(playbackUrl, isVodLike, ext = '') {
  if (!isVodLike || !playbackUrl.includes('/api/proxy/play')) return false
  const container = String(ext || '').toLowerCase().replace(/^\./, '')
  if (SERVER_FIRST_CONTAINERS.has(container)) return false
  return true
}

/**
 * Reproductor avbridge con logging detallado en consola.
 */
export async function attachAvbridgePlayer(video, sourceUrl, {
  resumeAt = 0,
  initialMuted = false,
  context = {},
  onTracks,
  onTimeUpdate,
  onStrategyChange,
  onError,
  onStall,
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
    backgroundBehavior: 'continue',
    cacheBytes: SEEK_CACHE_BYTES,
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
  let audioTracksList = []

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
    onStrategyChange?.(payload)
  })

  bind('tracks', (payload) => {
    audioTracksList = payload.audio || []
    logAvbridge('tracks', 'Pistas detectadas', {
      video: payload.video?.length || 0,
      audio: audioTracksList.length,
      subtitle: payload.subtitle?.length || 0,
      payload,
      context,
    })
    onTracks?.(payload)
    if (audioTracksList.length > 0) {
      player.setAudioTrack(audioTracksList[0].id).catch((err) => {
        logAvbridgeWarn('tracks', 'No se pudo fijar pista de audio por defecto', {
          error: err?.message,
        })
      })
    }
  })

  let lastLoggedSecond = -1
  let stallTimer = null
  let sawPlaybackProgress = false

  bind('timeupdate', (payload) => {
    onTimeUpdate?.(payload)
    if (payload.currentTime > 0.25) {
      sawPlaybackProgress = true
      if (stallTimer) {
        window.clearTimeout(stallTimer)
        stallTimer = null
      }
    }
    const second = Math.floor(payload.currentTime)
    if (second > 0 && second % 30 === 0 && second !== lastLoggedSecond) {
      lastLoggedSecond = second
      logAvbridge('timeupdate', `Posición ~${second}s`, {
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
    if (stallTimer) window.clearTimeout(stallTimer)
    stallTimer = window.setTimeout(() => {
      if (!sawPlaybackProgress) {
        logAvbridgeWarn('stall', 'Sin avance tras estar listo', {
          videoState: {
            paused: video.paused,
            currentTime: video.currentTime,
            readyState: video.readyState,
            networkState: video.networkState,
          },
          diagnostics: player.getDiagnostics(),
        })
        onStall?.({ reason: 'sin avance tras ready' })
      }
    }, 20000)
  })

  bind('error', (err) => {
    logAvbridgeError('error', err?.message || 'Error avbridge', {
      error: err,
      diagnostics: player.getDiagnostics(),
      context,
    })
    onError?.(err)
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
    await withTimeout(player.play(), 20000, 'play()')
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
    play: () => player.play(),
    pause: () => player.pause(),
    seek: (seconds) => player.seek(seconds),
    setAudioTrack: (id) => player.setAudioTrack(id),
    getAudioTracks: () => audioTracksList,
    destroy: async () => {
      logAvbridge('destroy', 'Destruyendo sesión avbridge', { context })
      if (stallTimer) window.clearTimeout(stallTimer)
      window.clearInterval(diagTimer)
      unsubscribers.forEach((fn) => fn())
      audioTracksList = []
      await player.destroy()
    },
  }
}
