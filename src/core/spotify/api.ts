import type { TokenManager } from './auth';
import { API_URL } from './config';

export type SpotifyTrack = {
  id: string;
  name: string;
  artists: string[];
  album: string;
  imageUrl: string | null;
  durationMs: number;
};

export class SpotifyApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** 'premium' = la cuenta no es Premium; 'not-allowed' = cuenta no añadida en el panel (modo desarrollo). */
    readonly reason?: 'premium' | 'not-allowed' | 'quota' | 'no-device',
  ) {
    super(message);
  }
}

type RawTrack = {
  id: string;
  name: string;
  duration_ms: number;
  artists?: { name: string }[];
  album?: { name?: string; images?: { url: string; width?: number }[] };
};

export function toTrack(raw: RawTrack): SpotifyTrack {
  const images = raw.album?.images ?? [];
  // La más pequeña que no sea diminuta: basta para una miniatura.
  const image = [...images]
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
    .find((i) => (i.width ?? 300) >= 64);
  return {
    id: raw.id,
    name: raw.name,
    artists: (raw.artists ?? []).map((a) => a.name),
    album: raw.album?.name ?? '',
    imageUrl: image?.url ?? images[0]?.url ?? null,
    durationMs: raw.duration_ms,
  };
}

/** Acepta un enlace de open.spotify.com, una URI spotify:track:… o el ID tal cual. */
export function parseTrackId(input: string): string | null {
  const text = input.trim();
  const match =
    /open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]{22})/.exec(text) ??
    /^spotify:track:([A-Za-z0-9]{22})$/.exec(text) ??
    /^([A-Za-z0-9]{22})$/.exec(text);
  return match ? match[1] : null;
}

type FetchFn = typeof fetch;

/** Cliente mínimo de la Web API: reintenta una vez si el token ha caducado. */
export class SpotifyApi {
  constructor(
    private readonly tokens: TokenManager,
    private readonly fetchFn: FetchFn = (...args) => fetch(...args),
  ) {}

  private async request<T>(
    path: string,
    init: RequestInit = {},
    retried = false,
  ): Promise<T | null> {
    const token = await this.tokens.accessToken();
    if (!token) throw new SpotifyApiError(401, 'No has iniciado sesión en Spotify');
    const res = await this.fetchFn(`${API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    if (res.status === 401 && !retried) {
      await this.tokens.refresh();
      return this.request(path, init, true);
    }
    if (res.status === 204 || res.status === 202) return null;
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const message: string = body?.error?.message ?? `HTTP ${res.status}`;
      const reason =
        body?.reason === 'QUOTA_EXCEEDED'
          ? 'quota'
          : body?.error?.reason === 'PREMIUM_REQUIRED' || /premium/i.test(message)
            ? 'premium'
            : res.status === 403
              ? 'not-allowed'
              : body?.error?.reason === 'NO_ACTIVE_DEVICE'
                ? 'no-device'
                : undefined;
      throw new SpotifyApiError(res.status, message, reason);
    }
    return body as T;
  }

  async me(): Promise<{ id: string; displayName: string; product: string | null }> {
    const r = await this.request<{ id: string; display_name?: string; product?: string }>('/me');
    return { id: r!.id, displayName: r!.display_name ?? r!.id, product: r!.product ?? null };
  }

  async searchTracks(query: string): Promise<SpotifyTrack[]> {
    const params = new URLSearchParams({ q: query, type: 'track', limit: '10' });
    const r = await this.request<{ tracks?: { items?: (RawTrack | null)[] } }>(`/search?${params}`);
    return (r?.tracks?.items ?? []).filter((t): t is RawTrack => !!t?.id).map(toTrack);
  }

  async track(id: string): Promise<SpotifyTrack> {
    return toTrack((await this.request<RawTrack>(`/tracks/${encodeURIComponent(id)}`))!);
  }

  /** Reproduce en el dispositivo indicado (el reproductor de la propia página) desde una posición. */
  async play(deviceId: string, trackId: string, positionMs: number): Promise<void> {
    await this.request(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
      method: 'PUT',
      body: JSON.stringify({
        uris: [`spotify:track:${trackId}`],
        position_ms: Math.max(0, Math.round(positionMs)),
      }),
    });
  }
}
