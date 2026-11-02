import { ACCOUNTS_URL, SPOTIFY_CLIENT_ID, SPOTIFY_SCOPES } from './config';
import { codeChallenge, randomString } from './pkce';

export type SpotifyTokens = {
  accessToken: string;
  refreshToken: string;
  /** Instante (Date.now) en que caduca el access token. */
  expiresAt: number;
  scope: string;
};

/** Dónde se guardan los tokens (IndexedDB en la app; memoria en los tests). */
export interface TokenStore {
  load(): Promise<SpotifyTokens | null>;
  save(tokens: SpotifyTokens | null): Promise<void>;
}

/** Datos que sobreviven a la redirección a Spotify (verificador PKCE, estado y página de vuelta). */
export type PendingLogin = {
  verifier: string;
  state: string;
  returnTo: string;
  redirectUri: string;
};

export class SpotifyAuthError extends Error {
  constructor(
    readonly reason: 'denied' | 'state' | 'token' | 'expired',
    message: string,
  ) {
    super(message);
  }
}

type FetchFn = typeof fetch;

export async function createLogin(
  redirectUri: string,
  returnTo: string,
): Promise<{ url: string; pending: PendingLogin }> {
  const verifier = randomString(64);
  const state = randomString(16);
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: await codeChallenge(verifier),
    scope: SPOTIFY_SCOPES.join(' '),
    state,
  });
  return {
    url: `${ACCOUNTS_URL}/authorize?${params}`,
    pending: { verifier, state, returnTo, redirectUri },
  };
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

async function tokenRequest(
  body: Record<string, string>,
  fetchFn: FetchFn,
): Promise<TokenResponse> {
  const res = await fetchFn(`${ACCOUNTS_URL}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: SPOTIFY_CLIENT_ID, ...body }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}) as Record<string, string>);
    const reason = detail.error === 'invalid_grant' ? 'expired' : 'token';
    throw new SpotifyAuthError(
      reason,
      detail.error_description || detail.error || `HTTP ${res.status}`,
    );
  }
  return res.json();
}

const toTokens = (r: TokenResponse, previousRefresh: string, now: number): SpotifyTokens => ({
  accessToken: r.access_token,
  // Spotify puede rotar el refresh token: si llega uno nuevo, sustituye al anterior.
  refreshToken: r.refresh_token ?? previousRefresh,
  expiresAt: now + r.expires_in * 1000,
  scope: r.scope ?? '',
});

/** Vuelta de Spotify: valida el estado y cambia el código por tokens. */
export async function completeLogin(
  query: URLSearchParams,
  pending: PendingLogin | null,
  fetchFn: FetchFn = fetch,
  now = Date.now(),
): Promise<SpotifyTokens> {
  if (query.get('error')) throw new SpotifyAuthError('denied', query.get('error')!);
  const code = query.get('code');
  if (!pending || !code || query.get('state') !== pending.state) {
    throw new SpotifyAuthError(
      'state',
      'La respuesta de Spotify no corresponde a este inicio de sesión',
    );
  }
  const r = await tokenRequest(
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      code_verifier: pending.verifier,
    },
    fetchFn,
  );
  return toTokens(r, '', now);
}

const MARGIN_MS = 60_000;

/** Entrega un access token válido, renovándolo cuando falta menos de un minuto. */
export class TokenManager {
  private refreshing: Promise<SpotifyTokens | null> | null = null;

  constructor(
    private readonly store: TokenStore,
    private readonly fetchFn: FetchFn = (...args) => fetch(...args),
    private readonly now: () => number = Date.now,
  ) {}

  async isConnected(): Promise<boolean> {
    return (await this.store.load()) !== null;
  }

  async accessToken(): Promise<string | null> {
    const tokens = await this.store.load();
    if (!tokens) return null;
    if (tokens.expiresAt - this.now() > MARGIN_MS) return tokens.accessToken;
    return (await this.refresh())?.accessToken ?? null;
  }

  /** Renueva el token. Varias llamadas a la vez comparten la misma petición. */
  refresh(): Promise<SpotifyTokens | null> {
    this.refreshing ??= (async () => {
      try {
        const tokens = await this.store.load();
        if (!tokens) return null;
        const r = await tokenRequest(
          { grant_type: 'refresh_token', refresh_token: tokens.refreshToken },
          this.fetchFn,
        );
        const next = toTokens(r, tokens.refreshToken, this.now());
        await this.store.save(next);
        return next;
      } catch (err) {
        // Refresh token revocado o caducado: hay que volver a iniciar sesión.
        if (err instanceof SpotifyAuthError && err.reason === 'expired')
          await this.store.save(null);
        throw err;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  logout(): Promise<void> {
    return this.store.save(null);
  }
}
