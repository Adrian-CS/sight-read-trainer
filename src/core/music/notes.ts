/** Utilidades de notas basadas en número MIDI (60 = Do central = Do4). */

export type NoteNaming = 'solfege' | 'letter';

const SOLFEGE = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
const LETTER = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export const MIDI_MIN = 0;
export const MIDI_MAX = 127;
export const MIDDLE_C = 60;

export function isValidMidi(midi: number): boolean {
  return Number.isInteger(midi) && midi >= MIDI_MIN && midi <= MIDI_MAX;
}

/** Clase de altura (0 = Do ... 11 = Si). */
export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/** Octava en notación científica: Do central (60) es la octava 4. */
export function octave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitchClass(midi));
}

export function midiToName(midi: number, naming: NoteNaming = 'solfege'): string {
  const names = naming === 'solfege' ? SOLFEGE : LETTER;
  return `${names[pitchClass(midi)]}${octave(midi)}`;
}

/**
 * Compara notas por tecla física: Do♯ y Re♭ son el mismo número MIDI,
 * así que basta comparar números.
 */
export function sameKey(a: number, b: number): boolean {
  return a === b;
}
