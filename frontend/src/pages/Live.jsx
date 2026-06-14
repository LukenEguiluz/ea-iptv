import { useCallback, useEffect, useState } from 'react'
import { buildPlayerSession, fetchCatalog } from '../api'
import LoadingState from '../components/LoadingState'
import MediaCard from '../components/MediaCard'
import Navbar from '../components/Navbar'
import Player from '../components/Player'
import SearchBar from '../components/SearchBar'

function streamsPath(categoryId) {
  return `/catalog/live/streams?limit=200&category_id=${categoryId}`
}

export default function Live() {
  const [categories, setCategories] = useState([])
  const [streams, setStreams] = useState([])
  const [activeCategory, setActiveCategory] = useState('')
  const [loadingCats, setLoadingCats] = useState(true)
  const [loadingStreams, setLoadingStreams] = useState(false)
  const [error, setError] = useState('')
  const [player, setPlayer] = useState(null)
  const [liveAudioOn, setLiveAudioOn] = useState(false)

  useEffect(() => {
    fetchCatalog('/catalog/live/categories')
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

    setLoadingStreams(true)
    setError('')
    fetchCatalog(streamsPath(activeCategory))
      .then((data) => setStreams(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingStreams(false))
  }, [activeCategory])

  async function openItem(item) {
    try {
      const session = await buildPlayerSession(
        {
          content_type: 'live',
          item_id: String(item.stream_id || item.item_id),
          name: item.name,
          image: item.stream_icon || item.image,
          category_name: item.category_name,
        },
        { withEpg: true },
      )
      setLiveAudioOn(false)
      setPlayer(session)
    } catch (err) {
      setError(err.message)
    }
  }

  const changeLiveChannel = useCallback(async (direction, selectedChannel = null) => {
    if (!player || streams.length < 2) return

    const currentId = String(player.meta?.itemId || '')
    const currentIndex = streams.findIndex(
      (item) => String(item.stream_id || item.item_id) === currentId,
    )

    let nextItem = selectedChannel
    if (!nextItem) {
      const baseIndex = currentIndex >= 0 ? currentIndex : 0
      const offset = direction === 'prev' ? -1 : 1
      const nextIndex = (baseIndex + offset + streams.length) % streams.length
      nextItem = streams[nextIndex]
    }

    if (!nextItem) return

    try {
      const session = await buildPlayerSession(
        {
          content_type: 'live',
          item_id: String(nextItem.stream_id || nextItem.item_id),
          name: nextItem.name,
          image: nextItem.stream_icon || nextItem.image,
          category_name: nextItem.category_name,
        },
        { withEpg: true },
      )
      setPlayer(session)
    } catch (err) {
      setError(err.message)
    }
  }, [player, streams])

  return (
    <div className="app-shell">
      <Navbar active="tv" />
      <main className="page-content page-content--padded">
        <h1 className="page-title">TV en vivo</h1>
        <SearchBar
          type="live"
          placeholder="Buscar canales por nombre…"
          emptyLabel="No se encontraron canales"
          onSelect={openItem}
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
        {loadingStreams ? <LoadingState message="Cargando canales…" /> : (
          <div className="media-grid">
            {streams.length === 0 ? <p className="page-empty-inline">Sin canales en esta categoría.</p> : null}
            {streams.map((item) => (
              <MediaCard
                key={item.stream_id}
                title={item.name}
                image={item.stream_icon}
                subtitle={item.category_name}
                onClick={() => openItem(item)}
              />
            ))}
          </div>
        )}
      </main>
      {player ? (
        <Player
          title={player.title}
          url={player.url}
          type={player.type}
          epg={player.epg}
          meta={player.meta}
          initialMuted={!liveAudioOn}
          liveChannels={streams}
          onLiveChannelChange={changeLiveChannel}
          onMutedChange={(isMuted) => setLiveAudioOn(!isMuted)}
          onClose={() => {
            setPlayer(null)
            setLiveAudioOn(false)
          }}
        />
      ) : null}
    </div>
  )
}
