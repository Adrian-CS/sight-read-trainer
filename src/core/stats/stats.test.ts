import { describe, expect, it } from 'vitest';
import type { Attempt, NoteStat } from '../storage/types';
import {
  dailyPractice,
  dayKey,
  heatLevel,
  keyRows,
  lastDays,
  noteRows,
  recentAccuracy,
  streaks,
  totals,
  weakestNotes,
} from './stats';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const attempt = (date: number, durationMs = 60_000, accuracy = 1): Attempt => ({
  id: String(date) + Math.random(),
  date,
  durationMs,
  accuracy,
});
const stat = (midi: number, s: Partial<NoteStat> = {}): NoteStat => ({
  midi,
  clef: 'treble',
  attempts: 10,
  errors: 0,
  avgReactionMs: 900,
  lastSeen: 0,
  ...s,
});

describe('práctica diaria', () => {
  const now = at(2026, 11, 10, 9);
  const attempts = [
    attempt(at(2026, 11, 10, 8), 120_000),
    attempt(at(2026, 11, 9, 23), 60_000),
    attempt(at(2026, 11, 9, 7), 30_000),
    attempt(at(2026, 11, 8)),
    attempt(at(2026, 11, 3)),
    attempt(at(2026, 11, 2)),
    attempt(at(2026, 11, 1)),
    attempt(at(2026, 10, 31)),
  ];

  it('agrupa por día local', () => {
    const daily = dailyPractice(attempts);
    expect(daily.get('2026-11-09')).toEqual({ ms: 90_000, sessions: 2 });
    expect(dayKey(at(2026, 1, 5))).toBe('2026-01-05');
  });

  it('devuelve los últimos días con ceros donde no hubo práctica', () => {
    const days = lastDays(dailyPractice(attempts), 7, now);
    expect(days.map((d) => d.key)).toEqual([
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
    ]);
    expect(days.map((d) => d.ms)).toEqual([0, 0, 0, 0, 60_000, 90_000, 120_000]);
  });

  it('calcula la racha actual y la mejor (cruzando de mes)', () => {
    expect(streaks(dailyPractice(attempts), now)).toEqual({ current: 3, best: 4 });
  });

  it('la racha no se rompe si hoy aún no se ha practicado', () => {
    const daily = dailyPractice(attempts.slice(1));
    expect(streaks(daily, now).current).toBe(2);
    expect(streaks(daily, at(2026, 11, 12)).current).toBe(0);
  });

  it('suma tiempos totales, de la semana y de hoy', () => {
    expect(totals(attempts, now)).toMatchObject({
      todayMs: 120_000,
      weekMs: 120_000 + 90_000 + 60_000,
      sessions: 8,
      days: 7,
    });
  });

  it('pondera la precisión reciente por duración', () => {
    const list = [attempt(now, 60_000, 1), attempt(now, 180_000, 0.5)];
    expect(recentAccuracy(list, now)).toBeCloseTo(0.625);
    expect(recentAccuracy([], now)).toBeNull();
  });
});

describe('notas', () => {
  it('combina claves por tecla con la reacción ponderada', () => {
    const rows = keyRows([
      stat(60, { attempts: 10, errors: 1, avgReactionMs: 1000 }),
      stat(60, { clef: 'bass', attempts: 30, errors: 3, avgReactionMs: 2000 }),
      stat(62, { attempts: 0 }),
    ]);
    expect(rows).toEqual([
      expect.objectContaining({
        midi: 60,
        clef: 'both',
        attempts: 40,
        errors: 4,
        errorRate: 0.1,
        avgReactionMs: 1750,
      }),
    ]);
    expect(noteRows([stat(62, { attempts: 0 })])).toEqual([]);
  });

  it('asigna niveles de calor con límites fijos', () => {
    const [row] = noteRows([stat(60, { attempts: 20, errors: 5, avgReactionMs: 2100 })]);
    expect(heatLevel(row, 'errors')).toBe(3); // 25 %
    expect(heatLevel(row, 'reaction')).toBe(3);
    expect(heatLevel(noteRows([stat(64)])[0], 'errors')).toBe(0);
  });

  it('ordena las notas a repasar con el criterio de la repetición espaciada', () => {
    const weak = weakestNotes(
      [stat(60), stat(62, { errors: 6 }), stat(64, { avgReactionMs: 3000 })],
      2,
      0,
    );
    expect(weak.map((r) => r.midi)).toEqual([62, 64]);
  });
});
