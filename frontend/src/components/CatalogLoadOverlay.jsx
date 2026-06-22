import { useEffect, useRef } from 'react'
import {
  Backdrop,
  Box,
  LinearProgress,
  Paper,
  Typography,
} from '@mui/material'
import { logCatalogInfo } from '../utils/catalogLog'

export default function CatalogLoadOverlay({ show, title, loaded = 0, total = 0, source = 'catalog' }) {
  const wasVisibleRef = useRef(false)

  useEffect(() => {
    if (show && !wasVisibleRef.current) {
      logCatalogInfo('overlay', `Pantalla de carga visible: ${title}`, {
        source,
        loaded,
        total,
      })
    } else if (!show && wasVisibleRef.current) {
      logCatalogInfo('overlay', `Pantalla de carga oculta: ${title}`, { source, loaded, total })
    }
    wasVisibleRef.current = show
  }, [show, title, loaded, total, source])

  if (!show) return null

  const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0

  return (
    <Backdrop
      open
      sx={{
        zIndex: (t) => t.zIndex.modal + 1,
        color: '#fff',
        backgroundColor: 'rgba(8, 10, 18, 0.32)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <Paper
        elevation={8}
        sx={{
          p: 3,
          width: 'min(22rem, 90vw)',
          textAlign: 'center',
          bgcolor: 'rgba(22, 26, 38, 0.88)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        {total > 0 ? (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {loaded.toLocaleString()} de {total.toLocaleString()} cargados
            </Typography>
            <LinearProgress
              variant="determinate"
              value={percent}
              sx={{ height: 8, borderRadius: 99, mb: 1 }}
            />
            <Typography variant="caption" color="text.secondary">
              {percent}%
            </Typography>
          </>
        ) : (
          <>
            <Box sx={{ my: 2 }}>
              <LinearProgress sx={{ height: 8, borderRadius: 99 }} />
            </Box>
            <Typography variant="body2" color="text.secondary">
              Preparando catálogo…
            </Typography>
          </>
        )}
      </Paper>
    </Backdrop>
  )
}
