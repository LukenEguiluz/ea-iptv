import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
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
import SyncIcon from '@mui/icons-material/Sync'
import { fetchDiagnostics } from '../api'
import { useCatalogRefresh } from '../context/CatalogRefreshContext'
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

const STATUS_LABELS = {
  ready: 'Listo',
  running: 'Sincronizando',
  error: 'Error',
  idle: 'Pendiente',
}

function formatCatalogCounts(counts) {
  if (!counts) return ''
  const parts = []
  if (counts.vod) parts.push(`${counts.vod.toLocaleString()} películas`)
  if (counts.series) parts.push(`${counts.series.toLocaleString()} series`)
  if (counts.live) parts.push(`${counts.live.toLocaleString()} canales`)
  return parts.join(' · ')
}

export default function Settings() {
  const { catalogStatus, runCatalogRefresh } = useCatalogRefresh()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [refreshingCatalog, setRefreshingCatalog] = useState(false)
  const [catalogError, setCatalogError] = useState('')

  const isSyncRunning = catalogStatus?.status === 'running'
  const progressPercent = isSyncRunning
    ? (catalogStatus?.progress_percent ?? 0)
    : catalogStatus?.status === 'ready'
      ? 100
      : 0

  async function refreshCatalogNow(types = ['live']) {
    setRefreshingCatalog(true)
    setCatalogError('')
    try {
      await runCatalogRefresh({ force: true, types, wait: true })
    } catch (err) {
      setCatalogError(err.message)
      console.error('[IPTV Catálogo]', err.message, err)
    } finally {
      setRefreshingCatalog(false)
    }
  }

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

      <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Catálogo</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Por defecto se sincroniza TV en vivo. Películas y series se indexan bajo demanda.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} flexWrap="wrap" useFlexGap>
          <Button
            variant="outlined"
            startIcon={refreshingCatalog || isSyncRunning ? <CircularProgress size={18} /> : <SyncIcon />}
            onClick={() => refreshCatalogNow(['live'])}
            disabled={refreshingCatalog || isSyncRunning}
          >
            {refreshingCatalog || isSyncRunning ? 'Sincronizando…' : 'Actualizar TV en vivo'}
          </Button>
          <Button
            variant="text"
            onClick={() => refreshCatalogNow(['vod'])}
            disabled={refreshingCatalog || isSyncRunning}
          >
            Indexar películas
          </Button>
          <Button
            variant="text"
            onClick={() => refreshCatalogNow(['series'])}
            disabled={refreshingCatalog || isSyncRunning}
          >
            Indexar series
          </Button>
          {catalogStatus ? (
            <Chip
              size="small"
              label={`Estado: ${STATUS_LABELS[catalogStatus.status] || catalogStatus.status}${catalogStatus.counts?.live ? ` · ${catalogStatus.counts.live.toLocaleString()} canales` : ''}`}
              color={catalogStatus.status === 'ready' ? 'success' : catalogStatus.status === 'running' ? 'warning' : catalogStatus.status === 'error' ? 'error' : 'default'}
            />
          ) : null}
        </Stack>

        {catalogStatus && (isSyncRunning || catalogStatus.status === 'ready' || catalogStatus.status === 'error') ? (
          <Box sx={{ mt: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                {isSyncRunning
                  ? (catalogStatus.progress_phase || 'Sincronizando catálogo…')
                  : catalogStatus.status === 'ready'
                    ? 'Catálogo actualizado'
                    : 'Sincronización detenida'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {progressPercent}%
              </Typography>
            </Stack>
            <LinearProgress
              variant={isSyncRunning && progressPercent === 0 && catalogStatus.progress_last_error ? 'indeterminate' : 'determinate'}
              value={progressPercent}
              color={catalogStatus.status === 'error' ? 'error' : 'primary'}
              sx={{ height: 8, borderRadius: 1 }}
            />
            {catalogStatus.progress_detail ? (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                {catalogStatus.progress_detail}
              </Typography>
            ) : null}
            {catalogStatus.progress_last_error ? (
              <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: 'block' }}>
                {catalogStatus.progress_last_error}
                {catalogStatus.progress_retry_attempt
                  ? ` (intento ${catalogStatus.progress_retry_attempt})`
                  : ''}
              </Typography>
            ) : null}
            {catalogStatus.status === 'ready' && catalogStatus.counts ? (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                {formatCatalogCounts(catalogStatus.counts)}
              </Typography>
            ) : null}
          </Box>
        ) : null}

        {catalogStatus?.error ? (
          <Alert severity="error" sx={{ mt: 2 }}>{catalogStatus.error}</Alert>
        ) : null}
        {catalogError ? <Alert severity="error" sx={{ mt: 2 }}>{catalogError}</Alert> : null}
      </Paper>

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
