import type { Clef, CourseProgress } from '../storage/types';

export type { CourseProgress };

import { CHORD_LEVELS, INTERVAL_LEVEL_COUNT } from './harmony';
import { RHYTHM_LEVELS } from './rhythm';

/** Pistas de lectura de notas sueltas: se desbloquean nota a nota. */
export type NoteTrackId = 'treble' | 'bass' | 'both';
/** Pistas de ritmo, intervalos y acordes: se desbloquean por niveles. */
export type LevelTrackId = 'rhythm' | 'intervals' | 'chords';
export type TrackId = NoteTrackId | LevelTrackId;

export type PoolNote = { midi: number; clef: Clef };

export type Track = {
  id: NoteTrackId;
  /** Orden en que se desbloquean las notas (solo pistas de una clave). */
  order: PoolNote[];
  /** Notas desbloqueadas al empezar. */
  initial: number;
};

const notes = (clef: Clef, midis: number[]): PoolNote[] => midis.map((midi) => ({ midi, clef }));

/**
 * Clave de Sol: posición de cinco dedos de Do (Do4–Sol4), después hacia arriba hasta Sol5
 * y por último las notas con líneas adicionales por debajo.
 */
const TREBLE = notes('treble', [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 59, 57, 81]);

/**
 * Clave de Fa: posición de cinco dedos de la mano izquierda (Do3–Sol3), después hacia abajo
 * hasta Do2 y por último hacia el Do central.
 */
const BASS = notes('bass', [48, 50, 52, 53, 55, 47, 45, 43, 41, 40, 38, 36, 57, 59, 60]);

export const TRACKS: Record<NoteTrackId, Track> = {
  treble: { id: 'treble', order: TREBLE, initial: 3 },
  bass: { id: 'bass', order: BASS, initial: 3 },
  // "Ambas" no tiene orden propio: usa lo desbloqueado en Sol y en Fa.
  both: { id: 'both', order: [], initial: 0 },
};

export const NOTE_TRACK_IDS: NoteTrackId[] = ['treble', 'bass', 'both'];
export const LEVEL_TRACK_IDS: LevelTrackId[] = ['rhythm', 'intervals', 'chords'];
export const TRACK_IDS: TrackId[] = [...NOTE_TRACK_IDS, ...LEVEL_TRACK_IDS];

export const isLevelTrack = (id: TrackId): id is LevelTrackId =>
  (LEVEL_TRACK_IDS as TrackId[]).includes(id);

export const LEVEL_COUNTS: Record<LevelTrackId, number> = {
  rhythm: RHYTHM_LEVELS.length,
  intervals: INTERVAL_LEVEL_COUNT,
  chords: CHORD_LEVELS.length,
};

/** Nivel actual (desde 1) de una pista por niveles. */
export function currentLevel(trackId: LevelTrackId, progress: CourseProgress | undefined): number {
  return Math.min(LEVEL_COUNTS[trackId], Math.max(1, progress?.unlocked ?? 1));
}

export function unlockedCount(trackId: NoteTrackId, progress: CourseProgress | undefined): number {
  const track = TRACKS[trackId];
  return Math.min(track.order.length, Math.max(track.initial, progress?.unlocked ?? track.initial));
}

/** Notas con las que se practica en una pista. */
export function trackPool(
  trackId: NoteTrackId,
  progress: Partial<Record<TrackId, CourseProgress>>,
): PoolNote[] {
  if (trackId === 'both') {
    return [...trackPool('treble', progress), ...trackPool('bass', progress)];
  }
  return TRACKS[trackId].order.slice(0, unlockedCount(trackId, progress[trackId]));
}

/** Siguiente nota por desbloquear, o null si la pista está completa (o es "Ambas"). */
export function nextNote(
  trackId: NoteTrackId,
  progress: CourseProgress | undefined,
): PoolNote | null {
  const track = TRACKS[trackId];
  return track.order[unlockedCount(trackId, progress)] ?? null;
}
