import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Chip,
  Typography,
} from '@mui/material'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import { fetchCatalog } from '../api'
import ContentRow from '../components/ContentRow'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import LoadingState from '../components/LoadingState'
import PageShell from '../components/PageShell'
import RecentChannelsRow from '../components/RecentChannelsRow'
import { usePlayback } from '../context/PlaybackContext'
import { useCatalogRefresh } from '../context/CatalogRefreshContext'

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
  const { playItem, setPlayer } = usePlayback()
  const { refreshGeneration } = useCatalogRefresh()
  const [live, setLive] = useState([])
  const [movies, setMovies] = useState([])
  const [series, setSeries] = useState([])
  const [loading, setLoading] = useState({ live: true, movies: true, series: true })
  const [errors, setErrors] = useState({})

  const loadHomeContent = useCallback(() => {
    setLoading({ live: true, movies: true, series: true })
    setErrors({})

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
  }, [])

  useEffect(() => {
    loadHomeContent()
  }, [loadHomeContent])

  useEffect(() => {
    if (refreshGeneration === 0) return
    loadHomeContent()
  }, [refreshGeneration, loadHomeContent])

  const playLive = useCallback(async (item) => {
    await playItem({
      content_type: 'live',
      item_id: String(item.stream_id || item.item_id),
      name: item.name || item.title,
      image: item.stream_icon || item.image,
      category_name: item.category_name,
    })
  }, [playItem])

  const playVod = useCallback(async (item) => {
    await playItem({
      content_type: 'vod',
      item_id: String(item.stream_id || item.item_id),
      name: item.name || item.title,
      image: item.stream_icon || item.image,
      category_name: item.category_name,
      container_extension: item.container_extension || item.ext || 'mp4',
    })
  }, [playItem])

  const playSeries = useCallback((item) => {
    window.location.href = `/series/${item.series_id}`
  }, [])

  const hero = movies[0] || series[0] || live[0]
  const anyLoading = loading.live || loading.movies || loading.series
  const allEmpty = !anyLoading && !live.length && !movies.length && !series.length
  const heroImage = hero?.stream_icon || hero?.cover || hero?.cover_big || ''

  return (
    <PageShell active="home">
      {Object.entries(errors).map(([key, msg]) => (
        <Alert key={key} severity="error" sx={{ mb: 2 }}>
          {key}: {msg}
        </Alert>
      ))}
      <ContinueWatchingRow onPlay={setPlayer} />
      {anyLoading && !hero ? <LoadingState message="Conectando con el proveedor IPTV…" /> : null}
      {allEmpty ? (
        <Box
          sx={{
            textAlign: 'center',
            py: 8,
            px: 2,
            borderRadius: 3,
            border: '1px dashed',
            borderColor: 'divider',
          }}
        >
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            No se recibió contenido del proveedor.
          </Typography>
          <Button
            component={Link}
            to="/settings"
            variant="outlined"
            startIcon={<SettingsOutlinedIcon />}
          >
            Abrir configuración y diagnóstico
          </Button>
        </Box>
      ) : null}
      {hero ? (
        <Box
          sx={{
            position: 'relative',
            borderRadius: 3,
            overflow: 'hidden',
            mb: 3,
            minHeight: { xs: 220, md: 320 },
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              backgroundImage: heroImage ? `url(${heroImage})` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(2px)',
              transform: 'scale(1.05)',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg, rgba(11,11,15,0.95) 0%, rgba(11,11,15,0.4) 60%, transparent 100%)',
            }}
          />
          <Box sx={{ position: 'relative', p: { xs: 2.5, md: 4 }, maxWidth: 560 }}>
            <Chip label="Destacado" color="primary" size="small" sx={{ mb: 1.5 }} />
            <Typography variant="h3" component="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.5rem' }, mb: 1 }}>
              {hero.name || hero.title}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Disfruta TV en vivo, películas y series en un solo lugar.
            </Typography>
          </Box>
        </Box>
      ) : null}
      <RecentChannelsRow onPlay={playLive} />
      {loading.live ? <LoadingState message="Cargando TV en vivo…" /> : (
        <ContentRow title="TV en vivo" items={live} onPlay={playLive} />
      )}
      {loading.movies ? <LoadingState message="Cargando películas…" /> : (
        <ContentRow title="Películas" items={movies} onPlay={playVod} poster />
      )}
      {loading.series ? <LoadingState message="Cargando series…" /> : (
        <ContentRow title="Series" items={series} onPlay={playSeries} poster />
      )}
    </PageShell>
  )
}
