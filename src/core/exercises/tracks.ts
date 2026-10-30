import type { Clef, CourseProgress } from '../storage/types';

export type { CourseProgress };

export type TrackId = 'treble' | 'bass' | 'both';

export type PoolNote = { midi: number; clef: Clef };

export type Track = {
  id: TrackId;
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

export const TRACKS: Record<TrackId, Track> = {
  treble: { id: 'treble', order: TREBLE, initial: 3 },
  bass: { id: 'bass', order: BASS, initial: 3 },
  // "Ambas" no tiene orden propio: usa lo desbloqueado en Sol y en Fa.
  both: { id: 'both', order: [], initial: 0 },
};

export const TRACK_IDS: TrackId[] = ['treble', 'bass', 'both'];

export function unlockedCount(trackId: TrackId, progress: CourseProgress | undefined): number {
  const track = TRACKS[trackId];
  return Math.min(track.order.length, Math.max(track.initial, progress?.unlocked ?? track.initial));
}

/** Notas con las que se practica en una pista. */
export function trackPool(
  trackId: TrackId,
  progress: Partial<Record<TrackId, CourseProgress>>,
): PoolNote[] {
  if (trackId === 'both') {
    return [...trackPool('treble', progress), ...trackPool('bass', progress)];
  }
  return TRACKS[trackId].order.slice(0, unlockedCount(trackId, progress[trackId]));
}

/** Siguiente nota por desbloquear, o null si la pista está completa (o es "Ambas"). */
export function nextNote(trackId: TrackId, progress: CourseProgress | undefined): PoolNote | null {
  const track = TRACKS[trackId];
  return track.order[unlockedCount(trackId, progress)] ?? null;
}
