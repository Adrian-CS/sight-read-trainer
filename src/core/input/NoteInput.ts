/** Abstracción de entrada de notas. El resto de la app solo conoce NoteInput. */

export type InputSource = 'midi' | 'onscreen' | 'computer';

export type NoteEvent = {
  type: 'noteon' | 'noteoff';
  midi: number;
  /** 0-127. Las entradas sin sensibilidad usan un valor fijo. */
  velocity: number;
  /** Marca de tiempo en ms en la base de performance.now(). */
  time: number;
  source: InputSource;
  /** Nombre del dispositivo, si lo hay (p. ej. "Digital Piano"). */
  deviceName?: string;
};

export type NoteListener = (event: NoteEvent) => void;

export interface NoteInput {
  /** Devuelve una función para darse de baja. */
  subscribe(listener: NoteListener): () => void;
  dispose(): void;
}

/** Base con la gestión de suscriptores, compartida por todas las implementaciones. */
export abstract class NoteEmitter implements NoteInput {
  abstract readonly source: InputSource;
  private listeners = new Set<NoteListener>();

  subscribe(listener: NoteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected emit(event: NoteEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  dispose(): void {
    this.listeners.clear();
  }
}

export const DEFAULT_VELOCITY = 96;

export function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
