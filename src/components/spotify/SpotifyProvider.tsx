'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  SpotifyApi,
  SpotifyApiError,
  SpotifyAuthError,
  TokenManager,
  WebPlayer,
  createLogin,
  redirectUri,
  repositoryTokenStore,
  savePendingLogin,
} from '@/core/spotify';
import { getRepository } from '@/core/storage/client';

export type SpotifyStatus = 'loading' | 'disconnected' | 'connected';

type SpotifyContextValue = {
  status: SpotifyStatus;
  profile: { displayName: string; product: string | null } | null;
  /** Problema de la cuenta que impide usar Spotify (no Premium, no añadida en el panel…). */
  accountError: string | null;
  api: SpotifyApi;
  login(returnTo: string): Promise<void>;
  logout(): Promise<void>;
  /** Crea (una vez) el reproductor de la página. */
  getPlayer(): Promise<WebPlayer>;
  /** Para que los componentes informen de errores de cuenta (p. ej. del SDK). */
  reportError(error: unknown): string;
};

const SpotifyContext = createContext<SpotifyContextValue | null>(null);

/** Mensaje en español para los errores de Spotify. */
export function describeSpotifyError(error: unknown): string {
  if (error instanceof SpotifyApiError) {
    if (error.reason === 'premium')
      return 'Spotify necesita una cuenta Premium (los planes solo para móvil no sirven).';
    if (error.reason === 'not-allowed') {
      return 'Spotify no permite esta cuenta: añádela en User Management del panel de desarrollador.';
    }
    if (error.reason === 'quota')
      return 'Se ha alcanzado el límite de peticiones de Spotify. Prueba más tarde.';
    if (error.status === 401) return 'La sesión de Spotify ha caducado. Vuelve a conectar.';
    return `Spotify: ${error.message}`;
  }
  if (error instanceof SpotifyAuthError) {
    if (error.reason === 'denied') return 'Has cancelado el acceso a Spotify.';
    if (error.reason === 'expired') return 'La sesión de Spotify ha caducado. Vuelve a conectar.';
    return `No se pudo iniciar sesión en Spotify: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export function SpotifyProvider({ children }: { children: ReactNode }) {
  const tokens = useMemo(() => new TokenManager(repositoryTokenStore(getRepository())), []);
  const api = useMemo(() => new SpotifyApi(tokens), [tokens]);
  const [status, setStatus] = useState<SpotifyStatus>('loading');
  const [profile, setProfile] = useState<SpotifyContextValue['profile']>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const player = useRef<Promise<WebPlayer> | null>(null);

  const reportError = useCallback((error: unknown) => {
    const message = describeSpotifyError(error);
    const sessionLost =
      (error instanceof SpotifyApiError && error.status === 401) ||
      (error instanceof SpotifyAuthError && error.reason === 'expired');
    if (sessionLost) setStatus('disconnected');
    if (
      error instanceof SpotifyApiError &&
      (error.reason === 'premium' || error.reason === 'not-allowed')
    ) {
      setAccountError(message);
    }
    return message;
  }, []);

  useEffect(() => {
    void tokens.isConnected().then((connected) => {
      setStatus(connected ? 'connected' : 'disconnected');
      if (!connected) return;
      api
        .me()
        .then((me) => {
          setProfile(me);
          if (me.product && me.product !== 'premium') {
            setAccountError('Spotify necesita una cuenta Premium para reproducir en la app.');
          }
        })
        .catch(reportError);
    });
  }, [tokens, api, reportError]);

  const login = useCallback(async (returnTo: string) => {
    const { url, pending } = await createLogin(redirectUri(window.location.origin), returnTo);
    savePendingLogin(pending);
    window.location.assign(url);
  }, []);

  const logout = useCallback(async () => {
    void player.current?.then((p) => p.disconnect());
    player.current = null;
    await tokens.logout();
    setProfile(null);
    setAccountError(null);
    setStatus('disconnected');
  }, [tokens]);

  const getPlayer = useCallback(() => {
    player.current ??= WebPlayer.create(() => tokens.accessToken().catch(() => null)).catch(
      (err) => {
        player.current = null;
        throw err;
      },
    );
    return player.current;
  }, [tokens]);

  useEffect(() => () => void player.current?.then((p) => p.disconnect()), []);

  return (
    <SpotifyContext.Provider
      value={{ status, profile, accountError, api, login, logout, getPlayer, reportError }}
    >
      {children}
    </SpotifyContext.Provider>
  );
}

export function useSpotify(): SpotifyContextValue {
  const ctx = useContext(SpotifyContext);
  if (!ctx) throw new Error('useSpotify debe usarse dentro de <SpotifyProvider>');
  return ctx;
}
