import Link from 'next/link';
import { Keyboard } from '@/components/Keyboard';
import { MidiPanel } from '@/components/MidiPanel';
import { NoteMonitor } from '@/components/NoteMonitor';
import { t } from '@/i18n';

export default function DiagnosticsPage() {
  return (
    <main className="page">
      <div className="topbar">
        <Link
          href="/"
          className="btn"
          style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
        >
          ← {t('back')}
        </Link>
        <h1>{t('diag.title')}</h1>
      </div>
      <MidiPanel />
      <NoteMonitor />
      <Keyboard />
    </main>
  );
}
