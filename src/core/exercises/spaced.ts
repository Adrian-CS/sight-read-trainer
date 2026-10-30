import type { NoteStat } from '../storage/types';
import { shuffle, type Rng } from './random';
import type { PoolNote } from './tracks';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Peso de repaso de una nota: más alto cuanto más se falla, más tarda en reconocerse,
 * menos se ha practicado o más tiempo hace que no se ve.
 */
export function noteWeight(stat: NoteStat | undefined, now: number): number {
  if (!stat || stat.attempts === 0) return 4; // nota nueva: que salga a menudo
  const errorRate = (stat.errors + 0.5) / (stat.attempts + 1);
  const slowness = Math.min(3, Math.max(0, (stat.avgReactionMs - 1000) / 1000));
  const fewAttempts = stat.attempts < 8 ? 1.5 : 0;
  const staleness = Math.min(7, (now - stat.lastSeen) / DAY_MS) * 0.2;
  return 1 + 4 * errorRate + slowness + fewAttempts + staleness;
}

const statKey = (n: PoolNote) => `${n.midi}:${n.clef}`;

/**
 * Elige `count` notas del conjunto. Si caben, cada nota sale al menos una vez; el resto se reparte
 * según el peso de repaso. Nunca la misma nota más de dos veces seguidas.
 */
export function pickNotes(
  pool: PoolNote[],
  stats: NoteStat[],
  count: number,
  rng: Rng,
  now = Date.now(),
): PoolNote[] {
  if (!pool.length) return [];
  const byKey = new Map(stats.map((s) => [`${s.midi}:${s.clef}`, s]));
  const weights = pool.map((n) => noteWeight(byKey.get(statKey(n)), now));
  const total = weights.reduce((a, b) => a + b, 0);

  const weighted = (avoid: PoolNote | null): PoolNote => {
    for (let tries = 0; tries < 20; tries++) {
      let r = rng() * total;
      let i = 0;
      while (i < pool.length - 1 && r >= weights[i]) r -= weights[i++];
      if (!avoid || statKey(pool[i]) !== statKey(avoid) || pool.length === 1) return pool[i];
    }
    return pool.find((n) => statKey(n) !== statKey(avoid!)) ?? pool[0];
  };

  const picked: PoolNote[] = pool.length * 2 <= count ? [...pool] : [];
  while (picked.length < count) picked.push(weighted(null));

  // Mezclar y deshacer rachas de tres iguales.
  const out = shuffle(picked, rng);
  for (let i = 2; i < out.length; i++) {
    if (statKey(out[i]) === statKey(out[i - 1]) && statKey(out[i]) === statKey(out[i - 2])) {
      out[i] = weighted(out[i]);
    }
  }
  return out;
}
