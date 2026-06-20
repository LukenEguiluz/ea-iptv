import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchDeployVersion, reloadAppWithFreshAssets } from '../utils/deployVersion'
import { DEPLOY_CHECK_MS } from '../utils/refreshIntervals'

const EMBEDDED_BUILD_VERSION = typeof __APP_BUILD_VERSION__ !== 'undefined'
  ? String(__APP_BUILD_VERSION__)
  : null

export default function useDeployVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const loadedVersionRef = useRef(EMBEDDED_BUILD_VERSION)

  const checkVersion = useCallback(async () => {
    const version = await fetchDeployVersion()
    if (!version) return

    if (loadedVersionRef.current === null) {
      loadedVersionRef.current = version
      return
    }

    if (version !== loadedVersionRef.current) {
      setUpdateAvailable(true)
    }
  }, [])

  useEffect(() => {
    checkVersion()

    const timer = window.setInterval(checkVersion, DEPLOY_CHECK_MS)

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        checkVersion()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [checkVersion])

  const reloadApp = useCallback(() => {
    reloadAppWithFreshAssets()
  }, [])

  const dismissUpdate = useCallback(() => {
    setUpdateAvailable(false)
  }, [])

  return { updateAvailable, reloadApp, dismissUpdate }
}
