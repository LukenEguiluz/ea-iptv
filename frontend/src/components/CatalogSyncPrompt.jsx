import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  Typography,
} from '@mui/material'

const TYPE_LABELS = {
  vod: 'películas',
  series: 'series',
}

export default function CatalogSyncPrompt({
  open,
  type,
  syncing = false,
  progressPercent = 0,
  progressPhase = '',
  onConfirm,
  onCancel,
}) {
  const label = TYPE_LABELS[type] || type

  return (
    <Dialog open={open} onClose={syncing ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Indexar {label}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: syncing ? 2 : 0 }}>
          {syncing
            ? `Sincronizando ${label} desde el proveedor. Puede tardar varios minutos.`
            : `Las ${label} no están indexadas en el servidor. ¿Quieres descargar el catálogo ahora?`}
        </DialogContentText>
        {syncing ? (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {progressPhase || 'Sincronizando…'} · {progressPercent}%
            </Typography>
            <LinearProgress variant="determinate" value={progressPercent} sx={{ height: 8, borderRadius: 1 }} />
          </>
        ) : null}
      </DialogContent>
      <DialogActions>
        {!syncing ? (
          <>
            <Button onClick={onCancel}>Ahora no</Button>
            <Button variant="contained" onClick={onConfirm}>
              Sí, indexar
            </Button>
          </>
        ) : (
          <Button onClick={onCancel} disabled>
            En curso…
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
