'use client';

import { useState, type PointerEvent } from 'react';
import { isBlackKey, midiToName } from '@/core/music/notes';
import { t } from '@/i18n';
import { useInput, useNoteEvents } from './InputProvider';
import styles from './Keyboard.module.css';

type Props = {
  /** Primera y última nota (incluidas). Por defecto Do3–Do5. */
  from?: number;
  to?: number;
  showLabels?: boolean;
};

/** Teclado virtual táctil. Ilumina las notas que suenan desde cualquier entrada. */
export function Keyboard({ from = 48, to = 72, showLabels = true }: Props) {
  const { onScreen } = useInput();
  const [held, setHeld] = useState<ReadonlySet<number>>(new Set());

  useNoteEvents((e) => {
    setHeld((prev) => {
      const next = new Set(prev);
      if (e.type === 'noteon') next.add(e.midi);
      else next.delete(e.midi);
      return next;
    });
  });

  const keys = [];
  for (let midi = from; midi <= to; midi++) keys.push(midi);
  const whites = keys.filter((m) => !isBlackKey(m));

  const down = (midi: number) => (e: PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    onScreen.press(midi);
  };
  const up = (midi: number) => () => onScreen.release(midi);

  return (
    <div className={styles.keyboard} role="group" aria-label={t('keyboard.label')}>
      {whites.map((midi, i) => {
        const black = midi + 1 <= to && isBlackKey(midi + 1) ? midi + 1 : null;
        return (
          <div key={midi} className={styles.slot}>
            <button
              type="button"
              className={`${styles.white} ${held.has(midi) ? styles.active : ''}`}
              aria-label={midiToName(midi)}
              onPointerDown={down(midi)}
              onPointerUp={up(midi)}
              onPointerLeave={up(midi)}
              onPointerCancel={up(midi)}
              onContextMenu={(e) => e.preventDefault()}
            >
              {showLabels && <span className={styles.label}>{midiToName(midi)}</span>}
            </button>
            {black !== null && i < whites.length - 1 && (
              <button
                type="button"
                className={`${styles.black} ${held.has(black) ? styles.active : ''}`}
                aria-label={midiToName(black)}
                onPointerDown={down(black)}
                onPointerUp={up(black)}
                onPointerLeave={up(black)}
                onPointerCancel={up(black)}
                onContextMenu={(e) => e.preventDefault()}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
