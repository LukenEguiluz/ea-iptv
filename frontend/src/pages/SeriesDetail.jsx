import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchCatalog,
  fetchPlayUrl,
  fetchWatchProgress,
  recordViewHistory,
} from '../api'
import Navbar from '../components/Navbar'
import Player from '../components/Player'

export default function SeriesDetail() {
  const { seriesId } = useParams()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [player, setPlayer] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchCatalog(`/catalog/series/${seriesId}`)
        setInfo(data)
      } catch (err) {
        setError(err.message)
      }
    }
    load()
  }, [seriesId])

  async function playEpisode(episode) {
    try {
      const data = await fetchPlayUrl(`/catalog/series/episode/${episode.id}/play`)
      const progress = await fetchWatchProgress('series', String(episode.id)).catch(() => null)
      await recordViewHistory({
        content_type: 'series',
        item_id: String(episode.id),
        series_id: String(seriesId),
        title: episode.title || info?.info?.name,
        image: info?.info?.cover || info?.info?.cover_big || '',
      })
      setPlayer({
        title: episode.title || info?.info?.name,
        url: data.url,
        type: data.type,
        resumeAt: progress?.position_seconds || 0,
        meta: {
          contentType: 'series',
          itemId: String(episode.id),
          seriesId: String(seriesId),
          title: episode.title || info?.info?.name,
          image: info?.info?.cover || info?.info?.cover_big || '',
          ext: data.ext || 'mkv',
        },
      })
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const seasons = info?.episodes ? Object.entries(info.episodes) : []

  return (
    <div className="app-shell">
      <Navbar active="series" />
      <main className="page-content page-content--padded">
        <Link to="/series" className="back-link">← Volver a series</Link>
        {error ? <div className="page-error">{error}</div> : null}
        {info?.info ? (
          <section className="series-hero">
            <img src={info.info.cover || info.info.cover_big} alt={info.info.name} />
            <div>
              <h1>{info.info.name}</h1>
              <p>{info.info.plot || info.info.genre}</p>
            </div>
          </section>
        ) : null}
        {seasons.map(([season, episodes]) => (
          <section key={season} className="season-block">
            <h2>Temporada {season}</h2>
            <div className="episode-list">
              {episodes.map((episode) => (
                <button
                  key={episode.id}
                  type="button"
                  className="episode-card"
                  onClick={() => playEpisode(episode)}
                >
                  <span className="episode-number">E{episode.episode_num}</span>
                  <div>
                    <strong>{episode.title}</strong>
                    {episode.info?.plot ? <p>{episode.info.plot}</p> : null}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </main>
      {player ? (
        <Player
          title={player.title}
          url={player.url}
          type={player.type}
          meta={player.meta}
          resumeAt={player.resumeAt || 0}
          onClose={() => setPlayer(null)}
        />
      ) : null}
    </div>
  )
}
