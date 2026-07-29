'use client'

import { useMemo } from 'react'
import { useTheme } from 'next-themes'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter'

/**
 * Bridges next-themes -> MUI so Material React Table matches the Agent Enforcer
 * palette in both light and dark mode. Token values mirror app/globals.css.
 */
export function MuiProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme()
  const mode = resolvedTheme === 'dark' ? 'dark' : 'light'

  const theme = useMemo(() => {
    const isDark = mode === 'dark'
    return createTheme({
      palette: {
        mode,
        primary: {
          main: '#c8a94a',
          contrastText: isDark ? '#131519' : '#0a1628',
        },
        error: { main: isDark ? '#e0685a' : '#c0392b' },
        background: {
          default: isDark ? '#131519' : '#ffffff',
          paper: isDark ? '#1b1e24' : '#ffffff',
        },
        text: {
          primary: isDark ? '#edeff3' : '#152033',
          secondary: isDark ? '#9aa1ad' : '#647084',
        },
        divider: isDark ? 'rgba(255,255,255,0.09)' : '#d9dee8',
        action: {
          hover: 'rgba(200,169,74,0.12)',
          selected: 'rgba(200,169,74,0.18)',
        },
      },
      shape: { borderRadius: 6 },
      typography: {
        fontFamily:
          'var(--font-inter), "Inter Fallback", ui-sans-serif, system-ui, sans-serif',
      },
    })
  }, [mode])

  return (
    <AppRouterCacheProvider options={{ key: 'mui' }}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </AppRouterCacheProvider>
  )
}
