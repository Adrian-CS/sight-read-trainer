'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  completeExercise,
  completeRhythmExercise,
  createExercise,
  isLevelTrack,
  stepKey,
  TRACK_IDS,
  type Exercise,
  type SessionOutcome,
  type TrackId,
} from '@/core/exercises';
import { browserXmlParser } from '@/core/library/library';
import { midiToName } from '@/core/music/notes';
import type { ScoreModel } from '@/core/score/model';
import { parseScore } from '@/core/score/parseScore';
import { getRepository } from '@/core/storage/client';
import { t } from '@/i18n';
import { Keyboard } from '../Keyboard';
import { PracticeBar } from '../practice/PracticeBar';
import { usePractice } from '../practice/usePractice';
import { ScoreView, type ScoreViewHandle } from '../ScoreView';
import { TopBar } from '../TopBar';
import { levelName } from './levels';
import styles from './LessonView.module.css';

const KEYBOARD_KEY = 'sightread:showKeyboard';
const RHYTHM_BPM_KEY = 'sightread:rhythmBpm';
const KEYBOARD_RANGE: Record<TrackId, [number, number]> = {
  treble: [55, 84],
  bass: [36, 64],
  both: [36, 84],
  rhythm: [60, 79],
  intervals: [55, 84],
  chords: [55, 84],
};
const EMPTY_SCORE: ScoreModel = { title: '', composer: '', staves: [], measures: [], tempo: null };
/** Intervalos y acordes: ventana amplia para que las notas no tengan que caer exactamente juntas. */
const HARMONY_CHORD_WINDOW_MS = 400;

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // sin almacenamiento: solo se pierde la preferencia
  }
}

const percent = (x: number) => Math.round(x * 100);
const seconds = (ms = 0) => (ms / 1000).toFixed(1).replace('.', ',');

function resultText(trackId: TrackId, r: SessionOutcome): string {
  if (trackId === 'rhythm') {
    const vars = { accuracy: percent(r.accuracy), ms: Math.round(r.meanAbsDeltaMs ?? 0) };
    return t(r.passed ? 'lesson.passedRhythm' : 'lesson.failedRhythm', vars);
  }
  const vars = { accuracy: percent(r.accuracy), reaction: seconds(r.medianReactionMs) };
  if (r.passed) return t('lesson.passed', vars);
  return t(isLevelTrack(trackId) ? 'lesson.failedHarmony' : 'lesson.failed', vars);
}

function unlockText(trackId: TrackId, r: SessionOutcome): string | null {
  if (!r.unlocked) return null;
  if (r.unlocked.kind === 'note')
    return t('lesson.unlocked', { note: midiToName(r.unlocked.midi) });
  return isLevelTrack(trackId)
    ? t('lesson.levelUp', { name: levelName(trackId, r.unlocked.level) })
    : null;
}

