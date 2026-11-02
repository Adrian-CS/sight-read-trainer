import { SDK_URL } from './config';

/* Tipos mínimos del Web Playback SDK (https://sdk.scdn.co/spotify-player.js). */
export type SdkState = {
  position: number;
  duration: number;
  paused: boolean;
  track_window: { current_track: { id: string | null; uri: string } | null };
};

type SdkError = { message: string };

export interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: 'ready' | 'not_ready', cb: (e: { device_id: string }) => void): boolean;
  addListener(event: 'player_state_changed', cb: (state: SdkState | null) => void): boolean;
  addListener(
    event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error',
    cb: (e: SdkError) => void,
  ): boolean;
  getCurrentState(): Promise<SdkState | null>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(ms: number): Promise<void>;
  activateElement(): Promise<void>;
}

type SpotifyNamespace = {
  Player: new (options: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }) => SdkPlayer;
};

declare global {
  interface Window {
    Spotify?: SpotifyNamespace;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

let sdkPromise: Promise<SpotifyNamespace> | null = null;

/** Carga el SDK una sola vez. */
export function loadSdk(): Promise<SpotifyNamespace> {
  sdkPromise ??= new Promise((resolve, reject) => {
    if (window.Spotify) return resolve(window.Spotify);
    window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify!);
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error('No se pudo cargar el reproductor de Spotify (¿sin conexión?)'));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export type PlayerError = {
  kind: 'initialization' | 'authentication' | 'account' | 'playback';
  message: string;
};

/** Reproductor de Spotify dentro de la propia página: un "dispositivo" más de la cuenta. */
export class WebPlayer {
  private stateListeners = new Set<(state: SdkState | null) => void>();
  private errorListeners = new Set<(error: PlayerError) => void>();
  private deviceListeners = new Set<(deviceId: string | null) => void>();
  deviceId: string | null = null;

  private constructor(readonly sdk: SdkPlayer) {
    sdk.addListener('ready', ({ device_id }) => this.setDevice(device_id));
    sdk.addListener('not_ready', () => this.setDevice(null));
    sdk.addListener('player_state_changed', (state) =>
      this.stateListeners.forEach((l) => l(state)),
    );
    const forward = (kind: PlayerError['kind']) => (e: SdkError) =>
      this.errorListeners.forEach((l) => l({ kind, message: e.message }));
    sdk.addListener('initialization_error', forward('initialization'));
    sdk.addListener('authentication_error', forward('authentication'));
    sdk.addListener('account_error', forward('account'));
    sdk.addListener('playback_error', forward('playback'));
  }

  static async create(getToken: () => Promise<string | null>): Promise<WebPlayer> {
    const Spotify = await loadSdk();
    const sdk = new Spotify.Player({
      name: 'Sightread Trainer',
      volume: 0.8,
      getOAuthToken: (cb) => {
        void getToken().then((token) => token && cb(token));
      },
    });
    const player = new WebPlayer(sdk);
    await sdk.connect();
    return player;
  }

  private setDevice(id: string | null) {
    this.deviceId = id;
    this.deviceListeners.forEach((l) => l(id));
  }

  /** Espera a que el SDK registre el dispositivo (evento "ready"). */
  waitForDevice(timeoutMs = 10_000): Promise<string> {
    if (this.deviceId) return Promise.resolve(this.deviceId);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error('El reproductor de Spotify no responde'));
      }, timeoutMs);
      const off = this.onDevice((id) => {
        if (!id) return;
        clearTimeout(timer);
        off();
        resolve(id);
      });
    });
  }

  onDevice(listener: (deviceId: string | null) => void): () => void {
    this.deviceListeners.add(listener);
    return () => this.deviceListeners.delete(listener);
  }

  onState(listener: (state: SdkState | null) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onError(listener: (error: PlayerError) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  disconnect(): void {
    this.sdk.disconnect();
    this.stateListeners.clear();
    this.errorListeners.clear();
    this.deviceListeners.clear();
  }
}
