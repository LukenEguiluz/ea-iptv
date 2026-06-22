import { useCallback, useEffect } from 'react'
import { Alert, Box, Typography } from '@mui/material'
import { fetchCatalog } from '../api'
import CatalogLoadOverlay from '../components/CatalogLoadOverlay'
import CategoryChips from '../components/CategoryChips'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import LoadingState from '../components/LoadingState'
import MediaCard from '../components/MediaCard'
import PageShell from '../components/PageShell'
import SearchBar from '../components/SearchBar'
import { useAppConfig } from '../context/AppConfigContext'
import { usePlayback } from '../context/PlaybackContext'
import useFirstCategory from '../hooks/useFirstCategory'
import usePaginatedCatalog from '../hooks/usePaginatedCatalog'

export default function Movies() {
  const { playItem, setPlayer } = usePlayback()
  const { isOnDemand } = useAppConfig()
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

  useFirstCategory(categories, activeCategory, setActiveCategory)

  const loadCategories = useCallback(() => {
    setLoadingCats(true)
    return fetchCatalog('/catalog/vod/categories')
      .then((data) => {
        const cats = Array.isArray(data) ? data : []
        setCategories(cats)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingCats(false))
  }, [setCategories, setError, setLoadingCats])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  async function openItem(item) {
    try {
      await playItem({
        content_type: 'vod',
        item_id: String(item.stream_id || item.item_id),
        name: item.name,
        image: item.stream_icon || item.image,
        category_name: item.category_name,
        container_extension: item.container_extension || 'mp4',
      })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <PageShell active="movies" title="Películas">
      <CatalogLoadOverlay
        show={loading && movies.length === 0}
        title="Cargando películas"
        loaded={movies.length}
        total={total}
      />
      <ContinueWatchingRow type="vod" onPlay={setPlayer} />
      <SearchBar
        type="vod"
        placeholder="Buscar por título, actor o director…"
        emptyLabel="No se encontraron películas"
        onSelect={openItem}
        disabled={isOnDemand}
      />
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      <CategoryChips
        categories={categories}
        activeCategory={activeCategory}
        allValue={ALL_CATEGORY}
        showAllChip={!isOnDemand}
        onChange={setActiveCategory}
        loading={loadingCats}
        searchPlaceholder="Buscar categoría de películas…"
      />
      {!loading && total > 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Mostrando {movies.length.toLocaleString()} de {total.toLocaleString()} películas
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
        {movies.length === 0 && !loading ? (
          <Typography color="text.secondary">Sin películas en esta categoría.</Typography>
        ) : null}
        {movies.map((item) => (
          <MediaCard
            key={`${item.stream_id}-${item.category_id || ''}`}
            title={item.name}
            image={item.stream_icon}
            subtitle={item.rating || item.category_name}
            poster
            onClick={() => openItem(item)}
          />
        ))}
      </Box>
      {loadingMore ? <LoadingState message="Cargando más películas…" compact /> : null}
      {movies.length < total ? <div ref={loadMoreRef} className="catalog-scroll-sentinel" /> : null}
    </PageShell>
  )
}
