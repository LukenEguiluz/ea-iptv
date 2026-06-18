import { Box, Typography } from '@mui/material'
import MediaCard from './MediaCard'

export default function ContentRow({ title, items, onPlay, poster = false }) {
  if (!items?.length) return null

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h5" sx={{ px: { xs: 0, md: 0 }, mb: 1.5 }}>
        {title}
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
        {items.map((item) => (
          <Box key={item.id || item.stream_id || item.series_id} sx={{ scrollSnapAlign: 'start' }}>
            <MediaCard
              title={item.name || item.title}
              image={item.stream_icon || item.cover || item.cover_big}
              subtitle={item.category_name || item.rating || item.genre}
              poster={poster}
              onClick={() => onPlay(item)}
            />
          </Box>
        ))}
      </Box>
    </Box>
  )
}
