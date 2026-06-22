import { Capacitor } from '@capacitor/core'

export function isNativeApp() {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export function nativePlatform() {
  try {
    return Capacitor.getPlatform()
  } catch {
    return 'web'
  }
}
