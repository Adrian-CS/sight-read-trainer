import { Keyboard } from '@/components/Keyboard';
import { MidiPanel } from '@/components/MidiPanel';
import { NoteMonitor } from '@/components/NoteMonitor';
import { TopBar } from '@/components/TopBar';
import { t } from '@/i18n';

export default function DiagnosticsPage() {
  return (
    <main className="page">
      <TopBar title={t('diag.title')} />
      <MidiPanel />
      <NoteMonitor />
      <Keyboard />
    </main>
  );
}
