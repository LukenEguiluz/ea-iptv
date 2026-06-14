import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar({ active }) {
  const { logout } = useAuth()
  const linkClass = (name) => ({ isActive }) => (isActive || active === name ? 'active' : '')

  return (
    <nav className="navbar">
      <div className="navbar-brand">LEYLUZ TV</div>
      <div className="navbar-links">
        <NavLink to="/" className={linkClass('home')}>Inicio</NavLink>
        <NavLink to="/tv" className={linkClass('tv')}>TV en vivo</NavLink>
        <NavLink to="/movies" className={linkClass('movies')}>Películas</NavLink>
        <NavLink to="/series" className={linkClass('series')}>Series</NavLink>
      </div>
      <div className="navbar-actions">
        <Link to="/settings" className={`settings-btn ${active === 'settings' ? 'active' : ''}`} title="Configuración">
          ⚙
        </Link>
        <button type="button" className="navbar-logout" onClick={logout}>Salir</button>
      </div>
    </nav>
  )
}
