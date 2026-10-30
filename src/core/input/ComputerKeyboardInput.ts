import { DEFAULT_VELOCITY, NoteEmitter, now } from './NoteInput';

/**
 * Mapeo estilo DAW usando KeyboardEvent.code (independiente de la distribución,
 * así que funciona igual en un teclado español: "Semicolon" es la Ñ).
 * Fila central = teclas blancas, fila superior = teclas negras.
 * Desplazamiento en semitonos respecto al Do de la octava base.
 */
export const KEY_MAP: Readonly<Record<string, number>> = {
  KeyA: 0, // Do
  KeyW: 1, // Do♯
  KeyS: 2, // Re
  KeyE: 3, // Re♯
  KeyD: 4, // Mi
  KeyF: 5, // Fa
  KeyT: 6, // Fa♯
  KeyG: 7, // Sol
  KeyY: 8, // Sol♯
  KeyH: 9, // La
  KeyU: 10, // La♯
  KeyJ: 11, // Si
  KeyK: 12, // Do
  KeyO: 13, // Do♯
  KeyL: 14, // Re
  KeyP: 15, // Re♯
  Semicolon: 16, // Mi
};

export const OCTAVE_DOWN_KEY = 'KeyZ';
export const OCTAVE_UP_KEY = 'KeyX';

type KeyLike = Pick<KeyboardEvent, 'code' | 'repeat' | 'ctrlKey' | 'metaKey' | 'altKey'> & {
  target?: EventTarget | null;
  preventDefault?: () => void;
};

function isEditable(target: EventTarget | null | undefined): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const el = target as HTMLElement;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export class ComputerKeyboardInput extends NoteEmitter {
  readonly source = 'computer' as const;
  /** Do de la octava base (por defecto Do central). */
  private baseMidi: number;
  /** code -> midi que sonó al pulsar, para soltar la nota correcta aunque cambie la octava. */
  private held = new Map<string, number>();
  private octaveListeners = new Set<(baseMidi: number) => void>();

  private readonly onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
  private readonly onKeyUp = (e: KeyboardEvent) => this.handleKeyUp(e);
  private readonly onBlur = () => this.releaseAll();

  constructor(
    private readonly target: EventTarget | null = typeof window !== 'undefined' ? window : null,
    baseMidi = 60,
  ) {
    super();
    this.baseMidi = baseMidi;
    this.target?.addEventListener('keydown', this.onKeyDown as EventListener);
    this.target?.addEventListener('keyup', this.onKeyUp as EventListener);
    this.target?.addEventListener('blur', this.onBlur);
  }

  get octaveBase(): number {
    return this.baseMidi;
  }

  onOctaveChange(listener: (baseMidi: number) => void): () => void {
    this.octaveListeners.add(listener);
    return () => this.octaveListeners.delete(listener);
  }

  shiftOctave(delta: number): void {
    const next = this.baseMidi + delta * 12;
    // Que todo el rango mapeado (base + 16) quede dentro de 0-127.
    if (next < 0 || next + 16 > 127) return;
    this.baseMidi = next;
    this.octaveListeners.forEach((listener) => listener(next));
  }

  handleKeyDown(e: KeyLike): void {
    if (e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) return;
    if (e.code === OCTAVE_DOWN_KEY || e.code === OCTAVE_UP_KEY) {
      if (!e.repeat) this.shiftOctave(e.code === OCTAVE_UP_KEY ? 1 : -1);
      e.preventDefault?.();
      return;
    }
    const offset = KEY_MAP[e.code];
    if (offset === undefined) return;
    e.preventDefault?.();
    if (e.repeat || this.held.has(e.code)) return;
    const midi = this.baseMidi + offset;
    this.held.set(e.code, midi);
    this.emit({
      type: 'noteon',
      midi,
      velocity: DEFAULT_VELOCITY,
      time: now(),
      source: this.source,
    });
  }

  handleKeyUp(e: Pick<KeyboardEvent, 'code'>): void {
    const midi = this.held.get(e.code);
    if (midi === undefined) return;
    this.held.delete(e.code);
    this.emit({ type: 'noteoff', midi, velocity: 0, time: now(), source: this.source });
  }

  releaseAll(): void {
    [...this.held.keys()].forEach((code) => this.handleKeyUp({ code }));
  }

  dispose(): void {
    this.target?.removeEventListener('keydown', this.onKeyDown as EventListener);
    this.target?.removeEventListener('keyup', this.onKeyUp as EventListener);
    this.target?.removeEventListener('blur', this.onBlur);
    this.octaveListeners.clear();
    super.dispose();
  }
}