export function LessonView() {
  const param = useSearchParams().get('pista');
  const trackId = (TRACK_IDS as string[]).includes(param ?? '') ? (param as TrackId) : null;
  const [exercise, setExercise] = useState<(Exercise & { n: number }) | null>(null);
  const [result, setResult] = useState<SessionOutcome | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [bpm, setBpm] = useState(60);
  const scoreRef = useRef<ScoreViewHandle>(null);
  const autoStart = useRef(false);

  const generate = useCallback(async () => {
    if (!trackId) return;
    const next = await createExercise(getRepository(), trackId);
    setExercise((prev) => ({ ...next, n: (prev?.n ?? 0) + 1 }));
    setResult(null);
  }, [trackId]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- preferencias guardadas en el navegador */
    setShowKeyboard(readLocal(KEYBOARD_KEY) === '1');
    setBpm(Number(readLocal(RHYTHM_BPM_KEY)) || 60);
    /* eslint-enable react-hooks/set-state-in-effect */
    void generate();
  }, [generate]);

  const score = useMemo(
    () => (exercise ? parseScore(browserXmlParser(exercise.xml)) : null),
    [exercise],
  );
  const mode = exercise?.mode ?? 'wait';
  const harmony = trackId === 'intervals' || trackId === 'chords';

  const practice = usePractice({
    exerciseId: trackId ?? undefined,
    score: score ?? EMPTY_SCORE,
    scoreRef,
    mode,
    hand: 'both',
    bpm,
    chordWindowMs: harmony ? HARMONY_CHORD_WINDOW_MS : 150,
    toleranceMs: 150,
    loop: null,
    onMeasure: () => {},
    readyText: t(
      mode === 'tempo' ? 'lesson.ready.rhythm' : harmony ? 'lesson.ready.harmony' : 'lesson.ready',
    ),
    revealExpected: false,
    anyKey: trackId === 'rhythm',
    stepName: (step) => exercise?.names?.[stepKey(step.measure, step.onset)],
    onWaitFinished: (outcomes, completed) => {
      if (!completed || !trackId || trackId === 'rhythm') return;
      void completeExercise(getRepository(), trackId, outcomes).then(setResult);
    },
    onTempoFinished: (summary, completed) => {
      if (!completed || trackId !== 'rhythm') return;
      void completeRhythmExercise(getRepository(), summary).then(setResult);
    },
  });
  const { start } = practice;

  // "Otro ejercicio" empieza solo en cuanto está listo.
  useEffect(() => {
    if (exercise && autoStart.current) {
      autoStart.current = false;
      start();
    }
  }, [exercise, start]);

  if (!trackId) {
    return (
      <main className="page">
        <TopBar title={t('course.title')} back="/curso/" />
        <p className="notice">{t('course.unknownTrack')}</p>
      </main>
    );
  }

  const [from, to] = KEYBOARD_RANGE[trackId];
  const unlocked = result && unlockText(trackId, result);
  const title =
    isLevelTrack(trackId) && exercise?.level
      ? `${t(`course.track.${trackId}`)} · ${levelName(trackId, exercise.level)}`
      : t(`course.track.${trackId}`);

  return (
    <main className={`page ${showKeyboard ? styles.withKeyboard : ''}`}>
      <TopBar title={title} back="/curso/" />
      <PracticeBar
        simple
        status={practice.status}
        feedback={practice.feedback}
        expected={practice.expected}
        counters={practice.counters}
        countIn={practice.countIn}
        mode={mode}
        hand="both"
        bpm={bpm}
        toleranceMs={150}
        chordWindowMs={150}
        loop={null}
        measureLabel={(i) => String(i + 1)}
        showKeyboard={showKeyboard}
        onStart={practice.start}
        onStop={practice.stop}
        onMode={() => {}}
        onHand={() => {}}
        onBpm={(b) => {
          setBpm(b);
          writeLocal(RHYTHM_BPM_KEY, String(b));
        }}
        onTolerance={() => {}}
        onChordWindow={() => {}}
        onLoopStart={() => {}}
        onLoopEnd={() => {}}
        onLoopClear={() => {}}
        onToggleKeyboard={() =>
          setShowKeyboard((v) => {
            writeLocal(KEYBOARD_KEY, v ? '0' : '1');
            return !v;
          })
        }
      />

      {result && (
        <section className={`card ${styles.result}`} role="status">
          <p className={result.passed ? 'status-ok' : undefined}>{resultText(trackId, result)}</p>
          {unlocked && <p className={styles.unlocked}>{unlocked}</p>}
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                autoStart.current = true;
                void generate();
              }}
            >
              {t('lesson.again')}
            </button>
            <Link href="/curso/" className="btn btn-link">
              {t('lesson.backToCourse')}
            </Link>
          </div>
        </section>
      )}

      {exercise && (
        <ScoreView
          key={exercise.n}
          ref={scoreRef}
          xml={exercise.xml}
          visible
          zoom={1.25}
          currentMeasure={-1}
          labels={[]}
          showTitle={false}
          onSelectMeasure={() => {}}
          onCursorMeasure={() => {}}
        />
      )}

      {showKeyboard && (
        <div className={styles.keyboard}>
          <Keyboard from={from} to={to} />
        </div>
      )}
    </main>
  );
}
