const STORAGE_KEY = 'iptv_live_session'

export function saveLiveSession(meta = {}) {
  if (!meta?.itemId) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      item_id: String(meta.itemId),
      name: meta.title || '',
      category_name: meta.categoryName || meta.category_name || '',
      saved_at: Date.now(),
    }))
  } catch {
    // ignore quota / private mode
  }
}

export function loadLiveSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data?.item_id) return null
    return data
  } catch {
    return null
  }
}

export function clearLiveSession() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
