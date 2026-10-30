'use client';

import { t } from '@/i18n';
import { useInput } from './InputProvider';
import styles from './MidiPanel.module.css';

/** Conexión y elección del teclado MIDI. */
export function MidiPanel() {
  const { midi, connectMidi, selectMidiDevice } = useInput();

  return (
    <section className={`card ${styles.panel}`} aria-live="polite">
      <h2>{t('midi.title')}</h2>
      {midi.status === 'unsupported' && <p className="notice">{t('midi.unsupported')}</p>}
      {midi.status === 'idle' && (
        <button type="button" className="btn btn-primary" onClick={() => void connectMidi()}>
          {t('midi.connect')}
        </button>
      )}
      {midi.status === 'requesting' && <p className="muted">{t('midi.requesting')}</p>}
      {(midi.status === 'denied' || midi.status === 'failed') && (
        <div className={styles.row}>
          <p className="notice">
            {midi.status === 'denied'
              ? t('midi.denied')
              : t('midi.failed', { message: midi.message })}
          </p>
          <button type="button" className="btn" onClick={() => void connectMidi()}>
            {t('midi.retry')}
          </button>
        </div>
      )}
      {midi.status === 'ready' &&
        (midi.devices.length === 0 ? (
          <p className="notice">{t('midi.noDevices')}</p>
        ) : (
          <div className={styles.row}>
            <label className={styles.field}>
              <span className="muted">{t('midi.device')}</span>
              <select
                className="select"
                value={midi.selection?.id ?? ''}
                onChange={(e) => selectMidiDevice(e.target.value)}
              >
                {!midi.devices.some((d) => d.id === midi.selection?.id) && midi.selection && (
                  <option value={midi.selection.id}>{midi.selection.name}</option>
                )}
                {midi.devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.manufacturer ? ` (${d.manufacturer})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <span className={midi.active ? styles.ok : styles.off}>
              ● {midi.active ? t('midi.connected') : t('midi.disconnected')}
            </span>
          </div>
        ))}
    </section>
  );
}
