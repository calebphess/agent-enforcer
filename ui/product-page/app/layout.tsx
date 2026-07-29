import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Agent Enforcer | Stop the Slop',
  description:
    'Agent Enforcer by Alchemist is an enterprise-grade policy enforcement layer for AI coding agents. Enforce what your AI agents are allowed to do before they do it.',
  generator: 'v0.app',
  icons: {
    icon: '/favicon.png',
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#081120',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className={`${inter.variable} font-sans antialiased`}>
        {/* Deploy-time runtime config (contact API base URL) — see lib/api.ts apiBase() */}
        <script src="/config.js" />
        {children}
      </body>
    </html>
  )
}
