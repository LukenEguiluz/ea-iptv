import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSearch } from '../context/SearchContext'

export default function Navbar({ active }) {
  const { logout } = useAuth()
  const { openSearch } = useSearch()
  const linkClass = (name) => ({ isActive }) => (isActive || active === name ? 'active' : '')

  return (
    <>
      <nav className="navbar">
        <div className="navbar-brand">LEYLUZ TV</div>
        <div className="navbar-links navbar-links--desktop">
          <NavLink to="/" className={linkClass('home')}>Inicio</NavLink>
          <NavLink to="/tv" className={linkClass('tv')}>TV en vivo</NavLink>
          <NavLink to="/movies" className={linkClass('movies')}>Películas</NavLink>
          <NavLink to="/series" className={linkClass('series')}>Series</NavLink>
        </div>
        <div className="navbar-actions">
          <button
            type="button"
            className="navbar-search-btn"
            onClick={openSearch}
            aria-label="Buscar"
          >
            <span className="navbar-search-icon" aria-hidden>⌕</span>
            <span className="navbar-search-label">Buscar</span>
          </button>
          <Link to="/settings" className={`settings-btn ${active === 'settings' ? 'active' : ''}`} title="Configuración" aria-label="Configuración">
            ⚙
          </Link>
          <button type="button" className="navbar-logout navbar-logout--desktop" onClick={logout}>
            Salir
          </button>
        </div>
      </nav>

      <nav className="mobile-bottom-nav" aria-label="Navegación principal">
        <NavLink to="/" className={linkClass('home')}>
          <span className="mobile-nav-icon" aria-hidden>⌂</span>
          <span>Inicio</span>
        </NavLink>
        <NavLink to="/tv" className={linkClass('tv')}>
          <span className="mobile-nav-icon" aria-hidden>▶</span>
          <span>TV</span>
        </NavLink>
        <button type="button" className="mobile-nav-search" onClick={openSearch} aria-label="Buscar">
          <span className="mobile-nav-icon" aria-hidden>⌕</span>
          <span>Buscar</span>
        </button>
        <NavLink to="/movies" className={linkClass('movies')}>
          <span className="mobile-nav-icon" aria-hidden>🎬</span>
          <span>Películas</span>
        </NavLink>
        <NavLink to="/series" className={linkClass('series')}>
          <span className="mobile-nav-icon" aria-hidden>📺</span>
          <span>Series</span>
        </NavLink>
      </nav>
    </>
  )
}
