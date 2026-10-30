import { DEFAULT_VELOCITY, NoteEmitter, now } from './NoteInput';

/** Entrada desde el teclado virtual en pantalla: el componente llama a press/release. */
export class OnScreenKeyboardInput extends NoteEmitter {
  readonly source = 'onscreen' as const;
  private held = new Set<number>();

  press(midi: number, velocity = DEFAULT_VELOCITY): void {
    if (this.held.has(midi)) return;
    this.held.add(midi);
    this.emit({ type: 'noteon', midi, velocity, time: now(), source: this.source });
  }

  release(midi: number): void {
    if (!this.held.delete(midi)) return;
    this.emit({ type: 'noteoff', midi, velocity: 0, time: now(), source: this.source });
  }

  releaseAll(): void {
    [...this.held].forEach((midi) => this.release(midi));
  }
}
