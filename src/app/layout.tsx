import type { Metadata, Viewport } from 'next';
import { InputProvider } from '@/components/InputProvider';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import { t } from '@/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: t('appName'),
  description: t('appTagline'),
  applicationName: t('appName'),
  appleWebApp: { capable: true, title: t('appName') },
  icons: { icon: '/icons/icon.svg', apple: '/icons/icon-192.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f5f0' },
    { media: '(prefers-color-scheme: dark)', color: '#15171a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <InputProvider>{children}</InputProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
