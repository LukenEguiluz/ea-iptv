import { useCallback, useEffect, useState } from 'react'
import CatalogSyncPrompt from './CatalogSyncPrompt'
import { useCatalogRefresh } from '../context/CatalogRefreshContext'

const DECLINE_KEY = {
  vod: 'iptv_sync_declined_vod',
  series: 'iptv_sync_declined_series',
}

export default function useOptionalCatalogSync(type) {
  const { catalogStatus, runCatalogRefresh } = useCatalogRefresh()
  const [open, setOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const ready = catalogStatus?.ready_by_type?.[type]
  const isRunningForType = catalogStatus?.status === 'running'
    && catalogStatus?.sync_types?.includes(type)

  useEffect(() => {
    if (!catalogStatus || ready || isRunningForType) return
    if (sessionStorage.getItem(DECLINE_KEY[type])) return
    setOpen(true)
  }, [catalogStatus, ready, isRunningForType, type])

  useEffect(() => {
    if (isRunningForType) {
      setSyncing(true)
      setOpen(true)
    } else if (syncing && ready) {
      setSyncing(false)
      setOpen(false)
    }
  }, [isRunningForType, ready, syncing])

  const decline = useCallback(() => {
    sessionStorage.setItem(DECLINE_KEY[type], '1')
    setOpen(false)
  }, [type])

  const confirm = useCallback(async () => {
    setSyncing(true)
    setOpen(true)
    try {
      await runCatalogRefresh({ force: true, types: [type], wait: true })
    } finally {
      setSyncing(false)
    }
  }, [runCatalogRefresh, type])

  const prompt = (
    <CatalogSyncPrompt
      open={open}
      type={type}
      syncing={syncing || isRunningForType}
      progressPercent={catalogStatus?.progress_percent ?? 0}
      progressPhase={catalogStatus?.progress_phase ?? ''}
      onConfirm={confirm}
      onCancel={syncing || isRunningForType ? () => setOpen(false) : decline}
    />
  )

  return { ready, prompt, isRunningForType }
}
