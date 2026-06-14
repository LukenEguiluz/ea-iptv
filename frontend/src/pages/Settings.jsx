import { useState } from 'react'
import { fetchDiagnostics } from '../api'
import LoadingState from '../components/LoadingState'
import Navbar from '../components/Navbar'

const CHECK_LABELS = {
  auth: 'Autenticación (cuenta)',
  live_categories: 'Categorías TV en vivo',
  live_streams: 'Canales TV en vivo',
  vod_categories: 'Categorías películas',
  vod_streams: 'Películas (VOD)',
  series_categories: 'Categorías series',
  series: 'Series',
}

export default function Settings() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function runDiagnostics() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchDiagnostics()
      setReport(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell">
      <Navbar active="settings" />
      <main className="page-content page-content--padded settings-page">
        <h1 className="page-title">Configuración y diagnóstico</h1>
        <p className="settings-intro">
          Comprueba que el servidor Xtream responde correctamente y revisa los enlaces más usados del proveedor.
        </p>

        <button type="button" className="settings-run-btn" onClick={runDiagnostics} disabled={loading}>
          {loading ? 'Probando proveedor…' : 'Ejecutar diagnóstico completo'}
        </button>

        {error ? <div className="page-error">{error}</div> : null}
        {loading ? <LoadingState message="Consultando player_api, categorías y catálogos…" /> : null}

        {report ? (
          <div className="settings-report">
            <section className="settings-card">
              <h2>Conexión</h2>
              <dl className="settings-dl">
                <dt>Servidor Xtream</dt>
                <dd><code>{report.server_url}</code></dd>
                <dt>Usuario gateway</dt>
                <dd>{report.gateway_user}</dd>
                <dt>Cuenta asignada</dt>
                <dd>{report.session.account_name || '—'} ({report.session.account_username})</dd>
                <dt>Sesión activa</dt>
                <dd>{report.session.active ? 'Sí' : 'No'}</dd>
              </dl>
            </section>

            <section className="settings-card">
              <h2>Resultados ({report.summary.passed}/{report.checks.length} OK · {report.summary.total_ms} ms)</h2>
              <div className="diag-table">
                {report.checks.map((check) => (
                  <div key={check.name} className={`diag-row ${check.ok ? 'ok' : 'fail'}`}>
                    <span className="diag-status">{check.ok ? '✓' : '✗'}</span>
                    <span className="diag-name">{CHECK_LABELS[check.name] || check.name}</span>
                    <span className="diag-count">{check.count != null ? `${check.count} items` : '—'}</span>
                    <span className="diag-ms">{check.ms} ms</span>
                    {!check.ok ? <span className="diag-detail">{check.detail}</span> : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="settings-card">
              <h2>Comandos y enlaces comunes</h2>
              <ul className="commands-list">
                {report.commands.map((cmd) => (
                  <li key={cmd.label}>
                    <strong>{cmd.label}</strong>
                    <code>{cmd.url}</code>
                    <button
                      type="button"
                      className="copy-btn"
                      onClick={() => navigator.clipboard.writeText(cmd.url)}
                    >
                      Copiar
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  )
}
