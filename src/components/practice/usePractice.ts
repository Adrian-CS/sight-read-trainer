'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { NoteEvent } from '@/core/input';
import { midiToName } from '@/core/music/notes';
import {
  Metronome,
  TempoEvaluator,
  WaitModeEngine,
  buildSteps,
  measureStarts,
  mergeNoteStat,
  tallyOutcomes,
  waitAccuracy,
  type Range,
  type Step,
} from '@/core/practice';
import type { ScoreModel } from '@/core/score/model';
import { getRepository } from '@/core/storage/client';
import type { Hand } from '@/core/storage/types';
import { t } from '@/i18n';
import { useNoteEvents } from '../InputProvider';
import type { ScoreViewHandle } from '../ScoreView';

export type PracticeMode = 'wait' | 'tempo';

export type Feedback = { kind: 'info' | 'ok' | 'error'; text: string };

export type PracticeStatus = 'idle' | 'countin' | 'running' | 'finished';

export type PracticeOptions = {
  pieceId: string;
  score: ScoreModel;
  scoreRef: RefObject<ScoreViewHandle | null>;
  mode: PracticeMode;
  hand: Hand;
  bpm: number;
  chordWindowMs: number;
  toleranceMs: number;
  loop: Range | null;
  onMeasure(index: number): void;
};

const GREEN = '#1f9d55';
const RED = '#d64545';
const COUNT_IN_LEAD_MS = 400;

const names = (step: Step | null) => step?.notes.map((n) => midiToName(n.midi)).join(' + ') ?? '';

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

type WaitSession = {
  kind: 'wait';
  engine: WaitModeEngine;
  startedAt: number;
  ok: number;
  errors: number;
};
type TempoSession = {
  kind: 'tempo';
  evaluator: TempoEvaluator;
  metronome: Metronome;
  steps: Step[];
  startedAt: number;
  /** Instante (performance.now) del inicio de la pasada actual y duración de una pasada. */
  passStart: number;
  passMs: number;
  passesAdded: number;
  msPerQuarter: number;
  origin: number;
  stepIndex: number;
  /** Terminó la cuenta previa. */
  started: boolean;
  raf: number;
};

