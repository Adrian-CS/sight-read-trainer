'use client';

import styles from './SegmentedControl.module.css';

type Option<T extends string> = { value: T; label: string };

/** Selector segmentado (radiogrupo) con botones grandes para uso táctil. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange(value: T): void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={styles.group}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`${styles.option} ${o.value === value ? styles.selected : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
