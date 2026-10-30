import type { SyncData } from '../storage/types';

export type { SyncData };

export function measureMs(sync: Pick<SyncData, 'bpm' | 'beatsPerMeasure'>): number {
  return (60000 / sync.bpm) * sync.beatsPerMeasure;
}

/** Anclas ordenadas: compás 0 (startOffsetMs, salvo que tenga marca propia) + marcas manuales. */
export function anchors(sync: SyncData): [number, number][] {
  const map = new Map<number, number>([[0, sync.startOffsetMs]]);
  for (const [measure, ms] of Object.entries(sync.marks)) map.set(Number(measure), ms);
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * Tiempo de inicio (ms en la canción) de cada compás, más uno final con el fin del último compás:
 * devuelve `count + 1` valores.
 */
export function times(sync: SyncData, count: number): number[] {
  const list = anchors(sync);
  const step = measureMs(sync);
  const result: number[] = [];
  let k = 0; // última ancla con índice <= i
  for (let i = 0; i <= count; i++) {
    while (k + 1 < list.length && list[k + 1][0] <= i) k++;
    const [a, ta] = list[k];
    const next = list[k + 1];
    if (i === a) result.push(ta);
    else if (next) result.push(ta + ((i - a) / (next[0] - a)) * (next[1] - ta));
    else result.push(ta + (i - a) * step);
  }
  return result;
}

/**
 * Compás que suena en `ms`, según el resultado de times().
 * -1 antes del primer compás; `times.length - 1` (= count) después del último.
 */
export function measureAtTime(measureTimes: number[], ms: number): number {
  const count = measureTimes.length - 1;
  if (count < 0 || ms < measureTimes[0]) return -1;
  if (ms >= measureTimes[count]) return count;
  // Búsqueda binaria del último i con times[i] <= ms.
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measureTimes[mid] <= ms) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Posición (0-1) dentro del compás i, interpolada linealmente entre su inicio y el siguiente. */
export function fractionInMeasure(measureTimes: number[], i: number, ms: number): number {
  const start = measureTimes[i];
  const end = measureTimes[i + 1];
  if (start === undefined || end === undefined || end <= start) return 0;
  return Math.min(1, Math.max(0, (ms - start) / (end - start)));
}

/** "1:05.3" */
export function formatMs(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  const tenths = Math.round(Math.abs(ms) / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = ((tenths % 600) / 10).toFixed(1).padStart(4, '0');
  return `${sign}${minutes}:${seconds}`;
}

/** Sincronización por defecto a partir del tempo y compás de la partitura (bpm en negras). */
export function defaultSync(opts: {
  tempo: number | null;
  beats: number;
  beatType: number;
}): SyncData {
  return {
    bpm: opts.tempo && opts.tempo > 0 ? opts.tempo : 100,
    beatsPerMeasure: (opts.beats * 4) / opts.beatType,
    startOffsetMs: 0,
    marks: {},
  };
}
