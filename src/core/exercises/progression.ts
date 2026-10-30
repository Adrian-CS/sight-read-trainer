import type { StepOutcome } from '../practice/waitMode';

export const UNLOCK_ACCURACY = 0.9;
export const UNLOCK_REACTION_MS = 2000;

export type SessionResult = {
  accuracy: number;
  /** Mediana del tiempo de reacción (menos sensible a una distracción puntual que la media). */
  medianReactionMs: number;
  /** Se cumplen los umbrales para añadir una nota nueva. */
  passed: boolean;
};

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Evalúa un ejercicio terminado frente a los umbrales de desbloqueo. */
export function evaluateSession(outcomes: StepOutcome[]): SessionResult {
  if (!outcomes.length) return { accuracy: 0, medianReactionMs: 0, passed: false };
  const accuracy = outcomes.filter((o) => o.errors === 0).length / outcomes.length;
  // La primera nota incluye el tiempo de situarse: no cuenta para la reacción.
  const medianReactionMs = median(outcomes.slice(1).map((o) => o.reactionMs));
  return {
    accuracy,
    medianReactionMs,
    passed: accuracy >= UNLOCK_ACCURACY && medianReactionMs <= UNLOCK_REACTION_MS,
  };
}
