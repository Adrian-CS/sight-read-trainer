'use client';

import { t } from '@/i18n';
import { useInput } from './InputProvider';
import styles from './MidiStatusChip.module.css';

/** Estado compacto del teclado MIDI; si no está conectado, permite conectarlo desde cualquier pantalla. */
export function MidiStatusChip() {
  const { midi, connectMidi } = useInput();
  if (midi.status === 'unsupported') return null;
  if (midi.status === 'ready' && midi.active) {
    return <span className={`${styles.chip} ${styles.on}`}>● {midi.active.name}</span>;
  }
  if (midi.status === 'ready') {
    return <span className={`${styles.chip} ${styles.off}`}>● {t('midi.chipDisconnected')}</span>;
  }
  return (
    <button
      type="button"
      className={`btn ${styles.connect}`}
      disabled={midi.status === 'requesting'}
      onClick={() => void connectMidi()}
    >
      {midi.status === 'requesting' ? t('midi.requesting') : t('midi.connect')}
    </button>
  );
}
