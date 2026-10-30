'use client';

import { useRef } from 'react';
import type { Range } from '@/core/practice';
import type { Hand } from '@/core/storage/types';
import { t } from '@/i18n';
import { MidiStatusChip } from '../MidiStatusChip';
import { SegmentedControl } from '../SegmentedControl';
import type { Feedback, PracticeMode, PracticeStatus } from './usePractice';
import styles from './PracticeBar.module.css';

const BPM_MIN = 30;
const BPM_MAX = 220;
const TOLERANCES = [80, 120, 150, 200, 300];
const CHORD_WINDOWS = [80, 150, 250, 400];

type Props = {
  status: PracticeStatus;
  feedback: Feedback;
  counters: string;
  countIn: number;
  mode: PracticeMode;
  hand: Hand;
  bpm: number;
  toleranceMs: number;
  chordWindowMs: number;
  loop: Range | null;
  /** Etiqueta (número) del compás según la partitura. */
  measureLabel(index: number): string;
  showKeyboard: boolean;
  onStart(): void;
  onStop(): void;
  onMode(mode: PracticeMode): void;
  onHand(hand: Hand): void;
  onBpm(bpm: number): void;
  onTolerance(ms: number): void;
  onChordWindow(ms: number): void;
  onLoopStart(): void;
  onLoopEnd(): void;
  onLoopClear(): void;
  onToggleKeyboard(): void;
};

export function PracticeBar(p: Props) {
  const active = p.status === 'running' || p.status === 'countin';
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const start = () => {
    // Plegar los ajustes para que la cabecera fija deje ver más partitura.
    if (detailsRef.current) detailsRef.current.open = false;
    p.onStart();
  };
  const feedbackClass =
    p.feedback.kind === 'ok' ? styles.ok : p.feedback.kind === 'error' ? styles.error : styles.info;

  return (
    <section className={`card ${styles.bar}`} aria-label={t('practice.mode')}>
      <div className={styles.row}>
        <fieldset className={styles.fieldset} disabled={active}>
          <SegmentedControl
            label={t('practice.mode')}
            value={p.mode}
            onChange={p.onMode}
            options={[
              { value: 'wait', label: t('practice.mode.wait') },
              { value: 'tempo', label: t('practice.mode.tempo') },
            ]}
          />
          <SegmentedControl
            label={t('practice.hand')}
            value={p.hand}
            onChange={p.onHand}
            options={[
              { value: 'right', label: t('practice.hand.right') },
              { value: 'left', label: t('practice.hand.left') },
              { value: 'both', label: t('practice.hand.both') },
            ]}
          />
        </fieldset>
        <MidiStatusChip />
        {active ? (
          <button type="button" className={`btn ${styles.main} ${styles.stop}`} onClick={p.onStop}>
            ■ {t('practice.stop')}
          </button>
        ) : (
          <button type="button" className={`btn btn-primary ${styles.main}`} onClick={start}>
            ▶ {t('practice.start')}
          </button>
        )}
      </div>

      <div className={styles.row}>
        <p className={`${styles.feedback} ${feedbackClass}`} role="status" aria-live="polite">
          {p.status === 'countin' ? t('practice.countIn', { n: p.countIn }) : p.feedback.text}
        </p>
        {p.counters && <span className={`muted ${styles.counters}`}>{p.counters}</span>}
      </div>

      <details ref={detailsRef} className={styles.details}>
        <summary>
          {t('practice.settings')}
          {p.loop && (
            <span className={styles.loopTag}>
              {t('practice.loopRange', {
                from: p.measureLabel(p.loop.from),
                to: p.measureLabel(p.loop.to),
              })}
            </span>
          )}
        </summary>
        <fieldset className={styles.settings} disabled={active}>
          <div className={styles.group}>
            <span className="muted">{t('practice.loop')}</span>
            <button type="button" className="btn" onClick={p.onLoopStart}>
              {t('practice.loopStart')}
            </button>
            <button type="button" className="btn" onClick={p.onLoopEnd}>
              {t('practice.loopEnd')}
            </button>
            {p.loop && (
              <button type="button" className="btn" onClick={p.onLoopClear}>
                {t('practice.loopClear')}
              </button>
            )}
          </div>
          {p.mode === 'tempo' ? (
            <div className={styles.group}>
              <span className="muted">{t('practice.bpm')}</span>
              <button
                type="button"
                className="btn btn-icon"
                aria-label={t('practice.slower')}
                onClick={() => p.onBpm(Math.max(BPM_MIN, p.bpm - 4))}
              >
                −
              </button>
              <output className={styles.bpm}>{p.bpm}</output>
              <button
                type="button"
                className="btn btn-icon"
                aria-label={t('practice.faster')}
                onClick={() => p.onBpm(Math.min(BPM_MAX, p.bpm + 4))}
              >
                +
              </button>
              <select
                className="select"
                value={p.toleranceMs}
                onChange={(e) => p.onTolerance(Number(e.target.value))}
                aria-label={t('practice.tolerance', { ms: p.toleranceMs })}
              >
                {TOLERANCES.map((ms) => (
                  <option key={ms} value={ms}>
                    {t('practice.tolerance', { ms })}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className={styles.group}>
              <select
                className="select"
                value={p.chordWindowMs}
                onChange={(e) => p.onChordWindow(Number(e.target.value))}
                aria-label={t('practice.chordWindow', { ms: p.chordWindowMs })}
              >
                {CHORD_WINDOWS.map((ms) => (
                  <option key={ms} value={ms}>
                    {t('practice.chordWindow', { ms })}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className={styles.toggle}>
            <input type="checkbox" checked={p.showKeyboard} onChange={p.onToggleKeyboard} />
            {t('practice.keyboard')}
          </label>
        </fieldset>
      </details>
    </section>
  );
}
