import { useState } from 'react'

export default function MediaCard({ title, image, subtitle, onClick }) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = image && !imageFailed

  return (
    <button type="button" className="media-card focusable-card" onClick={onClick}>
      <div className="media-card-image">
        {showImage ? (
          <img
            src={image}
            alt={title}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="media-card-placeholder">{title?.slice(0, 1) || '?'}</div>
        )}
      </div>
      <div className="media-card-info">
        <span className="media-card-title">{title}</span>
        {subtitle ? <span className="media-card-subtitle">{subtitle}</span> : null}
      </div>
    </button>
  )
}
