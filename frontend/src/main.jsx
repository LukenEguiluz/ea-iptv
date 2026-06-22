import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import App from './App.jsx'
import './styles/global.css'

if (Capacitor.isNativePlatform()) {
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
    StatusBar.setBackgroundColor({ color: '#0b0b0f' }).catch(() => {})
  }).catch(() => {})
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
