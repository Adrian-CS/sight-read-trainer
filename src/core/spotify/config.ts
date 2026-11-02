/**
 * Client ID de la app en el Spotify Developer Dashboard. No es secreto: viaja en cada
 * petición de autorización. Con PKCE no se usa el Client Secret.
 */
export const SPOTIFY_CLIENT_ID =
  process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || '222cc8a586484b6f981a8b8261d6f6df';

export const SPOTIFY_SCOPES = [
  'streaming', // Web Playback SDK
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
];

export const CALLBACK_PATH = '/spotify/callback/';

/** Debe coincidir exactamente con una Redirect URI registrada en el panel de Spotify. */
export function redirectUri(origin: string): string {
  return origin + CALLBACK_PATH;
}

export const ACCOUNTS_URL = 'https://accounts.spotify.com';
export const API_URL = 'https://api.spotify.com/v1';
export const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
