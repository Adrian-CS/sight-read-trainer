import { buildMusicXml } from '../score/buildMusicXml';
import type { Rng } from './random';

/** Tecla única de los ejercicios de ritmo: Si4, la línea central de la clave de Sol. */
export const RHYTHM_PITCH = 'B4';
export const RHYTHM_MIDI = 71;

/** Un grupo de figuras que ocupa `beats` negras y solo puede empezar en ciertos tiempos del compás. */
export type RhythmPattern = {
  id: string;
  beats: number;
  /** Tiempos del compás de 4/4 (0-3) en los que puede empezar. */
  starts: number[];
  /** Figuras: "q", "r:q" (silencio), "e~begin"… La altura se añade al generar. */
  figures: string[];
  weight: number;
};

const ANY = [0, 1, 2, 3];
const P = (
  id: string,
  beats: number,
  starts: number[],
  figures: string[],
  weight = 1,
): RhythmPattern => ({
  id,
  beats,
  starts,
  figures,
  weight,
});

/** Patrones que añade cada nivel (se acumulan). */
export const RHYTHM_LEVELS: RhythmPattern[][] = [
  [P('w', 4, [0], ['w'], 0.5), P('h', 2, [0, 2], ['h'], 1.5), P('q', 1, ANY, ['q'], 3)],
  [P('rq', 1, ANY, ['r:q'], 1.2), P('rh', 2, [0, 2], ['r:h'], 0.4)],
  [P('ee', 1, ANY, ['e~begin', 'e~end'], 2.5)],
  [P('qde', 2, [0, 2], ['q.', 'e'], 1.5), P('hd', 3, [0], ['h.'], 0.6)],
  [
    P(
      'ssss',
      1,
      ANY,
      ['s~begin,begin', 's~continue,continue', 's~continue,continue', 's~end,end'],
      1.2,
    ),
    P('ess', 1, ANY, ['e~begin', 's~continue,begin', 's~end,end'], 1),
    P('sse', 1, ANY, ['s~begin,begin', 's~continue,end', 'e~end'], 1),
  ],
];

export function rhythmPatterns(level: number): RhythmPattern[] {
  return RHYTHM_LEVELS.slice(0, Math.max(1, level)).flat();
}

const isRest = (p: RhythmPattern) => p.figures.every((f) => f.startsWith('r:'));

/** Rellena un compás de 4/4 con patrones del nivel. */
export function rhythmMeasure(
  patterns: RhythmPattern[],
  rng: Rng,
  firstOfExercise = false,
): RhythmPattern[] {
  const out: RhythmPattern[] = [];
  let beat = 0;
  while (beat < 4) {
    const fits = patterns.filter(
      (p) =>
        p.starts.includes(beat) &&
        beat + p.beats <= 4 &&
        // El ejercicio empieza con una nota y no se encadenan dos silencios.
        !(
          isRest(p) &&
          ((firstOfExercise && beat === 0) || (out.length && isRest(out[out.length - 1])))
        ),
    );
    const total = fits.reduce((a, p) => a + p.weight, 0);
    let r = rng() * total;
    let chosen = fits[0];
    for (const p of fits) {
      if (r < p.weight) {
        chosen = p;
        break;
      }
      r -= p.weight;
    }
    out.push(chosen);
    beat += chosen.beats;
  }
  return out;
}

/** Escribe una figura del patrón con la altura de los ejercicios. */
const withPitch = (figure: string) =>
  figure.startsWith('r:') ? figure : `${RHYTHM_PITCH}:${figure}`;

export function rhythmExercise(
  level: number,
  measures: number,
  rng: Rng,
): { xml: string; patterns: string[][] } {
  const patterns = rhythmPatterns(level);
  const bars = Array.from({ length: measures }, (_, i) => rhythmMeasure(patterns, rng, i === 0));
  const xml = buildMusicXml({
    title: '',
    beats: 4,
    beatType: 4,
    keyFifths: 0,
    right: bars.map((bar) => bar.flatMap((p) => p.figures.map(withPitch)).join(' ')),
  });
  return { xml, patterns: bars.map((bar) => bar.map((p) => p.id)) };
}
