const STORAGE_KEY = 'iptv_tokens'

export function getTokens() {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

export function setTokens(tokens) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
}

export function clearTokens() {
  localStorage.removeItem(STORAGE_KEY)
}

export function isLoggedIn() {
  return Boolean(getTokens()?.access)
}
