import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { fetchCatalogRefresh, triggerCatalogRefresh } from '../api'
import { useAuth } from './AuthContext'
import {
  CATALOG_REFRESH_MS,
  CATALOG_VISIBILITY_MS,
  REFRESH_STATUS_POLL_MS,
  REFRESH_SYNC_POLL_MS,
} from '../utils/refreshIntervals'

const CatalogRefreshContext = createContext(null)

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function CatalogRefreshProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [refreshGeneration, setRefreshGeneration] = useState(0)
  const versionRef = useRef(null)
  const syncingRef = useRef(false)
  const hiddenAtRef = useRef(null)

  const bumpIfNewVersion = useCallback((version) => {
    if (!version) return
    if (versionRef.current && version !== versionRef.current) {
      setRefreshGeneration((value) => value + 1)
    }
    versionRef.current = version
  }, [])

  const readStatus = useCallback(async () => {
    const data = await fetchCatalogRefresh()
    bumpIfNewVersion(data.version)
    return data
  }, [bumpIfNewVersion])

  const waitForSync = useCallback(async () => {
    const deadline = Date.now() + 30 * 60 * 1000
    while (Date.now() < deadline) {
      await sleep(REFRESH_SYNC_POLL_MS)
      const data = await fetchCatalogRefresh()
      if (data.status !== 'running') {
        bumpIfNewVersion(data.version)
        return data
      }
    }
    return readStatus()
  }, [bumpIfNewVersion, readStatus])

  const runCatalogRefresh = useCallback(async () => {
    if (!isAuthenticated || syncingRef.current) return
    syncingRef.current = true
    try {
      const result = await triggerCatalogRefresh()
      bumpIfNewVersion(result.version)
      if (result.status === 'running' || result.detail === 'Sincronización iniciada.') {
        await waitForSync()
      }
    } catch {
      // Se reintentará en el próximo ciclo
    } finally {
      syncingRef.current = false
    }
  }, [bumpIfNewVersion, isAuthenticated, waitForSync])

  useEffect(() => {
    if (!isAuthenticated) {
      versionRef.current = null
      return undefined
    }

    readStatus().catch(() => {})

    const timer = window.setInterval(() => {
      runCatalogRefresh()
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
        runCatalogRefresh()
      } else {
        readStatus().catch(() => {})
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [isAuthenticated, readStatus, runCatalogRefresh])

  useEffect(() => {
    if (!isAuthenticated) return undefined

    const timer = window.setInterval(() => {
      readStatus().catch(() => {})
    }, REFRESH_STATUS_POLL_MS)

    return () => window.clearInterval(timer)
  }, [isAuthenticated, readStatus])

  return (
    <CatalogRefreshContext.Provider value={{ refreshGeneration, runCatalogRefresh }}>
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
