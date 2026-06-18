import { useState } from 'react'
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Typography,
} from '@mui/material'
import LiveTvIcon from '@mui/icons-material/LiveTv'

export default function ChannelCard({
  title,
  image,
  category,
  onClick,
  layout = 'horizontal',
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = image && !imageFailed

  const imageBox = (
    <Box
      sx={{
        bgcolor: 'action.hover',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 1.5,
        ...(layout === 'horizontal'
          ? {
              width: { xs: '100%', sm: 200 },
              minHeight: { xs: 140, sm: 120 },
              flexShrink: 0,
            }
          : {
              width: '100%',
              aspectRatio: '16 / 9',
            }),
      }}
    >
      {showImage ? (
        <Box
          component="img"
          src={image}
          alt={title}
          loading="lazy"
          onError={() => setImageFailed(true)}
          sx={{
            maxWidth: '100%',
            maxHeight: layout === 'horizontal' ? { xs: 120, sm: 96 } : '85%',
            width: layout === 'grid' ? 'auto' : undefined,
            height: layout === 'grid' ? 'auto' : undefined,
            objectFit: 'contain',
          }}
        />
      ) : (
        <LiveTvIcon sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.6 }} />
      )}
    </Box>
  )

  const infoBox = (
    <CardContent sx={{ flex: 1, minWidth: 0, py: { xs: 1.5, sm: 2 } }}>
      <Typography
        variant="subtitle1"
        fontWeight={700}
        sx={{ lineHeight: 1.35, wordBreak: 'break-word' }}
      >
        {title}
      </Typography>
      {category ? (
        <Chip label={category} size="small" variant="outlined" sx={{ mt: 1 }} />
      ) : null}
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
        TV en vivo
      </Typography>
    </CardContent>
  )

  return (
    <Card
      sx={{
        width: '100%',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 4,
        },
      }}
    >
      <CardActionArea onClick={onClick} sx={{ height: '100%' }}>
        {layout === 'grid' ? (
          <>
            {imageBox}
            {infoBox}
          </>
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: 'stretch',
            }}
          >
            {imageBox}
            {infoBox}
          </Box>
        )}
      </CardActionArea>
    </Card>
  )
}
