import 'fake-indexeddb/auto';
import { DOMParser } from '@xmldom/xmldom';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSteps } from '../practice/steps';
import type { StepOutcome } from '../practice/waitMode';
import { parseScore } from '../score/parseScore';
import { DexieRepository } from '../storage/DexieRepository';
import type { NoteStat } from '../storage/types';
import { completeExercise, createExercise, EXERCISE_LENGTH, loadProgress } from './course';
import { midiToToken, noteExerciseXml } from './generator';
import { evaluateSession, UNLOCK_REACTION_MS } from './progression';
import { seededRng } from './random';
import { noteWeight, pickNotes } from './spaced';
import { TRACKS, nextNote, trackPool, type PoolNote } from './tracks';

const parse = (xml: string) =>
  parseScore(new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document);
const stat = (midi: number, s: Partial<NoteStat> = {}): NoteStat => ({
  midi,
  clef: 'treble',
  attempts: 20,
  errors: 0,
  avgReactionMs: 800,
  lastSeen: 0,
  ...s,
});
const outcomes = (n: number, errors = 0, reactionMs = 1000): StepOutcome[] =>
  Array.from({ length: n }, (_, i) => ({
    step: { measure: 0, onset: 0, time: 0, notes: [] },
    errors: i < errors ? 1 : 0,
    reactionMs,
  }));

describe('tracks', () => {
  it('empiezan con Do central / Do3 y tres notas', () => {
    expect(trackPool('treble', {}).map((n) => n.midi)).toEqual([60, 62, 64]);
    expect(trackPool('bass', {}).map((n) => n.midi)).toEqual([48, 50, 52]);
    expect(trackPool('both', {})).toHaveLength(6);
    expect(nextNote('treble', undefined)).toEqual({ midi: 65, clef: 'treble' });
  });

  it('solo contienen notas naturales sin repetir', () => {
    for (const track of [TRACKS.treble, TRACKS.bass]) {
      const midis = track.order.map((n) => n.midi);
      expect(new Set(midis).size).toBe(midis.length);
      expect(midis.every((m) => ![1, 3, 6, 8, 10].includes(m % 12))).toBe(true);
    }
  });
});

describe('pickNotes', () => {
  const pool: PoolNote[] = [60, 62, 64].map((midi) => ({ midi, clef: 'treble' }));

  it('incluye todas las notas, sin tres iguales seguidas, y es reproducible', () => {
    const a = pickNotes(pool, [], 16, seededRng(1), 0);
    expect(a).toEqual(pickNotes(pool, [], 16, seededRng(1), 0));
    expect(a).toHaveLength(16);
    expect(new Set(a.map((n) => n.midi))).toEqual(new Set([60, 62, 64]));
    for (let i = 2; i < a.length; i++) {
      expect(a[i].midi === a[i - 1].midi && a[i].midi === a[i - 2].midi).toBe(false);
    }
  });

  it('prioriza las notas con más fallos o más lentas', () => {
    const stats = [stat(60), stat(62, { errors: 12 }), stat(64, { avgReactionMs: 3500 })];
    const counts: Record<number, number> = { 60: 0, 62: 0, 64: 0 };
    const rng = seededRng(7);
    for (let i = 0; i < 50; i++)
      for (const n of pickNotes(pool, stats, 16, rng, 0)) counts[n.midi]++;
    expect(counts[62]).toBeGreaterThan(counts[60] * 1.5);
    expect(counts[64]).toBeGreaterThan(counts[60] * 1.5);
  });

  it('da más peso a lo nuevo y a lo que hace tiempo que no se ve', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(noteWeight(undefined, 0)).toBeGreaterThan(noteWeight(stat(60), 0));
    expect(noteWeight(stat(60), 5 * day)).toBeGreaterThan(noteWeight(stat(60), 0));
  });
});

describe('noteExerciseXml', () => {
  it('genera un ejercicio de clave de Fa que se lee igual que una partitura', () => {
    const seq: PoolNote[] = [48, 50, 52, 48, 55].map((midi) => ({ midi, clef: 'bass' }));
    const score = parse(noteExerciseXml('bass', seq));
    expect(score.staves.map((s) => s.clef)).toEqual(['F']);
    expect(score.measures).toHaveLength(2);
    expect(buildSteps(score, 'both').map((s) => s.notes[0].midi)).toEqual([48, 50, 52, 48, 55]);
    expect(buildSteps(score, 'both')[0].notes[0].clef).toBe('bass');
  });

  it('en "ambas" pone cada nota en su pentagrama', () => {
    const seq: PoolNote[] = [
      { midi: 60, clef: 'treble' },
      { midi: 48, clef: 'bass' },
    ];
    const steps = buildSteps(parse(noteExerciseXml('both', seq)), 'both');
    expect(steps.map((s) => [s.onset, s.notes.map((n) => [n.midi, n.clef])])).toEqual([
      [0, [[60, 'treble']]],
      [1, [[48, 'bass']]],
    ]);
  });

  it('escribe alturas con sostenidos', () => {
    expect(midiToToken(61)).toBe('C#4');
    expect(midiToToken(36)).toBe('C2');
  });
});

describe('evaluateSession', () => {
  it('aprueba con 90 % y reacción rápida, ignorando la primera nota', () => {
    const list = outcomes(16, 1, 1200);
    list[0].reactionMs = 20000;
    expect(evaluateSession(list)).toMatchObject({ passed: true, medianReactionMs: 1200 });
    expect(evaluateSession(outcomes(16, 2)).passed).toBe(false); // 87,5 %
    expect(evaluateSession(outcomes(16, 0, UNLOCK_REACTION_MS + 1)).passed).toBe(false);
    expect(evaluateSession([]).passed).toBe(false);
  });
});

describe('course', () => {
  let repo: DexieRepository;
  let n = 0;
  afterEach(() => repo.close());

  it('crea ejercicios y desbloquea una nota por ejercicio superado', async () => {
    repo = new DexieRepository(`course-${n++}`);
    const ex = await createExercise(repo, 'treble', seededRng(3));
    expect(ex.sequence).toHaveLength(EXERCISE_LENGTH);
    expect(new Set(ex.sequence.map((s) => s.midi))).toEqual(new Set([60, 62, 64]));

    expect((await completeExercise(repo, 'treble', outcomes(16, 5))).unlocked).toBeNull();
    const first = await completeExercise(repo, 'treble', outcomes(16));
    expect(first.unlocked).toEqual({ midi: 65, clef: 'treble' });
    await completeExercise(repo, 'treble', outcomes(16));
    expect((await loadProgress(repo)).treble?.unlocked).toBe(5);
    expect(trackPool('treble', await loadProgress(repo)).map((p) => p.midi)).toEqual([
      60, 62, 64, 65, 67,
    ]);

    // "Ambas" nunca desbloquea por sí misma
    expect((await completeExercise(repo, 'both', outcomes(16))).unlocked).toBeNull();
  });

  it('se detiene al completar la pista', async () => {
    repo = new DexieRepository(`course-${n++}`);
    await repo.putCourseProgress({
      trackId: 'bass',
      unlocked: TRACKS.bass.order.length,
      updatedAt: 0,
    });
    expect((await completeExercise(repo, 'bass', outcomes(16))).unlocked).toBeNull();
  });
});
