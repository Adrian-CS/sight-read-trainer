import { buildMusicXml } from '../score/buildMusicXml';
import type { PoolNote, TrackId } from './tracks';

const LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToToken(midi: number): string {
  return `${LETTERS[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export const NOTES_PER_MEASURE = 4;

/**
 * Ejercicio de lectura de notas sueltas en negras, 4 por compás.
 * Pistas de una clave: un pentagrama. "Ambas": sistema de piano, cada nota en su pentagrama
 * y silencio en el otro.
 */
export function noteExerciseXml(trackId: TrackId, sequence: PoolNote[]): string {
  const measures: PoolNote[][] = [];
  for (let i = 0; i < sequence.length; i += NOTES_PER_MEASURE) {
    measures.push(sequence.slice(i, i + NOTES_PER_MEASURE));
  }
  // Completar el último compás con silencios.
  const pad = (m: string[]) => [...m, ...Array(NOTES_PER_MEASURE - m.length).fill('r:q')].join(' ');

  const base = { title: '', beats: 4, beatType: 4, keyFifths: 0 };
  if (trackId === 'both') {
    return buildMusicXml({
      ...base,
      right: measures.map((m) =>
        pad(m.map((n) => (n.clef === 'treble' ? `${midiToToken(n.midi)}:q` : 'r:q'))),
      ),
      left: measures.map((m) =>
        pad(m.map((n) => (n.clef === 'bass' ? `${midiToToken(n.midi)}:q` : 'r:q'))),
      ),
    });
  }
  return buildMusicXml({
    ...base,
    clef: trackId === 'bass' ? 'F' : 'G',
    right: measures.map((m) => pad(m.map((n) => `${midiToToken(n.midi)}:q`))),
  });
}
