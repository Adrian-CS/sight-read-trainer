import { miniStaffNotes } from '@/core/score/miniStaff';
import type { ScoreMeasure, Staff } from '@/core/score/model';

const W = 160;
const GAP = 6; // distancia entre líneas
const HALF = GAP / 2;
const STAFF_H = GAP * 4;
const MARGIN_X = 14;
const STAFF_SPACING = 46; // de la línea superior de un pentagrama a la del siguiente
const TOP = 18;

/** Pentagrama(s) simplificado(s) de un compás, sin claves ni plicas. */
export function MiniStaff({ measure, staves }: { measure: ScoreMeasure; staves: Staff[] }) {
  const shown = staves.slice(0, 2);
  const height = TOP * 2 + STAFF_H + (shown.length - 1) * STAFF_SPACING;
  const usable = W - MARGIN_X * 2;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {shown.map((staff, si) => {
        const bottom = TOP + si * STAFF_SPACING + STAFF_H;
        const y = (step: number) => bottom - step * HALF;
        return (
          <g key={staff.index}>
            {[0, 2, 4, 6, 8].map((s) => (
              <line
                key={s}
                x1={2}
                x2={W - 2}
                y1={y(s)}
                y2={y(s)}
                stroke="currentColor"
                strokeOpacity={0.35}
              />
            ))}
            {miniStaffNotes(measure, staff.index, staff.clef).map((n, i) => {
              const cx = MARGIN_X + n.x * usable;
              return (
                <g key={i}>
                  {n.ledgers.map((s) => (
                    <line
                      key={s}
                      x1={cx - 6}
                      x2={cx + 6}
                      y1={y(s)}
                      y2={y(s)}
                      stroke="currentColor"
                      strokeOpacity={0.6}
                    />
                  ))}
                  <ellipse
                    cx={cx}
                    cy={y(n.step)}
                    rx={3.8}
                    ry={2.8}
                    transform={`rotate(-20 ${cx} ${y(n.step)})`}
                    fill={n.hollow ? 'none' : 'currentColor'}
                    stroke="currentColor"
                    strokeWidth={n.hollow ? 1.3 : 0}
                  />
                  {n.accidental && (
                    <text x={cx - 10} y={y(n.step) + 3} fontSize={8} fill="currentColor">
                      {n.accidental}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
