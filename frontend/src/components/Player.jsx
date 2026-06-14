import { useCallback, useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import mpegts from 'mpegts.js'
import { saveWatchProgress } from '../api'

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatEpgTime(value) {
  if (!value) return ''
  const parts = value.split(' ')
  if (parts.length < 2) return value
  return parts[1].slice(0, 5)
}

const LIVE_STATUS_LABELS = {
  connecting: 'Conectando…',
  live: 'En vivo',
  buffering: 'Buffering…',
  stalled: 'Transmisión detenida',
}

export default function Player({
  title,
  url,
  type,
  epg,
  meta,
  resumeAt = 0,
  initialMuted,
  liveChannels = [],
  onLiveChannelChange,
  onMutedChange,
  onClose,
}) {
  const videoRef = useRef(null)
  const lastProgressRef = useRef(0)
  const stallTicksRef = useRef(0)
  const lastSavedRef = useRef(0)
  const resumeAppliedRef = useRef(false)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(() => {
    if (typeof initialMuted === 'boolean') return initialMuted
    return type === 'live'
  })
  const [liveStatus, setLiveStatus] = useState('connecting')
  const [showGuide, setShowGuide] = useState(false)
  const [zapBanner, setZapBanner] = useState(null)
  const [switching, setSwitching] = useState(false)
  const isLive = type === 'live'
  const canZap = isLive && liveChannels.length > 1 && typeof onLiveChannelChange === 'function'
  const currentChannelId = meta?.itemId ? String(meta.itemId) : ''
  const currentChannelIndex = liveChannels.findIndex(
    (ch) => String(ch.stream_id || ch.item_id) === currentChannelId,
  )
  const currentChannelNumber = currentChannelIndex >= 0
    ? (liveChannels[currentChannelIndex]?.num || currentChannelIndex + 1)
    : null

  const zapChannel = useCallback((direction) => {
    if (!canZap || switching) return
    setSwitching(true)
    onLiveChannelChange(direction)
  }, [canZap, switching, onLiveChannelChange])

  const selectGuideChannel = useCallback((channel) => {
    if (!canZap || switching) return
    const channelId = String(channel.stream_id || channel.item_id)
    if (channelId === currentChannelId) {
      setShowGuide(false)
      return
    }
    setSwitching(true)
    setShowGuide(false)
    onLiveChannelChange('select', channel)
  }, [canZap, switching, onLiveChannelChange, currentChannelId])

  useEffect(() => {
    setSwitching(false)
    if (isLive) {
      setZapBanner({ number: currentChannelNumber, name: title })
      const zapTimer = window.setTimeout(() => setZapBanner(null), 2800)
      return () => window.clearTimeout(zapTimer)
    }
    return undefined
  }, [url, title, isLive, currentChannelNumber])

  useEffect(() => {
    if (!canZap) return undefined

    function handleKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'ChannelUp') {
        event.preventDefault()
        zapChannel('prev')
      } else if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === 'ChannelDown') {
        event.preventDefault()
        zapChannel('next')
      } else if (event.key === 'g' || event.key === 'G' || event.key === 'Guide') {
        event.preventDefault()
        setShowGuide((open) => !open)
      } else if (event.key === 'Escape' && showGuide) {
        setShowGuide(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canZap, showGuide, zapChannel])

  useEffect(() => {
    if (!showGuide || currentChannelIndex < 0) return undefined
    const row = document.getElementById(`live-guide-row-${currentChannelId}`)
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [showGuide, currentChannelId, currentChannelIndex])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !url) return undefined

    const playbackUrl = url.startsWith('/')
      ? `${window.location.origin}${url}`
      : url

    setError('')
    setPlaying(false)
    setCurrent(0)
    setDuration(0)
    setBuffered(0)
    setLiveStatus(isLive ? 'connecting' : 'live')
    lastProgressRef.current = 0
    stallTicksRef.current = 0
    if (isLive) {
      const startMuted = typeof initialMuted === 'boolean' ? initialMuted : true
      setMuted(startMuted)
      setVolume(1)
    }

    let hls
    let mpegtsPlayer
    let stallInterval

    const liveSupported = mpegts.getFeatureList().mseLivePlayback

    if (isLive && liveSupported) {
      const startMuted = typeof initialMuted === 'boolean' ? initialMuted : true
      video.muted = startMuted
      video.volume = 1
      mpegtsPlayer = mpegts.createPlayer({
        type: 'mse',
        isLive: true,
        hasAudio: true,
        hasVideo: true,
        url: playbackUrl,
      }, {
        enableWorker: false,
        enableStashBuffer: false,
        lazyLoad: false,
        liveBufferLatencyChasing: false,
        liveSync: false,
        autoCleanupSourceBuffer: true,
        autoCleanupMaxBackwardDuration: 120,
        autoCleanupMinBackwardDuration: 60,
      })
      mpegtsPlayer.attachMediaElement(video)
      mpegtsPlayer.load()
      mpegtsPlayer.on(mpegts.Events.MEDIA_INFO, () => {
        setLiveStatus('live')
        setSwitching(false)
        mpegtsPlayer.play().catch(() => {
          video.play().catch(() => {})
        })
      })
      mpegtsPlayer.on(mpegts.Events.ERROR, (_, data) => {
        const detail = data?.detail || data?.type || 'error'
        setLiveStatus('stalled')
        if (String(detail).toLowerCase().includes('codec') || String(detail).includes('MEDIA')) {
          setError('Este canal usa un formato de video no compatible con el navegador (p. ej. HEVC/4K). Prueba otro canal SD/HD.')
        } else {
          setError(`No se pudo reproducir el canal en vivo (${detail}).`)
        }
      })
    } else if (isLive && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true })
      hls.loadSource(playbackUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const startMuted = typeof initialMuted === 'boolean' ? initialMuted : true
        video.muted = startMuted
        video.volume = 1
        setLiveStatus('live')
        video.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setLiveStatus('stalled')
          setError('No se pudo reproducir el canal en vivo.')
        }
      })
    } else if (isLive && video.canPlayType('application/vnd.apple.mpegurl')) {
      const startMuted = typeof initialMuted === 'boolean' ? initialMuted : true
      video.src = playbackUrl
      video.muted = startMuted
      video.volume = 1
      video.play().catch(() => {})
    } else {
      video.src = playbackUrl
      video.volume = 1
      video.muted = false
      video.play().catch(() => {})
    }

    const onPlay = () => {
      setPlaying(true)
      if (isLive) setLiveStatus('live')
    }
    const onPause = () => setPlaying(false)
    const onWaiting = () => {
      if (isLive) setLiveStatus('buffering')
    }
    const onPlaying = () => {
      if (isLive) {
        setLiveStatus('live')
        stallTicksRef.current = 0
      }
    }
    const onTime = () => {
      if (isLive) return
      const position = video.currentTime || 0
      setCurrent(position)
      if (video.buffered.length) {
        setBuffered(video.buffered.end(video.buffered.length - 1))
      }
      if (meta?.itemId && (type === 'vod' || type === 'series')) {
        const now = Date.now()
        if (now - lastSavedRef.current > 12000 && position > 0) {
          lastSavedRef.current = now
          saveWatchProgress({
            content_type: meta.contentType || type,
            item_id: meta.itemId,
            series_id: meta.seriesId || '',
            title: meta.title || title,
            image: meta.image || '',
            ext: meta.ext || '',
            position_seconds: position,
            duration_seconds: video.duration || null,
          })
        }
      }
    }
    const onMeta = () => {
      const total = video.duration || 0
      setDuration(total)
      if (!isLive && resumeAt > 0 && !resumeAppliedRef.current && total > resumeAt + 5) {
        video.currentTime = resumeAt
        resumeAppliedRef.current = true
      }
    }
    const onVol = () => {
      setVolume(video.volume)
      setMuted(video.muted)
    }
    const onMediaError = () => setError(
      type === 'series' || type === 'vod'
        ? 'Error de reproducción. Si no hay audio, el formato puede no ser compatible con el navegador.'
        : 'No se pudo reproducir el video.',
    )

    if (isLive) {
      stallInterval = window.setInterval(() => {
        const videoEl = videoRef.current
        if (!videoEl || videoEl.paused || videoEl.readyState < 2) return
        const progress = videoEl.currentTime
        if (Math.abs(progress - lastProgressRef.current) < 0.01) {
          stallTicksRef.current += 1
          if (stallTicksRef.current >= 2) {
            setLiveStatus(videoEl.readyState < 3 ? 'buffering' : 'stalled')
          }
        } else {
          stallTicksRef.current = 0
          setLiveStatus('live')
          lastProgressRef.current = progress
        }
      }, 4000)
    }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('durationchange', onMeta)
    video.addEventListener('progress', onTime)
    video.addEventListener('volumechange', onVol)
    video.addEventListener('error', onMediaError)

    return () => {
      if (stallInterval) window.clearInterval(stallInterval)
      if (meta?.itemId && (type === 'vod' || type === 'series') && video.currentTime > 0) {
        saveWatchProgress({
          content_type: meta.contentType || type,
          item_id: meta.itemId,
          series_id: meta.seriesId || '',
          title: meta.title || title,
          image: meta.image || '',
          ext: meta.ext || '',
          position_seconds: video.currentTime,
          duration_seconds: video.duration || null,
        })
      }
      if (mpegtsPlayer) {
        mpegtsPlayer.pause()
        mpegtsPlayer.unload()
        mpegtsPlayer.detachMediaElement()
        mpegtsPlayer.destroy()
      }
      if (hls) hls.destroy()
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('durationchange', onMeta)
      video.removeEventListener('progress', onTime)
      video.removeEventListener('volumechange', onVol)
      video.removeEventListener('error', onMediaError)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [url, type, isLive, meta, resumeAt, title, initialMuted])

  function toggleMute() {
    const video = videoRef.current
    if (!video) return
    const next = !video.muted
    video.muted = next
    setMuted(next)
    onMutedChange?.(next)
    if (!next && video.volume === 0) {
      video.volume = 1
      setVolume(1)
    }
  }

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      if (isLive && video.muted) {
        video.muted = false
        setMuted(false)
        onMutedChange?.(false)
      }
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }

  function seek(value) {
    const video = videoRef.current
    if (!video || isLive) return
    video.currentTime = Number(value)
  }

  function changeVolume(value) {
    const video = videoRef.current
    if (!video) return
    const level = Number(value)
    video.volume = level
    const nextMuted = level === 0
    video.muted = nextMuted
    setVolume(level)
    setMuted(nextMuted)
    onMutedChange?.(nextMuted)
  }

  const progressMax = duration > 0 ? duration : buffered || 100
  const currentProgram = epg?.current
  const upcomingPrograms = (epg?.listings || []).filter((item) => !item.now).slice(0, 4)

  return (
    <div className="player-overlay">
      <div className="player-header">
        <button type="button" className="player-close" onClick={onClose}>← Volver</button>
        <div className="player-header-main">
          <h2>{title}</h2>
          {isLive ? <span className="player-live-badge">EN VIVO</span> : null}
        </div>
      </div>
      {error ? <div className="player-error">{error}</div> : null}
      {isLive && muted ? <div className="player-muted-hint">Pulsa ▶ o 🔊 para activar el sonido</div> : null}
      <div className="player-stage">
        <video ref={videoRef} className="player-video" playsInline muted={muted} />
        {isLive && zapBanner ? (
          <div className="player-zap-banner">
            <span className="player-zap-number">{zapBanner.number ?? '—'}</span>
            <span className="player-zap-name">{zapBanner.name}</span>
          </div>
        ) : null}
        {isLive && switching ? <div className="player-zap-loading">Cambiando canal…</div> : null}
        {isLive && showGuide && canZap ? (
          <div className="player-channel-guide">
            <div className="player-channel-guide-header">
              <strong>Guía de canales</strong>
              <span>↑↓ cambiar · G cerrar</span>
            </div>
            <ul className="player-channel-guide-list">
              {liveChannels.map((channel, index) => {
                const channelId = String(channel.stream_id || channel.item_id)
                const active = channelId === currentChannelId
                return (
                  <li key={channelId}>
                    <button
                      id={`live-guide-row-${channelId}`}
                      type="button"
                      className={active ? 'active' : ''}
                      onClick={() => selectGuideChannel(channel)}
                    >
                      <span className="player-channel-num">{channel.num || index + 1}</span>
                      <span className="player-channel-name">{channel.name}</span>
                      {active ? <span className="player-channel-now">AHORA</span> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </div>
      {isLive ? (
        <div className="player-live-status">
          <span className={`player-live-dot player-live-dot--${liveStatus}`} />
          <span>{LIVE_STATUS_LABELS[liveStatus] || LIVE_STATUS_LABELS.live}</span>
        </div>
      ) : null}
      {isLive && epg?.has_epg ? (
        <div className="player-epg">
          {currentProgram ? (
            <div className="player-epg-now">
              <span className="player-epg-label">Ahora</span>
              <strong>{currentProgram.title}</strong>
              <span className="player-epg-time">
                {formatEpgTime(currentProgram.start)} – {formatEpgTime(currentProgram.end)}
              </span>
              {currentProgram.description ? (
                <p>{currentProgram.description}</p>
              ) : null}
            </div>
          ) : null}
          {upcomingPrograms.length ? (
            <div className="player-epg-next">
              <span className="player-epg-label">Después</span>
              <ul>
                {upcomingPrograms.map((item) => (
                  <li key={`${item.id}-${item.start}`}>
                    <span>{formatEpgTime(item.start)}</span>
                    <span>{item.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {isLive && epg && !epg.has_epg ? (
        <div className="player-epg player-epg--empty">Sin guía de programación para este canal.</div>
      ) : null}
      <div className="player-controls">
        {canZap ? (
          <>
            <button
              type="button"
              className="player-btn player-btn--zap"
              onClick={() => zapChannel('prev')}
              disabled={switching}
              aria-label="Canal anterior"
            >
              −
            </button>
            <button
              type="button"
              className="player-btn player-btn--guide"
              onClick={() => setShowGuide((open) => !open)}
              aria-label="Guía de canales"
            >
              ☰
            </button>
            <button
              type="button"
              className="player-btn player-btn--zap"
              onClick={() => zapChannel('next')}
              disabled={switching}
              aria-label="Canal siguiente"
            >
              +
            </button>
          </>
        ) : null}
        <button type="button" className="player-btn" onClick={togglePlay} aria-label={playing ? 'Pausar' : 'Reproducir'}>
          {playing ? '⏸' : '▶'}
        </button>
        {isLive ? (
          <span className="player-time player-time--live">
            {currentChannelNumber ? `Canal ${currentChannelNumber}` : 'En directo'}
          </span>
        ) : (
          <span className="player-time">
            {formatTime(current)}
            {` / ${duration > 0 ? formatTime(duration) : '--:--'}`}
          </span>
        )}
        {isLive ? (
          <div className={`player-live-bar player-live-bar--${liveStatus}`} aria-hidden="true">
            <span className="player-live-bar-fill" />
          </div>
        ) : (
          <input
            className="player-seek"
            type="range"
            min="0"
            max={progressMax}
            step="0.1"
            value={Math.min(current, progressMax)}
            onChange={(e) => seek(e.target.value)}
          />
        )}
        <button type="button" className="player-btn" onClick={toggleMute} aria-label={muted ? 'Activar sonido' : 'Silenciar'}>
          {muted || volume === 0 ? '🔇' : '🔊'}
        </button>
        <input
          className="player-volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => changeVolume(e.target.value)}
        />
        <button
          type="button"
          className="player-btn"
          onClick={() => videoRef.current?.requestFullscreen?.()}
          aria-label="Pantalla completa"
        >
          ⛶
        </button>
      </div>
    </div>
  )
}
