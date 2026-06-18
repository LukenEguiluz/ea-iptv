import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Typography } from '@mui/material'
import { fetchCatalog } from '../api'
import CatalogLoadOverlay from '../components/CatalogLoadOverlay'
import CategoryChips from '../components/CategoryChips'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import LoadingState from '../components/LoadingState'
import MediaCard from '../components/MediaCard'
import PageShell from '../components/PageShell'
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
    <PageShell active="series" title="Series">
      <CatalogLoadOverlay
        show={loading && series.length === 0}
        title="Cargando series"
        loaded={series.length}
        total={total}
      />
      <ContinueWatchingRow type="series" onPlay={setPlayer} />
      <SearchBar
        type="series"
        placeholder="Buscar por título, actor o director…"
        emptyLabel="No se encontraron series"
        onSeriesSelect={(item) => navigate(`/series/${item.item_id}`)}
      />
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      <CategoryChips
        categories={categories}
        activeCategory={activeCategory}
        allValue={ALL_CATEGORY}
        onChange={setActiveCategory}
        loading={loadingCats}
        searchPlaceholder="Buscar categoría de series…"
      />
      {!loading && total > 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Mostrando {series.length.toLocaleString()} de {total.toLocaleString()} series
        </Typography>
      ) : null}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(auto-fill, minmax(130px, 1fr))',
            sm: 'repeat(auto-fill, minmax(150px, 1fr))',
            md: 'repeat(auto-fill, minmax(170px, 1fr))',
          },
          gap: 2,
        }}
      >
        {series.length === 0 && !loading ? (
          <Typography color="text.secondary">Sin series en esta categoría.</Typography>
        ) : null}
        {series.map((item) => (
          <MediaCard
            key={`${item.series_id}-${item.category_id || ''}`}
            title={item.name}
            image={item.cover || item.cover_big}
            subtitle={item.genre || item.rating}
            poster
            onClick={() => navigate(`/series/${item.series_id}`)}
          />
        ))}
      </Box>
      {loadingMore ? <LoadingState message="Cargando más series…" compact /> : null}
      {series.length < total ? <div ref={loadMoreRef} className="catalog-scroll-sentinel" /> : null}
    </PageShell>
  )
}
