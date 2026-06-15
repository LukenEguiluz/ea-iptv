import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import GlobalSearch from '../components/GlobalSearch'

const SearchContext = createContext(null)

export function SearchProvider({ children }) {
  const [open, setOpen] = useState(false)

  const openSearch = useCallback(() => setOpen(true), [])
  const closeSearch = useCallback(() => setOpen(false), [])

  useEffect(() => {
    function handleKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase()
      const inField = tag === 'input' || tag === 'textarea' || tag === 'select'

      if ((event.key === '/' || (event.key === 'k' && (event.metaKey || event.ctrlKey))) && !inField) {
        event.preventDefault()
        setOpen(true)
      }
      if (event.key === 'Escape' && open) {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  return (
    <SearchContext.Provider value={{ open, openSearch, closeSearch }}>
      {children}
      {open ? <GlobalSearch onClose={closeSearch} /> : null}
    </SearchContext.Provider>
  )
}

export function useSearch() {
  const ctx = useContext(SearchContext)
  if (!ctx) {
    throw new Error('useSearch debe usarse dentro de SearchProvider')
  }
  return ctx
}
