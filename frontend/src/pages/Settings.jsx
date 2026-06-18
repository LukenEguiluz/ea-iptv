import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined'
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined'
import { fetchDiagnostics } from '../api'
import LoadingState from '../components/LoadingState'
import PageShell from '../components/PageShell'

const CHECK_LABELS = {
  auth: 'Autenticación (cuenta)',
  live_categories: 'Categorías TV en vivo',
  live_streams: 'Canales TV en vivo',
  vod_categories: 'Categorías películas',
  vod_streams: 'Películas (VOD)',
  series_categories: 'Categorías series',
  series: 'Series',
}

export default function Settings() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function runDiagnostics() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchDiagnostics()
      setReport(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageShell active="settings" title="Configuración y diagnóstico">
      <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 640 }}>
        Comprueba que el servidor Xtream responde correctamente y revisa los enlaces más usados del proveedor.
      </Typography>

      <Button
        variant="contained"
        size="large"
        startIcon={<PlayCircleOutlinedIcon />}
        onClick={runDiagnostics}
        disabled={loading}
        sx={{ mb: 3 }}
      >
        {loading ? 'Probando proveedor…' : 'Ejecutar diagnóstico completo'}
      </Button>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {loading ? <LoadingState message="Consultando player_api, categorías y catálogos…" /> : null}

      {report ? (
        <Stack spacing={3}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Conexión</Typography>
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="caption" color="text.secondary">Servidor Xtream</Typography>
                <Typography component="code" sx={{ display: 'block', wordBreak: 'break-all' }}>
                  {report.server_url}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Usuario gateway</Typography>
                <Typography>{report.gateway_user}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Cuenta asignada</Typography>
                <Typography>
                  {report.session.account_name || '—'} ({report.session.account_username})
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Sesión activa</Typography>
                <Chip
                  size="small"
                  label={report.session.active ? 'Sí' : 'No'}
                  color={report.session.active ? 'success' : 'default'}
                />
              </Box>
            </Stack>
          </Paper>

          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Resultados ({report.summary.passed}/{report.checks.length} OK · {report.summary.total_ms} ms)
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={48} />
                    <TableCell>Prueba</TableCell>
                    <TableCell align="right">Items</TableCell>
                    <TableCell align="right">Tiempo</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.checks.map((check) => (
                    <TableRow key={check.name} hover>
                      <TableCell>
                        {check.ok ? (
                          <CheckCircleOutlinedIcon color="success" fontSize="small" />
                        ) : (
                          <ErrorOutlinedIcon color="error" fontSize="small" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{CHECK_LABELS[check.name] || check.name}</Typography>
                        {!check.ok && check.detail ? (
                          <Typography variant="caption" color="error.main">{check.detail}</Typography>
                        ) : null}
                      </TableCell>
                      <TableCell align="right">
                        {check.count != null ? `${check.count} items` : '—'}
                      </TableCell>
                      <TableCell align="right">{check.ms} ms</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Comandos y enlaces comunes</Typography>
            <Stack spacing={2}>
              {report.commands.map((cmd) => (
                <Box
                  key={cmd.label}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: 'action.hover',
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: 1.5,
                    alignItems: { sm: 'center' },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2">{cmd.label}</Typography>
                    <Typography
                      component="code"
                      variant="body2"
                      sx={{ wordBreak: 'break-all', color: 'text.secondary' }}
                    >
                      {cmd.url}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    aria-label="Copiar"
                    onClick={() => navigator.clipboard.writeText(cmd.url)}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Stack>
          </Paper>
        </Stack>
      ) : null}
    </PageShell>
  )
}
