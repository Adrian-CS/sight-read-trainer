import type { Clef, NoteStat } from '../storage/types';
import type { StepOutcome } from './waitMode';

export type NoteTally = {
  midi: number;
  clef: Clef;
  attempts: number;
  errors: number;
  reactionSum: number;
  reactionCount: number;
};

const key = (midi: number, clef: Clef) => `${midi}:${clef}`;

/** Suma por nota los resultados de una sesión en modo espera. Un fallo cuenta para cada nota del paso. */
export function tallyOutcomes(outcomes: StepOutcome[]): NoteTally[] {
  const map = new Map<string, NoteTally>();
  for (const { step, errors, reactionMs } of outcomes) {
    for (const n of step.notes) {
      const t = map.get(key(n.midi, n.clef)) ?? {
        midi: n.midi,
        clef: n.clef,
        attempts: 0,
        errors: 0,
        reactionSum: 0,
        reactionCount: 0,
      };
      t.attempts++;
      if (errors > 0) t.errors++;
      t.reactionSum += reactionMs;
      t.reactionCount++;
      map.set(key(n.midi, n.clef), t);
    }
  }
  return [...map.values()];
}

/** Combina una cuenta de la sesión con la estadística guardada (media de reacción ponderada). */
export function mergeNoteStat(
  existing: NoteStat | undefined,
  tally: NoteTally,
  now: number,
): NoteStat {
  const base = existing ?? {
    midi: tally.midi,
    clef: tally.clef,
    attempts: 0,
    errors: 0,
    avgReactionMs: 0,
    lastSeen: now,
  };
  const reactionCount = base.attempts + tally.reactionCount;
  const avgReactionMs =
    tally.reactionCount === 0
      ? base.avgReactionMs
      : (base.avgReactionMs * base.attempts + tally.reactionSum) / Math.max(1, reactionCount);
  return {
    midi: tally.midi,
    clef: tally.clef,
    attempts: base.attempts + tally.attempts,
    errors: base.errors + tally.errors,
    avgReactionMs,
    lastSeen: now,
  };
}

/** Precisión de una sesión de espera: pasos acertados a la primera / pasos tocados. */
export function waitAccuracy(outcomes: StepOutcome[]): number {
  if (!outcomes.length) return 0;
  return outcomes.filter((o) => o.errors === 0).length / outcomes.length;
}
