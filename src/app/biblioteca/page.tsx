import { LibraryView } from '@/components/LibraryView';
import { TopBar } from '@/components/TopBar';
import { t } from '@/i18n';

export default function LibraryPage() {
  return (
    <main className="page">
      <TopBar title={t('library.title')} />
      <LibraryView />
    </main>
  );
}
