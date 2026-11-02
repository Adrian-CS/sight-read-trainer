import type { LevelTrackId } from '@/core/exercises';
import { t, type MessageKey } from '@/i18n';

export const LEVEL_NAME_KEYS: Record<LevelTrackId, MessageKey[]> = {
  rhythm: [
    'level.rhythm.1',
    'level.rhythm.2',
    'level.rhythm.3',
    'level.rhythm.4',
    'level.rhythm.5',
  ],
  intervals: ['level.intervals.1', 'level.intervals.2', 'level.intervals.3'],
  chords: ['level.chords.1', 'level.chords.2', 'level.chords.3'],
};

/** Nombre del nivel `n` (desde 1) de una pista. */
export function levelName(track: LevelTrackId, n: number): string {
  const key = LEVEL_NAME_KEYS[track][n - 1];
  return key ? t(key) : String(n);
}
