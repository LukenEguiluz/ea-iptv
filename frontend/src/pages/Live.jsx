import { useCallback, useEffect } from 'react'
import { Alert, Box, Typography } from '@mui/material'
import { fetchCatalog } from '../api'
import CatalogLoadOverlay from '../components/CatalogLoadOverlay'
import CategoryChips from '../components/CategoryChips'
import LoadingState from '../components/LoadingState'
import MediaCard from '../components/MediaCard'
import PageShell from '../components/PageShell'
import SearchBar from '../components/SearchBar'
import { usePlayback } from '../context/PlaybackContext'
import { useCatalogRefresh } from '../context/CatalogRefreshContext'
import usePaginatedCatalog from '../hooks/usePaginatedCatalog'

export default function Live() {
  const { playItem, setLiveChannels } = usePlayback()
  const { refreshGeneration } = useCatalogRefresh()
  const {
    ALL_CATEGORY,
    categories,
    setCategories,
    items: streams,
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
    reloadCurrentItems,
  } = usePaginatedCatalog('live')

  const loadCategories = useCallback(() => {
    setLoadingCats(true)
    return fetchCatalog('/catalog/live/categories')
      .then((data) => {
        const cats = Array.isArray(data) ? data : []
        setCategories(cats)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingCats(false))
  }, [setCategories, setError, setLoadingCats])

  useEffect(() => {
    loadCategories().then(() => setActiveCategory(ALL_CATEGORY))
  }, [ALL_CATEGORY, loadCategories, setActiveCategory])

  useEffect(() => {
    if (refreshGeneration === 0) return
    loadCategories()
    reloadCurrentItems()
  }, [refreshGeneration, loadCategories, reloadCurrentItems])

  useEffect(() => {
    setLiveChannels(streams)
  }, [streams, setLiveChannels])

  async function openItem(item) {
    try {
      await playItem({
        content_type: 'live',
        item_id: String(item.stream_id || item.item_id),
        name: item.name,
        image: item.stream_icon || item.image,
        category_name: item.category_name,
      })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <PageShell active="tv" title="TV en vivo">
      <CatalogLoadOverlay
        show={loading && streams.length === 0}
        title="Cargando canales"
        loaded={streams.length}
        total={total}
      />
      <SearchBar
        type="live"
        placeholder="Buscar canales por nombre…"
        emptyLabel="No se encontraron canales"
        onSelect={openItem}
      />
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      <CategoryChips
        categories={categories}
        activeCategory={activeCategory}
        allValue={ALL_CATEGORY}
        onChange={setActiveCategory}
        loading={loadingCats}
        searchPlaceholder="Buscar categoría de canales…"
      />
      {!loading && total > 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Mostrando {streams.length.toLocaleString()} de {total.toLocaleString()} canales
        </Typography>
      ) : null}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(auto-fill, minmax(150px, 1fr))',
            md: 'repeat(auto-fill, minmax(190px, 1fr))',
          },
          gap: 2,
        }}
      >
        {streams.length === 0 && !loading ? (
          <Typography color="text.secondary">Sin canales en esta categoría.</Typography>
        ) : null}
        {streams.map((item) => (
          <MediaCard
            key={`${item.stream_id}-${item.category_id || ''}`}
            title={item.name}
            image={item.stream_icon}
            subtitle={item.category_name}
            onClick={() => openItem(item)}
          />
        ))}
      </Box>
      {loadingMore ? <LoadingState message="Cargando más canales…" compact /> : null}
      {streams.length < total ? <div ref={loadMoreRef} className="catalog-scroll-sentinel" /> : null}
    </PageShell>
  )
}
