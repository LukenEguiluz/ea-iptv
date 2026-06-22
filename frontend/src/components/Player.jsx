import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Typography,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import MenuIcon from '@mui/icons-material/Menu'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import RemoveIcon from '@mui/icons-material/Remove'
import AddIcon from '@mui/icons-material/Add'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import PictureInPictureAltIcon from '@mui/icons-material/PictureInPictureAlt'
import PictureInPictureIcon from '@mui/icons-material/PictureInPicture'
import Hls from 'hls.js'
import mpegts from 'mpegts.js'
import { saveWatchProgress } from '../api'
import { resolveApiUrl } from '../config'
import {
  appendClientDecode,
  attachAvbridgePlayer,
  logAvbridge,
  logAvbridgeError,
  logAvbridgeWarn,
  shouldUseAvbridgeForVod,
  stripClientDecode,
} from '../utils/avbridgePlayer'
import { logPlaybackError, logPlaybackInfo, logPlaybackWarn } from '../utils/playbackLog'

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
  reconnecting: 'Reconectando…',
}

const LIVE_RECONNECT_BASE_MS = 2500
const LIVE_RECONNECT_MAX_MS = 30000
const LIVE_WAITING_RECONNECT_MS = 20000
const LIVE_BUFFER_OVERLAY_DELAY_MS = 2500

const READY_STATE_PERCENT = [8, 28, 52, 78, 100]
const FULLSCREEN_UI_HIDE_MS = 3000

