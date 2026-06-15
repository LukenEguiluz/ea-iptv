import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { heartbeat } from './api'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PlaybackProvider } from './context/PlaybackContext'
import { SearchProvider } from './context/SearchContext'
import Home from './pages/Home'
import Live from './pages/Live'
import Login from './pages/Login'
import Movies from './pages/Movies'
import Series from './pages/Series'
import SeriesDetail from './pages/SeriesDetail'
import Settings from './pages/Settings'

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    if (!isAuthenticated) return undefined
    const timer = setInterval(() => {
      heartbeat().catch(() => {})
    }, 60000)
    return () => clearInterval(timer)
  }, [isAuthenticated])

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/tv" element={<ProtectedRoute><Live /></ProtectedRoute>} />
      <Route path="/movies" element={<ProtectedRoute><Movies /></ProtectedRoute>} />
      <Route path="/series" element={<ProtectedRoute><Series /></ProtectedRoute>} />
      <Route path="/series/:seriesId" element={<ProtectedRoute><SeriesDetail /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PlaybackProvider>
          <SearchProvider>
            <AppRoutes />
          </SearchProvider>
        </PlaybackProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}
