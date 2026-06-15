import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPaginatedCatalog } from '../api'

const ALL_CATEGORY = 'all'
const PAGE_SIZE = 300

export default function usePaginatedCatalog(catalogType) {
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY)
  const [total, setTotal] = useState(0)
  const [loadingCats, setLoadingCats] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const loadMoreRef = useRef(null)

  const loadItems = useCallback(async (categoryId, { append = false, offset = 0 } = {}) => {
    const isMore = append && offset > 0
    if (isMore) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setError('')
    }

    try {
      const data = await fetchPaginatedCatalog(catalogType, categoryId, {
        offset,
        limit: PAGE_SIZE,
      })
      const pageItems = Array.isArray(data.items) ? data.items : []
      setTotal(data.total || pageItems.length)
      setItems((prev) => (append ? [...prev, ...pageItems] : pageItems))
    } catch (err) {
      setError(err.message)
      if (!append) {
        setItems([])
        setTotal(0)
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [catalogType])

  useEffect(() => {
    if (!activeCategory) return undefined
    setItems([])
    setTotal(0)
    loadItems(activeCategory)
  }, [activeCategory, loadItems])

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node || items.length >= total) return undefined

    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || loading || loadingMore) return
      if (items.length < total) {
        loadItems(activeCategory, { append: true, offset: items.length })
      }
    }, { rootMargin: '600px' })

    observer.observe(node)
    return () => observer.disconnect()
  }, [activeCategory, items.length, loadItems, loading, loadingMore, total])

  return {
    ALL_CATEGORY,
    categories,
    setCategories,
    items,
    activeCategory,
    setActiveCategory,
    total,
    loadingCats,
    setLoadingCats,
    loading,
    loadingMore,
    error,
    setError,
    loadMoreRef,
  }
}
