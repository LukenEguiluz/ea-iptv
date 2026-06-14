import { useEffect, useState } from 'react'
import { buildPlayerSession, fetchCatalog, fetchPlayUrlWithAudio } from '../api'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import LoadingState from '../components/LoadingState'
import MediaCard from '../components/MediaCard'
import Navbar from '../components/Navbar'
import Player from '../components/Player'
import SearchBar from '../components/SearchBar'

function streamsPath(categoryId) {
  return `/catalog/vod/streams?limit=200&category_id=${categoryId}`
}

export default function Movies() {
  const [categories, setCategories] = useState([])
  const [movies, setMovies] = useState([])
  const [activeCategory, setActiveCategory] = useState('')
  const [loadingCats, setLoadingCats] = useState(true)
  const [loadingStreams, setLoadingStreams] = useState(false)
  const [error, setError] = useState('')
  const [player, setPlayer] = useState(null)

  useEffect(() => {
    fetchCatalog('/catalog/vod/categories')
      .then((data) => {
        const cats = Array.isArray(data) ? data : []
        setCategories(cats)
        if (cats[0]?.category_id) {
          setActiveCategory(String(cats[0].category_id))
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingCats(false))
  }, [])

  useEffect(() => {
    if (!activeCategory) return undefined

    setLoadingStreams(true)
    setError('')
    fetchCatalog(streamsPath(activeCategory))
      .then((data) => setMovies(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingStreams(false))
  }, [activeCategory])

  async function openItem(item) {
    try {
      const session = await buildPlayerSession({
        content_type: 'vod',
        item_id: String(item.stream_id || item.item_id),
        name: item.name,
        image: item.stream_icon || item.image,
        category_name: item.category_name,
        container_extension: item.container_extension || 'mp4',
      })
      setPlayer(session)
    } catch (err) {
      setError(err.message)
    }
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

  return (
    <div className="app-shell">
      <Navbar active="movies" />
      <main className="page-content page-content--padded">
        <h1 className="page-title">Películas</h1>
        <ContinueWatchingRow type="vod" onPlay={setPlayer} />
        <SearchBar
          type="vod"
          placeholder="Buscar por título, actor o director…"
          emptyLabel="No se encontraron películas"
          onSelect={openItem}
        />
        {error ? <div className="page-error">{error}</div> : null}
        {loadingCats ? <LoadingState message="Cargando categorías…" /> : (
          <div className="category-tabs">
            {categories.map((cat) => (
              <button
                key={cat.category_id}
                type="button"
                className={activeCategory === String(cat.category_id) ? 'active' : ''}
                onClick={() => setActiveCategory(String(cat.category_id))}
              >
                {cat.category_name}
              </button>
            ))}
          </div>
        )}
        {loadingStreams ? <LoadingState message="Cargando películas…" /> : (
          <div className="media-grid media-grid--posters">
            {movies.length === 0 ? <p className="page-empty-inline">Sin películas en esta categoría.</p> : null}
            {movies.map((item) => (
              <MediaCard
                key={item.stream_id}
                title={item.name}
                image={item.stream_icon}
                subtitle={item.rating}
                onClick={() => openItem(item)}
              />
            ))}
          </div>
        )}
      </main>
      {player ? (
        <Player
          title={player.title}
          url={player.url}
          type={player.type}
          meta={player.meta}
          durationHint={player.durationHint || 0}
          tracks={player.tracks}
          resumeAt={player.resumeAt || 0}
          onUrlChange={handleAudioChange}
          onClose={() => setPlayer(null)}
        />
      ) : null}
    </div>
  )
}