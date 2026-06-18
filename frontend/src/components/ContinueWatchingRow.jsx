import { useCallback, useEffect, useState } from 'react'
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  IconButton,
  LinearProgress,
  Tooltip,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined'
import {
  deleteWatchProgress,
  fetchContinueWatching,
  fetchPlayUrl,
  fetchWatchProgress,
} from '../api'
import { useCatalogRefresh } from '../context/CatalogRefreshContext'
import { logPlaybackError } from '../utils/playbackLog'

export default function ContinueWatchingRow({ type = '', limit = 12, onPlay }) {
  const { refreshGeneration } = useCatalogRefresh()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [removingId, setRemovingId] = useState('')

  const loadItems = useCallback(() => {
    setLoading(true)
    return fetchContinueWatching(limit, type)
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [limit, type])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  useEffect(() => {
    if (refreshGeneration === 0) return
    loadItems()
  }, [refreshGeneration, loadItems])

  async function resumeItem(item) {
    try {
      const ext = item.ext || 'mp4'
      const playPath = item.content_type === 'series'
        ? `/catalog/series/episode/${item.item_id}/play`
        : `/catalog/vod/${item.item_id}/play?ext=${ext}`
      const [playData, progress] = await Promise.all([
        fetchPlayUrl(playPath),
        fetchWatchProgress(item.content_type, item.item_id).catch(() => null),
      ])
      onPlay({
        title: item.title,
        url: playData.url,
        type: item.content_type,
        durationHint: playData.duration_seconds || item.duration_seconds || 0,
        tracks: playData.tracks || null,
        resumeAt: progress?.position_seconds || item.position_seconds || 0,
        meta: {
          contentType: item.content_type,
          itemId: item.item_id,
          seriesId: item.series_id || '',
          title: item.title,
          image: item.image,
          ext: playData.ext || ext,
          playPath,
        },
      })
    } catch (err) {
      logPlaybackError('continueWatching', err, { item })
      throw err
    }
  }

  async function removeItem(item, event) {
    event.preventDefault()
    event.stopPropagation()
    const key = `${item.content_type}-${item.item_id}`
    setRemovingId(key)
    try {
      await deleteWatchProgress(item.content_type, item.item_id)
      setItems((prev) => prev.filter(
        (entry) => `${entry.content_type}-${entry.item_id}` !== key,
      ))
    } catch (err) {
      logPlaybackError('removeWatchProgress', err, { item })
    } finally {
      setRemovingId('')
    }
  }

  if (loading || items.length === 0) return null

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h5" sx={{ mb: 1.5 }}>
        Seguir viendo
      </Typography>
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          overflowX: 'auto',
          pb: 1,
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {items.map((item) => {
          const key = `${item.content_type}-${item.item_id}`
          return (
            <Card
              key={key}
              sx={{
                width: { xs: 150, sm: 170 },
                flexShrink: 0,
                scrollSnapAlign: 'start',
                transition: 'transform 0.2s',
                position: 'relative',
                '&:hover': { transform: 'translateY(-3px)' },
              }}
            >
              <Tooltip title="Quitar de seguir viendo">
                <IconButton
                  size="small"
                  aria-label="Quitar de seguir viendo"
                  disabled={removingId === key}
                  onClick={(event) => removeItem(item, event)}
                  sx={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    zIndex: 2,
                    bgcolor: 'rgba(11, 11, 15, 0.75)',
                    '&:hover': { bgcolor: 'rgba(11, 11, 15, 0.9)' },
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <CardActionArea onClick={() => resumeItem(item)} sx={{ height: '100%' }}>
                <Box sx={{ position: 'relative' }}>
                  {item.image ? (
                    <CardMedia
                      component="img"
                      image={item.image}
                      alt={item.title}
                      sx={{ aspectRatio: '2 / 3', objectFit: 'cover' }}
                    />
                  ) : (
                    <CardMedia
                      sx={{
                        aspectRatio: '2 / 3',
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: 'action.hover',
                        color: 'text.secondary',
                      }}
                    >
                      <MovieOutlinedIcon fontSize="large" />
                    </CardMedia>
                  )}
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, item.percent || 0)}
                    sx={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 4,
                      borderRadius: 0,
                    }}
                  />
                </Box>
                <CardContent sx={{ py: 1, px: 1.25 }}>
                  <Typography variant="body2" fontWeight={600} noWrap title={item.title}>
                    {item.title}
                  </Typography>
                  {item.percent > 0 ? (
                    <Typography variant="caption" color="primary.main">
                      {item.percent}% visto
                    </Typography>
                  ) : null}
                </CardContent>
              </CardActionArea>
            </Card>
          )
        })}
      </Box>
    </Box>
  )
}
