import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { buildMusicXml, type BuildScoreInput } from '../score/buildMusicXml';
import { parseScore } from '../score/parseScore';
import { beatsBetween } from './metronome';
import { mergeNoteStat, tallyOutcomes, waitAccuracy } from './stats';
import { buildSteps, measureStarts, stavesForHand } from './steps';
import { TempoEvaluator } from './tempoMode';
import { WaitModeEngine } from './waitMode';

const score = (input: Partial<BuildScoreInput>) =>
  parseScore(
    new DOMParser().parseFromString(
      buildMusicXml({ title: 't', beats: 4, beatType: 4, keyFifths: 0, right: [], ...input }),
      'text/xml',
    ) as unknown as Document,
  );

const twoHands = score({
  right: ['C4:q D4:q E4:h', 'G4:w'],
  left: ['C3+G3:h r:h', 'G2:w'],
});

describe('buildSteps', () => {
  it('agrupa por instante y combina manos', () => {
    const steps = buildSteps(twoHands, 'both');
    expect(steps.map((s) => [s.measure, s.onset, s.time, s.notes.map((n) => n.midi)])).toEqual([
      [0, 0, 0, [48, 55, 60]],
      [0, 1, 1, [62]],
      [0, 2, 2, [64]],
      [1, 0, 4, [43, 67]],
    ]);
    expect(steps[0].notes.find((n) => n.midi === 48)?.clef).toBe('bass');
  });

  it('filtra por mano y por rango', () => {
    expect(buildSteps(twoHands, 'right').map((s) => s.notes.map((n) => n.midi))).toEqual([
      [60],
      [62],
      [64],
      [67],
    ]);
    expect(buildSteps(twoHands, 'left').map((s) => s.notes.map((n) => n.midi))).toEqual([
      [48, 55],
      [43],
    ]);
    expect(buildSteps(twoHands, 'both', { from: 1, to: 1 })).toHaveLength(1);
  });

  it('con un solo pentagrama, la mano izquierda no tiene notas', () => {
    const single = score({ right: ['C4:w'] });
    expect([...stavesForHand(single, 'right')]).toEqual([0]);
    expect(buildSteps(single, 'left')).toEqual([]);
  });

  it('omite las notas ligadas que continúan', () => {
    let n = 0;
    const tied = buildMusicXml({
      title: 't',
      beats: 4,
      beatType: 4,
      keyFifths: 0,
      right: ['C4:h C4:h'],
    }).replace(/<\/type>/g, (m) => m + (n++ === 0 ? '<tie type="start"/>' : '<tie type="stop"/>'));
    const s = parseScore(new DOMParser().parseFromString(tied, 'text/xml') as unknown as Document);
    expect(buildSteps(s, 'both')).toHaveLength(1);
  });

  it('calcula el inicio de cada compás', () => {
    expect(measureStarts(twoHands)).toEqual([0, 4, 8]);
  });
});

describe('WaitModeEngine', () => {
  const steps = buildSteps(twoHands, 'both');

  it('avanza solo con la nota correcta y cuenta fallos', () => {
    const steps = buildSteps(twoHands, 'right');
    const engine = new WaitModeEngine(steps, { chordWindowMs: 150, loop: false });
    engine.start(0);
    expect(engine.noteOn(61, 100)).toMatchObject({ type: 'wrong', midi: 61 });
    expect(engine.current?.notes[0].midi).toBe(60);
    expect(engine.noteOn(60, 900)).toMatchObject({
      type: 'advance',
      reactionMs: 900,
      hadErrors: true,
    });
    expect(engine.current?.notes[0].midi).toBe(62);
    engine.noteOn(62, 1000);
    engine.noteOn(64, 1100);
    const last = engine.noteOn(67, 1200);
    expect(last).toMatchObject({ type: 'advance', next: null, looped: false });
    expect(engine.isFinished).toBe(true);
    expect(engine.noteOn(67, 1300)).toEqual({ type: 'ignored' });
    expect(waitAccuracy(engine.outcomes)).toBe(0.75);
  });

  it('acepta un acorde dentro de la ventana, en cualquier orden', () => {
    const engine = new WaitModeEngine(steps, { chordWindowMs: 150, loop: false });
    expect(engine.noteOn(60, 0).type).toBe('partial');
    expect(engine.noteOn(48, 50).type).toBe('partial');
    expect(engine.noteOn(55, 140).type).toBe('advance');
  });

  it('rechaza un acorde arpegiado más lento que la ventana', () => {
    const engine = new WaitModeEngine(steps, { chordWindowMs: 150, loop: false });
    engine.noteOn(48, 0);
    engine.noteOn(55, 100);
    expect(engine.noteOn(60, 300).type).toBe('partial'); // 48 y 55 caducaron
    engine.noteOn(48, 350);
    expect(engine.noteOn(55, 400).type).toBe('advance');
  });

  it('vuelve al principio en bucle', () => {
    const one = buildSteps(twoHands, 'right', { from: 1, to: 1 });
    const engine = new WaitModeEngine(one, { chordWindowMs: 150, loop: true });
    expect(engine.noteOn(67, 0)).toMatchObject({ type: 'advance', looped: true });
    expect(engine.current?.notes[0].midi).toBe(67);
    expect(engine.isFinished).toBe(false);
  });
});

