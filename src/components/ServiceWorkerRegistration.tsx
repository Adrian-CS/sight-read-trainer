'use client';

import { useEffect } from 'react';

/** Registra /sw.js (generado tras el build) solo en producción. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('SW no registrado', err));
  }, []);
  return null;
}
