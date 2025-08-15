import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: {
      main: '#2E7D32',
      light: '#4CAF50',
      dark: '#1B5E20',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#FF6D00',
      light: '#FF9800',
      dark: '#E65100',
      contrastText: '#ffffff',
    },
    background: {
      default: '#F8F9FA',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#212121',
      secondary: '#757575',
    },
    success: {
      main: '#4CAF50',
    },
    warning: {
      main: '#FF9800',
    },
    error: {
      main: '#F44336',
    },
    info: {
      main: '#2196F3',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 700,
      fontSize: '2.5rem',
      lineHeight: 1.2,
    },
    h2: {
      fontWeight: 600,
      fontSize: '2rem',
      lineHeight: 1.3,
    },
    h3: {
      fontWeight: 600,
      fontSize: '1.75rem',
      lineHeight: 1.3,
    },
    h4: {
      fontWeight: 600,
      fontSize: '1.5rem',
      lineHeight: 1.4,
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.25rem',
      lineHeight: 1.4,
    },
    h6: {
      fontWeight: 600,
      fontSize: '1.125rem',
      lineHeight: 1.4,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 12,
  },
  shadows: [
    'none',
    '0px 2px 8px rgba(0, 0, 0, 0.04)',
    '0px 4px 12px rgba(0, 0, 0, 0.08)',
    '0px 6px 16px rgba(0, 0, 0, 0.12)',
    '0px 8px 20px rgba(0, 0, 0, 0.16)',
    '0px 10px 24px rgba(0, 0, 0, 0.20)',
    '0px 12px 28px rgba(0, 0, 0, 0.24)',
    '0px 14px 32px rgba(0, 0, 0, 0.28)',
    '0px 16px 36px rgba(0, 0, 0, 0.32)',
    '0px 18px 40px rgba(0, 0, 0, 0.36)',
    '0px 20px 44px rgba(0, 0, 0, 0.40)',
    '0px 22px 48px rgba(0, 0, 0, 0.44)',
    '0px 24px 52px rgba(0, 0, 0, 0.48)',
    '0px 26px 56px rgba(0, 0, 0, 0.52)',
    '0px 28px 60px rgba(0, 0, 0, 0.56)',
    '0px 30px 64px rgba(0, 0, 0, 0.60)',
    '0px 32px 68px rgba(0, 0, 0, 0.64)',
    '0px 34px 72px rgba(0, 0, 0, 0.68)',
    '0px 36px 76px rgba(0, 0, 0, 0.72)',
    '0px 38px 80px rgba(0, 0, 0, 0.76)',
    '0px 40px 84px rgba(0, 0, 0, 0.80)',
    '0px 42px 88px rgba(0, 0, 0, 0.84)',
    '0px 44px 92px rgba(0, 0, 0, 0.88)',
    '0px 46px 96px rgba(0, 0, 0, 0.92)',
    '0px 48px 100px rgba(0, 0, 0, 0.96)',
  ],
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '12px 24px',
          fontSize: '1rem',
          fontWeight: 600,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
          },
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #45A049 0%, #1B5E20 100%)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.08)',
          border: '1px solid rgba(0, 0, 0, 0.05)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
  },
});

export default theme;