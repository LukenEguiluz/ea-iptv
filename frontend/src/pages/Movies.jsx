import { useEffect, useState } from 'react'
import { buildPlayerSession, fetchCatalog, fetchPlayUrlWithAudio } from '../api'
import CatalogLoadOverlay from '../components/CatalogLoadOverlay'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import LoadingState from '../components/LoadingState'
import MediaCard from '../components/MediaCard'
import Navbar from '../components/Navbar'
import Player from '../components/Player'
import SearchBar from '../components/SearchBar'
import usePaginatedCatalog from '../hooks/usePaginatedCatalog'

export default function Movies() {
  const {
    ALL_CATEGORY,
    categories,
    setCategories,
    items: movies,
    activeCategory,
    setActiveCategory,
    total,
    loadingCats,
    setLoadingCats,
    loading,
    loadingMore,
    error,
    setError,
    loadMoreRef,
  } = usePaginatedCatalog('vod')

  const [player, setPlayer] = useState(null)

  useEffect(() => {
    fetchCatalog('/catalog/vod/categories')
      .then((data) => {
        const cats = Array.isArray(data) ? data : []
        setCategories(cats)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingCats(false))
  }, [setCategories, setError, setLoadingCats])

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
      <CatalogLoadOverlay
        show={loading && movies.length === 0}
        title="Cargando películas"
        loaded={movies.length}
        total={total}
      />
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
            <button
              type="button"
              className={activeCategory === ALL_CATEGORY ? 'active' : ''}
              onClick={() => setActiveCategory(ALL_CATEGORY)}
            >
              Todas
            </button>
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
        {!loading && total > 0 ? (
          <p className="catalog-count">
            Mostrando {movies.length.toLocaleString()} de {total.toLocaleString()} películas
          </p>
        ) : null}
        <div className="media-grid media-grid--posters">
          {movies.length === 0 && !loading ? (
            <p className="page-empty-inline">Sin películas en esta categoría.</p>
          ) : null}
          {movies.map((item) => (
            <MediaCard
              key={`${item.stream_id}-${item.category_id || ''}`}
              title={item.name}
              image={item.stream_icon}
              subtitle={item.rating || item.category_name}
              onClick={() => openItem(item)}
            />
          ))}
        </div>
        {loadingMore ? <LoadingState message="Cargando más películas…" compact /> : null}
        {movies.length < total ? <div ref={loadMoreRef} className="catalog-scroll-sentinel" /> : null}
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
