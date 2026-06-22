import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { fetchCatalogRefresh, triggerCatalogRefresh } from '../api'
import { useAppConfig } from './AppConfigContext'
import { useAuth } from './AuthContext'
import {
  formatRetryMessage,
  logCatalogError,
  logCatalogInfo,
  logCatalogWarn,
  summarizeCatalogStatus,
} from '../utils/catalogLog'
import {
  CATALOG_REFRESH_MS,
  CATALOG_SYNC_PROGRESS_POLL_MS,
  CATALOG_VISIBILITY_MS,
  REFRESH_STATUS_POLL_MS,
} from '../utils/refreshIntervals'

const CatalogRefreshContext = createContext(null)

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function CatalogRefreshProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const { isOnDemand } = useAppConfig()
  const [refreshGeneration, setRefreshGeneration] = useState(0)
  const [catalogStatus, setCatalogStatus] = useState(null)
  const versionRef = useRef(null)
  const syncingRef = useRef(false)
  const hiddenAtRef = useRef(null)
  const prevStatusRef = useRef(null)

  const bumpIfNewVersion = useCallback((version) => {
    if (!version) return
    if (versionRef.current && version !== versionRef.current) {
      logCatalogInfo('version', 'Catálogo actualizado en servidor', { version })
      setRefreshGeneration((value) => value + 1)
    }
    versionRef.current = version
  }, [])

  const emitStatusLogs = useCallback((data, source) => {
    if (!data) return

    const prev = prevStatusRef.current
    const summary = summarizeCatalogStatus(data)

    if (data.error && data.error !== prev?.error) {
      logCatalogError('sync', data.error, { source, ...summary })
    }

    const retryAttempt = data.progress_retry_attempt || 0
    const prevRetryAttempt = prev?.progress_retry_attempt || 0
    if (data.status === 'running' && retryAttempt > 0 && retryAttempt !== prevRetryAttempt) {
      logCatalogWarn('retry', formatRetryMessage(data) || `Reintento ${retryAttempt}`, {
        source,
        ...summary,
      })
    }

    if (source === 'init' && !prev && data.status === 'running') {
      logCatalogInfo(
        'init',
        data.progress_last_error
          ? `Sync en curso · ${formatRetryMessage(data)}`
          : `Sync en curso · ${data.progress_percent || 0}%`,
        { source, ...summary },
      )
    } else if (data.status !== prev?.status) {
      logCatalogInfo('status', `Estado: ${data.status}`, { source, ...summary })
    } else if (
      data.status === 'running'
      && typeof data.progress_percent === 'number'
      && data.progress_percent !== prev?.progress_percent
      && data.progress_percent > 0
      && (data.progress_percent % 10 === 0 || data.progress_percent >= 95)
    ) {
      logCatalogInfo(
        'progress',
        `${data.progress_percent}% · ${data.progress_phase || 'Sincronizando'}`,
        { source, ...summary },
      )
    }

    prevStatusRef.current = summary
  }, [])

  const applyCatalogStatus = useCallback((data, source = 'poll') => {
    emitStatusLogs(data, source)
    setCatalogStatus(data)
    return data
  }, [emitStatusLogs])

  const readStatus = useCallback(async (source = 'poll') => {
    try {
      const data = await fetchCatalogRefresh()
      bumpIfNewVersion(data.version)
      return applyCatalogStatus(data, source)
    } catch (err) {
      logCatalogError('fetch', 'No se pudo leer el estado del catálogo', {
        source,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }, [applyCatalogStatus, bumpIfNewVersion])

  const waitForSync = useCallback(async (types = ['live']) => {
    const deadline = Date.now() + 30 * 60 * 1000
    while (Date.now() < deadline) {
      await sleep(CATALOG_SYNC_PROGRESS_POLL_MS)
      try {
        const data = await fetchCatalogRefresh()
        applyCatalogStatus(data, 'wait')
        if (data.status !== 'running') {
          bumpIfNewVersion(data.version)
          if (data.status === 'ready') {
            logCatalogInfo('complete', 'Sincronización completada', summarizeCatalogStatus(data))
          }
          return data
        }
        const waitingFor = types || ['live']
        const allReady = waitingFor.every((type) => data.ready_by_type?.[type])
        if (allReady) {
          bumpIfNewVersion(data.version)
          logCatalogInfo('complete', 'Sincronización completada', summarizeCatalogStatus(data))
          return data
        }
      } catch (err) {
        logCatalogWarn('wait', 'Error al consultar progreso; reintentando…', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    logCatalogWarn('wait', 'Tiempo de espera agotado; leyendo estado final')
    return readStatus('wait-timeout')
  }, [applyCatalogStatus, bumpIfNewVersion, readStatus])

  const runCatalogRefresh = useCallback(async ({ force = false, types = ['live'], wait = true } = {}) => {
    if (isOnDemand) {
      logCatalogInfo('skip', 'Sync desactivada en modo directo (on-demand)')
      return null
    }
    if (!isAuthenticated || syncingRef.current) return readStatus('skip')
    syncingRef.current = true
    logCatalogInfo('start', force ? 'Iniciando sync forzada' : 'Iniciando sync programada', { force, types })
    try {
      const result = await triggerCatalogRefresh(force, types)
      applyCatalogStatus(result, 'trigger')
      bumpIfNewVersion(result.version)
      if (wait && (result.status === 'running' || result.detail === 'Sincronización iniciada.')) {
        return waitForSync(types)
      }
      return result
    } catch (err) {
      logCatalogError('trigger', 'No se pudo iniciar la sincronización', {
        force,
        types,
        error: err instanceof Error ? err.message : String(err),
      })
      return readStatus('trigger-error')
    } finally {
      syncingRef.current = false
    }
  }, [applyCatalogStatus, bumpIfNewVersion, isAuthenticated, isOnDemand, readStatus, waitForSync])

  useEffect(() => {
    if (!isAuthenticated || isOnDemand) {
      versionRef.current = null
      prevStatusRef.current = null
      if (isOnDemand) setCatalogStatus(null)
      return undefined
    }

    readStatus('init')
      .then((data) => {
        if (!data?.ready_by_type?.live && data?.status !== 'running') {
          runCatalogRefresh({ types: ['live'], wait: false })
        }
      })
      .catch(() => {})

    const timer = window.setInterval(() => {
      runCatalogRefresh({ types: ['live'], wait: false })
    }, CATALOG_REFRESH_MS)

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now()
        return
      }
      if (document.visibilityState !== 'visible') return

      const hiddenMs = hiddenAtRef.current
        ? Date.now() - hiddenAtRef.current
        : CATALOG_VISIBILITY_MS
      hiddenAtRef.current = null

      if (hiddenMs >= CATALOG_VISIBILITY_MS) {
        runCatalogRefresh({ types: ['live'], wait: false })
      } else {
        readStatus('visibility').catch(() => {})
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [isAuthenticated, isOnDemand, readStatus, runCatalogRefresh])

  useEffect(() => {
    if (!isAuthenticated || isOnDemand) return undefined

    const timer = window.setInterval(() => {
      readStatus('interval').catch(() => {})
    }, REFRESH_STATUS_POLL_MS)

    return () => window.clearInterval(timer)
  }, [isAuthenticated, isOnDemand, readStatus])

  useEffect(() => {
    if (!isAuthenticated || isOnDemand || catalogStatus?.status !== 'running') return undefined

    const timer = window.setInterval(() => {
      readStatus('running-poll').catch(() => {})
    }, CATALOG_SYNC_PROGRESS_POLL_MS)

    return () => window.clearInterval(timer)
  }, [catalogStatus?.status, isAuthenticated, isOnDemand, readStatus])

  return (
    <CatalogRefreshContext.Provider value={{ refreshGeneration, catalogStatus, readCatalogStatus: readStatus, runCatalogRefresh }}>
      {children}
    </CatalogRefreshContext.Provider>
  )
}

export function useCatalogRefresh() {
  const context = useContext(CatalogRefreshContext)
  if (!context) {
    throw new Error('useCatalogRefresh debe usarse dentro de CatalogRefreshProvider')
  }
  return context
}
