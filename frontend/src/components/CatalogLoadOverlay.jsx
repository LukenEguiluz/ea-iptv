export default function CatalogLoadOverlay({ show, title, loaded = 0, total = 0 }) {
  if (!show) return null

  const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0

  return (
    <div className="catalog-load-overlay">
      <div className="catalog-load-card">
        <div className="loading-spinner" />
        <strong>{title}</strong>
        {total > 0 ? (
          <>
            <p>{loaded.toLocaleString()} de {total.toLocaleString()} cargados</p>
            <div className="catalog-load-progress">
              <span style={{ width: `${percent}%` }} />
            </div>
            <span className="catalog-load-percent">{percent}%</span>
          </>
        ) : (
          <p>Preparando catálogo…</p>
        )}
      </div>
    </div>
  )
}
