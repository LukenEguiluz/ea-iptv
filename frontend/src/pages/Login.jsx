import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import LiveTvIcon from '@mui/icons-material/LiveTv'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username.trim(), password)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        p: 2,
        background: (t) => `radial-gradient(circle at top, ${t.palette.primary.main}33, transparent 42%), ${t.palette.background.default}`,
      }}
    >
      <Paper
        component="form"
        onSubmit={handleSubmit}
        elevation={12}
        sx={{
          width: 'min(420px, 100%)',
          p: { xs: 3, sm: 4 },
          border: 1,
          borderColor: 'divider',
        }}
      >
        <Stack spacing={2.5} alignItems="center" sx={{ mb: 3 }}>
          <LiveTvIcon sx={{ fontSize: 48, color: 'primary.main' }} />
          <Typography variant="h4" color="primary.main" fontWeight={800}>
            LEYLUZ TV
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Películas, series y TV en vivo
          </Typography>
        </Stack>

        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

        <Stack spacing={2}>
          <TextField
            label="Usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="luken"
            autoComplete="username"
            required
            fullWidth
          />
          <TextField
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            fullWidth
          />
          <Button type="submit" variant="contained" size="large" disabled={loading} fullWidth>
            {loading ? 'Entrando…' : 'Entrar'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  )
}
