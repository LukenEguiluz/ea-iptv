import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchCatalog } from '../api'
import LoadingState from '../components/LoadingState'
import MediaCard from '../components/MediaCard'
import Navbar from '../components/Navbar'
import SearchBar from '../components/SearchBar'

function seriesPath(categoryId) {
  return `/catalog/series?limit=200&category_id=${categoryId}`
}

export default function Series() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState([])
  const [series, setSeries] = useState([])
  const [activeCategory, setActiveCategory] = useState('')
  const [loadingCats, setLoadingCats] = useState(true)
  const [loadingSeries, setLoadingSeries] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchCatalog('/catalog/series/categories')
      .then((data) => {
        const cats = Array.isArray(data) ? data : []
        setCategories(cats)
        if (cats[0]?.category_id) {
          setActiveCategory(String(cats[0].category_id))
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingCats(false))
  }, [])

  useEffect(() => {
    if (!activeCategory) return undefined

    setLoadingSeries(true)
    setError('')
    fetchCatalog(seriesPath(activeCategory))
      .then((data) => setSeries(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingSeries(false))
  }, [activeCategory])

  return (
    <div className="app-shell">
      <Navbar active="series" />
      <main className="page-content page-content--padded">
        <h1 className="page-title">Series</h1>
        <SearchBar
          type="series"
          placeholder="Buscar por título, actor o director…"
          emptyLabel="No se encontraron series"
          onSeriesSelect={(item) => navigate(`/series/${item.item_id}`)}
        />
        {error ? <div className="page-error">{error}</div> : null}
        {loadingCats ? <LoadingState message="Cargando categorías…" /> : (
          <div className="category-tabs">
            {categories.map((cat) => (
              <button
                key={cat.category_id}
                type="button"
                className={activeCategory === String(cat.category_id) ? 'active' : ''}
                onClick={() => setActiveCategory(String(cat.category_id))}
              >
                {cat.category_name}
              </button>
            ))}
          </div>
        )}
        {loadingSeries ? <LoadingState message="Cargando series…" /> : (
          <div className="media-grid media-grid--posters">
            {series.length === 0 ? <p className="page-empty-inline">Sin series en esta categoría.</p> : null}
            {series.map((item) => (
              <MediaCard
                key={item.series_id}
                title={item.name}
                image={item.cover || item.cover_big}
                subtitle={item.genre || item.rating}
                onClick={() => navigate(`/series/${item.series_id}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
