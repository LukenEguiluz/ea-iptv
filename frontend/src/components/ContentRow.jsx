import MediaCard from './MediaCard'

export default function ContentRow({ title, items, onPlay }) {
  if (!items?.length) return null

  return (
    <section className="content-row">
      <h3>{title}</h3>
      <div className="content-row-track">
        {items.map((item) => (
          <MediaCard
            key={item.id || item.stream_id || item.series_id}
            title={item.name || item.title}
            image={item.stream_icon || item.cover || item.cover_big}
            subtitle={item.category_name || item.rating || item.genre}
            onClick={() => onPlay(item)}
          />
        ))}
      </div>
    </section>
  )
}
