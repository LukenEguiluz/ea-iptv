import { Box, Container, Typography } from '@mui/material'
import Navbar from './Navbar'

export default function PageShell({
  active,
  title,
  children,
  maxWidth = 'xl',
  disableGutters = false,
}) {
  return (
    <Box
      className="app-shell"
      sx={{
        minHeight: '100dvh',
        bgcolor: 'background.default',
        background: (t) => `linear-gradient(180deg, ${t.palette.background.paper} 0%, ${t.palette.background.default} 240px)`,
      }}
    >
      <Navbar active={active} />
      <Container
        maxWidth={maxWidth}
        disableGutters={disableGutters}
        sx={{ py: { xs: 2, md: 3 }, px: { xs: 2, md: 3 } }}
      >
        {title ? (
          <Typography variant="h4" component="h1" sx={{ mb: 2.5 }}>
            {title}
          </Typography>
        ) : null}
        {children}
      </Container>
    </Box>
  )
}
