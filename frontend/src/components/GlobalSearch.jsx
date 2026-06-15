import { useEffect, useRef, useState } from 'react'
import { searchCatalog } from '../api'
import { usePlayback } from '../context/PlaybackContext'
import LoadingState from './LoadingState'
import MediaCard from './MediaCard'

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
    document.body.classList.add('search-open')
    return () => document.body.classList.remove('search-open')
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
    <div className="global-search-overlay" role="dialog" aria-modal="true" aria-label="Buscador">
      <div className="global-search-panel">
        <div className="global-search-header">
          <input
            ref={inputRef}
            className="global-search-input"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            placeholder="Buscar canales, películas, series, actores…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="global-search-close" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="global-search-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id || 'all'}
              type="button"
              role="tab"
              aria-selected={type === tab.id}
              className={type === tab.id ? 'active' : ''}
              onClick={() => setType(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="global-search-body">
          {loading ? <LoadingState message="Buscando…" /> : null}
          {error ? <div className="search-empty">{error}</div> : null}
          {!loading && !error && query.trim().length < 2 ? (
            <div className="search-empty">Escribe al menos 2 caracteres para buscar.</div>
          ) : null}
          {!loading && !error && debouncedQuery.trim().length >= 2 && results.length === 0 ? (
            <div className="search-empty">No se encontraron resultados.</div>
          ) : null}
          {!loading && !error && results.length > 0 ? (
            <div className="global-search-results">
              {results.map((item) => (
                <MediaCard
                  key={`${item.content_type}-${item.item_id}`}
                  title={item.name}
                  image={item.image}
                  subtitle={[item.category_name, item.year, item.rating, item.cast].filter(Boolean).join(' · ')}
                  onClick={() => handleSelect(item)}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
