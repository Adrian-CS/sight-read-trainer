import { buildMusicXml } from '../score/buildMusicXml';
import { midiToToken } from './generator';
import { shuffle, type Rng } from './random';

/** Algo que se toca de una vez (intervalo armónico o acorde) y que tiene nombre. */
export type HarmonyItem = { id: string; name: string; midis: number[] };

const STEP_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

/** Nota natural a partir de su posición diatónica (Do4 = 28). */
export function midiOfDiatonic(d: number): number {
  return (Math.floor(d / 7) + 1) * 12 + STEP_SEMITONES[((d % 7) + 7) % 7];
}

const C4 = 28;
const G4 = 32;

/** Tamaños de intervalo (2 = segunda… 8 = octava) y nota más aguda permitida, por nivel. */
const INTERVAL_LEVELS: { sizes: number[]; top: number }[] = [
  { sizes: [3, 5], top: C4 + 7 }, // hasta Do5
  { sizes: [2, 3, 4, 5], top: C4 + 7 },
  { sizes: [2, 3, 4, 5, 6, 7, 8], top: G4 + 7 }, // hasta Sol5
];

/** Intervalos armónicos sobre teclas blancas con la nota grave entre Do4 y Sol4. */
export function intervalItems(level: number): HarmonyItem[] {
  const { sizes, top } = INTERVAL_LEVELS[Math.min(level, INTERVAL_LEVELS.length) - 1];
  const items: HarmonyItem[] = [];
  for (let low = C4; low <= G4; low++) {
    for (const size of sizes) {
      const high = low + size - 1;
      if (high > top) continue;
      items.push({
        id: `i${low}-${size}`,
        name: `${size}ª`,
        midis: [midiOfDiatonic(low), midiOfDiatonic(high)],
      });
    }
  }
  return items;
}

export const INTERVAL_LEVEL_COUNT = INTERVAL_LEVELS.length;

const chord = (id: string, name: string, notes: string[]): HarmonyItem => ({
  id,
  name,
  midis: notes.map((n) => {
    const d = Number(n.slice(-1)) * 7 + 'CDEFGAB'.indexOf(n[0]);
    return midiOfDiatonic(d);
  }),
});

/** Acordes de tres notas en clave de Sol, por nivel (se acumulan). */
export const CHORD_LEVELS: HarmonyItem[][] = [
  [
    chord('C', 'Do mayor', ['C4', 'E4', 'G4']),
    chord('F', 'Fa mayor', ['F4', 'A4', 'C5']),
    chord('G', 'Sol mayor', ['G4', 'B4', 'D5']),
  ],
  [
    chord('Am', 'La menor', ['A4', 'C5', 'E5']),
    chord('Dm', 'Re menor', ['D4', 'F4', 'A4']),
    chord('Em', 'Mi menor', ['E4', 'G4', 'B4']),
  ],
  [
    chord('C6', 'Do mayor (1ª inversión)', ['E4', 'G4', 'C5']),
    chord('C64', 'Do mayor (2ª inversión)', ['G4', 'C5', 'E5']),
    chord('F64', 'Fa mayor (2ª inversión)', ['C4', 'F4', 'A4']),
    chord('F6', 'Fa mayor (1ª inversión)', ['A4', 'C5', 'F5']),
    chord('G6', 'Sol mayor (1ª inversión)', ['B3', 'D4', 'G4']),
    chord('G64', 'Sol mayor (2ª inversión)', ['D4', 'G4', 'B4']),
  ],
];

export function chordItems(level: number): HarmonyItem[] {
  return CHORD_LEVELS.slice(0, Math.max(1, level)).flat();
}

/**
 * Elige `count` elementos: cada uno al menos una vez si caben, los del nivel recién
 * desbloqueado con el doble de probabilidad, y nunca el mismo dos veces seguidas.
 */
export function pickItems(
  items: HarmonyItem[],
  count: number,
  rng: Rng,
  newest: HarmonyItem[] = [],
): HarmonyItem[] {
  if (!items.length) return [];
  const isNew = new Set(newest.map((i) => i.id));
  const weights = items.map((i) => (isNew.has(i.id) ? 2 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const random = () => {
    let r = rng() * total;
    let k = 0;
    while (k < items.length - 1 && r >= weights[k]) r -= weights[k++];
    return items[k];
  };
  const picked = items.length <= count ? [...items] : [];
  while (picked.length < count) picked.push(random());
  const out = shuffle(picked, rng);
  for (let i = 1; i < out.length; i++) {
    for (let tries = 0; out[i].id === out[i - 1].id && items.length > 1 && tries < 20; tries++) {
      out[i] = random();
    }
  }
  return out;
}

export const HARMONY_PER_MEASURE = 2;

/** Ejercicio en blancas, dos por compás, en clave de Sol. */
export function harmonyExerciseXml(sequence: HarmonyItem[]): string {
  const measures: string[] = [];
  for (let i = 0; i < sequence.length; i += HARMONY_PER_MEASURE) {
    const figures = sequence
      .slice(i, i + HARMONY_PER_MEASURE)
      .map((item) => `${item.midis.map(midiToToken).join('+')}:h`);
    while (figures.length < HARMONY_PER_MEASURE) figures.push('r:h');
    measures.push(figures.join(' '));
  }
  return buildMusicXml({ title: '', beats: 4, beatType: 4, keyFifths: 0, right: measures });
}
