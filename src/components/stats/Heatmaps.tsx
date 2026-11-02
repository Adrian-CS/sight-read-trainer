'use client';

import { isBlackKey, midiToName } from '@/core/music/notes';
import { heatLevel, type HeatMetric, type NoteRow } from '@/core/stats/stats';
import { t } from '@/i18n';
import styles from './Stats.module.css';

const STEP_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const midiOfDiatonic = (d: number) =>
  (Math.floor(d / 7) + 1) * 12 + STEP_SEMITONES[((d % 7) + 7) % 7];

export const heatFill = (level: number) => `var(--heat-${level + 1})`;

type Select = (row: NoteRow | null, midi: number, clef: NoteRow['clef']) => void;

/** Zona interactiva común: pasar, enfocar o tocar muestra el detalle. */
function hit(onSelect: Select, row: NoteRow | null, midi: number, clef: NoteRow['clef']) {
  const show = () => onSelect(row, midi, clef);
  return {
    tabIndex: 0,
    role: 'button',
    onPointerEnter: show,
    onFocus: show,
    onClick: show,
    style: { cursor: 'pointer' },
  } as const;
}

const GAP = 10; // separación entre líneas del pentagrama
const HALF = GAP / 2;

/**
 * Pentagramas de Sol y Fa con las notas naturales del curso, coloreadas por nivel.
 * Las notas alteradas aparecen en el teclado y en la tabla.
 */
export function StaffHeatmap({
  rows,
  metric,
  onSelect,
}: {
  rows: NoteRow[];
  metric: HeatMetric;
  onSelect: Select;
}) {
  const staves = [
    { clef: 'treble' as const, bottom: 4 * 7 + 2, from: 3 * 7 + 5, to: 5 * 7 + 5 }, // La3–La5
    { clef: 'bass' as const, bottom: 2 * 7 + 4, from: 2 * 7, to: 4 * 7 }, // Do2–Do4
  ];
  const slotW = 46;
  const left = 48;
  const width = left + 15 * slotW + 10;
  const staffTop = (i: number) => 40 + i * 150;
  const height = staffTop(1) + 4 * GAP + 70;
  const byKey = new Map(rows.map((r) => [`${r.midi}:${r.clef}`, r]));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={styles.staff}
      role="group"
      aria-label={t('stats.staff')}
    >
      {staves.map((staff, si) => {
        const bottomY = staffTop(si) + 4 * GAP;
        const y = (step: number) => bottomY - step * HALF;
        return (
          <g key={staff.clef}>
            <text x={8} y={staffTop(si) + 2 * GAP} dy="0.35em" className={styles.clefLabel}>
              {staff.clef === 'treble' ? 'Sol' : 'Fa'}
            </text>
            {[0, 2, 4, 6, 8].map((s) => (
              <line
                key={s}
                x1={left - 8}
                x2={width - 4}
                y1={y(s)}
                y2={y(s)}
                className={styles.staffLine}
              />
            ))}
            {Array.from({ length: staff.to - staff.from + 1 }, (_, i) => {
              const d = staff.from + i;
              const midi = midiOfDiatonic(d);
              const step = d - staff.bottom;
              const cx = left + i * slotW + slotW / 2;
              const row = byKey.get(`${midi}:${staff.clef}`) ?? null;
              const ledgers: number[] = [];
              for (let s = -2; s >= step; s -= 2) ledgers.push(s);
              for (let s = 10; s <= step; s += 2) ledgers.push(s);
              return (
                <g
                  key={d}
                  {...hit(onSelect, row, midi, staff.clef)}
                  aria-label={
                    row
                      ? `${midiToName(midi)}: ${Math.round(row.errorRate * 100)} %, ${(row.avgReactionMs / 1000).toFixed(1)} s`
                      : t('stats.detailEmpty', { note: midiToName(midi) })
                  }
                >
                  <rect
                    x={cx - slotW / 2}
                    y={y(12)}
                    width={slotW}
                    height={y(-6) - y(12)}
                    fill="transparent"
                  />
                  {ledgers.map((s) => (
                    <line
                      key={s}
                      x1={cx - 11}
                      x2={cx + 11}
                      y1={y(s)}
                      y2={y(s)}
                      className={styles.staffLine}
                    />
                  ))}
                  <ellipse
                    cx={cx}
                    cy={y(step)}
                    rx={7.5}
                    ry={5.5}
                    transform={`rotate(-20 ${cx} ${y(step)})`}
                    fill={row ? heatFill(heatLevel(row, metric)) : 'none'}
                    stroke={row ? 'none' : 'var(--heat-none)'}
                    strokeWidth={1.5}
                    strokeDasharray={row ? undefined : '3 2'}
                  />
                  <text x={cx} y={bottomY + 40} textAnchor="middle" className={styles.noteLabel}>
                    {midiToName(midi)}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/** Teclado de Do2 a Do6 coloreado por nivel (sumando las dos claves). */
export function KeyboardHeatmap({
  rows,
  metric,
  onSelect,
}: {
  rows: NoteRow[];
  metric: HeatMetric;
  onSelect: Select;
}) {
  const from = 36;
  const to = 84;
  const whites: number[] = [];
  for (let m = from; m <= to; m++) if (!isBlackKey(m)) whites.push(m);
  const w = 26;
  const h = 120;
  const width = whites.length * w;
  const byMidi = new Map(rows.map((r) => [r.midi, r]));

  const key = (midi: number, x: number, black: boolean) => {
    const row = byMidi.get(midi) ?? null;
    const fill = row
      ? heatFill(heatLevel(row, metric))
      : black
        ? 'var(--heatkey-black)'
        : 'var(--heatkey-white)';
    return (
      <g key={midi} {...hit(onSelect, row, midi, 'both')} aria-label={midiToName(midi)}>
        <rect
          x={x + 1}
          y={0}
          width={(black ? w * 0.62 : w) - 2}
          height={black ? h * 0.62 : h}
          rx={3}
          fill={fill}
          className={black ? styles.blackKey : styles.whiteKey}
        />
        {!black && midi % 12 === 0 && (
          <text x={x + w / 2} y={h - 8} textAnchor="middle" className={styles.keyLabel}>
            {midiToName(midi)}
          </text>
        )}
      </g>
    );
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${h + 2}`}
      className={styles.keys}
      role="group"
      aria-label={t('stats.keyboard')}
    >
      {whites.map((m, i) => key(m, i * w, false))}
      {whites.map((m, i) =>
        m + 1 <= to && isBlackKey(m + 1) ? key(m + 1, i * w + w * 0.69, true) : null,
      )}
    </svg>
  );
}

/** Leyenda de la escala: 5 niveles con sus límites y "sin datos". */
export function HeatLegend({ metric }: { metric: HeatMetric }) {
  const labels = t(metric === 'errors' ? 'stats.legend.errors' : 'stats.legend.reaction').split(
    '|',
  );
  return (
    <ul className={styles.legend} aria-label={t('stats.metric')}>
      {labels.map((label, i) => (
        <li key={label}>
          <span className={styles.swatch} style={{ background: heatFill(i) }} />
          {label}
        </li>
      ))}
      <li>
        <span className={`${styles.swatch} ${styles.swatchNone}`} />
        {t('stats.noData')}
      </li>
    </ul>
  );
}
