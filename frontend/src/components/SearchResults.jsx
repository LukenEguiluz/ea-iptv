import { Box, Typography } from '@mui/material'
import ChannelCard from './ChannelCard'
import MediaCard from './MediaCard'

export function groupSearchResults(results = []) {
  return {
    live: results.filter((item) => item.content_type === 'live'),
    vod: results.filter((item) => item.content_type === 'vod'),
    series: results.filter((item) => item.content_type === 'series'),
  }
}

function PosterGrid({ items, onSelect }) {
  if (!items.length) return null
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(auto-fill, minmax(130px, 1fr))',
          md: 'repeat(auto-fill, minmax(170px, 1fr))',
        },
        gap: 2,
      }}
    >
      {items.map((item) => (
        <MediaCard
          key={`${item.content_type}-${item.item_id}`}
          title={item.name}
          image={item.image}
          poster
          subtitle={[item.category_name, item.year, item.rating, item.cast].filter(Boolean).join(' · ')}
          onClick={() => onSelect(item)}
        />
      ))}
    </Box>
  )
}

function ChannelGrid({ items, onSelect, layout = 'grid' }) {
  if (!items.length) return null
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: layout === 'list'
          ? '1fr'
          : {
              xs: '1fr',
              sm: 'repeat(auto-fill, minmax(280px, 1fr))',
              md: 'repeat(auto-fill, minmax(320px, 1fr))',
            },
        gap: 2,
      }}
    >
      {items.map((item) => (
        <ChannelCard
          key={`live-${item.item_id}`}
          title={item.name}
          image={item.image}
          category={item.category_name}
          layout={layout === 'list' ? 'horizontal' : 'grid'}
          onClick={() => onSelect(item)}
        />
      ))}
    </Box>
  )
}

function SearchSection({ title, count, children }) {
  if (!count) return null
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" sx={{ mb: 1.5 }}>
        {title}
        <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
          ({count})
        </Typography>
      </Typography>
      {children}
    </Box>
  )
}

export default function SearchResults({
  results,
  onSelect,
  activeType = '',
  channelLayout = 'grid',
}) {
  const grouped = groupSearchResults(results)

  if (activeType === 'live') {
    return <ChannelGrid items={grouped.live} onSelect={onSelect} layout={channelLayout} />
  }

  if (activeType === 'vod') {
    return <PosterGrid items={grouped.vod} onSelect={onSelect} />
  }

  if (activeType === 'series') {
    return <PosterGrid items={grouped.series} onSelect={onSelect} />
  }

  const hasMultipleSections = [
    grouped.live.length > 0,
    grouped.vod.length > 0,
    grouped.series.length > 0,
  ].filter(Boolean).length > 1

  if (!hasMultipleSections) {
    if (grouped.live.length) {
      return <ChannelGrid items={grouped.live} onSelect={onSelect} layout={channelLayout} />
    }
    if (grouped.vod.length) {
      return <PosterGrid items={grouped.vod} onSelect={onSelect} />
    }
    return <PosterGrid items={grouped.series} onSelect={onSelect} />
  }

  return (
    <>
      <SearchSection title="Canales de TV" count={grouped.live.length}>
        <ChannelGrid items={grouped.live} onSelect={onSelect} layout={channelLayout} />
      </SearchSection>
      <SearchSection title="Películas" count={grouped.vod.length}>
        <PosterGrid items={grouped.vod} onSelect={onSelect} />
      </SearchSection>
      <SearchSection title="Series" count={grouped.series.length}>
        <PosterGrid items={grouped.series} onSelect={onSelect} />
      </SearchSection>
    </>
  )
}
