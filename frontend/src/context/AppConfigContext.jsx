import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { fetchAppConfig } from '../api'
import { useAuth } from './AuthContext'

const AppConfigContext = createContext(null)

const DEFAULT_CONFIG = {
  catalog_mode: 'on_demand',
  catalog_use_index: false,
  catalog_sync_enabled: false,
  search_enabled: false,
  client_direct_playback: true,
  xtream_server: '',
}

export function AppConfigProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(false)

  const reloadConfig = useCallback(async () => {
    if (!isAuthenticated) {
      setConfig(DEFAULT_CONFIG)
      return DEFAULT_CONFIG
    }
    setLoading(true)
    try {
      const data = await fetchAppConfig()
      const next = { ...DEFAULT_CONFIG, ...data }
      setConfig(next)
      return next
    } catch {
      setConfig(DEFAULT_CONFIG)
      return DEFAULT_CONFIG
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    reloadConfig()
  }, [reloadConfig])

  const isOnDemand = config.catalog_mode === 'on_demand'

  return (
    <AppConfigContext.Provider value={{
      config,
      loading,
      isOnDemand,
      reloadConfig,
    }}>
      {children}
    </AppConfigContext.Provider>
  )
}

export function useAppConfig() {
  const ctx = useContext(AppConfigContext)
  if (!ctx) {
    throw new Error('useAppConfig debe usarse dentro de AppConfigProvider')
  }
  return ctx
}
