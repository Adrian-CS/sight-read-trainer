'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  DEFAULT_FRAGMENT_MS,
  PlaybackClock,
  clampFragment,
  parseTrackId,
  type SpotifyTrack,
  type WebPlayer,
} from '@/core/spotify';
import type { Piece, SyncData } from '@/core/storage/types';
import {
  clearMarks,
  formatMs,
  fractionInMeasure,
  measureAtTime,
  nearestMeasureStart,
  setMark,
} from '@/core/sync/sync';
import { t } from '@/i18n';
import type { ScoreViewHandle } from '../ScoreView';
import { useSpotify } from './SpotifyProvider';
import styles from './SpotifyPanel.module.css';

type Props = {
  piece: Piece;
  sync: SyncData;
  measureTimes: number[];
  /** Compás seleccionado por el usuario (para «Fijar compás N aquí» y «Desde compás N»). */
  currentMeasure: number;
  measureLabel(index: number): string;
  scoreRef: RefObject<ScoreViewHandle | null>;
  /** Durante la práctica no se reproduce (no mezclar audio con la evaluación). */
  disabled: boolean;
  onChange(patch: Partial<Pick<Piece, 'spotify' | 'sync'>>): void;
  /** Compás que suena ahora, o null si no hay reproducción sincronizada. */
  onPlayhead(measure: number | null): void;
  /**
   * Dónde poner los ajustes de sincronización. El reproductor va en la cabecera fija, pero los
   * ajustes van debajo para no tapar la partitura.
   */
  settingsContainer?: HTMLElement | null;
};

const POLL_MS = 250;
const FOLLOW_KEY = 'sightread:spotifyFollow';
const DEBUG_KEY = 'sightread:spotifyDebug';

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // sin almacenamiento: solo se pierde la preferencia
  }
}

