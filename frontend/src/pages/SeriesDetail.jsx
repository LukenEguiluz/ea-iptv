import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardMedia,
  Chip,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Typography,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import {
  fetchCatalog,
  fetchPlayUrl,
  fetchWatchProgress,
  recordViewHistory,
} from '../api'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import PageShell from '../components/PageShell'
import { usePlayback } from '../context/PlaybackContext'
import { logPlaybackError } from '../utils/playbackLog'

export default function SeriesDetail() {
  const { seriesId } = useParams()
  const { setPlayer } = usePlayback()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchCatalog(`/catalog/series/${seriesId}`)
        setInfo(data)
      } catch (err) {
        setError(err.message)
      }
    }
    load()
  }, [seriesId])

  async function playEpisode(episode) {
    try {
      const data = await fetchPlayUrl(`/catalog/series/episode/${episode.id}/play`)
      const progress = await fetchWatchProgress('series', String(episode.id)).catch(() => null)
      await recordViewHistory({
        content_type: 'series',
        item_id: String(episode.id),
        series_id: String(seriesId),
        title: episode.title || info?.info?.name,
        image: info?.info?.cover || info?.info?.cover_big || '',
      })
      setPlayer({
        title: episode.title || info?.info?.name,
        url: data.url,
        fallbackUrl: data.fallbackUrl || null,
        playbackMode: data.playbackMode || 'proxy',
        type: data.type,
        durationHint: data.duration_seconds || progress?.duration_seconds || 0,
        tracks: data.tracks || null,
        resumeAt: progress?.position_seconds || 0,
        meta: {
          contentType: 'series',
          itemId: String(episode.id),
          seriesId: String(seriesId),
          title: episode.title || info?.info?.name,
          image: info?.info?.cover || info?.info?.cover_big || '',
          ext: data.ext || 'mkv',
          playPath: `/catalog/series/episode/${episode.id}/play`,
        },
      })
      setError('')
    } catch (err) {
      logPlaybackError('seriesEpisode', err, { seriesId, episodeId: episode.id, episodeTitle: episode.title })
      setError(err.message)
    }
  }

  const seasons = info?.episodes ? Object.entries(info.episodes) : []
  const cover = info?.info?.cover || info?.info?.cover_big

  return (
    <PageShell active="series">
      <Button
        component={Link}
        to="/series"
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 2 }}
      >
        Volver a series
      </Button>
      <ContinueWatchingRow type="series" onPlay={setPlayer} />
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {info?.info ? (
        <Paper
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            gap: 3,
            p: { xs: 2, md: 3 },
            mb: 3,
          }}
        >
          {cover ? (
            <Card sx={{ width: { xs: '100%', md: 220 }, flexShrink: 0 }}>
              <CardMedia
                component="img"
                image={cover}
                alt={info.info.name}
                sx={{ aspectRatio: '2 / 3', objectFit: 'cover' }}
              />
            </Card>
          ) : null}
          <Box>
            <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
              {info.info.name}
            </Typography>
            {info.info.genre ? (
              <Chip label={info.info.genre} size="small" sx={{ mb: 1.5 }} />
            ) : null}
            <Typography color="text.secondary">
              {info.info.plot || 'Sin descripción disponible.'}
            </Typography>
          </Box>
        </Paper>
      ) : null}
      {seasons.map(([season, episodes]) => (
        <Box key={season} sx={{ mb: 3 }}>
          <Typography variant="h5" sx={{ mb: 1.5 }}>
            Temporada {season}
          </Typography>
          <Paper variant="outlined">
            <List disablePadding>
              {episodes.map((episode, index) => (
                <ListItemButton
                  key={episode.id}
                  divider={index < episodes.length - 1}
                  onClick={() => playEpisode(episode)}
                  sx={{ alignItems: 'flex-start', py: 1.5 }}
                >
                  <Chip
                    label={`E${episode.episode_num}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ mr: 2, mt: 0.25, minWidth: 48 }}
                  />
                  <ListItemText
                    primary={episode.title}
                    secondary={episode.info?.plot}
                    primaryTypographyProps={{ fontWeight: 600 }}
                    secondaryTypographyProps={{
                      sx: {
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      },
                    }}
                  />
                  <PlayArrowIcon color="primary" sx={{ ml: 1, mt: 0.5 }} />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        </Box>
      ))}
    </PageShell>
  )
}
