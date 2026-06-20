import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material'
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt'

export default function DeployUpdateDialog({ open, onReload, onDismiss }) {
  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        if (reason === 'backdropClick') return
        onDismiss()
      }}
      disableEscapeKeyDown
      aria-labelledby="deploy-update-title"
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle id="deploy-update-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SystemUpdateAltIcon color="primary" />
        Actualización disponible
      </DialogTitle>
      <DialogContent>
        <Typography color="text.secondary">
          Hay una nueva versión de la aplicación. Pulsa <strong>Recargar</strong> para descargar los cambios y que todo funcione correctamente.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onDismiss} color="inherit">
          Más tarde
        </Button>
        <Button onClick={onReload} variant="contained" autoFocus>
          Recargar
        </Button>
      </DialogActions>
    </Dialog>
  )
}
