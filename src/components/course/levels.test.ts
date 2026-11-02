import { describe, expect, it } from 'vitest';
import { LEVEL_COUNTS, LEVEL_TRACK_IDS } from '@/core/exercises';
import { LEVEL_NAME_KEYS, levelName } from './levels';

describe('nombres de nivel', () => {
  it('hay un nombre por cada nivel definido en el curso', () => {
    for (const track of LEVEL_TRACK_IDS)
      expect(LEVEL_NAME_KEYS[track]).toHaveLength(LEVEL_COUNTS[track]);
    expect(levelName('chords', 1)).toBe('Do, Fa y Sol mayor');
  });
});
