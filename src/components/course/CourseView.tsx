'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  currentLevel,
  LEVEL_COUNTS,
  LEVEL_TRACK_IDS,
  loadProgress,
  nextNote,
  NOTE_TRACK_IDS,
  TRACK_IDS,
  TRACKS,
  trackPool,
  type LevelTrackId,
  type NoteTrackId,
  type ProgressMap,
  type TrackId,
} from '@/core/exercises';
import { midiToName } from '@/core/music/notes';
import { getRepository } from '@/core/storage/client';
import { t } from '@/i18n';
import { levelName } from './levels';
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

  const lastText = (id: TrackId) =>
    last[id] !== undefined
      ? ` · ${t('course.last', { accuracy: Math.round(last[id]! * 100) })}`
      : '';

  const noteTrack = (id: NoteTrackId) => {
    const pool = trackPool(id, progress);
    const total =
      id === 'both'
        ? TRACKS.treble.order.length + TRACKS.bass.order.length
        : TRACKS[id].order.length;
    const next = id === 'both' ? null : nextNote(id, progress[id]);
    return (
      <TrackCard key={id} id={id} fraction={pool.length / total}>
        <span className={styles.details}>
          {t('course.progress', { n: pool.length, total })}
          {id !== 'both' &&
            (next
              ? ` · ${t('course.next', { note: midiToName(next.midi) })}`
              : ` · ${t('course.complete')}`)}
          {lastText(id)}
        </span>
        <span className={`muted ${styles.notes}`}>
          {t('course.known', {
            list: [...pool]
              .sort((a, b) => a.midi - b.midi)
              .map((n) => midiToName(n.midi))
              .join(' '),
          })}
        </span>
      </TrackCard>
    );
  };

  const levelTrack = (id: LevelTrackId) => {
    const level = currentLevel(id, progress[id]);
    const total = LEVEL_COUNTS[id];
    return (
      <TrackCard key={id} id={id} fraction={level / total}>
        <span className={styles.details}>
          {t('course.level', { n: level, total, name: levelName(id, level) })}
          {lastText(id)}
        </span>
        <span className={`muted ${styles.notes}`}>
          {level < total
            ? t('course.nextLevel', { name: levelName(id, level + 1) })
            : t('course.complete')}
        </span>
      </TrackCard>
    );
  };

  return (
    <>
      <p className={`muted ${styles.intro}`}>{t('course.intro')}</p>
      <h2 className={styles.section}>{t('course.section.notes')}</h2>
      <ol className={styles.tracks}>{NOTE_TRACK_IDS.map(noteTrack)}</ol>
      <h2 className={styles.section}>{t('course.section.more')}</h2>
      <ol className={styles.tracks}>{LEVEL_TRACK_IDS.map(levelTrack)}</ol>
    </>
  );
}

function TrackCard({
  id,
  fraction,
  children,
}: {
  id: TrackId;
  fraction: number;
  children: React.ReactNode;
}) {
  return (
    <li className={`card ${styles.track}`}>
      <div className={styles.info}>
        <strong>{t(`course.track.${id}`)}</strong>
        <span className="muted">{t(`course.track.${id}.hint`)}</span>
        <div className={styles.meter} aria-hidden="true">
          <span style={{ width: `${Math.round(fraction * 100)}%` }} />
        </div>
        {children}
      </div>
      <Link href={`/curso/leccion/?pista=${id}`} className="btn btn-primary btn-link">
        {t('course.start')}
      </Link>
    </li>
  );
}
