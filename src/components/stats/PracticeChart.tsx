'use client';

import { useEffect, useRef, useState } from 'react';
import { t } from '@/i18n';
import styles from './Stats.module.css';

type Day = { key: string; date: number; ms: number; sessions: number };

const HEIGHT = 190;
const M = { top: 22, right: 8, bottom: 26, left: 40 };
const MAX_BAR = 24;

/** Máximo "redondo" del eje en minutos. */
function niceMax(minutes: number): number {
  for (const step of [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240])
    if (minutes <= step) return step;
  return Math.ceil(minutes / 60) * 60;
}

const sessionsLabel = (n: number) => (n === 1 ? t('stats.session') : t('stats.sessionsN', { n }));

const dateLabel = (ts: number) =>
  new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short' });

/** Columnas de una sola serie: minutos por día. Tooltip al pasar o tocar cada día. */
export function PracticeChart({ days }: { days: Day[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const minutes = days.map((d) => d.ms / 60000);
  const max = niceMax(Math.max(1, ...minutes));
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const band = days.length ? plotW / days.length : 0;
  const barW = Math.max(2, Math.min(MAX_BAR, band - 2)); // 2 px de aire entre columnas
  const y = (v: number) => M.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const peak = minutes.indexOf(Math.max(...minutes));

  return (
    <div className={styles.chart} ref={wrapRef}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={t('stats.chartTitle')}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} className={styles.grid} />
              <text x={M.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className={styles.axis}>
                {Math.round(v)}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const x = M.left + i * band + (band - barW) / 2;
            const h = (minutes[i] / max) * plotH;
            const top = M.top + plotH - h;
            const r = Math.min(4, barW / 2, h);
            const showDate = i === days.length - 1 || (days.length - 1 - i) % 7 === 0;
            return (
              <g key={d.key}>
                {h > 0 && (
                  // Extremo de datos redondeado (4 px) y base recta sobre el eje.
                  <path
                    className={`${styles.bar} ${active === i ? styles.barActive : ''}`}
                    d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`}
                  />
                )}
                {showDate && (
                  <text x={x + barW / 2} y={HEIGHT - 8} textAnchor="middle" className={styles.axis}>
                    {i === days.length - 1 ? t('stats.today') : dateLabel(d.date)}
                  </text>
                )}
                {i === peak && minutes[i] > 0 && (
                  <text x={x + barW / 2} y={top - 6} textAnchor="middle" className={styles.value}>
                    {Math.round(minutes[i])}
                  </text>
                )}
                {/* Zona de toque más grande que la columna. */}
                <rect
                  x={M.left + i * band}
                  y={M.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={t('stats.chartTooltip', {
                    date: dateLabel(d.date),
                    minutes: Math.round(minutes[i]),
                    sessions: sessionsLabel(d.sessions),
                  })}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive(i)}
                />
              </g>
            );
          })}
          <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} className={styles.baseline} />
        </svg>
      )}
      {active !== null && width > 0 && (
        <div
          className={styles.tooltip}
          style={{
            left: Math.min(width - 160, Math.max(0, M.left + active * band + band / 2 - 80)),
            top: Math.max(0, y(minutes[active]) - 52),
          }}
        >
          {t('stats.chartTooltip', {
            date: dateLabel(days[active].date),
            minutes: Math.round(minutes[active]),
            sessions: sessionsLabel(days[active].sessions),
          })}
        </div>
      )}
    </div>
  );
}