/** Sesión de práctica: conecta el motor (core/practice) con la entrada de notas y la partitura. */
export function usePractice(options: PracticeOptions) {
  const [status, setStatus] = useState<PracticeStatus>('idle');
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'info', text: t('practice.ready') });
  const [counters, setCounters] = useState('');
  const [countIn, setCountIn] = useState(0);
  const session = useRef<WaitSession | TempoSession | null>(null);
  /** Compás desde el que se empieza cuando no hay bucle. */
  const startMeasure = useRef(0);
  const audio = useRef<AudioContext | null>(null);
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });

  // Ambos leen siempre la referencia actual, así que son estables.
  const score = useCallback(() => opts.current.scoreRef.current, []);
  const color = useCallback(
    (step: Step, midis: number[], c: string) =>
      opts.current.scoreRef.current?.colorNotes(step.measure, step.onset, midis, c),
    [],
  );

  const save = useCallback(
    async (
      accuracy: number,
      durationMs: number,
      mode: PracticeMode,
      tallies?: ReturnType<typeof tallyOutcomes>,
    ) => {
      const repo = getRepository();
      const { pieceId, hand } = opts.current;
      await repo.addAttempt({
        id: crypto.randomUUID(),
        pieceId,
        date: Date.now(),
        accuracy,
        durationMs,
        mode,
        hand,
      });
      const now = Date.now();
      for (const tally of tallies ?? []) {
        repo.putNoteStat(mergeNoteStat(await repo.getNoteStat(tally.midi, tally.clef), tally, now));
      }
    },
    [],
  );

  /** Termina la sesión. `completed` = se llegó al final (sin bucle). */
  const finish = useCallback(
    (completed: boolean) => {
      const s = session.current;
      if (!s) return;
      session.current = null;
      const durationMs = performance.now() - s.startedAt;
      if (s.kind === 'wait') {
        const outcomes = s.engine.outcomes;
        if (outcomes.length) {
          const accuracy = waitAccuracy(outcomes);
          void save(accuracy, durationMs, 'wait', tallyOutcomes(outcomes));
          setFeedback({
            kind: completed ? 'ok' : 'info',
            text: t('practice.finished', {
              accuracy: Math.round(accuracy * 100),
              time: formatDuration(durationMs),
            }),
          });
        } else {
          setFeedback({ kind: 'info', text: t('practice.ready') });
        }
      } else {
        cancelAnimationFrame(s.raf);
        s.metronome.stop();
        const { hits, misses, extras } = s.evaluator.summary;
        const total = hits + misses + extras;
        if (total) {
          const accuracy = hits / total;
          void save(accuracy, durationMs, 'tempo');
          setFeedback({
            kind: completed ? 'ok' : 'info',
            text: t('practice.finished', {
              accuracy: Math.round(accuracy * 100),
              time: formatDuration(durationMs),
            }),
          });
        } else {
          setFeedback({ kind: 'info', text: t('practice.ready') });
        }
      }
      setStatus(completed ? 'finished' : 'idle');
    },
    [save],
  );

  const startWait = useCallback(
    (steps: Step[]) => {
      const { chordWindowMs, loop, onMeasure } = opts.current;
      const engine = new WaitModeEngine(steps, { chordWindowMs, loop: !!loop });
      const now = performance.now();
      engine.start(now);
      session.current = { kind: 'wait', engine, startedAt: now, ok: 0, errors: 0 };
      score()?.toPosition(steps[0].measure, steps[0].onset);
      onMeasure(steps[0].measure);
      setStatus('running');
      setCounters(t('practice.counters.wait', { ok: 0, errors: 0 }));
      setFeedback({ kind: 'info', text: t('practice.waiting', { notes: names(steps[0]) }) });
    },
    [score],
  );

  const startTempo = useCallback(
    async (steps: Step[], range: Range) => {
      const { score: model, bpm, toleranceMs, loop, onMeasure } = opts.current;
      audio.current ??= new AudioContext();
      await audio.current.resume();
      const starts = measureStarts(model);
      const first = model.measures[range.from];
      const msPerQuarter = 60000 / bpm;
      const msPerBeat = (msPerQuarter * 4) / first.beatType;
      const beatsPerBar = first.beats;
      const passMs = (starts[range.to + 1] - starts[range.from]) * msPerQuarter;
      const now = performance.now();
      const passStart = now + COUNT_IN_LEAD_MS + beatsPerBar * msPerBeat;
      const evaluator = new TempoEvaluator(steps, {
        toleranceMs,
        msPerQuarter,
        origin: starts[range.from],
      });
      evaluator.addPass(passStart);
      const metronome = new Metronome(audio.current);
      metronome.start(passStart, msPerBeat, beatsPerBar, -beatsPerBar);

      const s: TempoSession = {
        kind: 'tempo',
        evaluator,
        metronome,
        steps,
        startedAt: now,
        passStart,
        passMs,
        passesAdded: 1,
        msPerQuarter,
        origin: starts[range.from],
        stepIndex: -1,
        started: false,
        raf: 0,
      };
      session.current = s;
      score()?.clearColors();
      score()?.toPosition(steps[0].measure, steps[0].onset);
      onMeasure(steps[0].measure);
      setCountIn(beatsPerBar);
      setStatus('countin');
      setCounters(t('practice.counters.tempo', { hits: 0, misses: 0, extras: 0 }));

      const frame = () => {
        if (session.current !== s) return;
        const time = performance.now();
        if (!s.started) {
          if (time < s.passStart) {
            setCountIn(Math.min(beatsPerBar, Math.ceil((s.passStart - time) / msPerBeat)));
          } else {
            s.started = true;
            setStatus('running');
          }
        }
        // Encadenar la siguiente vuelta del bucle con antelación.
        if (loop && time > s.passStart + s.passMs - 1000 && s.passesAdded === 1) {
          evaluator.addPass(s.passStart + s.passMs);
          s.passesAdded = 2;
        }
        if (loop && time >= s.passStart + s.passMs) {
          s.passStart += s.passMs;
          s.passesAdded = 1;
          s.stepIndex = -1;
          score()?.clearColors();
        }
        // Mover el cursor al paso que toca ahora.
        const q = (time - s.passStart) / msPerQuarter + s.origin;
        let next = s.stepIndex;
        while (next + 1 < steps.length && steps[next + 1].time <= q + 1e-6) next++;
        if (next !== s.stepIndex && next >= 0) {
          s.stepIndex = next;
          score()?.toPosition(steps[next].measure, steps[next].onset);
          opts.current.onMeasure(steps[next].measure);
        }
        const missed = evaluator.tick(time);
        for (const m of missed) {
          if (m.type !== 'miss') continue;
          color(m.step, [m.note.midi], RED);
          setFeedback({
            kind: 'error',
            text: t('practice.miss', { note: midiToName(m.note.midi) }),
          });
        }
        if (missed.length) setCounters(t('practice.counters.tempo', evaluator.summary));
        if (!loop && time > s.passStart + s.passMs + toleranceMs) return finish(true);
        s.raf = requestAnimationFrame(frame);
      };
      s.raf = requestAnimationFrame(frame);
    },
    [finish, score, color],
  );

  const start = useCallback(() => {
    const { score: model, hand, loop, mode } = opts.current;
    const range = loop ?? { from: startMeasure.current, to: model.measures.length - 1 };
    const steps = buildSteps(model, hand, range);
    if (!steps.length) {
      setFeedback({ kind: 'error', text: t('practice.noNotes') });
      return;
    }
    score()?.clearColors();
    if (mode === 'wait') startWait(steps);
    else void startTempo(steps, range);
  }, [startWait, startTempo, score]);

  const stop = useCallback(() => finish(false), [finish]);

  // Parar al desmontar (salir de la pieza).
  useEffect(
    () => () => {
      const s = session.current;
      if (s?.kind === 'tempo') {
        cancelAnimationFrame(s.raf);
        s.metronome.stop();
      }
      session.current = null;
      void audio.current?.close();
    },
    [],
  );

  useNoteEvents((e: NoteEvent) => {
    const s = session.current;
    if (!s || e.type !== 'noteon') return;
    if (s.kind === 'wait') {
      const result = s.engine.noteOn(e.midi, e.time);
      if (result.type === 'wrong') {
        s.errors++;
        color(
          result.step,
          result.step.notes.map((n) => n.midi),
          RED,
        );
        setFeedback({
          kind: 'error',
          text: t('practice.wrong', { played: midiToName(e.midi), expected: names(result.step) }),
        });
      } else if (result.type === 'partial') {
        setFeedback({ kind: 'info', text: t('practice.partial', { note: midiToName(e.midi) }) });
      } else if (result.type === 'advance') {
        if (!result.hadErrors) {
          s.ok++;
          color(
            result.step,
            result.step.notes.map((n) => n.midi),
            GREEN,
          );
        }
        if (result.looped) score()?.clearColors();
        if (result.next) {
          score()?.toPosition(result.next.measure, result.next.onset);
          opts.current.onMeasure(result.next.measure);
          setFeedback({
            kind: result.hadErrors ? 'info' : 'ok',
            text: `${result.hadErrors ? '' : t('practice.correct') + ' · '}${t('practice.waiting', { notes: names(result.next) })}`,
          });
        }
      }
      setCounters(t('practice.counters.wait', { ok: s.ok, errors: s.errors }));
      if (s.engine.isFinished) finish(true);
      return;
    }
    if (performance.now() < s.passStart - opts.current.toleranceMs) return; // cuenta previa
    const ev = s.evaluator.noteOn(e.midi, e.time);
    if (ev.type === 'hit') {
      color(ev.step, [ev.note.midi], GREEN);
      const ms = Math.round(Math.abs(ev.deltaMs));
      const note = midiToName(ev.note.midi);
      setFeedback({
        kind: 'ok',
        text:
          ms < 40
            ? t('practice.hit', { note })
            : t(ev.deltaMs < 0 ? 'practice.early' : 'practice.late', { note, ms }),
      });
    } else if (ev.type === 'extra') {
      setFeedback({ kind: 'error', text: t('practice.extra', { note: midiToName(e.midi) }) });
    }
    setCounters(t('practice.counters.tempo', s.evaluator.summary));
  });

  const setStartMeasure = useCallback((m: number) => {
    startMeasure.current = m;
  }, []);

  return { status, feedback, counters, countIn, start, stop, setStartMeasure };
}
