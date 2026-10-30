import type { ClefSign, ScoreMeasure } from './model';

/** Posición diatónica de la línea inferior de cada clave (Mi4, Sol2, Fa3). */
const BOTTOM_LINE: Record<ClefSign, number> = {
  G: 4 * 7 + 2,
  F: 2 * 7 + 4,
  C: 3 * 7 + 3,
  percussion: 4 * 7 + 2,
};

const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B (índices de letra)
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F

/** Alteración que la armadura aplica a cada letra (0 = Do ... 6 = Si). */
export function keyAlterations(fifths: number): number[] {
  const alter = [0, 0, 0, 0, 0, 0, 0];
  const order = fifths >= 0 ? SHARP_ORDER : FLAT_ORDER;
  for (let i = 0; i < Math.min(7, Math.abs(fifths)); i++) alter[order[i]] = fifths >= 0 ? 1 : -1;
  return alter;
}

export type MiniNote = {
  /** 0-1 a lo largo del compás. */
  x: number;
  /** Pasos (medio espacio) por encima de la línea inferior: 0 = línea inferior, 8 = superior. */
  step: number;
  hollow: boolean;
  accidental: '♯' | '♭' | '♮' | null;
  /** Pasos de las líneas adicionales necesarias. */
  ledgers: number[];
};

/** Notas de un compás listas para dibujar en un mini pentagrama. */
export function miniStaffNotes(measure: ScoreMeasure, staff: number, clef: ClefSign): MiniNote[] {
  const length = measure.length || (measure.beats * 4) / measure.beatType;
  const keyAlter = keyAlterations(measure.keyFifths);
  return measure.notes
    .filter((n) => n.staff === staff)
    .map((n) => {
      const step = n.diatonic - BOTTOM_LINE[clef];
      const letter = ((n.diatonic % 7) + 7) % 7;
      const alter = Math.round(n.alter);
      const accidental =
        alter === keyAlter[letter] ? null : alter > 0 ? '♯' : alter < 0 ? '♭' : '♮';
      const ledgers: number[] = [];
      for (let s = -2; s >= step; s -= 2) ledgers.push(s);
      for (let s = 10; s <= step; s += 2) ledgers.push(s);
      return {
        x: length ? n.onset / length : 0,
        step,
        hollow: n.duration >= 2,
        accidental,
        ledgers,
      };
    });
}
