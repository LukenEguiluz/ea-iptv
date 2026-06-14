import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchCatalog,
  fetchPlayUrl,
  fetchPlayUrlWithAudio,
  fetchWatchProgress,
  recordViewHistory,
} from '../api'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
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
        durationHint: data.duration_seconds || progress?.duration_seconds || 0,
        tracks: data.tracks || null,
        resumeAt: progress?.position_seconds || 0,
        meta: {
          contentType: 'series',
          itemId: String(episode.id),
          seriesId: String(seriesId),
          title: episode.title || info?.info?.name,
          image: info?.info?.cover || info?.info?.cover_big || '',
          ext: data.ext || 'mkv',
          playPath: `/catalog/series/episode/${episode.id}/play`,
        },
      })
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const seasons = info?.episodes ? Object.entries(info.episodes) : []

  async function handleAudioChange(playPath, audioIndex, resumePosition) {
    const playData = await fetchPlayUrlWithAudio(playPath, audioIndex)
    setPlayer((prev) => ({
      ...prev,
      url: playData.url,
      tracks: playData.tracks || prev?.tracks,
      durationHint: playData.duration_seconds || prev?.durationHint,
      resumeAt: resumePosition,
    }))
  }

  return (
    <div className="app-shell">
      <Navbar active="series" />
      <main className="page-content page-content--padded">
        <Link to="/series" className="back-link">← Volver a series</Link>
        <ContinueWatchingRow type="series" onPlay={setPlayer} />
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
          durationHint={player.durationHint || 0}
          tracks={player.tracks}
          resumeAt={player.resumeAt || 0}
          onUrlChange={handleAudioChange}
          onClose={() => setPlayer(null)}
        />
      ) : null}
    </div>
  )
}