export function SpotifyPanel(props: Props) {
  const {
    piece,
    sync,
    measureTimes,
    currentMeasure,
    measureLabel,
    disabled,
    onChange,
    settingsContainer,
  } = props;
  const spotify = useSpotify();
  const track = piece.spotify;
  const [choosing, setChoosing] = useState(false);
  const [player, setPlayer] = useState<WebPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [follow, setFollow] = useState(true);
  const followRef = useRef(true);
  const [debug, setDebug] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const clock = useRef(new PlaybackClock());
  const stopAt = useRef<number | null>(null);
  const positionRef = useRef<HTMLSpanElement>(null);
  const debugRef = useRef<HTMLSpanElement>(null);
  const lastMeasure = useRef<number | null>(null);
  /** La canción que suena es la de la pieza (no otra puesta desde la app de Spotify). */
  const ownTrack = useRef(false);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });

  useEffect(() => {
    // Preferencias guardadas en el navegador.
    setFollow((followRef.current = readFlag(FOLLOW_KEY, true)));
    setDebug(readFlag(DEBUG_KEY, false));
  }, []);

  // Preparar el reproductor en cuanto hay canción: el primer play debe salir de un toque
  // (activateElement), así que no puede esperar a que se cargue el SDK.
  const connected = spotify.status === 'connected';
  const { getPlayer, reportError } = spotify;
  useEffect(() => {
    if (!connected || !track) return;
    let cancelled = false;
    getPlayer()
      .then((p) => !cancelled && setPlayer(p))
      .catch((err) => !cancelled && setError(reportError(err)));
    return () => {
      cancelled = true;
    };
  }, [connected, track, getPlayer, reportError]);

  useEffect(() => {
    if (!player) return;
    const offState = player.onState((state) => {
      if (!state) return;
      const trackId = live.current.piece.spotify?.trackId;
      ownTrack.current = !!trackId && state.track_window.current_track?.id === trackId;
      clock.current.update(state.position, state.paused, performance.now());
      setPlaying(!state.paused);
    });
    const offError = player.onError((e) => {
      setError(
        e.kind === 'account'
          ? 'Spotify necesita una cuenta Premium para reproducir en la app.'
          : e.kind === 'authentication'
            ? 'La sesión de Spotify ha caducado. Vuelve a conectar.'
            : e.kind === 'initialization'
              ? 'Este navegador no puede reproducir Spotify (necesita contenido protegido/DRM).'
              : `Spotify: ${e.message}`,
      );
    });
    return () => {
      offState();
      offError();
    };
  }, [player]);

  /** Coloca la línea de reproducción según la posición actual. */
  const showPosition = useCallback((pos: number) => {
    const { measureTimes: times, scoreRef, onPlayhead } = live.current;
    if (positionRef.current) positionRef.current.textContent = formatMs(pos);
    const count = times.length - 1;
    const m = measureAtTime(times, pos);
    const inside = ownTrack.current && m >= 0 && m < count;
    const fraction = inside ? fractionInMeasure(times, m, pos) : 0;
    if (debugRef.current) {
      debugRef.current.textContent = t('spotify.debugLine', {
        heard: formatMs(pos),
        measure: inside ? live.current.measureLabel(m) : '—',
        percent: Math.round(fraction * 100),
      });
    }
    if (!followRef.current || !inside) {
      scoreRef.current?.setPlayhead(null);
      if (lastMeasure.current !== null) onPlayhead(null);
      lastMeasure.current = null;
      return;
    }
    scoreRef.current?.setPlayhead(m, fraction);
    if (lastMeasure.current !== m) {
      lastMeasure.current = m;
      onPlayhead(m);
    }
  }, []);

  // Mientras suena: leer el estado cada 250 ms e interpolar en cada fotograma.
  useEffect(() => {
    if (!player || !playing) return;
    const playback = clock.current;
    const poll = setInterval(() => {
      void player.sdk.getCurrentState().then((state) => {
        if (state) clock.current.update(state.position, state.paused, performance.now());
      });
    }, POLL_MS);
    let raf = 0;
    const frame = () => {
      const pos = clock.current.position(performance.now());
      if (stopAt.current !== null && pos >= stopAt.current) {
        stopAt.current = null;
        void player.sdk.pause();
      }
      showPosition(pos);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      clearInterval(poll);
      cancelAnimationFrame(raf);
      showPosition(playback.position(performance.now()));
    };
  }, [player, playing, showPosition]);

  // Al empezar a practicar o salir de la pieza, pausar.
  useEffect(() => {
    if (disabled && playing) void player?.sdk.pause();
  }, [disabled, playing, player]);
  useEffect(
    () => () => {
      if (ownTrack.current) void player?.sdk.pause();
      live.current.onPlayhead(null);
    },
    [player],
  );

  const play = (fromMs: number, untilMs: number | null) => {
    if (!player || !track) return;
    // Debe ejecutarse en el propio toque, antes de cualquier await (reproducción automática en móvil).
    void player.sdk.activateElement();
    setError(null);
    stopAt.current = untilMs;
    ownTrack.current = true;
    void (async () => {
      try {
        const deviceId = await player.waitForDevice();
        await spotify.api.play(deviceId, track.trackId, fromMs);
        clock.current.update(fromMs, false, performance.now());
        setPlaying(true);
      } catch (err) {
        setError(spotify.reportError(err));
      }
    })();
  };

  const pause = () => {
    stopAt.current = null;
    void player?.sdk.pause();
  };

  const now = () => clock.current.position(performance.now());

  const mark = (measure: number, label: string) => {
    const pos = now();
    onChange({ sync: setMark(sync, measure, pos) });
    setMessage(t('spotify.tapped', { n: label, time: formatMs(pos) }));
  };

  const tap = () => {
    const m = nearestMeasureStart(measureTimes, now());
    mark(m, measureLabel(m));
  };

  const setFragment = (edge: 'start' | 'end') => {
    if (!track) return;
    const pos = now();
    const duration = track.durationMs ?? Number.MAX_SAFE_INTEGER;
    const next =
      edge === 'start'
        ? clampFragment(pos, Math.max(track.endMs, pos + 1000), duration)
        : clampFragment(track.startMs, pos, duration);
    onChange({ spotify: { ...track, ...next } });
  };

  if (spotify.status === 'loading') return null;

  if (!connected) {
    return (
      <section className={`card ${styles.panel}`}>
        <div className={styles.row}>
          <span className={styles.brand}>Spotify</span>
          <span className="muted">{t('spotify.intro')}</span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void spotify.login(window.location.pathname + window.location.search)}
          >
            {t('spotify.connect')}
          </button>
        </div>
      </section>
    );
  }

  if (!track || choosing) {
    return (
      <section className={`card ${styles.panel}`}>
        <TrackSearch
          onPick={(picked) => {
            const { startMs, endMs } = clampFragment(0, DEFAULT_FRAGMENT_MS, picked.durationMs);
            onChange({
              spotify: {
                trackId: picked.id,
                startMs,
                endMs,
                name: picked.name,
                artists: picked.artists,
                imageUrl: picked.imageUrl,
                durationMs: picked.durationMs,
              },
            });
            setChoosing(false);
          }}
          onCancel={track ? () => setChoosing(false) : undefined}
        />
        {(error || spotify.accountError) && (
          <p className="notice">{spotify.accountError ?? error}</p>
        )}
      </section>
    );
  }

  const ready = !!player && !disabled;
  const marks = Object.keys(sync.marks).length;

  const settings = (
    <section className={`card ${styles.panel} ${styles.settings}`}>
      <details className={styles.details}>
        <summary>
          {t('spotify.sync')} ·{' '}
          {t('spotify.fragment', { from: formatMs(track.startMs), to: formatMs(track.endMs) })}
          {marks > 0 && ` · ${t('spotify.marks', { n: marks })}`}
        </summary>
        <p className={`muted ${styles.hint}`}>{t('spotify.syncHint')}</p>
        <div className={styles.group}>
          <span className="muted">
            {t('spotify.fragment', { from: formatMs(track.startMs), to: formatMs(track.endMs) })}
          </span>
          <button
            type="button"
            className="btn"
            disabled={!playing}
            onClick={() => setFragment('start')}
          >
            {t('spotify.fragmentStart')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!playing}
            onClick={() => setFragment('end')}
          >
            {t('spotify.fragmentEnd')}
          </button>
        </div>
        <div className={styles.group}>
          <span className="muted">{t('spotify.bpm')}</span>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() =>
              onChange({ sync: { ...sync, bpm: Math.max(20, Math.round(sync.bpm - 1)) } })
            }
          >
            −
          </button>
          <output className={styles.bpm}>{Math.round(sync.bpm)}</output>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() =>
              onChange({ sync: { ...sync, bpm: Math.min(300, Math.round(sync.bpm + 1)) } })
            }
          >
            +
          </button>
          <button
            type="button"
            className="btn"
            disabled={!playing}
            onClick={() => mark(0, measureLabel(0))}
          >
            {t('spotify.startHere')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!playing}
            onClick={() => mark(currentMeasure, measureLabel(currentMeasure))}
          >
            {t('spotify.markHere', { n: measureLabel(currentMeasure) })}
          </button>
          <button
            type="button"
            className="btn"
            disabled={marks === 0}
            onClick={() => onChange({ sync: clearMarks(sync) })}
          >
            {t('spotify.clearMarks')}
          </button>
        </div>
        <div className={styles.group}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={follow}
              onChange={(e) => {
                setFollow((followRef.current = e.target.checked));
                writeFlag(FOLLOW_KEY, e.target.checked);
                showPosition(now());
              }}
            />
            {t('spotify.follow')}
          </label>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={debug}
              onChange={(e) => {
                setDebug(e.target.checked);
                writeFlag(DEBUG_KEY, e.target.checked);
              }}
            />
            {t('spotify.debug')}
          </label>
          <button type="button" className="btn" onClick={() => setChoosing(true)}>
            {t('spotify.change')}
          </button>
          <button type="button" className="btn" onClick={() => void spotify.logout()}>
            {t('spotify.disconnect')}
          </button>
        </div>
        {spotify.profile && (
          <p className="muted">{t('spotify.connectedAs', { name: spotify.profile.displayName })}</p>
        )}
      </details>
    </section>
  );

  return (
    <section className={`card ${styles.panel}`}>
      <div className={styles.row}>
        {track.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- carátula externa; el export estático no optimiza imágenes
          <img src={track.imageUrl} alt="" className={styles.cover} width={40} height={40} />
        )}
        <span className={styles.track}>
          <strong>{track.name ?? track.trackId}</strong>
          {track.artists?.length ? (
            <span className="muted"> · {track.artists.join(', ')}</span>
          ) : null}
        </span>
        <span className={styles.transport}>
          {playing ? (
            <button type="button" className="btn" onClick={pause}>
              ⏸ {t('spotify.pause')}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!ready}
                onClick={() => play(track.startMs, track.endMs)}
              >
                ▶ {t('spotify.playFragment')}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!ready}
                onClick={() => play(measureTimes[currentMeasure] ?? 0, null)}
              >
                ▶ {t('spotify.playFromMeasure', { n: measureLabel(currentMeasure) })}
              </button>
            </>
          )}
          <span ref={positionRef} className={styles.position}>
            0:00.0
          </span>
          <button type="button" className="btn" disabled={!playing} onClick={tap}>
            {t('spotify.tap')}
          </button>
        </span>
      </div>
      {!player && !error && <p className="muted">{t('spotify.loadingPlayer')}</p>}
      {disabled && <p className="muted">{t('spotify.practicing')}</p>}
      {(error || spotify.accountError) && <p className="notice">{spotify.accountError ?? error}</p>}
      {message && <p className={`muted ${styles.message}`}>{message}</p>}
      {debug && <span ref={debugRef} className={`muted ${styles.debug}`} />}

      {settingsContainer ? createPortal(settings, settingsContainer) : settings}
    </section>
  );
}

