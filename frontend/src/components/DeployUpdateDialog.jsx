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
      onClose={onDismiss}
      aria-labelledby="deploy-update-title"
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle id="deploy-update-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SystemUpdateAltIcon color="primary" />
        Nueva versión disponible
      </DialogTitle>
      <DialogContent>
        <Typography color="text.secondary">
          Se ha publicado una actualización de la aplicación. Recarga la página para usar la última versión.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onDismiss} color="inherit">
          Más tarde
        </Button>
        <Button onClick={onReload} variant="contained" autoFocus>
          Actualizar ahora
        </Button>
      </DialogActions>
    </Dialog>
  )
}
