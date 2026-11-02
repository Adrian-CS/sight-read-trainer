import { describe, expect, it, vi } from 'vitest';
import { SpotifyApi, parseTrackId, toTrack } from './api';
import {
  TokenManager,
  completeLogin,
  createLogin,
  type SpotifyTokens,
  type TokenStore,
} from './auth';
import { PlaybackClock, clampFragment } from './clock';
import { SPOTIFY_CLIENT_ID } from './config';
import { base64Url, codeChallenge } from './pkce';

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function memoryStore(
  initial: SpotifyTokens | null = null,
): TokenStore & { value: SpotifyTokens | null } {
  return {
    value: initial,
    async load() {
      return this.value;
    },
    async save(t) {
      this.value = t;
    },
  };
}

describe('PKCE', () => {
  it('calcula el reto del ejemplo de la RFC 7636', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
    expect(base64Url(new Uint8Array([251, 255]))).toBe('-_8');
  });
});

describe('login', () => {
  it('construye la URL de autorización con PKCE', async () => {
    const { url, pending } = await createLogin('https://x.dev/spotify/callback/', '/pieza/?id=1');
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(u.searchParams.get('client_id')).toBe(SPOTIFY_CLIENT_ID);
    expect(u.searchParams.get('code_challenge')).toBe(await codeChallenge(pending.verifier));
    expect(u.searchParams.get('scope')).toContain('streaming');
    expect(u.searchParams.get('state')).toBe(pending.state);
    expect(pending.returnTo).toBe('/pieza/?id=1');
  });

  it('cambia el código por tokens y valida el estado', async () => {
    const pending = { verifier: 'v', state: 's', returnTo: '/', redirectUri: 'https://x.dev/cb/' };
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('code_verifier')).toBe('v');
      expect(body.get('grant_type')).toBe('authorization_code');
      return json({ access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: 'streaming' });
    });
    const tokens = await completeLogin(
      new URLSearchParams('code=c&state=s'),
      pending,
      fetchFn as typeof fetch,
      1000,
    );
    expect(tokens).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: 3_601_000,
      scope: 'streaming',
    });
    await expect(
      completeLogin(new URLSearchParams('code=c&state=otro'), pending),
    ).rejects.toMatchObject({ reason: 'state' });
    await expect(
      completeLogin(new URLSearchParams('error=access_denied'), pending),
    ).rejects.toMatchObject({ reason: 'denied' });
  });
});

describe('TokenManager', () => {
  const tokens = (expiresAt: number): SpotifyTokens => ({
    accessToken: 'old',
    refreshToken: 'r1',
    expiresAt,
    scope: '',
  });

  it('usa el token vigente y renueva cuando va a caducar, guardando el refresh rotado', async () => {
    let now = 0;
    const store = memoryStore(tokens(10 * 60_000));
    const fetchFn = vi.fn(async () =>
      json({ access_token: 'new', refresh_token: 'r2', expires_in: 3600 }),
    );
    const tm = new TokenManager(store, fetchFn as typeof fetch, () => now);
    expect(await tm.accessToken()).toBe('old');
    now = 9.5 * 60_000;
    const [a, b] = await Promise.all([tm.accessToken(), tm.accessToken()]);
    expect([a, b]).toEqual(['new', 'new']);
    expect(fetchFn).toHaveBeenCalledTimes(1); // una sola renovación compartida
    expect(store.value?.refreshToken).toBe('r2');
  });

  it('conserva el refresh token si Spotify no envía otro y cierra sesión si lo revoca', async () => {
    const store = memoryStore(tokens(0));
    const tm = new TokenManager(
      store,
      (async () => json({ access_token: 'n', expires_in: 3600 })) as typeof fetch,
      () => 0,
    );
    await tm.accessToken();
    expect(store.value?.refreshToken).toBe('r1');

    const revoked = new TokenManager(
      store,
      (async () => json({ error: 'invalid_grant' }, 400)) as typeof fetch,
      () => 1e12,
    );
    await expect(revoked.accessToken()).rejects.toMatchObject({ reason: 'expired' });
    expect(store.value).toBeNull();
  });
});

describe('SpotifyApi', () => {
  const valid = () =>
    memoryStore({ accessToken: 'a', refreshToken: 'r', expiresAt: 1e15, scope: '' });

  it('busca canciones y normaliza el resultado', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain('/search?q=oda&type=track&limit=10');
      return json({
        tracks: {
          items: [
            {
              id: 'x'.repeat(22),
              name: 'Ode',
              duration_ms: 200000,
              artists: [{ name: 'Beethoven' }],
              album: {
                name: 'Sym 9',
                images: [
                  { url: 'big', width: 640 },
                  { url: 'small', width: 64 },
                ],
              },
            },
            null,
          ],
        },
      });
    });
    const api = new SpotifyApi(new TokenManager(valid(), fetch), fetchFn as typeof fetch);
    expect(await api.searchTracks('oda')).toEqual([
      {
        id: 'x'.repeat(22),
        name: 'Ode',
        artists: ['Beethoven'],
        album: 'Sym 9',
        imageUrl: 'small',
        durationMs: 200000,
      },
    ]);
  });

  it('reintenta una vez tras un 401 y traduce los errores conocidos', async () => {
    const store = valid();
    const tokenFetch = vi.fn(async () => json({ access_token: 'b', expires_in: 3600 }));
    const tm = new TokenManager(store, tokenFetch as typeof fetch);
    let calls = 0;
    const apiFetch = (async () => (++calls === 1 ? json({}, 401) : json({}, 204))) as typeof fetch;
    await new SpotifyApi(tm, apiFetch).play('dev', 'x'.repeat(22), 1500);
    expect(calls).toBe(2);
    expect(tokenFetch).toHaveBeenCalledTimes(1);

    const premium = (async () =>
      json(
        { error: { status: 403, message: 'Premium required', reason: 'PREMIUM_REQUIRED' } },
        403,
      )) as typeof fetch;
    await expect(new SpotifyApi(tm, premium).me()).rejects.toMatchObject({ reason: 'premium' });
    const notAllowed = (async () =>
      json(
        { error: { status: 403, message: 'User not registered in the Developer Dashboard' } },
        403,
      )) as typeof fetch;
    await expect(new SpotifyApi(tm, notAllowed).me()).rejects.toMatchObject({
      reason: 'not-allowed',
    });
  });

  it('reconoce enlaces, URIs e IDs de canción', () => {
    const id = '4uLU6hMCjMI75M1A2tKUQC';
    expect(parseTrackId(`https://open.spotify.com/track/${id}?si=abc`)).toBe(id);
    expect(parseTrackId(`https://open.spotify.com/intl-es/track/${id}`)).toBe(id);
    expect(parseTrackId(`spotify:track:${id}`)).toBe(id);
    expect(parseTrackId(id)).toBe(id);
    expect(parseTrackId('https://open.spotify.com/album/123')).toBeNull();
    expect(toTrack({ id, name: 'n', duration_ms: 1 }).imageUrl).toBeNull();
  });
});

describe('PlaybackClock', () => {
  it('interpola mientras suena y se congela en pausa', () => {
    const clock = new PlaybackClock();
    clock.update(10_000, false, 1000);
    expect(clock.position(1250)).toBe(10_250);
    clock.update(10_300, true, 1300);
    expect(clock.position(5000)).toBe(10_300);
  });

  it('corrige fragmentos fuera de rango', () => {
    expect(clampFragment(-5, 500, 100_000)).toEqual({ startMs: 0, endMs: 1000 });
    expect(clampFragment(5000, 400_000, 100_000)).toEqual({ startMs: 5000, endMs: 100_000 });
  });
});
