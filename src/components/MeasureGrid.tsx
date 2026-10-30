'use client';

import { useEffect, useRef } from 'react';
import type { ScoreModel } from '@/core/score/model';
import { t } from '@/i18n';
import { MiniStaff } from './MiniStaff';
import type { MeasureLabel } from './ScoreView';
import styles from './MeasureGrid.module.css';

type Props = {
  score: ScoreModel;
  labels: MeasureLabel[];
  currentMeasure: number;
  visible: boolean;
  loop?: { from: number; to: number } | null;
  onSelectMeasure(index: number): void;
};

/** Cuadrícula de 4 columnas con un mini pentagrama y el tiempo de inicio de cada compás. */
export function MeasureGrid({
  score,
  labels,
  currentMeasure,
  visible,
  loop,
  onSelectMeasure,
}: Props) {
  const gridRef = useRef<HTMLOListElement>(null);

  // Mantener visible el compás actual (p. ej. al volver desde la vista de partitura).
  useEffect(() => {
    if (!visible) return;
    const el = gridRef.current?.children[currentMeasure] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentMeasure, visible]);

  return (
    <ol ref={gridRef} className={styles.grid} hidden={!visible}>
      {score.measures.map((measure, i) => (
        <li key={i}>
          <button
            type="button"
            className={`${styles.cell} ${i === currentMeasure ? styles.current : ''} ${
              loop && i >= loop.from && i <= loop.to ? styles.inLoop : ''
            }`}
            aria-pressed={i === currentMeasure}
            aria-label={t('piece.measure', { n: labels[i]?.number ?? i + 1 })}
            onClick={() => onSelectMeasure(i)}
          >
            <span className={styles.header}>
              <strong>{labels[i]?.number}</strong>
              <span>{labels[i]?.time}</span>
              {labels[i]?.manual && <span title={t('piece.manualMark')}>⚑</span>}
            </span>
            <MiniStaff measure={measure} staves={score.staves} />
          </button>
        </li>
      ))}
    </ol>
  );
}
