import type { MetadataRoute } from 'next';
import { t } from '@/i18n';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: t('appName'),
    short_name: 'Sightread',
    description: t('appTagline'),
    lang: 'es',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['fullscreen', 'standalone'],
    orientation: 'landscape',
    background_color: '#f7f5f0',
    theme_color: '#2f6fdf',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
