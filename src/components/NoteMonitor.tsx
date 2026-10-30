'use client';

import { useEffect, useState } from 'react';
import type { NoteEvent } from '@/core/input';
import { midiToName } from '@/core/music/notes';
import { t } from '@/i18n';
import { useInput, useNoteEvents } from './InputProvider';
import styles from './NoteMonitor.module.css';

const LOG_SIZE = 8;

/** Última nota, velocidad, dispositivo y registro de eventos. */
export function NoteMonitor() {
  const { computer } = useInput();
  const [last, setLast] = useState<NoteEvent | null>(null);
  const [log, setLog] = useState<(NoteEvent & { key: number })[]>([]);
  const [octaveBase, setOctaveBase] = useState(computer?.octaveBase ?? 60);

  useEffect(() => computer?.onOctaveChange(setOctaveBase), [computer]);

  useNoteEvents((e) => {
    if (e.type === 'noteon') setLast(e);
    setLog((prev) =>
      [{ ...e, key: performance.now() + Math.random() }, ...prev].slice(0, LOG_SIZE),
    );
  });

  const sourceLabel = (e: NoteEvent) =>
    e.source === 'midi' && e.deviceName ? e.deviceName : t(`diag.source.${e.source}`);

  return (
    <section className={styles.monitor}>
      <div className={`card ${styles.stats}`}>
        <div>
          <span className="muted">{t('diag.lastNote')}</span>
          <output className={styles.note}>{last ? midiToName(last.midi) : t('diag.none')}</output>
          <span className="muted">
            {last ? `${midiToName(last.midi, 'letter')} · MIDI ${last.midi}` : ' '}
          </span>
        </div>
        <div>
          <span className="muted">{t('diag.velocity')}</span>
          <output className={styles.value}>{last?.velocity ?? t('diag.none')}</output>
        </div>
        <div>
          <span className="muted">{t('diag.source')}</span>
          <output className={styles.value}>{last ? sourceLabel(last) : t('diag.none')}</output>
        </div>
      </div>
      <div className={`card ${styles.log}`}>
        <span className="muted">{t('diag.log')}</span>
        <ol>
          {log.map((e) => (
            <li key={e.key} className={e.type === 'noteon' ? styles.on : styles.offEvent}>
              {e.type === 'noteon' ? '▼' : '▲'} {midiToName(e.midi)} · {e.velocity} ·{' '}
              {sourceLabel(e)}
            </li>
          ))}
        </ol>
      </div>
      <p className={`muted ${styles.hint}`}>
        {t('diag.computerHint', { base: midiToName(octaveBase) })}
      </p>
    </section>
  );
}
