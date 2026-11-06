import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'The Weekly Showdown',
    short_name: 'Showdown',
    description: 'Live scores, team battle and rankings for The Weekly Showdown.',
    start_url: '/',
    display: 'standalone',
    background_color: '#141a26',
    theme_color: '#141a26',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
