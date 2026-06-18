import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#ff3b57',
      light: '#ff7a8c',
      dark: '#c92940',
    },
    secondary: {
      main: '#8b9cff',
    },
    background: {
      default: '#0b0b0f',
      paper: '#16161f',
    },
    divider: 'rgba(255, 255, 255, 0.08)',
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(11, 11, 15, 0.92)',
          backdropFilter: 'blur(12px)',
        },
      },
    },
    MuiBottomNavigation: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(11, 11, 15, 0.96)',
          backdropFilter: 'blur(14px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        },
      },
    },
  },
})