function TrackSearch({
  onPick,
  onCancel,
}: {
  onPick(track: SpotifyTrack): void;
  onCancel?: () => void;
}) {
  const { api, reportError } = useSpotify();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotifyTrack[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const id = parseTrackId(query);
      setResults(id ? [await api.track(id)] : await api.searchTracks(query));
    } catch (err) {
      setError(reportError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form className={styles.search} onSubmit={(e) => void submit(e)}>
        <span className={styles.brand}>Spotify</span>
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('spotify.searchLabel')}
          placeholder={t('spotify.searchPlaceholder')}
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? t('spotify.searching') : t('spotify.search')}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            {t('spotify.cancel')}
          </button>
        )}
      </form>
      {error && <p className="notice">{error}</p>}
      {results?.length === 0 && <p className="muted">{t('spotify.noResults')}</p>}
      {!!results?.length && (
        <ul className={styles.results}>
          {results.map((r) => (
            <li key={r.id}>
              {r.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- carátula externa; el export estático no optimiza imágenes
                <img src={r.imageUrl} alt="" className={styles.cover} width={40} height={40} />
              )}
              <span className={styles.track}>
                <strong>{r.name}</strong>
                <span className="muted">
                  {' '}
                  · {r.artists.join(', ')} · {formatMs(r.durationMs).replace(/\.\d$/, '')}
                </span>
              </span>
              <button type="button" className="btn" onClick={() => onPick(r)}>
                {t('spotify.choose')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
