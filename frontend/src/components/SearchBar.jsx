import { useEffect, useRef, useState } from 'react'
import { searchCatalog } from '../api'
import LoadingState from './LoadingState'
import MediaCard from './MediaCard'

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

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  return (
    <div className="search-bar" ref={containerRef}>
      <input
        className="search-input"
        type="search"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          if (query.trim().length >= 2) setOpen(true)
        }}
      />
      {showPanel ? (
        <div className="search-results">
          {loading ? <LoadingState message="Buscando…" compact /> : null}
          {error ? <div className="search-empty">{error}</div> : null}
          {!loading && !error && results.length === 0 && debouncedQuery.trim().length >= 2 ? (
            <div className="search-empty">{emptyLabel}</div>
          ) : null}
          {!loading && !error && results.length > 0 ? (
            <div className="search-grid">
              {results.map((item) => (
                <MediaCard
                  key={`${item.content_type}-${item.item_id}`}
                  title={item.name}
                  image={item.image}
                  subtitle={[item.cast, item.category_name, item.year, item.rating].filter(Boolean).join(' · ')}
                  onClick={() => handleSelect(item)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
