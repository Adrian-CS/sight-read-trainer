import type { Step } from './steps';

export type TimedNote = { stepIndex: number; midi: number; expectedAt: number };

export type TempoEvent =
  | { type: 'hit'; note: TimedNote; step: Step; deltaMs: number; stepComplete: boolean }
  | { type: 'miss'; note: TimedNote; step: Step }
  | { type: 'extra'; midi: number; time: number };

export type TempoSummary = {
  hits: number;
  misses: number;
  extras: number;
  /** Desviación media absoluta de los aciertos. */
  meanAbsDeltaMs: number;
};

/**
 * Evaluación de ritmo: cada nota esperada tiene un instante; tocarla con la tecla correcta
 * a menos de `toleranceMs` cuenta como acierto, y si pasa la tolerancia sin tocarla, fallo.
 * Las vueltas del bucle se encadenan añadiendo pasadas con un desfase.
 */
type Pending = TimedNote & { step: Step; pass: number };

export class TempoEvaluator {
  private pending: Pending[] = [];
  private stepRemaining = new Map<string, number>();
  private deltas: number[] = [];
  private misses = 0;
  private extras = 0;
  private pass = 0;

  constructor(
    private readonly steps: Step[],
    /** origin: instante (negras desde el inicio de la pieza) que corresponde a cada `startAt`. */
    private readonly options: { toleranceMs: number; msPerQuarter: number; origin?: number },
  ) {}

  /** Añade una pasada por los pasos empezando en `startAt` (ms, base performance.now()). */
  addPass(startAt: number): void {
    const origin = this.options.origin ?? this.steps[0]?.time ?? 0;
    const pass = this.pass++;
    this.steps.forEach((step, stepIndex) => {
      const expectedAt = startAt + (step.time - origin) * this.options.msPerQuarter;
      this.stepRemaining.set(`${pass}:${stepIndex}`, step.notes.length);
      for (const n of step.notes)
        this.pending.push({ stepIndex, midi: n.midi, expectedAt, step, pass });
    });
  }

  noteOn(midi: number, time: number): TempoEvent {
    const tol = this.options.toleranceMs;
    let best = -1;
    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i];
      if (p.midi !== midi || Math.abs(p.expectedAt - time) > tol) continue;
      if (
        best < 0 ||
        Math.abs(p.expectedAt - time) < Math.abs(this.pending[best].expectedAt - time)
      )
        best = i;
    }
    if (best < 0) {
      this.extras++;
      return { type: 'extra', midi, time };
    }
    const [p] = this.pending.splice(best, 1);
    const key = `${p.pass}:${p.stepIndex}`;
    const remaining = (this.stepRemaining.get(key) ?? 1) - 1;
    this.stepRemaining.set(key, remaining);
    const deltaMs = time - p.expectedAt;
    this.deltas.push(deltaMs);
    return { type: 'hit', note: strip(p), step: p.step, deltaMs, stepComplete: remaining === 0 };
  }

  /** Devuelve las notas que ya no se pueden acertar. */
  tick(time: number): TempoEvent[] {
    const out: TempoEvent[] = [];
    this.pending = this.pending.filter((p) => {
      if (time - p.expectedAt <= this.options.toleranceMs) return true;
      this.misses++;
      out.push({ type: 'miss', note: strip(p), step: p.step });
      return false;
    });
    return out;
  }

  get summary(): TempoSummary {
    const hits = this.deltas.length;
    return {
      hits,
      misses: this.misses,
      extras: this.extras,
      meanAbsDeltaMs: hits ? this.deltas.reduce((a, d) => a + Math.abs(d), 0) / hits : 0,
    };
  }
}

function strip(p: Pending): TimedNote {
  return { stepIndex: p.stepIndex, midi: p.midi, expectedAt: p.expectedAt };
}
