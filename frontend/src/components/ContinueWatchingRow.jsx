import { useEffect, useState } from 'react'
import { fetchContinueWatching, fetchPlayUrl, fetchWatchProgress } from '../api'

export default function ContinueWatchingRow({ type = '', limit = 12, onPlay }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchContinueWatching(limit, type)
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [type, limit])

  async function resumeItem(item) {
    const ext = item.ext || 'mp4'
    const playPath = item.content_type === 'series'
      ? `/catalog/series/episode/${item.item_id}/play`
      : `/catalog/vod/${item.item_id}/play?ext=${ext}`
    const [playData, progress] = await Promise.all([
      fetchPlayUrl(playPath),
      fetchWatchProgress(item.content_type, item.item_id).catch(() => null),
    ])
    onPlay({
      title: item.title,
      url: playData.url,
      type: item.content_type,
      durationHint: playData.duration_seconds || item.duration_seconds || 0,
      tracks: playData.tracks || null,
      resumeAt: progress?.position_seconds || item.position_seconds || 0,
      meta: {
        contentType: item.content_type,
        itemId: item.item_id,
        seriesId: item.series_id || '',
        title: item.title,
        image: item.image,
        ext: playData.ext || ext,
        playPath,
      },
    })
  }

  if (loading || items.length === 0) return null

  return (
    <section className="library-row library-row--top">
      <h2 className="content-row-title">Seguir viendo</h2>
      <div className="content-row-track">
        {items.map((item) => (
          <button
            key={`${item.content_type}-${item.item_id}`}
            type="button"
            className="resume-card"
            onClick={() => resumeItem(item)}
          >
            <div className="resume-card-image">
              {item.image ? <img src={item.image} alt={item.title} /> : <span>{item.title?.slice(0, 1)}</span>}
              <span className="resume-card-progress" style={{ width: `${item.percent || 0}%` }} />
            </div>
            <strong>{item.title}</strong>
            {item.percent > 0 ? <span className="resume-card-percent">{item.percent}%</span> : null}
          </button>
        ))}
      </div>
    </section>
  )
}
