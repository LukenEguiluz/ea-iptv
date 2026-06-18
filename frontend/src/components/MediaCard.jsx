import { useState } from 'react'
import {
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  Typography,
} from '@mui/material'
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined'

export default function MediaCard({
  title,
  image,
  subtitle,
  onClick,
  poster = false,
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = image && !imageFailed

  return (
    <Card
      sx={{
        width: poster ? { xs: 130, sm: 150, md: 170 } : { xs: 160, sm: 180, md: 200 },
        flexShrink: 0,
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 6,
        },
      }}
    >
      <CardActionArea onClick={onClick} sx={{ height: '100%' }}>
        {showImage ? (
          <CardMedia
            component="img"
            image={image}
            alt={title}
            loading="lazy"
            onError={() => setImageFailed(true)}
            sx={{
              aspectRatio: poster ? '2 / 3' : '16 / 9',
              objectFit: 'cover',
              bgcolor: 'action.hover',
            }}
          />
        ) : (
          <CardMedia
            sx={{
              aspectRatio: poster ? '2 / 3' : '16 / 9',
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'action.hover',
              color: 'text.secondary',
            }}
          >
            {poster ? <MovieOutlinedIcon fontSize="large" /> : (title?.slice(0, 1) || '?')}
          </CardMedia>
        )}
        <CardContent sx={{ py: 1.25, px: 1.25 }}>
          <Typography variant="body2" fontWeight={600} noWrap title={title}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="caption" color="text.secondary" noWrap display="block" title={subtitle}>
              {subtitle}
            </Typography>
          ) : null}
        </CardContent>
      </CardActionArea>
    </Card>
  )
}
