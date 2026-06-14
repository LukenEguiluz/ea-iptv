import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  buildPlayerSession,
  fetchCatalog,
  fetchPlayUrlWithAudio,
  fetchViewHistory,
} from '../api'
import ContentRow from '../components/ContentRow'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import LoadingState from '../components/LoadingState'
import MediaCard from '../components/MediaCard'
import Navbar from '../components/Navbar'
import Player from '../components/Player'

async function loadSection(path) {
  const data = await fetchCatalog(path)
  return Array.isArray(data) ? data : []
}

async function loadFirstCategoryItems(categoriesPath, streamsPathBuilder) {
  const categories = await loadSection(categoriesPath)
  const first = categories[0]
  if (!first?.category_id) return []
  return loadSection(streamsPathBuilder(first.category_id))
}

export default function Home() {
  const [live, setLive] = useState([])
  const [movies, setMovies] = useState([])
  const [series, setSeries] = useState([])
  const [recentChannels, setRecentChannels] = useState([])
  const [loading, setLoading] = useState({ live: true, movies: true, series: true, library: true })
  const [errors, setErrors] = useState({})
  const [player, setPlayer] = useState(null)
  const [liveAudioOn, setLiveAudioOn] = useState(false)

  useEffect(() => {
    loadFirstCategoryItems(
      '/catalog/live/categories',
      (id) => `/catalog/live/streams?limit=24&category_id=${id}`,
    )
      .then((data) => setLive(data))
      .catch((err) => setErrors((e) => ({ ...e, live: err.message })))
      .finally(() => setLoading((s) => ({ ...s, live: false })))

    loadFirstCategoryItems(
      '/catalog/vod/categories',
      (id) => `/catalog/vod/streams?limit=24&category_id=${id}`,
    )
      .then((data) => setMovies(data))
      .catch((err) => setErrors((e) => ({ ...e, movies: err.message })))
      .finally(() => setLoading((s) => ({ ...s, movies: false })))

    loadFirstCategoryItems(
      '/catalog/series/categories',
      (id) => `/catalog/series?limit=24&category_id=${id}`,
    )
      .then((data) => setSeries(data))
      .catch((err) => setErrors((e) => ({ ...e, series: err.message })))
      .finally(() => setLoading((s) => ({ ...s, series: false })))

    fetchViewHistory('live', 12)
      .then((history) => setRecentChannels(history))
      .catch((err) => setErrors((e) => ({ ...e, library: err.message })))
      .finally(() => setLoading((s) => ({ ...s, library: false })))
  }, [])

  async function playLive(item) {
    const session = await buildPlayerSession({
      content_type: 'live',
      item_id: String(item.stream_id || item.item_id),
      name: item.name || item.title,
      image: item.stream_icon || item.image,
      category_name: item.category_name,
    }, { withEpg: true })
    setLiveAudioOn(false)
    setPlayer(session)
  }

  const changeLiveChannel = useCallback(async (direction, selectedChannel = null) => {
    if (!player || player.type !== 'live' || live.length < 2) return

    const currentId = String(player.meta?.itemId || '')
    const currentIndex = live.findIndex(
      (item) => String(item.stream_id || item.item_id) === currentId,
    )

    let nextItem = selectedChannel
    if (!nextItem) {
      const baseIndex = currentIndex >= 0 ? currentIndex : 0
      const offset = direction === 'prev' ? -1 : 1
      const nextIndex = (baseIndex + offset + live.length) % live.length
      nextItem = live[nextIndex]
    }

    if (!nextItem) return

    const session = await buildPlayerSession({
      content_type: 'live',
      item_id: String(nextItem.stream_id || nextItem.item_id),
      name: nextItem.name || nextItem.title,
      image: nextItem.stream_icon || nextItem.image,
      category_name: nextItem.category_name,
    }, { withEpg: true })
    setPlayer(session)
  }, [player, live])

  async function playVod(item) {
    const session = await buildPlayerSession({
      content_type: 'vod',
      item_id: String(item.stream_id || item.item_id),
      name: item.name || item.title,
      image: item.stream_icon || item.image,
      container_extension: item.container_extension || item.ext || 'mp4',
    })
    setPlayer(session)
  }

  async function handleAudioChange(playPath, audioIndex, resumePosition) {
    const playData = await fetchPlayUrlWithAudio(playPath, audioIndex)
    setPlayer((prev) => ({
      ...prev,
      url: playData.url,
      tracks: playData.tracks || prev?.tracks,
      durationHint: playData.duration_seconds || prev?.durationHint,
      resumeAt: resumePosition,
    }))
  }

  function playSeries(item) {
    window.location.href = `/series/${item.series_id}`
  }

  const hero = movies[0] || series[0] || live[0]
  const anyLoading = loading.live || loading.movies || loading.series
  const allEmpty = !anyLoading && !live.length && !movies.length && !series.length

  return (
    <div className="app-shell">
      <Navbar active="home" />
      {Object.entries(errors).map(([key, msg]) => (
        <div key={key} className="page-error">{key}: {msg}</div>
      ))}
      <div className="page-content page-content--padded-top">
        <ContinueWatchingRow onPlay={setPlayer} />
      </div>
      {anyLoading && !hero ? <LoadingState message="Conectando con el proveedor IPTV…" /> : null}
      {allEmpty ? (
        <div className="page-empty">
          <p>No se recibió contenido del proveedor.</p>
          <Link to="/settings">Abrir configuración y diagnóstico →</Link>
        </div>
      ) : null}
      {hero ? (
        <section className="hero">
          <div
            className="hero-backdrop"
            style={{ backgroundImage: `url(${hero.stream_icon || hero.cover || hero.cover_big || ''})` }}
          />
          <div className="hero-content">
            <span className="hero-badge">Destacado</span>
            <h1>{hero.name || hero.title}</h1>
            <p>Disfruta TV en vivo, películas y series en un solo lugar.</p>
          </div>
        </section>
      ) : null}
      <main className="page-content">
        {!loading.library && recentChannels.length > 0 ? (
          <section className="library-row">
            <h2 className="content-row-title">Canales recientes</h2>
            <div className="content-row-track">
              {recentChannels.map((item) => (
                <MediaCard
                  key={`${item.item_id}-${item.viewed_at}`}
                  title={item.title}
                  image={item.image}
                  subtitle={item.category_name || 'TV en vivo'}
                  onClick={() => playLive({
                    stream_id: item.item_id,
                    name: item.title,
                    stream_icon: item.image,
                    category_name: item.category_name,
                  })}
                />
              ))}
            </div>
          </section>
        ) : null}
        {loading.live ? <LoadingState message="Cargando TV en vivo…" /> : (
          <ContentRow title="TV en vivo" items={live} onPlay={playLive} />
        )}
        {loading.movies ? <LoadingState message="Cargando películas…" /> : (
          <ContentRow title="Películas" items={movies} onPlay={playVod} />
        )}
        {loading.series ? <LoadingState message="Cargando series…" /> : (
          <ContentRow title="Series" items={series} onPlay={playSeries} />
        )}
      </main>
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
          initialMuted={player.type === 'live' ? !liveAudioOn : undefined}
          liveChannels={player.type === 'live' ? live : []}
          onLiveChannelChange={player.type === 'live' ? changeLiveChannel : undefined}
          onMutedChange={player.type === 'live' ? (isMuted) => setLiveAudioOn(!isMuted) : undefined}
          onUrlChange={player.type !== 'live' ? handleAudioChange : undefined}
          onClose={() => {
            setPlayer(null)
            setLiveAudioOn(false)
          }}
        />
      ) : null}
    </div>
  )
}
