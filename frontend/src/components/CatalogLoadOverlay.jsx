import {
  Backdrop,
  Box,
  LinearProgress,
  Paper,
  Typography,
} from '@mui/material'

export default function CatalogLoadOverlay({ show, title, loaded = 0, total = 0 }) {
  if (!show) return null

  const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0

  return (
    <Backdrop open sx={{ zIndex: (t) => t.zIndex.modal + 1, color: '#fff' }}>
      <Paper
        elevation={8}
        sx={{
          p: 3,
          width: 'min(22rem, 90vw)',
          textAlign: 'center',
          bgcolor: 'background.paper',
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
