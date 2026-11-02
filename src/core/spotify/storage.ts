import type { Repository } from '../storage/Repository';
import type { PendingLogin, SpotifyTokens, TokenStore } from './auth';

/** Tokens en IndexedDB, dentro de los ajustes. */
export function repositoryTokenStore(repo: Repository): TokenStore {
  return {
    load: async () => (await repo.getSettings()).spotifyAuth,
    save: async (tokens: SpotifyTokens | null) => {
      await repo.updateSettings({ spotifyAuth: tokens });
    },
  };
}

const PENDING_KEY = 'sightread:spotifyPending';

/** El verificador PKCE debe sobrevivir a la redirección a Spotify y vuelta. */
export function savePendingLogin(pending: PendingLogin): void {
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

export function takePendingLogin(): PendingLogin | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingLogin) : null;
  } catch {
    return null;
  }
}
