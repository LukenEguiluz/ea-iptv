import { useCallback, useEffect, useState } from 'react'
import {
  Box,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { deleteViewHistory, fetchViewHistory } from '../api'
import { useCatalogRefresh } from '../context/CatalogRefreshContext'
import MediaCard from './MediaCard'

export default function RecentChannelsRow({ limit = 12, onPlay }) {
  const { refreshGeneration } = useCatalogRefresh()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [removingId, setRemovingId] = useState('')

  const loadItems = useCallback(() => {
    setLoading(true)
    return fetchViewHistory('live', limit)
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [limit])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  useEffect(() => {
    if (refreshGeneration === 0) return
    loadItems()
  }, [refreshGeneration, loadItems])

  async function removeItem(item, event) {
    event.preventDefault()
    event.stopPropagation()
    setRemovingId(item.item_id)
    try {
      await deleteViewHistory('live', item.item_id)
      setItems((prev) => prev.filter((entry) => entry.item_id !== item.item_id))
    } catch {
      // ignore
    } finally {
      setRemovingId('')
    }
  }

  if (loading || items.length === 0) return null

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h5" sx={{ mb: 1.5 }}>
        Canales recientes
      </Typography>
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          overflowX: 'auto',
          pb: 1,
          scrollSnapType: 'x mandatory',
        }}
      >
        {items.map((item) => (
          <Box
            key={`${item.item_id}-${item.viewed_at}`}
            sx={{ position: 'relative', scrollSnapAlign: 'start' }}
          >
            <Tooltip title="Quitar de canales recientes">
              <IconButton
                size="small"
                aria-label="Quitar de canales recientes"
                disabled={removingId === item.item_id}
                onClick={(event) => removeItem(item, event)}
                sx={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  zIndex: 2,
                  bgcolor: 'rgba(11, 11, 15, 0.75)',
                  '&:hover': { bgcolor: 'rgba(11, 11, 15, 0.9)' },
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <MediaCard
              title={item.title}
              image={item.image}
              subtitle={item.category_name || 'TV en vivo'}
              onClick={() => onPlay({
                stream_id: item.item_id,
                name: item.title,
                stream_icon: item.image,
                category_name: item.category_name,
              })}
            />
          </Box>
        ))}
      </Box>
    </Box>
  )
}