describe('TempoEvaluator', () => {
  const steps = buildSteps(twoHands, 'right'); // negras en t=0,1,2 y 4
  const make = () => {
    const ev = new TempoEvaluator(steps, { toleranceMs: 100, msPerQuarter: 500 });
    ev.addPass(1000);
    return ev;
  };

  it('acierta dentro de la tolerancia e indica la desviación', () => {
    const ev = make();
    expect(ev.noteOn(60, 1040)).toMatchObject({ type: 'hit', deltaMs: 40, stepComplete: true });
    expect(ev.noteOn(62, 1450)).toMatchObject({ type: 'hit', deltaMs: -50 });
  });

  it('cuenta como extra una nota fuera de tiempo o equivocada', () => {
    const ev = make();
    expect(ev.noteOn(60, 1200).type).toBe('extra');
    expect(ev.noteOn(61, 1000).type).toBe('extra');
  });

  it('marca como fallo lo que pasa la tolerancia sin tocarse', () => {
    const ev = make();
    expect(ev.tick(1050)).toEqual([]);
    const missed = ev.tick(1650);
    expect(missed.map((e) => e.type === 'miss' && e.note.midi)).toEqual([60, 62]);
    ev.noteOn(64, 2010);
    expect(ev.summary).toMatchObject({ hits: 1, misses: 2, extras: 0, meanAbsDeltaMs: 10 });
  });

  it('usa el origen del rango aunque empiece con silencio', () => {
    const rest = score({ right: ['r:q C4:q D4:h'] });
    const ev = new TempoEvaluator(buildSteps(rest, 'right'), {
      toleranceMs: 100,
      msPerQuarter: 500,
      origin: 0,
    });
    ev.addPass(0);
    expect(ev.noteOn(60, 500).type).toBe('hit');
  });

  it('encadena pasadas para el bucle', () => {
    const one = buildSteps(twoHands, 'right', { from: 1, to: 1 });
    const ev = new TempoEvaluator(one, { toleranceMs: 100, msPerQuarter: 500 });
    ev.addPass(0);
    ev.addPass(2000);
    expect(ev.noteOn(67, 10).type).toBe('hit');
    expect(ev.noteOn(67, 2010).type).toBe('hit');
  });
});

describe('metronome', () => {
  it('programa los golpes de una ventana con acento en el 1', () => {
    expect(beatsBetween(1000, 500, 4, 0, 2100)).toEqual([
      { index: -2, at: 0, accent: false },
      { index: -1, at: 500, accent: false },
      { index: 0, at: 1000, accent: true },
      { index: 1, at: 1500, accent: false },
      { index: 2, at: 2000, accent: false },
    ]);
    expect(beatsBetween(0, 500, 4, -2000, -1999)[0]).toMatchObject({ index: -4, accent: true });
  });
});

describe('stats', () => {
  it('suma fallos y reacción por nota y los combina con lo guardado', () => {
    const steps = buildSteps(twoHands, 'right');
    const tallies = tallyOutcomes([
      { step: steps[0], errors: 2, reactionMs: 1000 },
      { step: steps[0], errors: 0, reactionMs: 500 },
    ]);
    expect(tallies).toEqual([
      { midi: 60, clef: 'treble', attempts: 2, errors: 1, reactionSum: 1500, reactionCount: 2 },
    ]);
    const merged = mergeNoteStat(
      { midi: 60, clef: 'treble', attempts: 2, errors: 0, avgReactionMs: 1500, lastSeen: 1 },
      tallies[0],
      99,
    );
    expect(merged).toEqual({
      midi: 60,
      clef: 'treble',
      attempts: 4,
      errors: 1,
      avgReactionMs: 1125,
      lastSeen: 99,
    });
  });
});
