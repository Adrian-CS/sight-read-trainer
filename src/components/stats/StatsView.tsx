'use client';

import { useEffect, useMemo, useState } from 'react';
import { midiToName } from '@/core/music/notes';
import {
  dailyPractice,
  keyRows,
  lastDays,
  noteRows,
  recentAccuracy,
  streaks,
  totals,
  weakestNotes,
  type HeatMetric,
  type NoteRow,
} from '@/core/stats/stats';
import { getRepository } from '@/core/storage/client';
import type { Attempt, NoteStat } from '@/core/storage/types';
import { t } from '@/i18n';
import { SegmentedControl } from '../SegmentedControl';
import { HeatLegend, KeyboardHeatmap, StaffHeatmap } from './Heatmaps';
import { PracticeChart } from './PracticeChart';
import styles from './Stats.module.css';

function duration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return t('stats.minutes', { n: minutes });
  const h = Math.floor(minutes / 60);
  return `${h} h ${String(minutes % 60).padStart(2, '0')} min`;
}

const days = (n: number) => (n === 1 ? t('stats.day') : t('stats.days', { n }));
const seconds = (ms: number) => (ms / 1000).toFixed(1).replace('.', ',');
const clefName = (clef: NoteRow['clef']) => t(`stats.clef.${clef}`);

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={`card ${styles.tile}`}>
      <span className="muted">{label}</span>
      <strong className={styles.tileValue}>{value}</strong>
      {sub && <span className={`muted ${styles.tileSub}`}>{sub}</span>}
    </div>
  );
}

function NotesTable({ rows }: { rows: NoteRow[] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">{t('stats.col.note')}</th>
          <th scope="col">{t('stats.col.clef')}</th>
          <th scope="col">{t('stats.col.attempts')}</th>
          <th scope="col">{t('stats.col.errors')}</th>
          <th scope="col">{t('stats.col.reaction')}</th>
          <th scope="col">{t('stats.col.lastSeen')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.midi}:${r.clef}`}>
            <th scope="row">{midiToName(r.midi)}</th>
            <td>{clefName(r.clef)}</td>
            <td>{r.attempts}</td>
            <td>{Math.round(r.errorRate * 100)} %</td>
            <td>{seconds(r.avgReactionMs)} s</td>
            <td>{new Date(r.lastSeen).toLocaleDateString('es')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatsView() {
  const [data, setData] = useState<{ attempts: Attempt[]; stats: NoteStat[] } | null>(null);
  const [metric, setMetric] = useState<HeatMetric>('errors');
  const [detail, setDetail] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const repo = getRepository();
    void Promise.all([repo.listAttempts(), repo.listNoteStats()]).then(([attempts, stats]) =>
      setData({ attempts, stats }),
    );
  }, []);

  const summary = useMemo(() => {
    if (!data) return null;
    const daily = dailyPractice(data.attempts);
    return {
      daily: lastDays(daily, 28, now),
      streak: streaks(daily, now),
      totals: totals(data.attempts, now),
      accuracy: recentAccuracy(data.attempts, now),
      notes: noteRows(data.stats).sort((a, b) => a.midi - b.midi || a.clef.localeCompare(b.clef)),
      keys: keyRows(data.stats),
      weakest: weakestNotes(data.stats, 6, now),
    };
  }, [data, now]);

  if (!summary) return null;
  if (!data?.attempts.length) return <p className="notice">{t('stats.empty')}</p>;

  const select = (row: NoteRow | null, midi: number, clef: NoteRow['clef']) =>
    setDetail(
      row
        ? t('stats.detail', {
            note: midiToName(midi),
            clef: clefName(clef),
            attempts: row.attempts,
            errors: Math.round(row.errorRate * 100),
            reaction: seconds(row.avgReactionMs),
          })
        : t('stats.detailEmpty', { note: midiToName(midi) }),
    );

  const { streak, totals: tot } = summary;

  return (
    <>
      <section className={styles.tiles}>
        <Tile
          label={t('stats.streak')}
          value={days(streak.current)}
          sub={`${t('stats.bestStreak')}: ${days(streak.best)}`}
        />
        <Tile label={t('stats.today')} value={duration(tot.todayMs)} />
        <Tile label={t('stats.week')} value={duration(tot.weekMs)} />
        <Tile
          label={t('stats.total')}
          value={duration(tot.totalMs)}
          sub={t('stats.sessions', { n: tot.sessions, days: tot.days })}
        />
        {summary.accuracy !== null && (
          <Tile label={t('stats.accuracy')} value={`${Math.round(summary.accuracy * 100)} %`} />
        )}
      </section>

      <section className={`card ${styles.section}`}>
        <h2>{t('stats.chartTitle')}</h2>
        <p className="muted">{t('stats.chartSubtitle')}</p>
        <PracticeChart days={summary.daily} />
      </section>

      <section className={`card ${styles.section}`}>
        <div className={styles.sectionHead}>
          <div>
            <h2>{t('stats.notesTitle')}</h2>
            <p className="muted">{t('stats.notesHint')}</p>
          </div>
          <SegmentedControl<HeatMetric>
            label={t('stats.metric')}
            value={metric}
            onChange={setMetric}
            options={[
              { value: 'errors', label: t('stats.metric.errors') },
              { value: 'reaction', label: t('stats.metric.reaction') },
            ]}
          />
        </div>
        <HeatLegend metric={metric} />
        <h3>{t('stats.staff')}</h3>
        <StaffHeatmap rows={summary.notes} metric={metric} onSelect={select} />
        <h3>{t('stats.keyboard')}</h3>
        <KeyboardHeatmap rows={summary.keys} metric={metric} onSelect={select} />
        <p className={styles.detail} aria-live="polite">
          {detail ?? ' '}
        </p>
      </section>

      {summary.weakest.length > 0 && (
        <section className={`card ${styles.section}`}>
          <h2>{t('stats.weakest')}</h2>
          <p className="muted">{t('stats.weakestHint')}</p>
          <NotesTable rows={summary.weakest} />
          <details className={styles.more}>
            <summary>{t('stats.table')}</summary>
            <NotesTable rows={summary.notes} />
          </details>
        </section>
      )}
    </>
  );
}
