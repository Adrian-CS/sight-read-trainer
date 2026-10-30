import { describe, expect, it } from 'vitest';
import { isBlackKey, midiToName, octave, pitchClass } from './notes';

describe('notes', () => {
  it('nombra el Do central como Do4 / C4', () => {
    expect(midiToName(60)).toBe('Do4');
    expect(midiToName(60, 'letter')).toBe('C4');
  });

  it('calcula octava y clase de altura', () => {
    expect(octave(21)).toBe(0); // La0, tecla más grave del piano
    expect(midiToName(21)).toBe('La0');
    expect(pitchClass(61)).toBe(1);
    expect(midiToName(108)).toBe('Do8');
  });

  it('detecta teclas negras', () => {
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(64)).toBe(false);
    expect(isBlackKey(70)).toBe(true);
  });
});
