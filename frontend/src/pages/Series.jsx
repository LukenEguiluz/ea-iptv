import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchCatalog } from '../api'
import CatalogLoadOverlay from '../components/CatalogLoadOverlay'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import LoadingState from '../components/LoadingState'
import MediaCard from '../components/MediaCard'
import Navbar from '../components/Navbar'
import SearchBar from '../components/SearchBar'
import { usePlayback } from '../context/PlaybackContext'
import usePaginatedCatalog from '../hooks/usePaginatedCatalog'

export default function Series() {
  const navigate = useNavigate()
  const { setPlayer } = usePlayback()
  const {
    ALL_CATEGORY,
    categories,
    setCategories,
    items: series,
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
  } = usePaginatedCatalog('series')

  useEffect(() => {
    fetchCatalog('/catalog/series/categories')
      .then((data) => {
        const cats = Array.isArray(data) ? data : []
        setCategories(cats)
        setActiveCategory(ALL_CATEGORY)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingCats(false))
  }, [ALL_CATEGORY, setActiveCategory, setCategories, setError, setLoadingCats])

  return (
    <div className="app-shell">
      <Navbar active="series" />
      <CatalogLoadOverlay
        show={loading && series.length === 0}
        title="Cargando series"
        loaded={series.length}
        total={total}
      />
      <main className="page-content page-content--padded">
        <h1 className="page-title">Series</h1>
        <ContinueWatchingRow type="series" onPlay={setPlayer} />
        <SearchBar
          type="series"
          placeholder="Buscar por título, actor o director…"
          emptyLabel="No se encontraron series"
          onSeriesSelect={(item) => navigate(`/series/${item.item_id}`)}
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
            Mostrando {series.length.toLocaleString()} de {total.toLocaleString()} series
          </p>
        ) : null}
        <div className="media-grid media-grid--posters">
          {series.length === 0 && !loading ? (
            <p className="page-empty-inline">Sin series en esta categoría.</p>
          ) : null}
          {series.map((item) => (
            <MediaCard
              key={`${item.series_id}-${item.category_id || ''}`}
              title={item.name}
              image={item.cover || item.cover_big}
              subtitle={item.genre || item.rating}
              onClick={() => navigate(`/series/${item.series_id}`)}
            />
          ))}
        </div>
        {loadingMore ? <LoadingState message="Cargando más series…" compact /> : null}
        {series.length < total ? <div ref={loadMoreRef} className="catalog-scroll-sentinel" /> : null}
      </main>
    </div>
  )
}
