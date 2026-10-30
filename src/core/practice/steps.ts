import type { ClefSign, ScoreModel } from '../score/model';
import type { Clef, Hand } from '../storage/types';

export type ExpectedNote = { midi: number; staff: number; clef: Clef };

/** Un instante de la partitura en el que hay que tocar una o varias notas a la vez. */
export type Step = {
  measure: number;
  /** Inicio en negras desde el principio del compás. */
  onset: number;
  /** Inicio en negras desde el principio de la pieza. */
  time: number;
  notes: ExpectedNote[];
};

export type Range = { from: number; to: number };

/** Pentagramas que corresponden a cada mano: el superior es la derecha, el siguiente la izquierda. */
export function stavesForHand(score: ScoreModel, hand: Hand): Set<number> {
  const all = score.staves.map((s) => s.index);
  if (hand === 'both') return new Set(all);
  if (all.length < 2) return new Set(hand === 'right' ? all : []);
  return new Set([hand === 'right' ? all[0] : all[1]]);
}

const clefOf = (sign: ClefSign | undefined): Clef => (sign === 'F' ? 'bass' : 'treble');

/** Inicio de cada compás en negras desde el principio (las anacrusas cuentan lo que duran). */
export function measureStarts(score: ScoreModel): number[] {
  const starts: number[] = [];
  let t = 0;
  for (const m of score.measures) {
    starts.push(t);
    t += m.length || (m.beats * 4) / m.beatType;
  }
  starts.push(t);
  return starts;
}

/**
 * Pasos a tocar dentro de un rango de compases (incluido), solo con los pentagramas de la mano elegida.
 * Las notas de continuación de una ligadura no se vuelven a tocar y se omiten.
 */
export function buildSteps(score: ScoreModel, hand: Hand, range?: Range): Step[] {
  const staves = stavesForHand(score, hand);
  const starts = measureStarts(score);
  const from = Math.max(0, range?.from ?? 0);
  const to = Math.min(score.measures.length - 1, range?.to ?? score.measures.length - 1);
  const clefByStaff = new Map(score.staves.map((s) => [s.index, clefOf(s.clef)]));
  const steps: Step[] = [];

  for (let i = from; i <= to; i++) {
    const byOnset = new Map<number, ExpectedNote[]>();
    for (const n of score.measures[i].notes) {
      if (n.tieStop || !staves.has(n.staff)) continue;
      const list = byOnset.get(n.onset) ?? [];
      // La misma tecla en dos voces se toca una sola vez.
      if (!list.some((e) => e.midi === n.midi)) {
        list.push({ midi: n.midi, staff: n.staff, clef: clefByStaff.get(n.staff) ?? 'treble' });
      }
      byOnset.set(n.onset, list);
    }
    for (const onset of [...byOnset.keys()].sort((a, b) => a - b)) {
      steps.push({ measure: i, onset, time: starts[i] + onset, notes: byOnset.get(onset)! });
    }
  }
  return steps;
}
