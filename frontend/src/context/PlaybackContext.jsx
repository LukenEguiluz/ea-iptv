import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildPlayerSession, ensureGatewaySession, fetchPlayUrlWithAudio, fetchLiveEpg } from '../api'
import Player from '../components/Player'
import { useAuth } from './AuthContext'
import { logPlaybackError } from '../utils/playbackLog'
import { clearLiveSession, loadLiveSession, saveLiveSession } from '../utils/liveSessionStorage'
import { EPG_REFRESH_MS } from '../utils/refreshIntervals'

const PlaybackContext = createContext(null)

export function PlaybackProvider({ children }) {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [player, setPlayer] = useState(null)
  const [liveChannels, setLiveChannels] = useState([])
  const restoredLiveRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) {
      restoredLiveRef.current = false
      setPlayer(null)
      return
    }

    if (restoredLiveRef.current || player) return undefined

    const saved = loadLiveSession()
    if (!saved?.item_id) return undefined

    let cancelled = false
    restoredLiveRef.current = true

    ensureGatewaySession()
      .then(() => buildPlayerSession({
        content_type: 'live',
        item_id: saved.item_id,
        name: saved.name,
        category_name: saved.category_name,
      }, { withEpg: true, restored: true }))
      .then((session) => {
        if (cancelled || session.navigate) return
        setPlayer(session)
      })
      .catch((err) => {
        logPlaybackError('restoreLiveSession', err, { saved })
        clearLiveSession()
        restoredLiveRef.current = false
      })

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, player])

  useEffect(() => {
    if (player?.type === 'live' && player.meta?.itemId) {
      saveLiveSession(player.meta)
    }
  }, [player])

  useEffect(() => {
    if (!player || player.type !== 'live' || !player.meta?.itemId) return undefined

    const itemId = String(player.meta.itemId)

    async function refreshEpg() {
      try {
        const epgData = await fetchLiveEpg(itemId, 8)
        setPlayer((prev) => (
          prev?.type === 'live' && String(prev.meta?.itemId) === itemId
            ? { ...prev, epg: epgData }
            : prev
        ))
      } catch {
        // La guía se reintentará en el próximo ciclo
      }
    }

    refreshEpg()
    const timer = window.setInterval(refreshEpg, EPG_REFRESH_MS)

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        refreshEpg()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [player?.type, player?.meta?.itemId])

  const playItem = useCallback(async (item) => {
    try {
      const contentType = item.content_type || item.type || 'vod'
      const itemId = String(item.item_id || item.stream_id || item.series_id || '')

      if (contentType === 'series') {
        navigate(`/series/${itemId}`)
        return
      }

      const session = await buildPlayerSession({
        content_type: contentType,
        item_id: itemId,
        name: item.name || item.title,
        image: item.image || item.stream_icon || item.cover,
        category_name: item.category_name,
        container_extension: item.container_extension || item.ext || 'mp4',
      }, { withEpg: contentType === 'live' })

      if (session.navigate) {
        navigate(session.navigate)
        return
      }

      if (contentType !== 'live') {
        clearLiveSession()
      }

      setPlayer(session)
    } catch (err) {
      logPlaybackError('playItem', err, { item })
      throw err
    }
  }, [navigate])

  const handleAudioChange = useCallback(async (playPath, audioIndex, resumePosition) => {
    try {
      const playData = await fetchPlayUrlWithAudio(playPath, audioIndex)
      setPlayer((prev) => ({
        ...prev,
        url: playData.url,
        fallbackUrl: playData.fallbackUrl || null,
        playbackMode: playData.playbackMode || prev?.playbackMode,
        tracks: playData.tracks || prev?.tracks,
        durationHint: playData.duration_seconds || prev?.durationHint,
        resumeAt: resumePosition,
      }))
    } catch (err) {
      logPlaybackError('changeAudio', err, { playPath, audioIndex, resumePosition })
      throw err
    }
  }, [])

  const changeLiveChannel = useCallback(async (direction, selectedChannel = null) => {
    if (!player || player.type !== 'live' || liveChannels.length < 2) return

    try {
      const currentId = String(player.meta?.itemId || '')
      const currentIndex = liveChannels.findIndex(
        (item) => String(item.stream_id || item.item_id) === currentId,
      )

      let nextItem = selectedChannel
      if (!nextItem) {
        const baseIndex = currentIndex >= 0 ? currentIndex : 0
        const offset = direction === 'prev' ? -1 : 1
        const nextIndex = (baseIndex + offset + liveChannels.length) % liveChannels.length
        nextItem = liveChannels[nextIndex]
      }

      if (!nextItem) return

      const session = await buildPlayerSession({
        content_type: 'live',
        item_id: String(nextItem.stream_id || nextItem.item_id),
        name: nextItem.name,
        image: nextItem.stream_icon || nextItem.image,
        category_name: nextItem.category_name,
      }, { withEpg: true })
      setPlayer(session)
    } catch (err) {
      logPlaybackError('changeLiveChannel', err, {
        direction,
        currentChannel: player.meta?.itemId,
        selectedChannel: selectedChannel?.name || selectedChannel?.stream_id,
      })
      throw err
    }
  }, [player, liveChannels])

  const reconnectLive = useCallback(async () => {
    if (!player || player.type !== 'live' || !player.meta?.itemId) return

    const session = await buildPlayerSession({
      content_type: 'live',
      item_id: String(player.meta.itemId),
      name: player.meta.title || player.title,
      image: player.meta.image || '',
      category_name: player.meta.categoryName || '',
    }, { withEpg: true })

    setPlayer(session)
  }, [player])

  const closePlayer = useCallback(() => {
    if (player?.type === 'live') {
      clearLiveSession()
    }
    restoredLiveRef.current = false
    setPlayer(null)
  }, [player])

  const value = {
    player,
    setPlayer,
    playItem,
    liveChannels,
    setLiveChannels,
  }

  return (
    <PlaybackContext.Provider value={value}>
      {children}
      {player ? (
        <Player
          title={player.title}
          url={player.url}
          fallbackUrl={player.fallbackUrl}
          type={player.type}
          epg={player.epg}
          meta={player.meta}
          durationHint={player.durationHint || 0}
          tracks={player.tracks}
          resumeAt={player.resumeAt || 0}
          initialMuted={player.type === 'live' ? Boolean(player.restored) : undefined}
          restored={Boolean(player.restored)}
          liveChannels={player.type === 'live' ? liveChannels : []}
          onLiveChannelChange={player.type === 'live' ? changeLiveChannel : undefined}
          onLiveReconnect={player.type === 'live' ? reconnectLive : undefined}
          onUrlChange={player.type !== 'live' ? handleAudioChange : undefined}
          onClose={closePlayer}
        />
      ) : null}
    </PlaybackContext.Provider>
  )
}

export function usePlayback() {
  const ctx = useContext(PlaybackContext)
  if (!ctx) {
    throw new Error('usePlayback debe usarse dentro de PlaybackProvider')
  }
  return ctx
}
