import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Chip,
  Dialog,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import { searchCatalog } from '../api'
import { usePlayback } from '../context/PlaybackContext'
import LoadingState from './LoadingState'
import SearchResults from './SearchResults'

const TABS = [
  { id: '', label: 'Todo' },
  { id: 'live', label: 'TV' },
  { id: 'vod', label: 'Películas' },
  { id: 'series', label: 'Series' },
]

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export default function GlobalSearch({ onClose }) {
  const { playItem } = usePlayback()
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const debouncedQuery = useDebouncedValue(query, 280)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setResults([])
      setError('')
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setLoading(true)
    setError('')

    searchCatalog(debouncedQuery, type, 60)
      .then((data) => {
        if (cancelled) return
        setResults(Array.isArray(data.results) ? data.results : [])
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setResults([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery, type])

  async function handleSelect(item) {
    onClose()
    try {
      await playItem(item)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Dialog fullScreen open onClose={onClose} PaperProps={{ sx: { bgcolor: 'background.default' } }}>
      <Stack spacing={2} sx={{ p: { xs: 2, md: 3 }, height: '100%' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            inputRef={inputRef}
            fullWidth
            placeholder="Buscar canales, películas, series, actores…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            }}
          />
          <IconButton onClick={onClose} aria-label="Cerrar">
            <CloseIcon />
          </IconButton>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.5 }}>
          {TABS.map((tab) => (
            <Chip
              key={tab.id || 'all'}
              label={tab.label}
              clickable
              color={type === tab.id ? 'primary' : 'default'}
              variant={type === tab.id ? 'filled' : 'outlined'}
              onClick={() => setType(tab.id)}
            />
          ))}
        </Stack>

        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading ? <LoadingState message="Buscando…" /> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          {!loading && !error && query.trim().length < 2 ? (
            <Typography color="text.secondary">Escribe al menos 2 caracteres para buscar.</Typography>
          ) : null}
          {!loading && !error && debouncedQuery.trim().length >= 2 && results.length === 0 ? (
            <Typography color="text.secondary">No se encontraron resultados.</Typography>
          ) : null}
          {!loading && !error && results.length > 0 ? (
            <SearchResults
              results={results}
              activeType={type}
              onSelect={handleSelect}
            />
          ) : null}
        </Box>
      </Stack>
    </Dialog>
  )
}
