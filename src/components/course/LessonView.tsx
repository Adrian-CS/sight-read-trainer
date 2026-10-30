'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TRACK_IDS,
  completeExercise,
  createExercise,
  type Exercise,
  type SessionOutcome,
  type TrackId,
} from '@/core/exercises';
import { browserXmlParser } from '@/core/library/library';
import { midiToName } from '@/core/music/notes';
import { parseScore } from '@/core/score/parseScore';
import { getRepository } from '@/core/storage/client';
import { t } from '@/i18n';
import { Keyboard } from '../Keyboard';
import { PracticeBar } from '../practice/PracticeBar';
import { usePractice } from '../practice/usePractice';
import { ScoreView, type ScoreViewHandle } from '../ScoreView';
import { TopBar } from '../TopBar';
import styles from './LessonView.module.css';

const KEYBOARD_KEY = 'sightread:showKeyboard';
const KEYBOARD_RANGE: Record<TrackId, [number, number]> = {
  treble: [55, 84],
  bass: [36, 64],
  both: [36, 84],
};

function readKeyboardPref(): boolean {
  try {
    return localStorage.getItem(KEYBOARD_KEY) === '1';
  } catch {
    return false;
  }
}

export function LessonView() {
  const param = useSearchParams().get('pista');
  const trackId = (TRACK_IDS as string[]).includes(param ?? '') ? (param as TrackId) : null;
  const [exercise, setExercise] = useState<(Exercise & { n: number }) | null>(null);
  const [result, setResult] = useState<SessionOutcome | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const scoreRef = useRef<ScoreViewHandle>(null);
  const autoStart = useRef(false);

  const generate = useCallback(async () => {
    if (!trackId) return;
    const next = await createExercise(getRepository(), trackId);
    setExercise((prev) => ({ ...next, n: (prev?.n ?? 0) + 1 }));
    setResult(null);
  }, [trackId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia guardada en el navegador
    setShowKeyboard(readKeyboardPref());
    void generate();
  }, [generate]);

  const score = useMemo(
    () => (exercise ? parseScore(browserXmlParser(exercise.xml)) : null),
    [exercise],
  );

  const practice = usePractice({
    exerciseId: trackId ?? undefined,
    score: score ?? { title: '', composer: '', staves: [], measures: [], tempo: null },
    scoreRef,
    mode: 'wait',
    hand: 'both',
    bpm: 60,
    chordWindowMs: 150,
    toleranceMs: 150,
    loop: null,
    onMeasure: () => {},
    readyText: t('lesson.ready'),
    onWaitFinished: (outcomes, completed) => {
      if (!completed || !trackId) return;
      void completeExercise(getRepository(), trackId, outcomes).then(setResult);
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

  return (
    <main className={`page ${showKeyboard ? styles.withKeyboard : ''}`}>
      <TopBar title={t(`course.track.${trackId}`)} back="/curso/" />
      <PracticeBar
        simple
        status={practice.status}
        feedback={practice.feedback}
        counters={practice.counters}
        countIn={0}
        mode="wait"
        hand="both"
        bpm={60}
        toleranceMs={150}
        chordWindowMs={150}
        loop={null}
        measureLabel={(i) => String(i + 1)}
        showKeyboard={showKeyboard}
        onStart={practice.start}
        onStop={practice.stop}
        onMode={() => {}}
        onHand={() => {}}
        onBpm={() => {}}
        onTolerance={() => {}}
        onChordWindow={() => {}}
        onLoopStart={() => {}}
        onLoopEnd={() => {}}
        onLoopClear={() => {}}
        onToggleKeyboard={() =>
          setShowKeyboard((v) => {
            try {
              localStorage.setItem(KEYBOARD_KEY, v ? '0' : '1');
            } catch {
              // sin almacenamiento: solo se pierde la preferencia
            }
            return !v;
          })
        }
      />

      {result && (
        <section className={`card ${styles.result}`} role="status">
          <p className={result.passed ? 'status-ok' : undefined}>
            {t(result.passed ? 'lesson.passed' : 'lesson.failed', {
              accuracy: Math.round(result.accuracy * 100),
              reaction: (result.medianReactionMs / 1000).toFixed(1).replace('.', ','),
            })}
          </p>
          {result.unlocked && (
            <p className={styles.unlocked}>
              {t('lesson.unlocked', { note: midiToName(result.unlocked.midi) })}
            </p>
          )}
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
