import { createTheme } from '@mui/material/styles';

export const tokens = {
  color: {
    earth:       '#1B3D2F',
    earthLight:  '#2D6147',
    earthDark:   '#0F2319',
    terra:       '#C4532A',
    terraLight:  '#D4724F',
    terraDark:   '#9E3E1A',
    cream:       '#FAF8F4',
    paper:       '#F2EDE6',
    paperDark:   '#E8E0D5',
    stone:       '#6B5E52',
    stoneLight:  '#8B7B6E',
    gold:        '#D4A853',
    night:       '#0D1F17',
    nightCard:   '#132B1E',
    nightBorder: '#1F3D2A',
  },
  font: {
    display: '"Fraunces", Georgia, serif',
    body:    '"DM Sans", system-ui, sans-serif',
    mono:    '"DM Mono", "Courier New", monospace',
  },
  radius: {
    sm:   '8px',
    md:   '16px',
    lg:   '24px',
    xl:   '32px',
    full: '9999px',
  },
} as const;

export const createAppTheme = (mode: 'light' | 'dark' = 'light') =>
  createTheme({
    palette: {
      mode,
      primary: {
        main:         tokens.color.earth,
        light:        tokens.color.earthLight,
        dark:         tokens.color.earthDark,
        contrastText: '#FFFFFF',
      },
      secondary: {
        main:         tokens.color.terra,
        light:        tokens.color.terraLight,
        dark:         tokens.color.terraDark,
        contrastText: '#FFFFFF',
      },
      background: {
        default: mode === 'dark' ? tokens.color.night     : tokens.color.cream,
        paper:   mode === 'dark' ? tokens.color.nightCard : tokens.color.paper,
      },
      text: {
        primary:   mode === 'dark' ? '#F0EBE3' : '#1A1410',
        secondary: mode === 'dark' ? '#A89B8E' : tokens.color.stone,
      },
      divider: mode === 'dark' ? tokens.color.nightBorder : tokens.color.paperDark,
      success: { main: '#3D8B5E' },
      warning: { main: tokens.color.gold },
      error:   { main: '#C0392B' },
      info:    { main: '#2980B9' },
    },

    typography: {
      fontFamily: tokens.font.body,
      h1: { fontFamily: tokens.font.display, fontWeight: 500, lineHeight: 1.15 },
      h2: { fontFamily: tokens.font.display, fontWeight: 500, lineHeight: 1.2  },
      h3: { fontFamily: tokens.font.display, fontWeight: 500, lineHeight: 1.25 },
      h4: { fontFamily: tokens.font.display, fontWeight: 400, lineHeight: 1.3  },
      h5: { fontFamily: tokens.font.body,    fontWeight: 600, lineHeight: 1.4  },
      h6: { fontFamily: tokens.font.body,    fontWeight: 600, lineHeight: 1.4  },
      body1: { lineHeight: 1.6 },
      body2: { lineHeight: 1.5 },
      button: {
        fontFamily:    tokens.font.body,
        fontWeight:    600,
        textTransform: 'none',
        letterSpacing: '0.01em',
      },
    },

    shape: { borderRadius: 16 },

    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius:  tokens.radius.full,
            padding:       '10px 28px',
            fontSize:      '0.9375rem',
            boxShadow:     'none',
            transition:    'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            '&:hover': {
              boxShadow: `0 4px 16px rgba(27, 61, 47, 0.2)`,
              transform: 'translateY(-1px)',
            },
            '&:active': { transform: 'translateY(0)' },
          },
          containedPrimary: {
            background: `linear-gradient(135deg, ${tokens.color.earthLight} 0%, ${tokens.color.earth} 100%)`,
            '&:hover': {
              background: `linear-gradient(135deg, ${tokens.color.earth} 0%, ${tokens.color.earthDark} 100%)`,
            },
          },
          containedSecondary: {
            background: `linear-gradient(135deg, ${tokens.color.terraLight} 0%, ${tokens.color.terra} 100%)`,
            '&:hover': {
              background: `linear-gradient(135deg, ${tokens.color.terra} 0%, ${tokens.color.terraDark} 100%)`,
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius:    tokens.radius.lg,
            border:          `1px solid ${mode === 'dark' ? tokens.color.nightBorder : tokens.color.paperDark}`,
            boxShadow:       mode === 'dark'
              ? '0 2px 12px rgba(0, 0, 0, 0.4)'
              : '0 2px 16px rgba(27, 61, 47, 0.06)',
            backgroundImage: 'none',
            transition:      'box-shadow 0.2s ease, transform 0.2s ease',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: tokens.radius.sm, fontWeight: 600 },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius:    tokens.radius.md,
              backgroundColor: mode === 'dark'
                ? 'rgba(255, 255, 255, 0.04)'
                : 'rgba(255, 255, 255, 0.8)',
              transition: 'background-color 0.2s ease',
              '&:hover': {
                backgroundColor: mode === 'dark'
                  ? 'rgba(255, 255, 255, 0.07)'
                  : '#FFFFFF',
              },
            },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: tokens.radius.xl },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: mode === 'dark' ? tokens.color.nightCard : tokens.color.earth,
            boxShadow:       'none',
            borderBottom:    `1px solid ${mode === 'dark' ? tokens.color.nightBorder : 'rgba(255, 255, 255, 0.1)'}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: mode === 'dark' ? tokens.color.nightCard : tokens.color.paper,
            borderRight: `1px solid ${mode === 'dark' ? tokens.color.nightBorder : tokens.color.paperDark}`,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.sm,
            margin: '2px 8px',
            width: 'calc(100% - 16px)',
            '&.Mui-selected': {
              backgroundColor: mode === 'dark'
                ? 'rgba(45, 97, 71, 0.3)'
                : 'rgba(27, 61, 47, 0.08)',
              '&:hover': {
                backgroundColor: mode === 'dark'
                  ? 'rgba(45, 97, 71, 0.4)'
                  : 'rgba(27, 61, 47, 0.12)',
              },
            },
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-root': {
              fontWeight: 600,
              backgroundColor: mode === 'dark' ? tokens.color.night : tokens.color.paper,
            },
          },
        },
      },
    },
  });

export default createAppTheme;
