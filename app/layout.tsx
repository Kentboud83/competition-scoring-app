import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Barlow_Condensed, Geist } from 'next/font/google'
import { AppHeader } from '@/components/app-header'
import { BottomNav } from '@/components/bottom-nav'
import { ServiceWorker } from '@/components/service-worker'
import { isManager } from '@/lib/auth'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const display = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display-face',
})

export const metadata: Metadata = {
  title: 'The Weekly Showdown',
  description: 'Live scores, team battle and rankings for The Weekly Showdown competition.',
  generator: 'v0.app',
  applicationName: 'Weekly Showdown',
  appleWebApp: { capable: true, title: 'Showdown', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#141a26',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const manager = await isManager()
  return (
    <html lang="en" className={`${geist.variable} ${display.variable}`}>
      <body className="min-h-dvh bg-background font-sans antialiased">
        <AppHeader />
        <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4">{children}</main>
        <BottomNav isManager={manager} />
        <ServiceWorker />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