function isIosDevice() {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function getFullscreenElement() {
  return document.fullscreenElement
    || document.webkitFullscreenElement
    || document.mozFullScreenElement
    || null
}

function isVideoNativeFullscreen(video) {
  return Boolean(video?.webkitDisplayingFullscreen)
}

export default function Player({
  title,
  url,
  type,
  epg,
  meta,
  resumeAt = 0,
  durationHint = 0,
  tracks = null,
  initialMuted,
  restored = false,
  liveChannels = [],
  onLiveChannelChange,
  onLiveReconnect,
  onMutedChange,
  onUrlChange,
  onClose,
}) {
  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const avbridgeHandleRef = useRef(null)
  const mpegtsPlayerRef = useRef(null)
  const loadStartedRef = useRef(Date.now())
  const lastProgressRef = useRef(0)
  const stallTicksRef = useRef(0)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef(null)
  const waitingReconnectTimerRef = useRef(null)
  const onLiveReconnectRef = useRef(onLiveReconnect)
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
    return false
  })
  const [liveStatus, setLiveStatus] = useState('connecting')
  const [showGuide, setShowGuide] = useState(false)
  const [zapBanner, setZapBanner] = useState(null)
  const [switching, setSwitching] = useState(false)
  const [selectedAudio, setSelectedAudio] = useState('')
  const [selectedSubtitle, setSelectedSubtitle] = useState('-1')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [uiVisible, setUiVisible] = useState(true)
  const uiHideTimerRef = useRef(null)
  const [loadPhase, setLoadPhase] = useState('idle')
  const [prepPercent, setPrepPercent] = useState(0)
  const [bufferPercent, setBufferPercent] = useState(0)
  const [isWaiting, setIsWaiting] = useState(false)
  const [showBufferingOverlay, setShowBufferingOverlay] = useState(false)
  const bufferingOverlayTimerRef = useRef(null)
  const [isSeeking, setIsSeeking] = useState(false)
  const [scrubTime, setScrubTime] = useState(0)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [isPip, setIsPip] = useState(false)
  const userPausedRef = useRef(false)
  const togglePlayRef = useRef(() => {})
  const isLive = type === 'live'
  const isVodLike = type === 'vod' || type === 'series'
  const audioTracks = tracks?.audio || []
  const subtitleTracks = tracks?.subtitles || []
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
    if (audioTracks.length) {
      setSelectedAudio(String(audioTracks[0].index))
    } else {
      setSelectedAudio('')
    }
    setSelectedSubtitle('-1')
  }, [url, audioTracks])

  const clearUiHideTimer = useCallback(() => {
    if (uiHideTimerRef.current) {
      window.clearTimeout(uiHideTimerRef.current)
      uiHideTimerRef.current = null
    }
  }, [])

  const scheduleUiHide = useCallback(() => {
    clearUiHideTimer()
    uiHideTimerRef.current = window.setTimeout(() => {
      setUiVisible(false)
    }, FULLSCREEN_UI_HIDE_MS)
  }, [clearUiHideTimer])

  const revealUi = useCallback(() => {
    setUiVisible(true)
    if (isFullscreen) {
      scheduleUiHide()
    }
  }, [isFullscreen, scheduleUiHide])

  const liveStatusRef = useRef(liveStatus)
  const prevLiveStatusLogRef = useRef('')
  const loadOverlayVisibleRef = useRef(false)
  useEffect(() => {
    liveStatusRef.current = liveStatus
  }, [liveStatus])

  useEffect(() => {
    if (!isLive || liveStatus === prevLiveStatusLogRef.current) return undefined
    prevLiveStatusLogRef.current = liveStatus
    logPlaybackInfo('player.liveStatus', `Estado live: ${liveStatus}`, {
      title,
      url,
      switching,
      isWaiting,
      loadPhase,
    })
    return undefined
  }, [isLive, liveStatus, title, url, switching, isWaiting, loadPhase])

  useEffect(() => {
    onLiveReconnectRef.current = onLiveReconnect
  }, [onLiveReconnect])

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const clearWaitingReconnectTimer = useCallback(() => {
    if (waitingReconnectTimerRef.current) {
      window.clearTimeout(waitingReconnectTimerRef.current)
      waitingReconnectTimerRef.current = null
    }
  }, [])

  const resetLiveRecovery = useCallback(() => {
    reconnectAttemptsRef.current = 0
    clearReconnectTimer()
    clearWaitingReconnectTimer()
  }, [clearReconnectTimer, clearWaitingReconnectTimer])

  const scheduleLiveReconnectRef = useRef(() => {})
  const forceLiveReconnectRef = useRef(async () => {})

  const forceLiveReconnect = useCallback(async (reason) => {
    if (!isLive || !onLiveReconnectRef.current) return
    clearReconnectTimer()
    logPlaybackWarn('player.liveWatchdog', reason, {
      title,
      url,
    })
    setLiveStatus('reconnecting')
    setError('')
    try {
      await onLiveReconnectRef.current()
      reconnectAttemptsRef.current = 0
      lastProgressRef.current = 0
      stallTicksRef.current = 0
    } catch (err) {
      logPlaybackWarn('player.liveWatchdog', 'Fallo al reconectar', {
        title,
        error: err?.message || String(err),
      })
      scheduleLiveReconnectRef.current(`watchdog falló: ${err?.message || 'error'}`)
    }
  }, [isLive, title, url, clearReconnectTimer])

  const scheduleLiveReconnect = useCallback((reason) => {
    if (!isLive || !onLiveReconnectRef.current) return
    if (reconnectTimerRef.current) return

    logPlaybackWarn('player.liveReconnect', reason, {
      title,
      url,
      attempt: reconnectAttemptsRef.current + 1,
    })

    setLiveStatus('reconnecting')
    setError('')

    const attempt = reconnectAttemptsRef.current
    const delay = Math.min(
      LIVE_RECONNECT_MAX_MS,
      Math.round(LIVE_RECONNECT_BASE_MS * (1.4 ** attempt)),
    )

    reconnectTimerRef.current = window.setTimeout(async () => {
      reconnectTimerRef.current = null
      reconnectAttemptsRef.current += 1
      try {
        await onLiveReconnectRef.current()
        reconnectAttemptsRef.current = 0
      } catch (err) {
        logPlaybackWarn('player.liveReconnect', 'Fallo al reconectar', {
          title,
          error: err?.message || String(err),
          attempt: reconnectAttemptsRef.current,
        })
        scheduleLiveReconnectRef.current('reintento tras fallo')
      }
    }, delay)
  }, [isLive, title, url])

  useEffect(() => {
    scheduleLiveReconnectRef.current = scheduleLiveReconnect
  }, [scheduleLiveReconnect])

  useEffect(() => {
    forceLiveReconnectRef.current = forceLiveReconnect
  }, [forceLiveReconnect])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined

    const onEnterPip = () => setIsPip(true)
    const onLeavePip = () => setIsPip(false)
    video.addEventListener('enterpictureinpicture', onEnterPip)
    video.addEventListener('leavepictureinpicture', onLeavePip)
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnterPip)
      video.removeEventListener('leavepictureinpicture', onLeavePip)
    }
  }, [url])

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return

      if (isLive) {
        const status = liveStatusRef.current
        if (status === 'stalled' || status === 'reconnecting' || status === 'buffering') {
          scheduleLiveReconnectRef.current('pestaña visible de nuevo')
        }
        return
      }

      const video = videoRef.current
      if (!video || userPausedRef.current) return
      const handle = avbridgeHandleRef.current
      const isPaused = handle?.player ? handle.player.paused : video.paused
      if (isPaused) {
        if (handle?.play) {
          handle.play().catch(() => {})
        } else {
          video.play().catch(() => {})
        }
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [isLive, url])

  useEffect(() => () => {
    clearReconnectTimer()
    clearWaitingReconnectTimer()
  }, [clearReconnectTimer, clearWaitingReconnectTimer])

  useEffect(() => {
    if (!canZap) return undefined

    function handleKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'ChannelUp') {
        event.preventDefault()
        revealUi()
        zapChannel('prev')
      } else if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === 'ChannelDown') {
        event.preventDefault()
        revealUi()
        zapChannel('next')
      } else if (event.key === 'g' || event.key === 'G' || event.key === 'Guide') {
        event.preventDefault()
        revealUi()
        setShowGuide((open) => !open)
      } else if (event.key === 'Escape' && showGuide) {
        setShowGuide(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canZap, showGuide, zapChannel, revealUi])

  useEffect(() => {
    if (!url) return undefined

    function handleKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (event.key === ' ' || event.key === 'k' || event.key === 'K') {
        event.preventDefault()
        revealUi()
        togglePlayRef.current()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [url, revealUi])

  useEffect(() => {
    if (!showGuide || currentChannelIndex < 0) return undefined
    const row = document.getElementById(`live-guide-row-${currentChannelId}`)
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [showGuide, currentChannelId, currentChannelIndex])

  useEffect(() => {
    if (!isFullscreen) {
      clearUiHideTimer()
      setUiVisible(true)
      return undefined
    }
    setUiVisible(true)
    scheduleUiHide()
    return () => clearUiHideTimer()
  }, [isFullscreen, clearUiHideTimer, scheduleUiHide])

  useEffect(() => () => clearUiHideTimer(), [clearUiHideTimer])

  useEffect(() => {
    function syncFullscreen() {
      const video = videoRef.current
      setIsFullscreen(Boolean(getFullscreenElement()) || isVideoNativeFullscreen(video))
    }

    document.addEventListener('fullscreenchange', syncFullscreen)
    document.addEventListener('webkitfullscreenchange', syncFullscreen)
    const video = videoRef.current
    video?.addEventListener('webkitbeginfullscreen', syncFullscreen)
    video?.addEventListener('webkitendfullscreen', syncFullscreen)

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen)
      document.removeEventListener('webkitfullscreenchange', syncFullscreen)
      video?.removeEventListener('webkitbeginfullscreen', syncFullscreen)
      video?.removeEventListener('webkitendfullscreen', syncFullscreen)
    }
  }, [url])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !url) return undefined

    const playbackUrl = resolveApiUrl(url)
    const needsConversion = isVodLike && playbackUrl.includes('/api/proxy/play') && !shouldUseAvbridgeForVod(playbackUrl, isVodLike, meta?.ext)
    const useAvbridgeVodPreview = shouldUseAvbridgeForVod(playbackUrl, isVodLike, meta?.ext)

    loadStartedRef.current = Date.now()
    setLoadPhase(useAvbridgeVodPreview ? 'avbridge' : (needsConversion ? 'converting' : 'loading'))
    setPrepPercent(0)
    setBufferPercent(0)
    setIsWaiting(false)

    const progressTimer = window.setInterval(() => {
      const elapsed = Date.now() - loadStartedRef.current
      const statePercent = READY_STATE_PERCENT[video.readyState] || 5
      const timeCap = needsConversion ? 120000 : 45000
      const timePercent = Math.min(92, Math.floor((elapsed / timeCap) * 92))
      const next = Math.max(statePercent, timePercent)
      setPrepPercent((prev) => (video.readyState >= 3 ? 100 : Math.max(prev, next)))

      if (video.readyState >= 3) {
        setLoadPhase('ready')
      } else if (needsConversion) {
        setLoadPhase('converting')
      } else if (isLive) {
        setLoadPhase('connecting')
      } else {
        setLoadPhase('loading')
      }

      if (!isLive && video.buffered.length > 0) {
        const end = video.buffered.end(video.buffered.length - 1)
        const total = (video.duration > 0 && Number.isFinite(video.duration))
          ? video.duration
          : (durationHint || 0)
        if (total > 0) {
          setBufferPercent(Math.min(100, Math.round((end / total) * 100)))
        }
      }
    }, 350)

    return () => window.clearInterval(progressTimer)
  }, [url, isVodLike, isLive, durationHint])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !url) return undefined

    const playbackUrl = resolveApiUrl(url)

    const reportError = (message, details = {}) => {
      logPlaybackError('player', message, { title, url, type, meta, playbackUrl, ...details })
      setError(message)
    }

    const logPlayFailure = (context, err) => {
      logPlaybackWarn('player.play', `Fallo al reproducir (${context})`, {
        title,
        url,
        type,
        playbackUrl,
        error: err?.message || String(err),
      })
    }

    const tryLivePlayback = async (playerInstance) => {
      const startMuted = typeof initialMuted === 'boolean' ? initialMuted : false
      const attempt = async (mutedPlayback) => {
        video.muted = mutedPlayback
        setMuted(mutedPlayback)
        if (playerInstance?.play) {
          await playerInstance.play()
        } else {
          await video.play()
        }
      }

      try {
        await attempt(startMuted)
      } catch (err) {
        if (!startMuted) {
          try {
            await attempt(true)
            return
          } catch (mutedErr) {
            logPlayFailure('mpegts+video-muted', mutedErr || err)
            return
          }
        }
        logPlayFailure('mpegts+video', err)
      }
    }

    setError('')
    setPlaying(false)
    setCurrent(0)
    setDuration(0)
    setBuffered(0)
    setPrepPercent(0)
    setBufferPercent(0)
    setIsWaiting(false)
    setIsSeeking(false)
    setIsScrubbing(false)
    setScrubTime(0)
    userPausedRef.current = false
    resetLiveRecovery()
    const useAvbridgeVod = shouldUseAvbridgeForVod(playbackUrl, isVodLike, meta?.ext)
    setLoadPhase(isLive ? 'connecting' : (useAvbridgeVod ? 'avbridge' : (url.includes('/api/proxy/play') ? 'converting' : 'loading')))
    if (isLive) setLiveStatus('connecting')
    lastProgressRef.current = 0
    stallTicksRef.current = 0
    if (isLive) {
      const startMuted = typeof initialMuted === 'boolean' ? initialMuted : false
      setMuted(startMuted)
      setVolume(1)
    }

    let hls
    let mpegtsPlayer
    let avbridgeHandle
    let avbridgeStarting = false
    let serverFallbackUsed = false
    let stallInterval
    let liveWatchdogInterval
    let liveWatchdogLastTime = 0
    let liveWatchdogStagnantSince = null

    const destroyAvbridge = async () => {
      if (!avbridgeHandle) return
      const handle = avbridgeHandle
      avbridgeHandle = null
      avbridgeHandleRef.current = null
      await handle.destroy().catch(() => {})
    }

    const startServerTranscodePlayback = (reason, resumePosition = 0) => {
      if (serverFallbackUsed) return
      serverFallbackUsed = true
      const serverUrl = stripClientDecode(playbackUrl)
      const targetResume = resumePosition > 0 ? resumePosition : resumeAt
      logAvbridgeWarn('server-fallback', `Reintentando con conversión en servidor (${reason})`, {
        serverUrl,
        resumePosition: targetResume,
      })
      setLoadPhase('converting')
      setError('')
      destroyAvbridge().finally(() => {
        video.pause()
        video.removeAttribute('src')
        video.setAttribute('playsinline', '')
        video.setAttribute('webkit-playsinline', 'true')
        video.preload = 'auto'
        video.src = serverUrl
        video.volume = 1
        video.muted = false
        const onServerMeta = () => {
          if (targetResume > 5 && video.duration > targetResume + 5) {
            video.currentTime = targetResume
            setCurrent(targetResume)
          }
          video.removeEventListener('loadedmetadata', onServerMeta)
        }
        video.addEventListener('loadedmetadata', onServerMeta)
        video.load()
        video.play().catch((err) => logPlayFailure('server-transcode', err))
      })
    }

    const switchToServerTranscode = (reason) => {
      if (serverFallbackUsed || isLive) return
      const resumePosition = video.currentTime > 0 ? video.currentTime : resumeAt
      startServerTranscodePlayback(reason, resumePosition)
    }

    const destroyMpegts = () => {
      if (!mpegtsPlayer) return
      mpegtsPlayer.pause()
      mpegtsPlayer.unload()
      mpegtsPlayer.detachMediaElement()
      mpegtsPlayer.destroy()
      mpegtsPlayer = null
    }

    const startAvbridgePlayback = async (reason, { live = false } = {}) => {
      if (avbridgeHandle || avbridgeStarting) return
      avbridgeStarting = true
      const avbridgeUrl = appendClientDecode(playbackUrl)
      logAvbridge('fallback', `Activando avbridge (${reason})`, {
        title,
        type,
        url: avbridgeUrl,
        live,
      })
      setLoadPhase('avbridge')
      setError('')
      destroyMpegts()
      if (hls) {
        hls.destroy()
        hls = null
      }
      video.pause()
      video.removeAttribute('src')
      video.load()
      try {
        avbridgeHandle = await attachAvbridgePlayer(video, avbridgeUrl, {
          resumeAt: live ? 0 : resumeAt,
          initialMuted: live
            ? (typeof initialMuted === 'boolean' ? initialMuted : true)
            : false,
          context: { title, type, reason, live },
          onTimeUpdate: ({ currentTime }) => {
            if (isLive) return
            setCurrent(currentTime)
            if (meta?.itemId && isVodLike) {
              const now = Date.now()
              const totalDuration = durationHint || video.duration || 0
              if (now - lastSavedRef.current > 12000 && currentTime > 0) {
                lastSavedRef.current = now
                saveWatchProgress({
                  content_type: meta.contentType || type,
                  item_id: meta.itemId,
                  series_id: meta.seriesId || '',
                  title: meta.title || title,
                  image: meta.image || '',
                  ext: meta.ext || '',
                  position_seconds: currentTime,
                  duration_seconds: totalDuration || null,
                })
              }
            }
          },
          onStrategyChange: (payload) => {
            if (live) return
            if (payload.to === 'hybrid' || payload.to === 'fallback') {
              switchToServerTranscode(`${payload.from}→${payload.to}: ${payload.reason || 'escalación'}`)
            }
          },
          onError: (err) => {
            if (!live) {
              switchToServerTranscode(`avbridge error: ${err?.message || 'error'}`)
            }
          },
          onStall: () => {
            if (!live) {
              switchToServerTranscode('avbridge sin avance tras estar listo')
            }
          },
        })
        avbridgeHandleRef.current = avbridgeHandle
        setPrepPercent(100)
        setLoadPhase('playing')
        if (live) {
          setLiveStatus('live')
          setSwitching(false)
          reconnectAttemptsRef.current = 0
        }
      } catch (err) {
        logAvbridgeError('fallback', 'avbridge no pudo reproducir', {
          reason,
          error: err?.message || String(err),
          title,
          type,
        })
        if (live) {
          setLiveStatus('stalled')
          scheduleLiveReconnectRef.current(`avbridge falló: ${err?.message || 'error'}`)
        } else {
          startServerTranscodePlayback(`avbridge: ${err?.message || reason}`)
        }
      } finally {
        avbridgeStarting = false
      }
    }

    const liveSupported = mpegts.getFeatureList().mseLivePlayback

    if (isLive && liveSupported) {
      const startMuted = typeof initialMuted === 'boolean' ? initialMuted : false
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
        enableStashBuffer: true,
        stashInitialSize: 768 * 1024,
        lazyLoad: false,
        liveBufferLatencyChasing: true,
        liveSync: true,
        autoCleanupSourceBuffer: true,
        autoCleanupMaxBackwardDuration: 180,
        autoCleanupMinBackwardDuration: 90,
      })
      mpegtsPlayer.attachMediaElement(video)
      mpegtsPlayer.load()
      mpegtsPlayerRef.current = mpegtsPlayer
      mpegtsPlayer.on(mpegts.Events.MEDIA_INFO, () => {
        setLiveStatus('live')
        setSwitching(false)
        reconnectAttemptsRef.current = 0
        tryLivePlayback(mpegtsPlayer)
      })
      mpegtsPlayer.on(mpegts.Events.ERROR, (_, data) => {
        const detail = data?.detail || data?.type || 'error'
        if (String(detail).toLowerCase().includes('codec') || String(detail).includes('MEDIA')) {
          logAvbridgeWarn('mpegts-codec', 'Codec no compatible en mpegts, probando avbridge', {
            title,
            mpegtsError: data,
          })
          startAvbridgePlayback('mpegts codec error', { live: true })
          return
        }
        setLiveStatus('stalled')
        logPlaybackWarn('player.mpegts', 'Error en transmisión en vivo', { title, mpegtsError: data })
        scheduleLiveReconnectRef.current(`error mpegts: ${detail}`)
      })
    } else if (isLive && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true })
      hls.loadSource(playbackUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const startMuted = typeof initialMuted === 'boolean' ? initialMuted : false
        video.muted = startMuted
        video.volume = 1
        setLiveStatus('live')
        video.play().catch((err) => logPlayFailure('hls', err))
      })
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setLiveStatus('stalled')
          logPlaybackWarn('player.hls', 'Error fatal HLS en vivo', { title, hlsError: data })
          scheduleLiveReconnectRef.current(`error hls fatal: ${data.details || data.type}`)
        } else {
          logPlaybackWarn('player.hls', 'Error HLS no fatal', { title, url, type, hlsError: data })
        }
      })
    } else if (isLive && video.canPlayType('application/vnd.apple.mpegurl')) {
      const startMuted = typeof initialMuted === 'boolean' ? initialMuted : false
      video.src = playbackUrl
      video.muted = startMuted
      video.volume = 1
      video.play().catch((err) => logPlayFailure('native-hls', err))
    } else if (useAvbridgeVod) {
      logAvbridge('vod', 'VOD/serie con avbridge (sin conversión en servidor)', {
        playbackUrl: appendClientDecode(playbackUrl),
      })
      startAvbridgePlayback('vod primary', { live: false })
    } else {
      const needsServerTranscode = playbackUrl.includes('/api/proxy/play')
        && !shouldUseAvbridgeForVod(playbackUrl, isVodLike, meta?.ext)
      if (needsServerTranscode) {
        setLoadPhase('converting')
      }
      video.setAttribute('playsinline', '')
      video.setAttribute('webkit-playsinline', 'true')
      video.preload = 'auto'
      video.src = playbackUrl
      video.volume = 1
      video.muted = false
      video.load()
      video.play().catch((err) => logPlayFailure('vod/native', err))
    }

    const onPlay = () => {
      setPlaying(true)
      userPausedRef.current = false
      setIsWaiting(false)
      clearWaitingReconnectTimer()
      setPrepPercent(100)
      setLoadPhase('playing')
      if (isLive) {
        setLiveStatus('live')
        reconnectAttemptsRef.current = 0
      }
    }
    const onPause = () => {
      setPlaying(false)
      userPausedRef.current = true
    }
    const onWaiting = () => {
      setIsWaiting(true)
      logPlaybackInfo('player.buffering', 'Buffering (evento waiting)', {
        title,
        url,
        type,
        isLive,
        readyState: video.readyState,
        networkState: video.networkState,
      })
      if (isLive) {
        setLiveStatus('buffering')
        clearWaitingReconnectTimer()
        waitingReconnectTimerRef.current = window.setTimeout(() => {
          scheduleLiveReconnectRef.current('buffering prolongado')
        }, LIVE_WAITING_RECONNECT_MS)
      }
    }
    const onPlaying = () => {
      setIsWaiting(false)
      clearWaitingReconnectTimer()
      setPrepPercent(100)
      setLoadPhase('playing')
      logPlaybackInfo('player.buffering', 'Reproducción reanudada (evento playing)', {
        title,
        url,
        type,
        isLive,
      })
      if (isLive) {
        setLiveStatus('live')
        stallTicksRef.current = 0
        reconnectAttemptsRef.current = 0
      }
    }
    const onCanPlay = () => {
      setPrepPercent(100)
      setLoadPhase('ready')
    }
    const onTime = () => {
      if (isLive) return
      const position = video.currentTime || 0
      setCurrent(position)
      if (video.buffered.length) {
        const end = video.buffered.end(video.buffered.length - 1)
        setBuffered(end)
        const total = (video.duration > 0 && Number.isFinite(video.duration))
          ? video.duration
          : (durationHint || 0)
        if (total > 0) {
          setBufferPercent(Math.min(100, Math.round((end / total) * 100)))
        }
      }
      if (meta?.itemId && isVodLike) {
        const now = Date.now()
        const totalDuration = (video.duration > 0 && Number.isFinite(video.duration))
          ? video.duration
          : durationHint
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
            duration_seconds: totalDuration || null,
          })
        }
      }
    }
    const onMeta = () => {
      const raw = video.duration || 0
      const total = (raw > 0 && Number.isFinite(raw) && raw < 1e8)
        ? raw
        : (durationHint || 0)
      if (total > 0) setDuration(total)
      if (!isLive && resumeAt > 0 && !resumeAppliedRef.current && total > resumeAt + 5) {
        video.currentTime = resumeAt
        resumeAppliedRef.current = true
      }
    }
    const onSeeking = () => {
      if (!isLive) setIsSeeking(true)
    }
    const onSeeked = () => {
      if (!isLive) setIsSeeking(false)
    }
    const onVol = () => {
      setVolume(video.volume)
      setMuted(video.muted)
    }
    const onMediaError = () => {
      const mediaError = video.error
      const code = mediaError?.code
      if (isLive) {
        setLiveStatus('stalled')
        logPlaybackWarn('player.video', 'Error de video en vivo', {
          title,
          mediaErrorCode: code,
          mediaErrorMessage: mediaError?.message,
        })
        if (!avbridgeHandle && !avbridgeStarting) {
          startAvbridgePlayback(`error video live: ${code || 'unknown'}`, { live: true })
        } else {
          scheduleLiveReconnectRef.current(`error video: ${code || 'unknown'}`)
        }
        return
      }
      if (!avbridgeHandle && !avbridgeStarting && isVodLike && playbackUrl.includes('/api/proxy/play')) {
        const via = shouldUseAvbridgeForVod(playbackUrl, isVodLike, meta?.ext) ? 'html5' : 'server'
        logAvbridgeWarn('native-fallback', `${via} falló, probando avbridge`, {
          mediaErrorCode: code,
          mediaErrorMessage: mediaError?.message,
        })
        startAvbridgePlayback(`${via} error ${code || 'unknown'}`, { live: false })
        return
      }
      if (avbridgeHandle && !serverFallbackUsed && isVodLike && playbackUrl.includes('/api/proxy/play')) {
        switchToServerTranscode(`error video durante avbridge: ${code || 'unknown'}`)
        return
      }
      let message = 'No se pudo reproducir el video.'
      if (type === 'series' || type === 'vod') {
        if (code === 4) {
          message = 'Formato no compatible con este dispositivo. El servidor intentará convertir el video automáticamente; vuelve a intentar en unos segundos.'
        } else if (!audioTracks.length) {
          message = 'Reproducción solo video (sin audio). Si falla, el formato de video puede no ser compatible con tu celular.'
        } else {
          message = 'Error de reproducción. El video se está preparando para tu dispositivo; intenta de nuevo.'
        }
      }
      reportError(message, {
        engine: 'html5-video',
        mediaErrorCode: code,
        mediaErrorMessage: mediaError?.message,
        networkState: video.networkState,
        readyState: video.readyState,
      })
    }

    if (isLive) {
      liveWatchdogInterval = window.setInterval(() => {
        const videoEl = videoRef.current
        if (!videoEl || userPausedRef.current || videoEl.paused) {
          liveWatchdogStagnantSince = null
          return
        }
        const progress = videoEl.currentTime
        if (Math.abs(progress - liveWatchdogLastTime) >= 0.01) {
          liveWatchdogLastTime = progress
          liveWatchdogStagnantSince = null
          return
        }
        const now = Date.now()
        if (liveWatchdogStagnantSince === null) {
          liveWatchdogStagnantSince = now
        } else if (now - liveWatchdogStagnantSince >= 8000) {
          liveWatchdogStagnantSince = null
          forceLiveReconnectRef.current('watchdog: sin avance en 8s')
        }
      }, 2000)

      stallInterval = window.setInterval(() => {
        const videoEl = videoRef.current
        if (!videoEl || videoEl.paused || videoEl.readyState < 2) return
        const progress = videoEl.currentTime
        if (Math.abs(progress - lastProgressRef.current) < 0.01) {
          stallTicksRef.current += 1
          if (stallTicksRef.current >= 3) {
            setLiveStatus('stalled')
            scheduleLiveReconnectRef.current('transmisión detenida')
          } else if (stallTicksRef.current >= 2) {
            setLiveStatus(videoEl.readyState < 3 ? 'buffering' : 'stalled')
          }
        } else {
          stallTicksRef.current = 0
          if (liveStatusRef.current !== 'reconnecting') {
            setLiveStatus('live')
          }
          lastProgressRef.current = progress
        }
      }, 4000)
    }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('canplaythrough', onCanPlay)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('durationchange', onMeta)
    video.addEventListener('progress', onTime)
    video.addEventListener('volumechange', onVol)
    video.addEventListener('seeking', onSeeking)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onMediaError)

    return () => {
      if (liveWatchdogInterval) window.clearInterval(liveWatchdogInterval)
      if (stallInterval) window.clearInterval(stallInterval)
      clearWaitingReconnectTimer()
      clearReconnectTimer()
      if (meta?.itemId && isVodLike && video.currentTime > 0) {
        const totalDuration = (video.duration > 0 && Number.isFinite(video.duration))
          ? video.duration
          : durationHint
        saveWatchProgress({
          content_type: meta.contentType || type,
          item_id: meta.itemId,
          series_id: meta.seriesId || '',
          title: meta.title || title,
          image: meta.image || '',
          ext: meta.ext || '',
          position_seconds: video.currentTime,
          duration_seconds: totalDuration || null,
        })
      }
      if (mpegtsPlayer) {
        destroyMpegts()
      }
      mpegtsPlayerRef.current = null
      if (hls) hls.destroy()
      if (avbridgeHandle) {
        avbridgeHandle.destroy().catch(() => {})
      }
      avbridgeHandleRef.current = null
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('canplaythrough', onCanPlay)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('durationchange', onMeta)
      video.removeEventListener('progress', onTime)
      video.removeEventListener('volumechange', onVol)
      video.removeEventListener('seeking', onSeeking)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onMediaError)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [url, type, isLive, isVodLike, meta, resumeAt, title, initialMuted, restored, durationHint, resetLiveRecovery, clearReconnectTimer, clearWaitingReconnectTimer])

  useEffect(() => {
    if (!isLive && durationHint > 0) {
      setDuration(durationHint)
    }
  }, [url, durationHint, isLive])

  async function changeAudioTrack(value) {
    if (!value) return
    const handle = avbridgeHandleRef.current
    if (handle?.setAudioTrack && handle.getAudioTracks) {
      const avTracks = handle.getAudioTracks()
      const backendIndex = audioTracks.findIndex((track) => String(track.index) === value)
      const avTrack = avTracks[backendIndex >= 0 ? backendIndex : 0]
      if (avTrack) {
        setSelectedAudio(value)
        try {
          await handle.setAudioTrack(avTrack.id)
        } catch (err) {
          logPlaybackWarn('player.audio', 'No se pudo cambiar pista de audio (avbridge)', {
            value,
            error: err?.message || String(err),
          })
        }
        return
      }
    }
    if (!meta?.playPath || !onUrlChange) return
    const resumePosition = videoRef.current?.currentTime || 0
    setSelectedAudio(value)
    await onUrlChange(meta.playPath, Number(value), resumePosition)
  }

  async function commitSeek(value) {
    const video = videoRef.current
    if (!video || isLive) return
    const time = Number(value)
    setIsSeeking(true)
    setCurrent(time)
    setScrubTime(time)
    try {
      const handle = avbridgeHandleRef.current
      if (handle?.seek) {
        await handle.seek(time)
      } else {
        video.currentTime = time
      }
    } catch (err) {
      logPlaybackWarn('player.seek', 'Fallo al buscar posición', {
        time,
        error: err?.message || String(err),
      })
    } finally {
      setIsSeeking(false)
      setIsScrubbing(false)
    }
  }

  function previewSeek(value) {
    if (isLive) return
    setIsScrubbing(true)
    setScrubTime(Number(value))
  }

  function changeSubtitleTrack(value) {
    setSelectedSubtitle(value)
    const video = videoRef.current
    if (!video?.textTracks) return
    for (let i = 0; i < video.textTracks.length; i += 1) {
      video.textTracks[i].mode = 'disabled'
    }
    if (value === '-1') return
    const track = video.textTracks[0]
    if (track) track.mode = 'showing'
  }

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
    const handle = avbridgeHandleRef.current
    const mpegts = mpegtsPlayerRef.current
    const isPaused = handle?.player ? handle.player.paused : video.paused

    if (isPaused) {
      userPausedRef.current = false
      if (isLive && video.muted) {
        video.muted = false
        setMuted(false)
        onMutedChange?.(false)
      }
      const playAction = handle?.play
        ? handle.play()
        : mpegts?.play
          ? mpegts.play()
          : video.play()
      Promise.resolve(playAction).catch((err) => {
        logPlaybackWarn('player.play', 'Fallo al reproducir (togglePlay)', {
          title,
          url,
          type,
          error: err?.message || String(err),
        })
      })
    } else {
      userPausedRef.current = true
      if (handle?.pause) {
        handle.pause()
      } else if (mpegts?.pause) {
        mpegts.pause()
      } else {
        video.pause()
      }
    }
  }
  togglePlayRef.current = togglePlay

  async function togglePictureInPicture() {
    const video = videoRef.current
    if (!video || isLive || !document.pictureInPictureEnabled) return
    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture()
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture()
      }
    } catch (err) {
      logPlaybackWarn('player.pip', 'No se pudo activar Picture-in-Picture', {
        error: err?.message || String(err),
      })
    }
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

  async function toggleFullscreen() {
    const video = videoRef.current
    const container = overlayRef.current
    if (!video) return

    const active = Boolean(getFullscreenElement()) || isVideoNativeFullscreen(video)

    if (active) {
      if (document.exitFullscreen) {
        await document.exitFullscreen().catch(() => {})
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen()
      } else if (video.webkitExitFullscreen) {
        video.webkitExitFullscreen()
      }
      return
    }

    if (isIosDevice() && typeof video.webkitEnterFullscreen === 'function') {
      video.webkitEnterFullscreen()
      return
    }

    const target = container || video
    if (target.requestFullscreen) {
      await target.requestFullscreen().catch(() => {
        if (typeof video.webkitEnterFullscreen === 'function') {
          video.webkitEnterFullscreen()
        }
      })
    } else if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen()
    } else if (typeof video.webkitEnterFullscreen === 'function') {
      video.webkitEnterFullscreen()
    }
  }

  const displayTime = isScrubbing ? scrubTime : current
  const totalDuration = durationHint > 0
    ? durationHint
    : ((duration > 0 && Number.isFinite(duration)) ? duration : 0)
  const playedPercent = totalDuration > 0
    ? Math.min(100, (displayTime / totalDuration) * 100)
    : 0
  const bufferedPercent = totalDuration > 0
    ? Math.min(100, (buffered / totalDuration) * 100)
    : 0
  const activeSubtitle = subtitleTracks.find((track) => String(track.index) === selectedSubtitle)
  const subtitleSrc = activeSubtitle?.url ? resolveApiUrl(activeSubtitle.url) : null
  const currentProgram = epg?.current
  const upcomingPrograms = (epg?.listings || []).filter((item) => !item.now).slice(0, 4)

  const loadPhaseLabel = {
    avbridge: 'Decodificando en el navegador (avbridge)',
    converting: 'Convirtiendo video',
    loading: 'Cargando video',
    connecting: 'Conectando canal',
    ready: 'Listo para reproducir',
    playing: 'Reproduciendo',
    idle: 'Preparando',
  }[loadPhase] || 'Cargando'

  const showLoadOverlay = prepPercent < 100 || isSeeking || liveStatus === 'reconnecting'
    || loadPhase === 'avbridge' || loadPhase === 'converting'
    || (isLive && liveStatus === 'connecting')
    || (isLive && showBufferingOverlay)
    || (!isLive && isWaiting)
  const displayPrepPercent = isLive && (liveStatus === 'buffering' || showBufferingOverlay)
    ? Math.max(prepPercent, 55)
    : prepPercent

  useEffect(() => {
    if (bufferingOverlayTimerRef.current) {
      window.clearTimeout(bufferingOverlayTimerRef.current)
      bufferingOverlayTimerRef.current = null
    }

    if (!isLive) {
      setShowBufferingOverlay(isWaiting)
      return undefined
    }

    const initialLoad = prepPercent < 100 || liveStatus === 'connecting' || liveStatus === 'reconnecting'
    if (initialLoad) {
      setShowBufferingOverlay(false)
      return undefined
    }

    if (!isWaiting && liveStatus !== 'buffering') {
      setShowBufferingOverlay(false)
      return undefined
    }

    bufferingOverlayTimerRef.current = window.setTimeout(() => {
      setShowBufferingOverlay(true)
      logPlaybackInfo('player.buffering', 'Buffering sostenido (>2.5s) — mostrando overlay', {
        title,
        url,
        liveStatus,
      })
    }, LIVE_BUFFER_OVERLAY_DELAY_MS)

    return () => {
      if (bufferingOverlayTimerRef.current) {
        window.clearTimeout(bufferingOverlayTimerRef.current)
        bufferingOverlayTimerRef.current = null
      }
    }
  }, [isLive, isWaiting, liveStatus, prepPercent, title, url])

  const hidePlayerChrome = isFullscreen && !uiVisible && !showGuide

  useEffect(() => {
    if (showGuide || showLoadOverlay || switching || error) {
      setUiVisible(true)
      if (isFullscreen) scheduleUiHide()
    }
  }, [showGuide, showLoadOverlay, switching, error, isFullscreen, scheduleUiHide])

  useEffect(() => {
    if (showLoadOverlay === loadOverlayVisibleRef.current) return undefined
    loadOverlayVisibleRef.current = showLoadOverlay

    const overlayLabel = liveStatus === 'reconnecting'
      ? 'Reconectando'
      : (isWaiting ? 'Buffering' : (isSeeking ? 'Seeking' : loadPhaseLabel))

    logPlaybackInfo(
      'player.loadOverlay',
      showLoadOverlay ? `Pantalla de carga visible: ${overlayLabel}` : 'Pantalla de carga oculta',
      {
        title,
        url,
        type,
        showLoadOverlay,
        liveStatus,
        loadPhase,
        isWaiting,
        isSeeking,
        switching,
        prepPercent: displayPrepPercent,
      },
    )
    return undefined
  }, [
    showLoadOverlay,
    liveStatus,
    isWaiting,
    isSeeking,
    loadPhase,
    loadPhaseLabel,
    title,
    url,
    type,
    switching,
    displayPrepPercent,
  ])

  return (
    <div
      className={`player-overlay${hidePlayerChrome ? ' player-overlay--ui-hidden' : ''}`}
      ref={overlayRef}
      onMouseMove={revealUi}
      onTouchStart={revealUi}
      onTouchEnd={revealUi}
    >
      <Box className="player-header player-chrome" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5 }}>
        <IconButton onClick={onClose} aria-label="Volver" color="inherit" size="small">
          <ArrowBackIcon />
        </IconButton>
        <Box className="player-header-main" sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" noWrap component="h2" sx={{ flex: 1 }}>
            {title}
          </Typography>
          {isLive ? <Chip label="EN VIVO" color="error" size="small" /> : null}
        </Box>
      </Box>
      {error ? (
        <Alert severity="error" className="player-chrome" sx={{ mx: 2, mb: 1 }} onClose={() => setError('')}>
          {error}
        </Alert>
      ) : null}
      {isLive && muted ? (
        <Alert severity="info" className="player-chrome" sx={{ mx: 2, mb: 1 }} icon={false}>
          {restored
            ? 'Canal restaurado tras recargar. Pulsa reproducir o el icono de volumen para activar el audio.'
            : 'El navegador bloqueó el audio automático. Pulsa reproducir o el icono de volumen.'}
        </Alert>
      ) : null}
      <div
        className="player-stage"
        onDoubleClick={toggleFullscreen}
        onClick={() => {
          if (isFullscreen) revealUi()
        }}
      >
        <video
          ref={videoRef}
          className="player-video"
          playsInline
          muted={muted}
          onClick={() => {
            if (isIosDevice() && !playing) {
              toggleFullscreen()
              return
            }
            if (!isLive) togglePlay()
          }}
        >
          {subtitleSrc ? (
            <track
              key={subtitleSrc}
              kind="subtitles"
              src={subtitleSrc}
              srcLang={activeSubtitle?.language || 'es'}
              label={activeSubtitle?.label || 'Subtítulos'}
              default
            />
          ) : null}
        </video>
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
        {showLoadOverlay ? (
          <Box className="player-load-overlay">
            <Paper
              elevation={8}
              className="player-load-card"
              sx={{
                p: 3,
                minWidth: 260,
                maxWidth: 360,
                textAlign: 'center',
                bgcolor: 'rgba(22, 22, 31, 0.82)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <CircularProgress size={40} sx={{ mb: 2 }} />
              <Typography variant="subtitle1" fontWeight={700}>
                {liveStatus === 'reconnecting'
                  ? 'Reconectando canal…'
                  : (isSeeking
                    ? 'Buscando posición…'
                    : (isWaiting ? 'Buffering…' : loadPhaseLabel))}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                {liveStatus === 'reconnecting'
                  ? 'Recuperando la señal automáticamente'
                  : (loadPhase === 'converting'
                    ? 'Adaptando formato para tu dispositivo'
                    : isLive
                      ? LIVE_STATUS_LABELS[liveStatus] || 'Conectando…'
                      : 'Descargando datos del servidor')}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={displayPrepPercent}
                sx={{ height: 8, borderRadius: 4, mb: 1 }}
              />
              <Typography variant="h6" color="primary.main">
                {displayPrepPercent}%
              </Typography>
              {!isLive && bufferPercent > 0 ? (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  Buffer: {bufferPercent}%
                </Typography>
              ) : null}
            </Paper>
          </Box>
        ) : null}
      </div>
      {isLive ? (
        <div className="player-live-status player-chrome">
          <span className={`player-live-dot player-live-dot--${liveStatus}`} />
          <span>{LIVE_STATUS_LABELS[liveStatus] || LIVE_STATUS_LABELS.live}</span>
        </div>
      ) : null}
      {isLive && epg?.has_epg ? (
        <div className="player-epg player-chrome">
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
        <div className="player-epg player-epg--empty player-chrome">Sin guía de programación para este canal.</div>
      ) : null}
      <Stack
        className="player-controls player-chrome"
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: { xs: 1, md: 2 }, py: 1.5, flexWrap: 'wrap' }}
      >
        {canZap ? (
          <>
            <IconButton
              onClick={() => zapChannel('prev')}
              disabled={switching}
              aria-label="Canal anterior"
              color="inherit"
              size="small"
            >
              <RemoveIcon />
            </IconButton>
            <IconButton
              onClick={() => setShowGuide((open) => !open)}
              aria-label="Guía de canales"
              color={showGuide ? 'primary' : 'inherit'}
              size="small"
            >
              <MenuIcon />
            </IconButton>
            <IconButton
              onClick={() => zapChannel('next')}
              disabled={switching}
              aria-label="Canal siguiente"
              color="inherit"
              size="small"
            >
              <AddIcon />
            </IconButton>
          </>
        ) : null}
        <IconButton onClick={togglePlay} aria-label={playing ? 'Pausar' : 'Reproducir'} color="inherit">
          {playing ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
        {isLive ? (
          <Typography variant="body2" className="player-time player-time--live" sx={{ minWidth: 72 }}>
            {currentChannelNumber ? `Canal ${currentChannelNumber}` : 'En directo'}
          </Typography>
        ) : (
          <Typography variant="body2" className="player-time" sx={{ minWidth: 96, fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(displayTime)}
            {` / ${totalDuration > 0 ? formatTime(totalDuration) : '--:--'}`}
          </Typography>
        )}
        {isLive ? (
          <Box sx={{ flex: 1, minWidth: 80 }}>
            <LinearProgress
              variant="indeterminate"
              color={liveStatus === 'stalled' ? 'error' : 'primary'}
              sx={{ height: 4, borderRadius: 2 }}
            />
          </Box>
        ) : (
          <Box className="player-seek-wrap" sx={{ flex: 1, minWidth: 120, position: 'relative', px: 0.5 }}>
            <Slider
              size="small"
              min={0}
              max={totalDuration > 0 ? totalDuration : 100}
              step={0.1}
              value={isScrubbing
                ? scrubTime
                : Math.min(current, totalDuration > 0 ? totalDuration : current)}
              onChange={(_, value) => previewSeek(value)}
              onChangeCommitted={(_, value) => commitSeek(value)}
              aria-label="Posición de reproducción"
              sx={{
                '& .MuiSlider-rail': { opacity: 0.3 },
                '& .MuiSlider-track': { border: 'none' },
              }}
            />
          </Box>
        )}
        <IconButton onClick={toggleMute} aria-label={muted ? 'Activar sonido' : 'Silenciar'} color="inherit" size="small">
          {muted || volume === 0 ? <VolumeOffIcon /> : <VolumeUpIcon />}
        </IconButton>
        <Slider
          size="small"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(_, value) => changeVolume(value)}
          aria-label="Volumen"
          sx={{ width: { xs: 56, sm: 80 }, display: { xs: 'none', sm: 'block' } }}
        />
        {isVodLike && typeof document !== 'undefined' && document.pictureInPictureEnabled ? (
          <IconButton
            onClick={togglePictureInPicture}
            aria-label={isPip ? 'Salir de imagen en imagen' : 'Imagen en imagen'}
            color="inherit"
            size="small"
          >
            {isPip ? <PictureInPictureIcon /> : <PictureInPictureAltIcon />}
          </IconButton>
        ) : null}
        <IconButton
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          color="inherit"
          size="small"
        >
          {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
        </IconButton>
        {isVodLike && audioTracks.length > 1 ? (
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <Select
              value={selectedAudio}
              onChange={(e) => changeAudioTrack(e.target.value)}
              displayEmpty
              variant="outlined"
            >
              {audioTracks.map((track) => (
                <MenuItem key={track.index} value={track.index}>{track.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null}
        {isVodLike && subtitleTracks.length > 0 ? (
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <Select
              value={selectedSubtitle}
              onChange={(e) => changeSubtitleTrack(e.target.value)}
              displayEmpty
              variant="outlined"
            >
              <MenuItem value="-1">Subs off</MenuItem>
              {subtitleTracks.map((track) => (
                <MenuItem key={track.index} value={track.index}>{track.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null}
      </Stack>
    </div>
  )
}
