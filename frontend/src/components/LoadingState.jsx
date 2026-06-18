import { Box, CircularProgress, Typography } from '@mui/material'

export default function LoadingState({ message = 'Cargando contenido…', compact = false }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
        py: compact ? 2 : 4,
        color: 'text.secondary',
      }}
    >
      <CircularProgress size={compact ? 24 : 36} color="primary" />
      <Typography variant={compact ? 'body2' : 'body1'}>{message}</Typography>
    </Box>
  )
}
