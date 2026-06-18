import { createContext, useCallback, useContext, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildPlayerSession, fetchPlayUrlWithAudio } from '../api'
import Player from '../components/Player'
import { logPlaybackError } from '../utils/playbackLog'

const PlaybackContext = createContext(null)

export function PlaybackProvider({ children }) {
  const navigate = useNavigate()
  const [player, setPlayer] = useState(null)
  const [liveChannels, setLiveChannels] = useState([])

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
          type={player.type}
          epg={player.epg}
          meta={player.meta}
          durationHint={player.durationHint || 0}
          tracks={player.tracks}
          resumeAt={player.resumeAt || 0}
          initialMuted={player.type === 'live' ? false : undefined}
          liveChannels={player.type === 'live' ? liveChannels : []}
          onLiveChannelChange={player.type === 'live' ? changeLiveChannel : undefined}
          onUrlChange={player.type !== 'live' ? handleAudioChange : undefined}
          onClose={() => setPlayer(null)}
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
