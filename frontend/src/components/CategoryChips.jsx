import { useMemo, useState } from 'react'
import {
  Autocomplete,
  Box,
  Chip,
  Skeleton,
  TextField,
  Typography,
} from '@mui/material'

function normalizeCategoryId(cat) {
  return String(cat.category_id)
}

export default function CategoryChips({
  categories = [],
  activeCategory,
  allValue,
  allLabel = 'Todas',
  showAllChip = true,
  onChange,
  loading = false,
  searchPlaceholder = 'Buscar categoría…',
}) {
  const [categoryQuery, setCategoryQuery] = useState('')

  const filteredCategories = useMemo(() => {
    const query = categoryQuery.trim().toLowerCase()
    if (!query) return categories
    return categories.filter((cat) => (
      cat.category_name?.toLowerCase().includes(query)
      || String(cat.category_id).includes(query)
    ))
  }, [categories, categoryQuery])

  const activeCategoryMeta = useMemo(
    () => categories.find((cat) => normalizeCategoryId(cat) === String(activeCategory)),
    [categories, activeCategory],
  )

  function selectCategory(categoryId) {
    onChange(categoryId)
    setCategoryQuery('')
  }

  if (loading) {
    return (
      <Box sx={{ mb: 2 }}>
        <Skeleton variant="rounded" height={40} sx={{ mb: 1.5 }} />
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" width={88} height={36} />
          ))}
        </Box>
      </Box>
    )
  }

  if (!categories.length) return null

  const showChipList = categoryQuery.trim().length > 0 || categories.length <= 24

  return (
    <Box sx={{ mb: 2 }}>
      <Autocomplete
        size="small"
        options={categories}
        value={activeCategory === allValue ? null : (activeCategoryMeta || null)}
        inputValue={categoryQuery}
        onInputChange={(_, value) => setCategoryQuery(value)}
        onChange={(_, cat) => {
          if (!cat) {
            selectCategory(allValue)
            return
          }
          selectCategory(normalizeCategoryId(cat))
        }}
        getOptionLabel={(cat) => cat.category_name || ''}
        isOptionEqualToValue={(a, b) => normalizeCategoryId(a) === normalizeCategoryId(b)}
        noOptionsText="Sin categorías con ese nombre"
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={searchPlaceholder}
            helperText={
              categoryQuery.trim()
                ? `${filteredCategories.length} de ${categories.length} categorías`
                : `${categories.length} categorías disponibles`
            }
          />
        )}
        sx={{ mb: 1.5 }}
      />

      <Box
        sx={{
          display: 'flex',
          gap: 1,
          overflowX: showChipList ? 'visible' : 'auto',
          pb: 0.5,
          flexWrap: showChipList ? 'wrap' : 'nowrap',
          WebkitOverflowScrolling: 'touch',
          '&::-webkit-scrollbar': { height: 6 },
        }}
      >
        {!categoryQuery.trim() && showAllChip ? (
          <Chip
            label={allLabel}
            clickable
            color={activeCategory === allValue ? 'primary' : 'default'}
            variant={activeCategory === allValue ? 'filled' : 'outlined'}
            onClick={() => selectCategory(allValue)}
            sx={{ flexShrink: 0 }}
          />
        ) : null}
        {filteredCategories.map((cat) => {
          const id = normalizeCategoryId(cat)
          return (
            <Chip
              key={id}
              label={cat.category_name}
              clickable
              color={activeCategory === id ? 'primary' : 'default'}
              variant={activeCategory === id ? 'filled' : 'outlined'}
              onClick={() => selectCategory(id)}
              sx={{ flexShrink: 0 }}
            />
          )
        })}
      </Box>

      {categoryQuery.trim() && filteredCategories.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No hay categorías que coincidan con «{categoryQuery.trim()}».
        </Typography>
      ) : null}
    </Box>
  )
}
