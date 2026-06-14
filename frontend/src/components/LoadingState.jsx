export default function LoadingState({ message = 'Cargando contenido…', compact = false }) {
  return (
    <div className={compact ? 'loading-state loading-state--compact' : 'loading-state'}>
      <div className="loading-spinner" />
      <p>{message}</p>
    </div>
  )
}
