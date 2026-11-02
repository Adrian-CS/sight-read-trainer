import 'fake-indexeddb/auto';
import { DOMParser } from '@xmldom/xmldom';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSteps } from '../practice/steps';
import type { StepOutcome } from '../practice/waitMode';
import { parseScore } from '../score/parseScore';
import { DexieRepository } from '../storage/DexieRepository';
import {
  completeExercise,
  completeRhythmExercise,
  createExercise,
  loadProgress,
  stepKey,
} from './course';
import { chordItems, CHORD_LEVELS, intervalItems, midiOfDiatonic, pickItems } from './harmony';
import { evaluateRhythm } from './progression';
import { seededRng } from './random';
import {
  RHYTHM_LEVELS,
  RHYTHM_MIDI,
  rhythmExercise,
  rhythmMeasure,
  rhythmPatterns,
} from './rhythm';
import { currentLevel, LEVEL_COUNTS } from './tracks';

const parse = (xml: string) =>
  parseScore(new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document);
const ok = (n: number, reactionMs = 1000): StepOutcome[] =>
  Array.from({ length: n }, () => ({
    step: { measure: 0, onset: 0, time: 0, notes: [] },
    errors: 0,
    reactionMs,
  }));

describe('ritmo', () => {
  it('cada compás suma 4 negras, respeta dónde empieza cada patrón y no empieza con silencio', () => {
    for (let level = 1; level <= RHYTHM_LEVELS.length; level++) {
      const rng = seededRng(level);
      for (let i = 0; i < 200; i++) {
        const bar = rhythmMeasure(rhythmPatterns(level), rng, true);
        let beat = 0;
        for (const p of bar) {
          expect(p.starts).toContain(beat);
          beat += p.beats;
        }
        expect(beat).toBe(4);
        expect(bar[0].figures[0].startsWith('r:')).toBe(false);
      }
    }
  });

  it('solo usa figuras del nivel', () => {
    const ids = new Set(rhythmPatterns(1).map((p) => p.id));
    const { patterns } = rhythmExercise(1, 8, seededRng(3));
    expect(patterns.flat().every((id) => ids.has(id))).toBe(true);
    expect(rhythmPatterns(3).map((p) => p.id)).toContain('ee');
  });

  it('genera una partitura válida sobre una sola tecla', () => {
    const { xml } = rhythmExercise(5, 4, seededRng(9));
    const score = parse(xml);
    expect(score.measures).toHaveLength(4);
    expect(score.measures.every((m) => m.length === 4)).toBe(true);
    const midis = new Set(buildSteps(score, 'both').flatMap((s) => s.notes.map((n) => n.midi)));
    expect([...midis]).toEqual([RHYTHM_MIDI]);
  });

  it('evalúa aciertos y precisión temporal', () => {
    expect(evaluateRhythm({ hits: 18, misses: 1, extras: 1, meanAbsDeltaMs: 50 })).toMatchObject({
      passed: true,
      accuracy: 0.9,
    });
    expect(evaluateRhythm({ hits: 20, misses: 0, extras: 0, meanAbsDeltaMs: 120 }).passed).toBe(
      false,
    );
    expect(evaluateRhythm({ hits: 0, misses: 0, extras: 0, meanAbsDeltaMs: 0 }).passed).toBe(false);
  });
});

describe('intervalos y acordes', () => {
  it('calcula notas naturales desde la posición diatónica', () => {
    expect(midiOfDiatonic(28)).toBe(60);
    expect(midiOfDiatonic(34)).toBe(71);
    expect(midiOfDiatonic(35)).toBe(72);
  });

  it('el nivel 1 de intervalos son terceras y quintas desde Do4–Sol4', () => {
    const items = intervalItems(1);
    expect(new Set(items.map((i) => i.name))).toEqual(new Set(['3ª', '5ª']));
    expect(items.find((i) => i.id === 'i28-3')?.midis).toEqual([60, 64]);
    expect(items.every((i) => i.midis[1] <= 72)).toBe(true);
    expect(intervalItems(3).some((i) => i.name === '8ª')).toBe(true);
  });

  it('los acordes son tríadas válidas que se acumulan por nivel', () => {
    expect(chordItems(1).map((c) => c.midis)).toEqual([
      [60, 64, 67],
      [65, 69, 72],
      [67, 71, 74],
    ]);
    expect(chordItems(CHORD_LEVELS.length)).toHaveLength(12);
  });

  it('reparte sin repetir dos veces seguidas e incluye todo si cabe', () => {
    const items = chordItems(1);
    const seq = pickItems(items, 8, seededRng(4));
    expect(seq).toHaveLength(8);
    expect(new Set(seq.map((s) => s.id)).size).toBe(3);
    for (let i = 1; i < seq.length; i++) expect(seq[i].id).not.toBe(seq[i - 1].id);
  });
});

describe('progreso por niveles', () => {
  let repo: DexieRepository;
  let n = 0;
  afterEach(() => repo.close());

  it('genera ejercicios de acordes con nombres por instante y sube de nivel', async () => {
    repo = new DexieRepository(`levels-${n++}`);
    const ex = await createExercise(repo, 'chords', seededRng(2));
    expect(ex).toMatchObject({ mode: 'wait', level: 1 });
    const steps = buildSteps(parse(ex.xml), 'both');
    expect(steps).toHaveLength(8);
    expect(steps.every((s) => s.notes.length === 3)).toBe(true);
    expect(ex.names?.[stepKey(steps[3].measure, steps[3].onset)]).toMatch(/mayor/);

    // 3 s de reacción es el límite en acordes
    expect((await completeExercise(repo, 'chords', ok(8, 3500))).unlocked).toBeNull();
    expect((await completeExercise(repo, 'chords', ok(8, 2800))).unlocked).toEqual({
      kind: 'level',
      level: 2,
    });
    expect(currentLevel('chords', (await loadProgress(repo)).chords)).toBe(2);
  });

  it('el ritmo se toca con tempo y se queda en el último nivel', async () => {
    repo = new DexieRepository(`levels-${n++}`);
    expect(await createExercise(repo, 'rhythm', seededRng(1))).toMatchObject({
      mode: 'tempo',
      level: 1,
    });
    const good = { hits: 20, misses: 0, extras: 0, meanAbsDeltaMs: 30 };
    for (let level = 2; level <= LEVEL_COUNTS.rhythm; level++) {
      expect((await completeRhythmExercise(repo, good)).unlocked).toEqual({ kind: 'level', level });
    }
    expect((await completeRhythmExercise(repo, good)).unlocked).toBeNull();
  });
});
