const LOG_PREFIX = '[IPTV Catálogo]'

function buildEntry(source, message, details = {}) {
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

  return { text, entry }
}

export function formatRetryMessage(data) {
  if (!data) return ''
  const parts = []
  if (data.progress_detail) parts.push(data.progress_detail)
  if (data.progress_last_error) parts.push(data.progress_last_error)
  return parts.join(' — ')
}

export function logCatalogInfo(source, message, details = {}) {
  const { text } = buildEntry(source, message, details)
  console.info(`${LOG_PREFIX} ${text}`)
}

export function logCatalogWarn(source, message, details = {}) {
  const { text, entry } = buildEntry(source, message, details)
  console.warn(`${LOG_PREFIX} ${text}`)
  if (Object.keys(entry).length > 3) {
    console.debug(`${LOG_PREFIX} detalle`, entry)
  }
}

export function logCatalogError(source, message, details = {}) {
  const { text, entry } = buildEntry(source, message, details)
  console.error(`${LOG_PREFIX} ${text}`)
  console.error(`${LOG_PREFIX} detalle`, entry)
}

export function summarizeCatalogStatus(data) {
  if (!data) return null
  return {
    status: data.status,
    progress_percent: data.progress_percent,
    progress_phase: data.progress_phase,
    progress_detail: data.progress_detail,
    progress_last_error: data.progress_last_error,
    progress_retry_attempt: data.progress_retry_attempt,
    error: data.error,
    counts: data.counts,
    version: data.version,
  }
}
