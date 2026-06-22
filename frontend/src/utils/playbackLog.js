const MEDIA_ERR_LABELS = {
  1: 'MEDIA_ERR_ABORTED',
  2: 'MEDIA_ERR_NETWORK',
  3: 'MEDIA_ERR_DECODE',
  4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
}

export function logPlaybackError(source, message, details = {}) {
  const text = typeof message === 'string' ? message : message?.message || String(message)
  const entry = {
    source,
    message: text,
    timestamp: new Date().toISOString(),
    ...details,
  }

  if (message instanceof Error) {
    entry.error = {
      name: message.name,
      message: message.message,
      stack: message.stack,
    }
  }

  if (details.mediaErrorCode) {
    entry.mediaErrorLabel = MEDIA_ERR_LABELS[details.mediaErrorCode] || 'UNKNOWN'
  }

  console.error('[IPTV Playback]', text, entry)
}

export function logPlaybackInfo(source, message, details = {}) {
  console.info('[IPTV Playback]', message, {
    source,
    timestamp: new Date().toISOString(),
    ...details,
  })
}

export function logPlaybackWarn(source, message, details = {}) {
  console.warn('[IPTV Playback]', message, { source, timestamp: new Date().toISOString(), ...details })
}
