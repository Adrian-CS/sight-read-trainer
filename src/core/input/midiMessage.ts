/** Interpretación pura de mensajes MIDI de canal. */

export type ParsedMidiMessage =
  | { type: 'noteon' | 'noteoff'; channel: number; midi: number; velocity: number }
  | { type: 'other' };

export function parseMidiMessage(data: ArrayLike<number> | null | undefined): ParsedMidiMessage {
  if (!data || data.length < 3) return { type: 'other' };
  const status = data[0] & 0xf0;
  const channel = data[0] & 0x0f;
  const midi = data[1] & 0x7f;
  const velocity = data[2] & 0x7f;
  if (status === 0x90 && velocity > 0) return { type: 'noteon', channel, midi, velocity };
  // Note On con velocidad 0 equivale a Note Off (running status de muchos teclados).
  if (status === 0x80 || status === 0x90) return { type: 'noteoff', channel, midi, velocity };
  return { type: 'other' };
}
