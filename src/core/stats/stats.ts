import { noteWeight } from '../exercises/spaced';
import type { Attempt, Clef, NoteStat } from '../storage/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Día local "AAAA-MM-DD" de un instante. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Medianoche local del día de `ts` desplazada `offset` días (robusto ante cambios de hora). */
function dayStart(ts: number, offset = 0): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset).getTime();
}

export type DayPractice = { ms: number; sessions: number };

/** Tiempo practicado y sesiones por día local. */
export function dailyPractice(attempts: Attempt[]): Map<string, DayPractice> {
  const map = new Map<string, DayPractice>();
  for (const a of attempts) {
    const key = dayKey(a.date);
    const day = map.get(key) ?? { ms: 0, sessions: 0 };
    day.ms += Math.max(0, a.durationMs);
    day.sessions++;
    map.set(key, day);
  }
  return map;
}

/** Los últimos `n` días hasta hoy (incluido), de más antiguo a más reciente. */
export function lastDays(
  daily: Map<string, DayPractice>,
  n: number,
  now: number,
): { key: string; date: number; ms: number; sessions: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const date = dayStart(now, i - (n - 1));
    const key = dayKey(date);
    const day = daily.get(key);
    return { key, date, ms: day?.ms ?? 0, sessions: day?.sessions ?? 0 };
  });
}

/**
 * Racha actual (días seguidos con práctica hasta hoy; si hoy aún no se ha practicado,
 * cuenta hasta ayer para no "romperla" a primera hora) y mejor racha.
 */
export function streaks(
  daily: Map<string, DayPractice>,
  now: number,
): { current: number; best: number } {
  const has = (offset: number) => daily.has(dayKey(dayStart(now, offset)));
  let current = 0;
  for (let offset = has(0) ? 0 : -1; has(offset); offset--) current++;

  const days = [...daily.keys()].sort();
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const key of days) {
    const [y, m, d] = key.split('-').map(Number);
    const t = new Date(y, m - 1, d).getTime();
    run = prev !== null && Math.round((t - prev) / DAY_MS) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return { current, best: Math.max(best, current) };
}

export type Totals = {
  totalMs: number;
  weekMs: number;
  todayMs: number;
  sessions: number;
  days: number;
};

export function totals(attempts: Attempt[], now: number): Totals {
  const weekStart = dayStart(now, -6);
  const today = dayStart(now);
  let totalMs = 0;
  let weekMs = 0;
  let todayMs = 0;
  for (const a of attempts) {
    const ms = Math.max(0, a.durationMs);
    totalMs += ms;
    if (a.date >= weekStart) weekMs += ms;
    if (a.date >= today) todayMs += ms;
  }
  return {
    totalMs,
    weekMs,
    todayMs,
    sessions: attempts.length,
    days: dailyPractice(attempts).size,
  };
}

export type NoteRow = {
  midi: number;
  clef: Clef | 'both';
  attempts: number;
  errors: number;
  errorRate: number;
  avgReactionMs: number;
  lastSeen: number;
};

const toRow = (s: NoteStat): NoteRow => ({
  midi: s.midi,
  clef: s.clef,
  attempts: s.attempts,
  errors: s.errors,
  errorRate: s.attempts ? s.errors / s.attempts : 0,
  avgReactionMs: s.avgReactionMs,
  lastSeen: s.lastSeen,
});

/** Filas por nota y clave (para el pentagrama). */
export function noteRows(stats: NoteStat[]): NoteRow[] {
  return stats.filter((s) => s.attempts > 0).map(toRow);
}

/** Filas por tecla, sumando las dos claves (para el teclado). Reacción media ponderada por intentos. */
export function keyRows(stats: NoteStat[]): NoteRow[] {
  const map = new Map<number, NoteStat>();
  for (const s of stats) {
    if (s.attempts === 0) continue;
    const prev = map.get(s.midi);
    if (!prev) {
      map.set(s.midi, { ...s });
      continue;
    }
    const attempts = prev.attempts + s.attempts;
    map.set(s.midi, {
      ...prev,
      attempts,
      errors: prev.errors + s.errors,
      avgReactionMs: (prev.avgReactionMs * prev.attempts + s.avgReactionMs * s.attempts) / attempts,
      lastSeen: Math.max(prev.lastSeen, s.lastSeen),
    });
  }
  return [...map.values()].map((s) => ({ ...toRow(s), clef: 'both' as const }));
}

export type HeatMetric = 'errors' | 'reaction';

/** Límites fijos de los 5 niveles del mapa de calor: estables entre días y fáciles de leer. */
export const HEAT_THRESHOLDS: Record<HeatMetric, number[]> = {
  errors: [0.05, 0.1, 0.2, 0.35], // tasa de fallos
  reaction: [1000, 1500, 2000, 3000], // ms
};

/** Nivel 0-4 (más alto = peor). */
export function heatLevel(row: NoteRow, metric: HeatMetric): number {
  const value = metric === 'errors' ? row.errorRate : row.avgReactionMs;
  return HEAT_THRESHOLDS[metric].filter((t) => value >= t).length;
}

/** Notas que más conviene repasar, con el mismo criterio que la repetición espaciada. */
export function weakestNotes(stats: NoteStat[], n: number, now: number): NoteRow[] {
  return stats
    .filter((s) => s.attempts > 0)
    .map((s) => ({ row: toRow(s), weight: noteWeight(s, now) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n)
    .map((x) => x.row);
}

/** Precisión media de los intentos de los últimos `days` días, ponderada por duración. */
export function recentAccuracy(attempts: Attempt[], now: number, days = 30): number | null {
  const from = dayStart(now, -(days - 1));
  const recent = attempts.filter((a) => a.date >= from);
  const weight = recent.reduce((sum, a) => sum + Math.max(1, a.durationMs), 0);
  if (!recent.length) return null;
  return recent.reduce((sum, a) => sum + a.accuracy * Math.max(1, a.durationMs), 0) / weight;
}
