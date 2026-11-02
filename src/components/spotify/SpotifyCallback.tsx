'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { completeLogin, repositoryTokenStore, takePendingLogin } from '@/core/spotify';
import { getRepository } from '@/core/storage/client';
import { t } from '@/i18n';
import { TopBar } from '../TopBar';
import { describeSpotifyError } from './SpotifyProvider';

/** Vuelta de Spotify tras autorizar: cambia el código por tokens y regresa a la pieza. */
export function SpotifyCallback() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode monta dos veces; el código solo vale una
    started.current = true;
    const pending = takePendingLogin();
    completeLogin(new URLSearchParams(params.toString()), pending)
      .then(async (tokens) => {
        await repositoryTokenStore(getRepository()).save(tokens);
        // Recarga completa para que el proveedor lea la sesión nueva.
        window.location.replace(pending?.returnTo || '/biblioteca/');
      })
      .catch((err) => setError(describeSpotifyError(err)));
  }, [params]);

  return (
    <main className="page">
      <TopBar title={t('spotify.title')} back="/biblioteca/" />
      {error ? (
        <p className="notice">{error}</p>
      ) : (
        <p className="muted">{t('spotify.connecting')}</p>
      )}
    </main>
  );
}
