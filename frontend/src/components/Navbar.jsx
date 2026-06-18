import {
  AppBar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  IconButton,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import HomeIcon from '@mui/icons-material/Home'
import LiveTvIcon from '@mui/icons-material/LiveTv'
import LogoutIcon from '@mui/icons-material/Logout'
import MovieIcon from '@mui/icons-material/Movie'
import SearchIcon from '@mui/icons-material/Search'
import SettingsIcon from '@mui/icons-material/Settings'
import TvIcon from '@mui/icons-material/Tv'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { usePlayback } from '../context/PlaybackContext'
import { useSearch } from '../context/SearchContext'

const DESKTOP_LINKS = [
  { key: 'home', label: 'Inicio', to: '/' },
  { key: 'tv', label: 'TV en vivo', to: '/tv' },
  { key: 'movies', label: 'Películas', to: '/movies' },
  { key: 'series', label: 'Series', to: '/series' },
]

function pathToNavValue(pathname) {
  if (pathname.startsWith('/tv')) return 'tv'
  if (pathname.startsWith('/movies')) return 'movies'
  if (pathname.startsWith('/series')) return 'series'
  if (pathname === '/') return 'home'
  return false
}

export default function Navbar({ active }) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'))
  const { logout } = useAuth()
  const { player } = usePlayback()
  const { openSearch } = useSearch()
  const location = useLocation()
  const navigate = useNavigate()
  const navValue = pathToNavValue(location.pathname) || active || 'home'

  if (player?.type === 'live') return null

  return (
    <>
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1, minHeight: { xs: 56, md: 64 } }}>
          <Typography
            variant="h6"
            component={Link}
            to="/"
            sx={{
              fontWeight: 800,
              letterSpacing: '0.06em',
              color: 'primary.main',
              textDecoration: 'none',
              mr: { md: 2 },
              fontSize: { xs: '0.95rem', md: '1.1rem' },
            }}
          >
            LEYLUZ TV
          </Typography>

          {!isMobile ? (
            <Box sx={{ display: 'flex', gap: 0.5, flex: 1 }}>
              {DESKTOP_LINKS.map((item) => (
                <Button
                  key={item.key}
                  component={Link}
                  to={item.to}
                  color={active === item.key || location.pathname === item.to ? 'primary' : 'inherit'}
                  variant={active === item.key || location.pathname === item.to ? 'contained' : 'text'}
                  size="small"
                >
                  {item.label}
                </Button>
              ))}
            </Box>
          ) : (
            <Box sx={{ flex: 1 }} />
          )}

          <Button
            variant="outlined"
            size="small"
            startIcon={<SearchIcon />}
            onClick={openSearch}
            sx={{ minWidth: { xs: 40, sm: 'auto' }, px: { xs: 1, sm: 1.5 } }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
              Buscar
            </Box>
          </Button>

          <IconButton
            component={Link}
            to="/settings"
            color={active === 'settings' ? 'primary' : 'default'}
            aria-label="Configuración"
          >
            <SettingsIcon />
          </IconButton>

          {!isMobile ? (
            <Button
              variant="outlined"
              size="small"
              startIcon={<LogoutIcon />}
              onClick={logout}
            >
              Salir
            </Button>
          ) : null}
        </Toolbar>
      </AppBar>

      {isMobile ? (
        <BottomNavigation
          value={navValue}
          showLabels
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: (t) => t.zIndex.appBar,
            pb: 'env(safe-area-inset-bottom)',
          }}
          onChange={(_, value) => {
            if (value === 'search') {
              openSearch()
              return
            }
            const routes = { home: '/', tv: '/tv', movies: '/movies', series: '/series' }
            navigate(routes[value] || '/')
          }}
        >
          <BottomNavigationAction label="Inicio" value="home" icon={<HomeIcon />} />
          <BottomNavigationAction label="TV" value="tv" icon={<LiveTvIcon />} />
          <BottomNavigationAction label="Buscar" value="search" icon={<SearchIcon />} />
          <BottomNavigationAction label="Películas" value="movies" icon={<MovieIcon />} />
          <BottomNavigationAction label="Series" value="series" icon={<TvIcon />} />
        </BottomNavigation>
      ) : null}
    </>
  )
}
