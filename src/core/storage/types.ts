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
  composer?: string;
  measureCount?: number;
  /** Piezas incluidas con la app (se pueden borrar y renombrar igual). */
  sampleId?: string;
  musicXml: string | Blob;
  createdAt: number;
  spotify?: { trackId: string; startMs: number; endMs: number };
  sync?: SyncData;
  hand: Hand;
  /** Tempo elegido para practicar con metrónomo (negras por minuto). */
  practiceBpm?: number;
};

export type Attempt = {
  id: string;
  pieceId?: string;
  exerciseId?: string;
  date: number;
  accuracy: number;
  durationMs: number;
  mode?: 'wait' | 'tempo';
  hand?: Hand;
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
  /** Margen para dar por buena una nota en el modo con tempo. */
  tempoToleranceMs: number;
  theme: 'auto' | 'light' | 'dark';
  hand: Hand;
  /** Ya se añadieron las piezas de ejemplo (para no volver a crearlas si se borran). */
  samplesSeeded: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  midiDevice: null,
  chordWindowMs: 150,
  tempoToleranceMs: 150,
  theme: 'auto',
  hand: 'both',
  samplesSeeded: false,
};

/** Progreso de una pista del curso: cuántas notas de su orden están desbloqueadas. */
export type CourseProgress = { trackId: string; unlocked: number; updatedAt: number };
