import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  ClickAwayListener,
  InputAdornment,
  Paper,
  TextField,
  Typography,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import { searchCatalog } from '../api'
import LoadingState from './LoadingState'
import SearchResults from './SearchResults'

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export default function SearchBar({
  type,
  placeholder = 'Buscar…',
  onSelect,
  onSeriesSelect,
  emptyLabel = 'Sin resultados',
  disabled = false,
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const debouncedQuery = useDebouncedValue(query, 280)
  const containerRef = useRef(null)

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
    searchCatalog(debouncedQuery, type, 50)
      .then((data) => {
        if (cancelled) return
        setResults(Array.isArray(data.results) ? data.results : [])
        setOpen(true)
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

  function handleSelect(item) {
    setOpen(false)
    setQuery('')
    if (item.content_type === 'series' && onSeriesSelect) {
      onSeriesSelect(item)
      return
    }
    onSelect?.(item)
  }

  const showPanel = open && (loading || error || query.trim().length >= 2)

  if (disabled) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Búsqueda global desactivada en modo directo. Navega por categorías.
      </Typography>
    )
  }

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box ref={containerRef} sx={{ position: 'relative', mb: 2 }}>
        <TextField
          fullWidth
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true)
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          }}
        />
        {showPanel ? (
          <Paper
            elevation={8}
            sx={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: 0,
              right: 0,
              zIndex: 20,
              maxHeight: { xs: '60vh', md: type === 'live' ? 480 : 380 },
              overflow: 'auto',
              p: 1.5,
            }}
          >
            {loading ? <LoadingState message="Buscando…" compact /> : null}
            {error ? <Alert severity="error">{error}</Alert> : null}
            {!loading && !error && results.length === 0 && debouncedQuery.trim().length >= 2 ? (
              <Typography variant="body2" color="text.secondary">{emptyLabel}</Typography>
            ) : null}
            {!loading && !error && results.length > 0 ? (
              <SearchResults
                results={results}
                activeType={type}
                channelLayout={type === 'live' ? 'list' : 'grid'}
                onSelect={handleSelect}
              />
            ) : null}
          </Paper>
        ) : null}
      </Box>
    </ClickAwayListener>
  )
}
