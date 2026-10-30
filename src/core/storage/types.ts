import type { MidiDeviceRef } from '../input/MidiInput';

export type Hand = 'right' | 'left' | 'both';
export type Clef = 'treble' | 'bass';

export type SyncData = {
  bpm: number;
  beatsPerMeasure: number;
  startOffsetMs: number;
  /** compás (índice 0) -> ms, marcas manuales */
  marks: Record<number, number>;
};

export type Piece = {
  id: string;
  title: string;
  musicXml: string | Blob;
  createdAt: number;
  spotify?: { trackId: string; startMs: number; endMs: number };
  sync?: SyncData;
  hand: Hand;
};

export type Attempt = {
  id: string;
  pieceId?: string;
  exerciseId?: string;
  date: number;
  accuracy: number;
  durationMs: number;
};

export type NoteStat = {
  midi: number;
  clef: Clef;
  attempts: number;
  errors: number;
  avgReactionMs: number;
  lastSeen: number;
};

export type Settings = {
  midiDevice: MidiDeviceRef | null;
  chordWindowMs: number;
  theme: 'auto' | 'light' | 'dark';
  hand: Hand;
};

export const DEFAULT_SETTINGS: Settings = {
  midiDevice: null,
  chordWindowMs: 150,
  theme: 'auto',
  hand: 'both',
};
