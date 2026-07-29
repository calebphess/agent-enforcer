import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/components/theme-provider'
import { MuiProvider } from '@/components/mui-provider'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Agent Enforcer — Enforcement Console',
  description:
    'Agent Enforcer by Alchemist — enforce what your AI agents are allowed to do, before they do it. Stop the Slop.',
  generator: 'v0.app',
  icons: {
    icon: '/favicon.png',
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#0A1628',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {/* Deploy-time runtime config (API base URL) — see lib/api.ts apiBase() */}
        <script src="/config.js" />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <MuiProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </MuiProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
