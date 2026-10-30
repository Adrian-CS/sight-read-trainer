'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  TRACKS,
  TRACK_IDS,
  loadProgress,
  nextNote,
  trackPool,
  type ProgressMap,
  type TrackId,
} from '@/core/exercises';
import { midiToName } from '@/core/music/notes';
import { getRepository } from '@/core/storage/client';
import { t } from '@/i18n';
import styles from './CourseView.module.css';

type LastResults = Partial<Record<TrackId, number>>;

export function CourseView() {
  const [progress, setProgress] = useState<ProgressMap | null>(null);
  const [last, setLast] = useState<LastResults>({});

  useEffect(() => {
    const repo = getRepository();
    void loadProgress(repo).then(setProgress);
    void Promise.all(TRACK_IDS.map((id) => repo.listAttempts({ exerciseId: id }))).then((lists) =>
      setLast(
        Object.fromEntries(
          lists.flatMap((list, i) =>
            list.length ? [[TRACK_IDS[i], list[list.length - 1].accuracy]] : [],
          ),
        ),
      ),
    );
  }, []);

  if (!progress) return null;

  return (
    <>
      <p className={`muted ${styles.intro}`}>{t('course.intro')}</p>
      <ol className={styles.tracks}>
        {TRACK_IDS.map((id) => {
          const pool = trackPool(id, progress);
          const total =
            id === 'both'
              ? TRACKS.treble.order.length + TRACKS.bass.order.length
              : TRACKS[id].order.length;
          const next = id === 'both' ? null : nextNote(id, progress[id]);
          return (
            <li key={id} className={`card ${styles.track}`}>
              <div className={styles.info}>
                <strong>{t(`course.track.${id}`)}</strong>
                <span className="muted">{t(`course.track.${id}.hint`)}</span>
                <div className={styles.meter} aria-hidden="true">
                  <span style={{ width: `${(pool.length / total) * 100}%` }} />
                </div>
                <span className={styles.details}>
                  {t('course.progress', { n: pool.length, total })}
                  {id !== 'both' &&
                    (next
                      ? ` · ${t('course.next', { note: midiToName(next.midi) })}`
                      : ` · ${t('course.complete')}`)}
                  {last[id] !== undefined &&
                    ` · ${t('course.last', { accuracy: Math.round(last[id]! * 100) })}`}
                </span>
                <span className={`muted ${styles.notes}`}>
                  {t('course.known', {
                    list: [...pool]
                      .sort((a, b) => a.midi - b.midi)
                      .map((n) => midiToName(n.midi))
                      .join(' '),
                  })}
                </span>
              </div>
              <Link href={`/curso/leccion/?pista=${id}`} className="btn btn-primary btn-link">
                {t('course.start')}
              </Link>
            </li>
          );
        })}
      </ol>
    </>
  );
}
