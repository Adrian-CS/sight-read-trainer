import type { NoteInput, NoteListener } from './NoteInput';

/** Une varias entradas en una sola NoteInput. Se pueden añadir entradas después (p. ej. MIDI al conceder permiso). */
export class CompositeInput implements NoteInput {
  private listeners = new Set<NoteListener>();
  private inputs = new Map<NoteInput, () => void>();

  constructor(inputs: NoteInput[] = []) {
    inputs.forEach((input) => this.add(input));
  }

  add(input: NoteInput): void {
    if (this.inputs.has(input)) return;
    const unsubscribe = input.subscribe((event) => {
      for (const listener of this.listeners) listener(event);
    });
    this.inputs.set(input, unsubscribe);
  }

  /** Quita y libera una entrada. */
  remove(input: NoteInput): void {
    this.inputs.get(input)?.();
    this.inputs.delete(input);
    input.dispose();
  }

  subscribe(listener: NoteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    [...this.inputs.keys()].forEach((input) => this.remove(input));
    this.listeners.clear();
  }
}
