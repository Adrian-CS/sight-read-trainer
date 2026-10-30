import type { Step } from './steps';

export type WaitResult =
  | { type: 'ignored' }
  /** Nota correcta, pero faltan otras del acorde. */
  | { type: 'partial'; midi: number }
  | { type: 'wrong'; midi: number; step: Step }
  | {
      type: 'advance';
      step: Step;
      reactionMs: number;
      hadErrors: boolean;
      next: Step | null;
      looped: boolean;
    };

export type StepOutcome = { step: Step; errors: number; reactionMs: number };

/**
 * Modo espera: el cursor solo avanza cuando suenan todas las notas del paso actual
 * dentro de la ventana de acorde. Sin tempo ni presión.
 */
export class WaitModeEngine {
  private index = 0;
  private hits = new Map<number, number>(); // midi -> momento del noteon
  private stepStart: number | null = null;
  private stepErrors = 0;
  readonly outcomes: StepOutcome[] = [];
  private finished = false;

  constructor(
    private readonly steps: Step[],
    private readonly options: { chordWindowMs: number; loop: boolean },
  ) {}

  get current(): Step | null {
    return this.finished ? null : (this.steps[this.index] ?? null);
  }

  get isFinished(): boolean {
    return this.finished || this.steps.length === 0;
  }

  /** Marca el inicio del tiempo de reacción del paso actual (al empezar). */
  start(time: number): void {
    this.stepStart = time;
  }

  noteOn(midi: number, time: number): WaitResult {
    const step = this.current;
    if (!step) return { type: 'ignored' };
    if (this.stepStart === null) this.stepStart = time;

    if (!step.notes.some((n) => n.midi === midi)) {
      this.stepErrors++;
      return { type: 'wrong', midi, step };
    }

    this.hits.set(midi, time);
    // Olvidar pulsaciones demasiado antiguas: el acorde debe sonar junto.
    for (const [m, t] of this.hits) if (time - t > this.options.chordWindowMs) this.hits.delete(m);
    if (!step.notes.every((n) => this.hits.has(n.midi))) return { type: 'partial', midi };

    const reactionMs = Math.max(0, time - this.stepStart);
    const hadErrors = this.stepErrors > 0;
    this.outcomes.push({ step, errors: this.stepErrors, reactionMs });
    this.hits.clear();
    this.stepErrors = 0;
    this.stepStart = time;

    let looped = false;
    this.index++;
    if (this.index >= this.steps.length) {
      if (this.options.loop) {
        this.index = 0;
        looped = true;
      } else {
        this.finished = true;
      }
    }
    return { type: 'advance', step, reactionMs, hadErrors, next: this.current, looped };
  }
}
