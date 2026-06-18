import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchDeployVersion } from '../utils/deployVersion'
import { DEPLOY_CHECK_MS } from '../utils/refreshIntervals'

export default function useDeployVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const loadedVersionRef = useRef(null)

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
    window.location.reload()
  }, [])

  const dismissUpdate = useCallback(() => {
    setUpdateAvailable(false)
  }, [])

  return { updateAvailable, reloadApp, dismissUpdate }
}
